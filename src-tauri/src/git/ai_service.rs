use crate::errors::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const OPENAI_DEFAULT_ENDPOINT: &str = "https://api.openai.com/v1";
const OPENAI_DEFAULT_MODEL: &str = "gpt-4o-mini";
const CLAUDE_DEFAULT_ENDPOINT: &str = "https://api.anthropic.com/v1";
const CLAUDE_DEFAULT_MODEL: &str = "claude-sonnet-4-20250514";
const DEEPSEEK_DEFAULT_ENDPOINT: &str = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL: &str = "deepseek-chat";
const OPENROUTER_DEFAULT_ENDPOINT: &str = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL: &str = "openai/gpt-4o-mini";
const MAX_COMMIT_DIFF_CHARS: usize = 60_000;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub enum AiProvider {
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "claude")]
    Claude,
    #[serde(rename = "deepseek")]
    DeepSeek,
    #[serde(rename = "openrouter")]
    OpenRouter,
}

impl AiProvider {
    fn default_endpoint(self) -> &'static str {
        match self {
            Self::OpenAi => OPENAI_DEFAULT_ENDPOINT,
            Self::Claude => CLAUDE_DEFAULT_ENDPOINT,
            Self::DeepSeek => DEEPSEEK_DEFAULT_ENDPOINT,
            Self::OpenRouter => OPENROUTER_DEFAULT_ENDPOINT,
        }
    }

    fn default_model(self) -> &'static str {
        match self {
            Self::OpenAi => OPENAI_DEFAULT_MODEL,
            Self::Claude => CLAUDE_DEFAULT_MODEL,
            Self::DeepSeek => DEEPSEEK_DEFAULT_MODEL,
            Self::OpenRouter => OPENROUTER_DEFAULT_MODEL,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::OpenAi => "OpenAI",
            Self::Claude => "Claude",
            Self::DeepSeek => "DeepSeek",
            Self::OpenRouter => "OpenRouter",
        }
    }

    fn models(self) -> &'static [&'static str] {
        match self {
            Self::OpenAi => &["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"],
            Self::Claude => &[
                "claude-sonnet-4-20250514",
                "claude-opus-4-20250514",
                "claude-3-5-haiku-20241022",
            ],
            Self::DeepSeek => &["deepseek-chat", "deepseek-reasoner"],
            Self::OpenRouter => &[
                "openai/gpt-4o-mini",
                "anthropic/claude-sonnet-4",
                "deepseek/deepseek-chat",
            ],
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
    pub providers: Vec<AiProviderView>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderView {
    pub id: AiProvider,
    pub label: String,
    pub default_endpoint: String,
    pub default_model: String,
    pub models: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiConfigRequest {
    pub provider: AiProvider,
    pub model: String,
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAiModelsRequest {
    pub provider: AiProvider,
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiModelView {
    pub id: String,
    pub label: String,
    pub context_length: Option<u32>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
pub enum AiModelListSource {
    #[serde(rename = "live")]
    Live,
    #[serde(rename = "fallback")]
    Fallback,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiModelListView {
    pub provider: AiProvider,
    pub models: Vec<AiModelView>,
    pub source: AiModelListSource,
    pub warning: Option<String>,
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

#[derive(Deserialize)]
struct ModelListResponse<T> {
    data: Vec<T>,
}

#[derive(Deserialize)]
struct ModelIdResponse {
    id: String,
}

#[derive(Deserialize)]
struct ClaudeModelResponse {
    id: String,
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct ClaudeModelListResponse {
    data: Vec<ClaudeModelResponse>,
    #[serde(default)]
    has_more: bool,
    last_id: Option<String>,
}

#[derive(Deserialize)]
struct OpenRouterModelResponse {
    id: String,
    name: Option<String>,
    context_length: Option<u32>,
}

#[derive(Serialize)]
struct ClaudeRequest {
    model: String,
    system: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContent>,
}

#[derive(Deserialize)]
struct ClaudeContent {
    text: Option<String>,
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
    anthropic_api_key: Option<String>,
    deepseek_api_key: Option<String>,
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
            anthropic_api_key: std::env::var("ANTHROPIC_API_KEY").ok(),
            deepseek_api_key: std::env::var("DEEPSEEK_API_KEY").ok(),
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
        Some("claude" | "anthropic") => AiProvider::Claude,
        Some("deepseek") => AiProvider::DeepSeek,
        Some("openrouter") => AiProvider::OpenRouter,
        Some(value) => {
            return Err(AppError::GitError(format!(
                "Unsupported AI provider '{}'. Expected openai, claude, deepseek, or openrouter.",
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
        AiProvider::Claude => trimmed_option(env.anthropic_api_key.as_deref()),
        AiProvider::DeepSeek => trimmed_option(env.deepseek_api_key.as_deref()),
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

fn saved_api_key(
    existing: &AiConfigFile,
    provider: AiProvider,
    requested_api_key: Option<String>,
) -> String {
    match requested_api_key {
        Some(api_key) => trimmed_option(Some(&api_key)).unwrap_or_default(),
        None if existing.provider == Some(provider) => trimmed_option(existing.api_key.as_deref())
            .or_else(|| trimmed_option(existing.ai_api_key.as_deref()))
            .unwrap_or_default(),
        None => String::new(),
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

    let stored_api_key = saved_api_key(&existing, request.provider, request.api_key);

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

pub fn list_ai_models(
    app_handle: &tauri::AppHandle,
    request: ListAiModelsRequest,
) -> Result<AiModelListView, AppError> {
    list_ai_models_from(
        request,
        load_config_file(app_handle)?,
        AiEnv::from_process(),
    )
}

fn list_ai_models_from(
    request: ListAiModelsRequest,
    existing: Option<AiConfigFile>,
    env: AiEnv,
) -> Result<AiModelListView, AppError> {
    let provider = request.provider;
    let endpoint = trimmed_option(request.endpoint.as_deref())
        .unwrap_or_else(|| provider.default_endpoint().to_string());
    validate_endpoint(&endpoint)?;

    let effective_provider = resolve_effective_config_from(existing.clone(), env.clone())?.provider;
    let configured_model = (effective_provider == provider)
        .then(|| {
            trimmed_option(env.giteye_model.as_deref()).or_else(|| {
                existing.as_ref().and_then(|config| {
                    trimmed_option(config.model.as_deref())
                        .or_else(|| trimmed_option(config.ai_model.as_deref()))
                })
            })
        })
        .flatten();
    let inline_api_key = trimmed_option(request.api_key.as_deref());
    let provider_endpoint = endpoint_matches_provider_origin(&endpoint, provider);
    if !provider_endpoint && inline_api_key.is_none() {
        return Ok(fallback_model_list(
            provider,
            configured_model.as_deref(),
            "Custom endpoints do not receive stored or environment API keys; enter a key and refresh explicitly."
                .to_string(),
        ));
    }
    if inline_api_key.is_some() && !endpoint_accepts_inline_key(&endpoint) {
        return Ok(fallback_model_list(
            provider,
            configured_model.as_deref(),
            "API keys are not sent to non-HTTPS model endpoints.".to_string(),
        ));
    }

    let implicit_api_key = provider_endpoint
        .then(|| {
            trimmed_option(env.giteye_api_key.as_deref())
                .or_else(|| match provider {
                    AiProvider::OpenAi => trimmed_option(env.openai_api_key.as_deref()),
                    AiProvider::Claude => trimmed_option(env.anthropic_api_key.as_deref()),
                    AiProvider::DeepSeek => trimmed_option(env.deepseek_api_key.as_deref()),
                    AiProvider::OpenRouter => trimmed_option(env.openrouter_api_key.as_deref()),
                })
                .or_else(|| {
                    existing.as_ref().and_then(|config| {
                        (config.provider == Some(provider))
                            .then(|| {
                                trimmed_option(config.api_key.as_deref())
                                    .or_else(|| trimmed_option(config.ai_api_key.as_deref()))
                            })
                            .flatten()
                    })
                })
        })
        .flatten();
    let api_key = inline_api_key.or(implicit_api_key);

    if provider != AiProvider::OpenRouter && api_key.is_none() {
        return Ok(fallback_model_list(
            provider,
            configured_model.as_deref(),
            "API key missing; showing default models.".to_string(),
        ));
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::GitError(format!("AI HTTP client setup failed: {e}")))?;

    match fetch_live_models(&client, provider, &endpoint, api_key.as_deref()) {
        Ok(models) => Ok(AiModelListView {
            provider,
            models: finalize_model_list(models, configured_model.as_deref()),
            source: AiModelListSource::Live,
            warning: None,
        }),
        Err(reason) => Ok(fallback_model_list(
            provider,
            configured_model.as_deref(),
            format!(
                "Could not fetch live {} models; showing default models. {}",
                provider.label(),
                reason
            ),
        )),
    }
}

fn endpoint_matches_provider_origin(endpoint: &str, provider: AiProvider) -> bool {
    let Ok(endpoint) = reqwest::Url::parse(endpoint) else {
        return false;
    };
    let Ok(default_endpoint) = reqwest::Url::parse(provider.default_endpoint()) else {
        return false;
    };

    endpoint.scheme() == default_endpoint.scheme()
        && endpoint.host_str() == default_endpoint.host_str()
        && endpoint.port_or_known_default() == default_endpoint.port_or_known_default()
}

fn endpoint_accepts_inline_key(endpoint: &str) -> bool {
    let Ok(endpoint) = reqwest::Url::parse(endpoint) else {
        return false;
    };
    if endpoint.scheme() == "https" {
        return true;
    }

    cfg!(test)
        && endpoint.scheme() == "http"
        && matches!(endpoint.host_str(), Some("127.0.0.1" | "::1" | "localhost"))
}

fn fallback_model_list(
    provider: AiProvider,
    configured_model: Option<&str>,
    warning: String,
) -> AiModelListView {
    let models = provider
        .models()
        .iter()
        .map(|model| AiModelView {
            id: (*model).to_string(),
            label: (*model).to_string(),
            context_length: None,
        })
        .collect();

    AiModelListView {
        provider,
        models: finalize_model_list(models, configured_model),
        source: AiModelListSource::Fallback,
        warning: Some(warning),
    }
}

fn finalize_model_list(
    mut models: Vec<AiModelView>,
    configured_model: Option<&str>,
) -> Vec<AiModelView> {
    models.retain(|model| !model.id.trim().is_empty());
    models.sort_by(|left, right| left.id.cmp(&right.id));
    models.dedup_by(|left, right| left.id == right.id);
    models.sort_by(|left, right| {
        left.label
            .to_ascii_lowercase()
            .cmp(&right.label.to_ascii_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });

    if let Some(model) = configured_model
        .filter(|model| !model.is_empty() && !models.iter().any(|candidate| candidate.id == *model))
    {
        models.insert(
            0,
            AiModelView {
                id: model.to_string(),
                label: format!("{model} (configured)"),
                context_length: None,
            },
        );
    }

    models
}

fn fetch_live_models(
    client: &reqwest::blocking::Client,
    provider: AiProvider,
    endpoint: &str,
    api_key: Option<&str>,
) -> Result<Vec<AiModelView>, String> {
    let endpoint = endpoint.trim_end_matches('/');
    match provider {
        AiProvider::OpenAi | AiProvider::DeepSeek => {
            let response = client
                .get(format!("{endpoint}/models"))
                .header(
                    "Authorization",
                    format!("Bearer {}", api_key.expect("authenticated provider key")),
                )
                .send()
                .map_err(|error| error.to_string())?;
            let response = successful_response(response)?;
            let payload = response
                .json::<ModelListResponse<ModelIdResponse>>()
                .map_err(|error| format!("Invalid model response: {error}"))?;
            Ok(payload
                .data
                .into_iter()
                .map(|model| AiModelView {
                    label: model.id.clone(),
                    id: model.id,
                    context_length: None,
                })
                .collect())
        }
        AiProvider::Claude => {
            let mut models = Vec::new();
            let mut after_id: Option<String> = None;
            for _ in 0..10 {
                let mut request = client
                    .get(format!("{endpoint}/models"))
                    .header("x-api-key", api_key.expect("authenticated provider key"))
                    .header("anthropic-version", "2023-06-01")
                    .query(&[("limit", "100")]);
                if let Some(after_id) = after_id.as_deref() {
                    request = request.query(&[("after_id", after_id)]);
                }
                let response = request.send().map_err(|error| error.to_string())?;
                let response = successful_response(response)?;
                let payload = response
                    .json::<ClaudeModelListResponse>()
                    .map_err(|error| format!("Invalid model response: {error}"))?;
                models.extend(payload.data.into_iter().map(|model| AiModelView {
                    label: model.display_name.unwrap_or_else(|| model.id.clone()),
                    id: model.id,
                    context_length: None,
                }));
                if !payload.has_more {
                    break;
                }
                let Some(last_id) = payload.last_id else {
                    break;
                };
                after_id = Some(last_id);
            }
            Ok(models)
        }
        AiProvider::OpenRouter => {
            let mut request = client.get(format!("{endpoint}/models"));
            if let Some(api_key) = api_key {
                request = request.header("Authorization", format!("Bearer {api_key}"));
            }
            let response = request.send().map_err(|error| error.to_string())?;
            let response = successful_response(response)?;
            let payload = response
                .json::<ModelListResponse<OpenRouterModelResponse>>()
                .map_err(|error| format!("Invalid model response: {error}"))?;
            Ok(payload
                .data
                .into_iter()
                .map(|model| AiModelView {
                    label: model.name.unwrap_or_else(|| model.id.clone()),
                    id: model.id,
                    context_length: model.context_length,
                })
                .collect())
        }
    }
}

fn successful_response(
    response: reqwest::blocking::Response,
) -> Result<reqwest::blocking::Response, String> {
    if response.status().is_success() {
        Ok(response)
    } else {
        Err(format!("HTTP {}", response.status().as_u16()))
    }
}

impl AiConfig {
    fn to_view(&self) -> AiConfigView {
        AiConfigView {
            provider: self.provider,
            model: self.model.clone(),
            endpoint: self.endpoint.clone(),
            api_key_configured: !self.api_key.is_empty(),
            api_key_source: self.api_key_source,
            providers: [
                AiProvider::OpenAi,
                AiProvider::Claude,
                AiProvider::DeepSeek,
                AiProvider::OpenRouter,
            ]
            .into_iter()
            .map(|provider| AiProviderView {
                id: provider,
                label: provider.label().to_string(),
                default_endpoint: provider.default_endpoint().to_string(),
                default_model: provider.default_model().to_string(),
                models: provider
                    .models()
                    .iter()
                    .map(|model| model.to_string())
                    .collect(),
            })
            .collect(),
        }
    }
}

fn call_ai(config: &AiConfig, system_prompt: &str, user_prompt: &str) -> Result<String, AppError> {
    if config.api_key.is_empty() {
        return Err(AppError::GitError(
            "AI is not configured. Set an API key in Settings or the provider's API key environment variable.".to_string(),
        ));
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::GitError(format!("AI HTTP client setup failed: {e}")))?;
    let endpoint = config.endpoint.trim_end_matches('/');
    let builder = if config.provider == AiProvider::Claude {
        client
            .post(format!("{endpoint}/messages"))
            .header("x-api-key", &config.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&ClaudeRequest {
                model: config.model.clone(),
                system: system_prompt.to_string(),
                messages: vec![ChatMessage {
                    role: "user".to_string(),
                    content: user_prompt.to_string(),
                }],
                temperature: 0.2,
                max_tokens: 2048,
            })
    } else {
        let mut builder = client
            .post(format!("{endpoint}/chat/completions"))
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&ChatRequest {
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
            });
        if config.provider == AiProvider::OpenRouter {
            builder = builder.header("X-OpenRouter-Title", "GitEye");
        }
        builder
    };

    let response = builder
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

    let content = if config.provider == AiProvider::Claude {
        let body: ClaudeResponse = serde_json::from_str(&text)
            .map_err(|e| AppError::GitError(format!("AI API response parse failed: {e}")))?;
        body.content.into_iter().find_map(|content| content.text)
    } else {
        let body: ChatResponse = serde_json::from_str(&text)
            .map_err(|e| AppError::GitError(format!("AI API response parse failed: {e}")))?;
        body.choices
            .first()
            .map(|choice| choice.message.content.clone())
    };

    content
        .and_then(|content| trimmed_option(Some(&content)))
        .ok_or_else(|| AppError::GitError("AI returned no text content.".to_string()))
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

    if diffs.is_empty() {
        return Err(AppError::GitError(
            "Stage at least one file before generating a commit message.".to_string(),
        ));
    }

    let full_diff_text: String = diffs
        .iter()
        .map(|d| {
            format!(
                "File: {}\nStatus: {}\nDiff:\n{}",
                d.file_path, d.status, d.diff_text
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");
    let diff_text: String = full_diff_text.chars().take(MAX_COMMIT_DIFF_CHARS).collect();

    let user = format!(
        "Generate a commit message for these changes:\n\n{}{}",
        diff_text,
        if full_diff_text.chars().count() > MAX_COMMIT_DIFF_CHARS {
            "\n\n[Diff truncated to fit the AI context window]"
        } else {
            ""
        }
    );

    call_ai(&config, system, &user)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
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

    #[test]
    fn commit_message_diff_deserializes_frontend_camel_case() {
        let diff: CommitMessageDiff = serde_json::from_str(
            r#"{"filePath":"src/main.rs","status":"modified","diffText":"+change"}"#,
        )
        .expect("camel-case commit diff");

        assert_eq!(diff.file_path, "src/main.rs");
        assert_eq!(diff.status, "modified");
        assert_eq!(diff.diff_text, "+change");
    }

    #[test]
    fn switching_provider_does_not_reuse_another_providers_key() {
        let existing = AiConfigFile {
            provider: Some(AiProvider::OpenRouter),
            api_key: Some("router-key".to_string()),
            ..AiConfigFile::default()
        };

        assert_eq!(
            saved_api_key(&existing, AiProvider::OpenRouter, None),
            "router-key"
        );
        assert!(saved_api_key(&existing, AiProvider::Claude, None).is_empty());
    }

    fn serve_once(
        status: &'static str,
        body: impl Into<String>,
    ) -> (String, thread::JoinHandle<String>) {
        let body = body.into();
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

    fn list_request(
        provider: AiProvider,
        endpoint: String,
        api_key: Option<&str>,
    ) -> ListAiModelsRequest {
        ListAiModelsRequest {
            provider,
            endpoint: Some(endpoint),
            api_key: api_key.map(str::to_string),
        }
    }

    #[test]
    fn openai_model_list_parses_live_models_and_sends_bearer_auth() {
        let (endpoint, handle) = serve_once("200 OK", r#"{"data":[{"id":"gpt-4o"}]}"#);

        let result = list_ai_models_from(
            list_request(AiProvider::OpenAi, endpoint, Some("secret")),
            None,
            AiEnv::default(),
        )
        .expect("model list");
        let request = handle.join().expect("server request");

        assert_eq!(result.source, AiModelListSource::Live);
        assert_eq!(result.models.len(), 1);
        assert_eq!(result.models[0].id, "gpt-4o");
        assert!(request.starts_with("GET /models HTTP/1.1"), "{request}");
        assert!(
            request
                .to_ascii_lowercase()
                .contains("authorization: bearer secret"),
            "{request}"
        );
    }

    #[test]
    fn configured_model_missing_from_live_catalog_is_kept_first() {
        let (endpoint, handle) = serve_once("200 OK", r#"{"data":[{"id":"gpt-4o"}]}"#);
        let existing = AiConfigFile {
            provider: Some(AiProvider::OpenAi),
            model: Some("private-deployment".to_string()),
            ..AiConfigFile::default()
        };

        let result = list_ai_models_from(
            list_request(AiProvider::OpenAi, endpoint, Some("secret")),
            Some(existing),
            AiEnv::default(),
        )
        .expect("model list");
        let _request = handle.join().expect("server request");

        assert_eq!(result.models[0].id, "private-deployment");
        assert_eq!(result.models[0].label, "private-deployment (configured)");
        assert_eq!(result.models[1].id, "gpt-4o");
    }

    #[test]
    fn claude_model_list_maps_display_name_and_sends_anthropic_headers() {
        let (endpoint, handle) = serve_once(
            "200 OK",
            r#"{"data":[{"id":"claude-sonnet-4-20250514","display_name":"Claude Sonnet 4"}],"has_more":false}"#,
        );

        let result = list_ai_models_from(
            list_request(AiProvider::Claude, endpoint, Some("claude-secret")),
            None,
            AiEnv::default(),
        )
        .expect("model list");
        let request = handle.join().expect("server request");
        let lower = request.to_ascii_lowercase();

        assert_eq!(result.source, AiModelListSource::Live);
        assert_eq!(result.models[0].label, "Claude Sonnet 4");
        assert!(
            request.starts_with("GET /models?limit=100 HTTP/1.1"),
            "{request}"
        );
        assert!(lower.contains("x-api-key: claude-secret"), "{request}");
        assert!(lower.contains("anthropic-version: 2023-06-01"), "{request}");
    }

    #[test]
    fn deepseek_model_list_uses_base_models_endpoint() {
        let (endpoint, handle) = serve_once("200 OK", r#"{"data":[{"id":"deepseek-chat"}]}"#);

        let result = list_ai_models_from(
            list_request(AiProvider::DeepSeek, endpoint, Some("deepseek-secret")),
            None,
            AiEnv::default(),
        )
        .expect("model list");
        let request = handle.join().expect("server request");

        assert_eq!(result.source, AiModelListSource::Live);
        assert_eq!(result.models[0].id, "deepseek-chat");
        assert!(request.starts_with("GET /models HTTP/1.1"), "{request}");
    }

    #[test]
    fn openrouter_model_list_handles_large_unauthenticated_catalog() {
        let mut models = (0..400)
            .rev()
            .map(|index| {
                serde_json::json!({
                    "id": format!("provider/model-{index:03}"),
                    "name": format!("Model {index:03}"),
                    "context_length": 128_000,
                })
            })
            .collect::<Vec<_>>();
        models.push(models[0].clone());
        let body = serde_json::json!({ "data": models }).to_string();
        let (endpoint, handle) = serve_once("200 OK", body);
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("test client");

        let models = fetch_live_models(&client, AiProvider::OpenRouter, &endpoint, None)
            .map(|models| finalize_model_list(models, None))
            .expect("model list");
        let request = handle.join().expect("server request");

        assert_eq!(models.len(), 400);
        assert_eq!(models[0].label, "Model 000");
        assert_eq!(models[0].context_length, Some(128_000));
        assert!(!request.to_ascii_lowercase().contains("authorization:"));
    }

    #[test]
    fn missing_openai_key_returns_fallback_models_with_warning() {
        let result = list_ai_models_from(
            ListAiModelsRequest {
                provider: AiProvider::OpenAi,
                endpoint: None,
                api_key: None,
            },
            None,
            AiEnv::default(),
        )
        .expect("fallback model list");

        assert_eq!(result.source, AiModelListSource::Fallback);
        assert!(!result.models.is_empty());
        assert_eq!(
            result.warning.as_deref(),
            Some("API key missing; showing default models.")
        );
    }

    #[test]
    fn custom_endpoint_does_not_receive_stored_or_environment_keys() {
        let existing = AiConfigFile {
            provider: Some(AiProvider::OpenAi),
            api_key: Some("stored-secret".to_string()),
            model: Some(OPENAI_DEFAULT_MODEL.to_string()),
            ..AiConfigFile::default()
        };
        let env = AiEnv {
            openai_api_key: Some("environment-secret".to_string()),
            ..AiEnv::default()
        };

        let result = list_ai_models_from(
            ListAiModelsRequest {
                provider: AiProvider::OpenAi,
                endpoint: Some("https://models.example.invalid/v1".to_string()),
                api_key: None,
            },
            Some(existing),
            env,
        )
        .expect("fallback model list");

        assert_eq!(result.source, AiModelListSource::Fallback);
        assert_eq!(
            result.warning.as_deref(),
            Some(
                "Custom endpoints do not receive stored or environment API keys; enter a key and refresh explicitly."
            )
        );
    }

    #[test]
    fn inline_key_is_not_sent_to_non_https_custom_endpoint() {
        let result = list_ai_models_from(
            ListAiModelsRequest {
                provider: AiProvider::OpenAi,
                endpoint: Some("http://models.example.invalid/v1".to_string()),
                api_key: Some("inline-secret".to_string()),
            },
            None,
            AiEnv::default(),
        )
        .expect("fallback model list");

        assert_eq!(result.source, AiModelListSource::Fallback);
        assert_eq!(
            result.warning.as_deref(),
            Some("API keys are not sent to non-HTTPS model endpoints.")
        );
        assert!(endpoint_matches_provider_origin(
            "https://api.openai.com/custom/models",
            AiProvider::OpenAi
        ));
        assert!(!endpoint_matches_provider_origin(
            "http://api.openai.com/v1",
            AiProvider::OpenAi
        ));
    }

    #[test]
    fn non_success_model_response_returns_fallback_with_provider_warning() {
        let (endpoint, handle) = serve_once("503 Service Unavailable", r#"{"error":"down"}"#);

        let result = list_ai_models_from(
            list_request(AiProvider::OpenAi, endpoint, Some("secret")),
            None,
            AiEnv::default(),
        )
        .expect("fallback model list");
        let _request = handle.join().expect("server request");

        assert_eq!(result.source, AiModelListSource::Fallback);
        assert!(!result.models.is_empty());
        assert!(result.warning.as_deref().is_some_and(|warning| warning
            .starts_with("Could not fetch live OpenAI models; showing default models.")));
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
            giteye_provider: Some("unknown".to_string()),
            ..AiEnv::default()
        };

        let error = resolve_effective_config_from(None, env).expect_err("invalid provider");

        assert_eq!(
            git_error_message(error),
            "Unsupported AI provider 'unknown'. Expected openai, claude, deepseek, or openrouter."
        );
    }

    #[test]
    fn anthropic_alias_uses_claude_defaults_and_environment_key() {
        let env = AiEnv {
            giteye_provider: Some("anthropic".to_string()),
            anthropic_api_key: Some("claude-key".to_string()),
            ..AiEnv::default()
        };

        let config = resolve_effective_config_from(None, env).expect("config");

        assert_eq!(config.provider, AiProvider::Claude);
        assert_eq!(config.endpoint, CLAUDE_DEFAULT_ENDPOINT);
        assert_eq!(config.model, CLAUDE_DEFAULT_MODEL);
        assert_eq!(config.api_key, "claude-key");
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
    fn claude_request_uses_messages_api_and_anthropic_headers() {
        let (endpoint, handle) =
            serve_once("200 OK", r#"{"content":[{"type":"text","text":"ok"}]}"#);
        let config = AiConfig {
            provider: AiProvider::Claude,
            endpoint,
            api_key: "claude-secret".to_string(),
            model: CLAUDE_DEFAULT_MODEL.to_string(),
            api_key_source: AiApiKeySource::Stored,
        };

        let result = call_ai(&config, "system", "user").expect("ai response");
        let request = handle.join().expect("server request");
        let lower = request.to_ascii_lowercase();

        assert_eq!(result, "ok");
        assert!(request.starts_with("POST /messages HTTP/1.1"), "{request}");
        assert!(lower.contains("x-api-key: claude-secret"), "{request}");
        assert!(lower.contains("anthropic-version: 2023-06-01"), "{request}");
        assert!(request.contains(r#""system":"system""#), "{request}");
        assert!(!lower.contains("authorization: bearer"), "{request}");
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
