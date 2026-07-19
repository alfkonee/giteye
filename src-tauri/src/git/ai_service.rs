use crate::errors::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const OPENAI_DEFAULT_ENDPOINT: &str = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL: &str = "gpt-4o-mini";
const OPENROUTER_DEFAULT_ENDPOINT: &str = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL: &str = "openai/gpt-4o-mini";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum AiProvider {
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "openrouter")]
    OpenRouter,
}

impl AiProvider {
    fn default_endpoint(self) -> &'static str {
        match self {
            Self::OpenAi => OPENAI_DEFAULT_ENDPOINT,
            Self::OpenRouter => OPENROUTER_DEFAULT_ENDPOINT,
        }
    }

    fn default_model(self) -> &'static str {
        match self {
            Self::OpenAi => OPENAI_DEFAULT_MODEL,
            Self::OpenRouter => OPENROUTER_DEFAULT_MODEL,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::OpenAi => "OpenAI",
            Self::OpenRouter => "OpenRouter",
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
pub enum AiApiKeySource {
    #[serde(rename = "environment")]
    Environment,
    #[serde(rename = "stored")]
    Stored,
    #[serde(rename = "missing")]
    Missing,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigView {
    pub provider: AiProvider,
    pub model: String,
    pub endpoint: String,
    pub api_key_configured: bool,
    pub api_key_source: AiApiKeySource,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiConfigRequest {
    pub provider: AiProvider,
    pub model: String,
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatResponseMessage,
}

#[derive(Deserialize)]
struct ChatResponseMessage {
    content: String,
}

#[derive(Deserialize)]
struct ChatErrorResponse {
    error: ChatErrorBody,
}

#[derive(Deserialize)]
struct ChatErrorBody {
    message: String,
}

#[derive(Clone, Debug)]
struct AiConfig {
    provider: AiProvider,
    endpoint: String,
    api_key: String,
    model: String,
    api_key_source: AiApiKeySource,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiConfigFile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    provider: Option<AiProvider>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    api_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    endpoint: Option<String>,
    #[serde(
        default,
        rename = "ai_api_key",
        skip_serializing_if = "Option::is_none"
    )]
    ai_api_key: Option<String>,
    #[serde(default, rename = "ai_model", skip_serializing_if = "Option::is_none")]
    ai_model: Option<String>,
    #[serde(
        default,
        rename = "ai_endpoint",
        skip_serializing_if = "Option::is_none"
    )]
    ai_endpoint: Option<String>,
}

#[derive(Clone, Debug, Default)]
struct AiEnv {
    giteye_provider: Option<String>,
    giteye_endpoint: Option<String>,
    giteye_model: Option<String>,
    giteye_api_key: Option<String>,
    openai_api_key: Option<String>,
    openrouter_api_key: Option<String>,
}

impl AiEnv {
    fn from_process() -> Self {
        Self {
            giteye_provider: std::env::var("GITEYE_AI_PROVIDER").ok(),
            giteye_endpoint: std::env::var("GITEYE_AI_ENDPOINT").ok(),
            giteye_model: std::env::var("GITEYE_AI_MODEL").ok(),
            giteye_api_key: std::env::var("GITEYE_AI_API_KEY").ok(),
            openai_api_key: std::env::var("OPENAI_API_KEY").ok(),
            openrouter_api_key: std::env::var("OPENROUTER_API_KEY").ok(),
        }
    }
}

fn ai_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    fs::create_dir_all(&dir).map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(dir.join("ai_config.json"))
}

fn load_config_file(app_handle: &tauri::AppHandle) -> Result<Option<AiConfigFile>, AppError> {
    let path = ai_config_path(app_handle)?;
    if !path.exists() {
        return Ok(None);
    }

    let data = fs::read_to_string(&path).map_err(|e| AppError::StorageError(e.to_string()))?;
    serde_json::from_str(&data)
        .map(Some)
        .map_err(|e| AppError::SerializationError(e.to_string()))
}

fn resolve_effective_config(file: Option<AiConfigFile>) -> Result<AiConfig, AppError> {
    resolve_effective_config_from(file, AiEnv::from_process())
}

fn resolve_effective_config_from(
    file: Option<AiConfigFile>,
    env: AiEnv,
) -> Result<AiConfig, AppError> {
    let provider = match trimmed_option(env.giteye_provider.as_deref()).as_deref() {
        Some("openai") => AiProvider::OpenAi,
        Some("openrouter") => AiProvider::OpenRouter,
        Some(value) => {
            return Err(AppError::GitError(format!(
                "Unsupported AI provider '{}'. Expected openai or openrouter.",
                value
            )))
        }
        None => file
            .as_ref()
            .and_then(|config| config.provider)
            .unwrap_or(AiProvider::OpenAi),
    };

    let endpoint = trimmed_option(env.giteye_endpoint.as_deref())
        .or_else(|| {
            file.as_ref()
                .and_then(|config| trimmed_option(config.endpoint.as_deref()))
        })
        .or_else(|| {
            file.as_ref()
                .and_then(|config| trimmed_option(config.ai_endpoint.as_deref()))
        })
        .unwrap_or_else(|| provider.default_endpoint().to_string());

    let model = trimmed_option(env.giteye_model.as_deref())
        .or_else(|| {
            file.as_ref()
                .and_then(|config| trimmed_option(config.model.as_deref()))
        })
        .or_else(|| {
            file.as_ref()
                .and_then(|config| trimmed_option(config.ai_model.as_deref()))
        })
        .unwrap_or_else(|| provider.default_model().to_string());

    let (api_key, api_key_source) = if let Some(key) = trimmed_option(env.giteye_api_key.as_deref())
    {
        (key, AiApiKeySource::Environment)
    } else if let Some(key) = match provider {
        AiProvider::OpenAi => trimmed_option(env.openai_api_key.as_deref()),
        AiProvider::OpenRouter => trimmed_option(env.openrouter_api_key.as_deref()),
    } {
        (key, AiApiKeySource::Environment)
    } else if let Some(key) = file
        .as_ref()
        .and_then(|config| trimmed_option(config.api_key.as_deref()))
        .or_else(|| {
            file.as_ref()
                .and_then(|config| trimmed_option(config.ai_api_key.as_deref()))
        })
    {
        (key, AiApiKeySource::Stored)
    } else {
        (String::new(), AiApiKeySource::Missing)
    };

    validate_endpoint(&endpoint)?;

    Ok(AiConfig {
        provider,
        endpoint,
        api_key,
        model,
        api_key_source,
    })
}

fn trimmed_option(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn validate_endpoint(endpoint: &str) -> Result<(), AppError> {
    let url = reqwest::Url::parse(endpoint)
        .map_err(|_| AppError::GitError("AI endpoint must be an http(s) URL.".to_string()))?;

    if matches!(url.scheme(), "http" | "https") {
        Ok(())
    } else {
        Err(AppError::GitError(
            "AI endpoint must be an http(s) URL.".to_string(),
        ))
    }
}

pub fn get_ai_config(app_handle: &tauri::AppHandle) -> Result<AiConfigView, AppError> {
    let config = resolve_effective_config(load_config_file(app_handle)?)?;
    Ok(config.to_view())
}

pub fn save_ai_config(
    app_handle: &tauri::AppHandle,
    request: SaveAiConfigRequest,
) -> Result<AiConfigView, AppError> {
    let existing = load_config_file(app_handle)?.unwrap_or_default();
    let model = trimmed_option(Some(&request.model))
        .unwrap_or_else(|| request.provider.default_model().to_string());
    let endpoint = trimmed_option(request.endpoint.as_deref())
        .unwrap_or_else(|| request.provider.default_endpoint().to_string());
    validate_endpoint(&endpoint)?;

    let stored_api_key = match request.api_key {
        None => trimmed_option(existing.api_key.as_deref())
            .or_else(|| trimmed_option(existing.ai_api_key.as_deref()))
            .unwrap_or_default(),
        Some(api_key) => trimmed_option(Some(&api_key)).unwrap_or_default(),
    };

    let file = AiConfigFile {
        provider: Some(request.provider),
        api_key: Some(stored_api_key),
        model: Some(model),
        endpoint: Some(endpoint),
        ai_api_key: None,
        ai_model: None,
        ai_endpoint: None,
    };

    let path = ai_config_path(app_handle)?;
    let json = serde_json::to_string_pretty(&file)
        .map_err(|e| AppError::SerializationError(e.to_string()))?;
    fs::write(path, json).map_err(|e| AppError::StorageError(e.to_string()))?;

    get_ai_config(app_handle)
}

impl AiConfig {
    fn to_view(&self) -> AiConfigView {
        AiConfigView {
            provider: self.provider,
            model: self.model.clone(),
            endpoint: self.endpoint.clone(),
            api_key_configured: !self.api_key.is_empty(),
            api_key_source: self.api_key_source,
        }
    }
}

fn call_ai(config: &AiConfig, system_prompt: &str, user_prompt: &str) -> Result<String, AppError> {
    if config.api_key.is_empty() {
        return Err(AppError::GitError(
            "AI is not configured. Set an API key in Settings, GITEYE_AI_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.".to_string(),
        ));
    }

    let client = reqwest::blocking::Client::new();
    let request = ChatRequest {
        model: config.model.clone(),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_prompt.to_string(),
            },
        ],
        temperature: 0.2,
        max_tokens: 2048,
    };

    let url = format!("{}/chat/completions", config.endpoint.trim_end_matches('/'));
    let mut builder = client
        .post(url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json");

    if config.provider == AiProvider::OpenRouter {
        builder = builder.header("X-OpenRouter-Title", "GitEye");
    }

    let response = builder
        .json(&request)
        .send()
        .map_err(|e| AppError::GitError(format!("AI API request failed: {e}")))?;

    let status = response.status();
    let text = response
        .text()
        .map_err(|e| AppError::GitError(format!("AI API response read failed: {e}")))?;

    if !status.is_success() {
        let message = serde_json::from_str::<ChatErrorResponse>(&text)
            .map(|body| body.error.message)
            .unwrap_or_else(|_| text.chars().take(500).collect::<String>());
        return Err(AppError::GitError(format!(
            "AI API error from {}: HTTP {}: {}",
            config.provider.label(),
            status.as_u16(),
            message
        )));
    }

    let body: ChatResponse = serde_json::from_str(&text)
        .map_err(|e| AppError::GitError(format!("AI API response parse failed: {e}")))?;

    body.choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| AppError::GitError("AI returned no choices.".to_string()))
}

pub fn resolve_merge_conflict(
    app_handle: &tauri::AppHandle,
    base: &str,
    ours: &str,
    theirs: &str,
) -> Result<String, AppError> {
    let config = resolve_effective_config(load_config_file(app_handle)?)?;

    let system = "You are a merge conflict resolution assistant. Given the base version, our changes, and their changes, produce the resolved code. Preserve correct syntax. Explain only if ambiguous; otherwise output only the resolved code.";

    let user = format!(
        "Base version:\n```\n{}\n```\n\nOur changes (current branch):\n```\n{}\n```\n\nTheir changes (incoming):\n```\n{}\n```\n\nOutput the resolved code:",
        base, ours, theirs
    );

    call_ai(&config, system, &user)
}

pub fn suggest_commit_message(
    app_handle: &tauri::AppHandle,
    diffs: &[CommitMessageDiff],
) -> Result<String, AppError> {
    let config = resolve_effective_config(load_config_file(app_handle)?)?;

    let system = "You are a commit message assistant. Generate a concise, conventional commit message based on the diff. Use the format: <type>: <subject>. Types: feat, fix, refactor, docs, test, chore. Keep subject under 72 characters. If the diff is large, summarize the primary change.";

    let diff_text: String = diffs
        .iter()
        .map(|d| {
            format!(
                "File: {}\nStatus: {}\nDiff:\n{}",
                d.file_path, d.status, d.diff_text
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");

    let user = format!(
        "Generate a commit message for these changes:\n\n{}",
        diff_text
    );

    call_ai(&config, system, &user)
}

#[derive(Deserialize)]
pub struct CommitMessageDiff {
    pub file_path: String,
    pub status: String,
    pub diff_text: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;
    use std::time::Duration;

    fn git_error_message(error: AppError) -> String {
        match error {
            AppError::GitError(message) => message,
            other => panic!("expected git error, got {other:?}"),
        }
    }

    fn serve_once(
        status: &'static str,
        body: &'static str,
    ) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind local test server");
        let endpoint = format!("http://{}", listener.local_addr().expect("local addr"));
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .expect("set read timeout");

            let mut bytes = Vec::new();
            let mut buffer = [0; 1024];
            let header_end = loop {
                let read = stream.read(&mut buffer).expect("read request");
                assert!(read > 0, "connection closed before request headers");
                bytes.extend_from_slice(&buffer[..read]);
                if let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                    break index + 4;
                }
            };

            let headers = String::from_utf8_lossy(&bytes[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().expect("content length"))
                })
                .unwrap_or(0);
            while bytes.len() < header_end + content_length {
                let read = stream.read(&mut buffer).expect("read body");
                assert!(read > 0, "connection closed before request body");
                bytes.extend_from_slice(&buffer[..read]);
            }

            let response = format!(
                "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            stream
                .write_all(response.as_bytes())
                .expect("write response");

            String::from_utf8(bytes).expect("request utf8")
        });

        (endpoint, handle)
    }

    #[test]
    fn defaults_to_openai_without_file_or_env() {
        let config = resolve_effective_config_from(None, AiEnv::default()).expect("config");

        assert_eq!(config.provider, AiProvider::OpenAi);
        assert_eq!(config.endpoint, OPENAI_DEFAULT_ENDPOINT);
        assert_eq!(config.model, OPENAI_DEFAULT_MODEL);
        assert!(config.api_key.is_empty());
        assert_eq!(config.api_key_source, AiApiKeySource::Missing);
    }

    #[test]
    fn openrouter_file_uses_provider_defaults_for_blank_endpoint_and_model() {
        let file = AiConfigFile {
            provider: Some(AiProvider::OpenRouter),
            endpoint: Some("  ".to_string()),
            model: Some(String::new()),
            ..AiConfigFile::default()
        };

        let config = resolve_effective_config_from(Some(file), AiEnv::default()).expect("config");

        assert_eq!(config.provider, AiProvider::OpenRouter);
        assert_eq!(config.endpoint, OPENROUTER_DEFAULT_ENDPOINT);
        assert_eq!(config.model, OPENROUTER_DEFAULT_MODEL);
    }

    #[test]
    fn giteye_api_key_overrides_provider_env_and_stored_key() {
        let file = AiConfigFile {
            api_key: Some("stored-key".to_string()),
            ..AiConfigFile::default()
        };
        let env = AiEnv {
            giteye_api_key: Some(" giteye-key ".to_string()),
            openai_api_key: Some("openai-key".to_string()),
            ..AiEnv::default()
        };

        let config = resolve_effective_config_from(Some(file), env).expect("config");

        assert_eq!(config.api_key, "giteye-key");
        assert_eq!(config.api_key_source, AiApiKeySource::Environment);
    }

    #[test]
    fn openrouter_uses_provider_env_when_giteye_key_is_empty() {
        let file = AiConfigFile {
            provider: Some(AiProvider::OpenRouter),
            api_key: Some("stored-key".to_string()),
            ..AiConfigFile::default()
        };
        let env = AiEnv {
            giteye_api_key: Some("  ".to_string()),
            openrouter_api_key: Some(" router-key ".to_string()),
            ..AiEnv::default()
        };

        let config = resolve_effective_config_from(Some(file), env).expect("config");

        assert_eq!(config.provider, AiProvider::OpenRouter);
        assert_eq!(config.api_key, "router-key");
        assert_eq!(config.api_key_source, AiApiKeySource::Environment);
    }

    #[test]
    fn legacy_file_fields_still_load() {
        let file = AiConfigFile {
            ai_api_key: Some(" legacy-key ".to_string()),
            ai_endpoint: Some(" https://legacy.example/v1 ".to_string()),
            ai_model: Some(" legacy-model ".to_string()),
            ..AiConfigFile::default()
        };

        let config = resolve_effective_config_from(Some(file), AiEnv::default()).expect("config");

        assert_eq!(config.endpoint, "https://legacy.example/v1");
        assert_eq!(config.model, "legacy-model");
        assert_eq!(config.api_key, "legacy-key");
        assert_eq!(config.api_key_source, AiApiKeySource::Stored);
    }

    #[test]
    fn invalid_provider_env_returns_exact_error() {
        let env = AiEnv {
            giteye_provider: Some("anthropic".to_string()),
            ..AiEnv::default()
        };

        let error = resolve_effective_config_from(None, env).expect_err("invalid provider");

        assert_eq!(
            git_error_message(error),
            "Unsupported AI provider 'anthropic'. Expected openai or openrouter."
        );
    }

    #[test]
    fn invalid_endpoint_scheme_returns_exact_error() {
        let env = AiEnv {
            giteye_endpoint: Some("file:///tmp/socket".to_string()),
            ..AiEnv::default()
        };

        let error = resolve_effective_config_from(None, env).expect_err("invalid endpoint");

        assert_eq!(
            git_error_message(error),
            "AI endpoint must be an http(s) URL."
        );
    }

    #[test]
    fn openai_request_uses_chat_completions_without_openrouter_title() {
        let (endpoint, handle) =
            serve_once("200 OK", r#"{"choices":[{"message":{"content":"ok"}}]}"#);
        let config = AiConfig {
            provider: AiProvider::OpenAi,
            endpoint,
            api_key: "secret".to_string(),
            model: "gpt-4o-mini".to_string(),
            api_key_source: AiApiKeySource::Stored,
        };

        let result = call_ai(&config, "system", "user").expect("ai response");
        let request = handle.join().expect("server request");
        let lower = request.to_ascii_lowercase();

        assert_eq!(result, "ok");
        assert!(
            request.starts_with("POST /chat/completions HTTP/1.1"),
            "{request}"
        );
        assert!(lower.contains("authorization: bearer secret"), "{request}");
        assert!(request.contains(r#""model":"gpt-4o-mini""#), "{request}");
        assert!(!lower.contains("x-openrouter-title"), "{request}");
    }

    #[test]
    fn openrouter_request_includes_provider_title_header() {
        let (endpoint, handle) =
            serve_once("200 OK", r#"{"choices":[{"message":{"content":"ok"}}]}"#);
        let config = AiConfig {
            provider: AiProvider::OpenRouter,
            endpoint,
            api_key: "router-secret".to_string(),
            model: "openai/gpt-4o-mini".to_string(),
            api_key_source: AiApiKeySource::Stored,
        };

        let result = call_ai(&config, "system", "user").expect("ai response");
        let request = handle.join().expect("server request");
        let lower = request.to_ascii_lowercase();

        assert_eq!(result, "ok");
        assert!(
            request.starts_with("POST /chat/completions HTTP/1.1"),
            "{request}"
        );
        assert!(
            lower.contains("authorization: bearer router-secret"),
            "{request}"
        );
        assert!(
            request.contains(r#""model":"openai/gpt-4o-mini""#),
            "{request}"
        );
        assert!(lower.contains("x-openrouter-title: giteye"), "{request}");
    }

    #[test]
    fn structured_error_mentions_provider_status_and_message() {
        let (endpoint, handle) =
            serve_once("401 Unauthorized", r#"{"error":{"message":"bad key"}}"#);
        let config = AiConfig {
            provider: AiProvider::OpenRouter,
            endpoint,
            api_key: "bad".to_string(),
            model: "openai/gpt-4o-mini".to_string(),
            api_key_source: AiApiKeySource::Stored,
        };

        let error = call_ai(&config, "system", "user").expect_err("provider error");
        let _request = handle.join().expect("server request");

        assert!(
            git_error_message(error).contains("AI API error from OpenRouter: HTTP 401: bad key")
        );
    }
}
