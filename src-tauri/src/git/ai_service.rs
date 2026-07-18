use crate::errors::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::Manager;

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
    #[serde(default)]
    error: Option<ChatErrorBody>,
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
struct ChatErrorBody {
    message: String,
}

struct AiConfig {
    endpoint: String,
    api_key: String,
    model: String,
}

fn load_config(app_handle: &tauri::AppHandle) -> Result<AiConfig, AppError> {
    let api_key = std::env::var("GITEYE_AI_API_KEY")
        .or_else(|_| load_config_value(app_handle, "ai_api_key"))
        .unwrap_or_default();

    let endpoint = std::env::var("GITEYE_AI_ENDPOINT")
        .or_else(|_| load_config_value(app_handle, "ai_endpoint"))
        .unwrap_or_else(|_| "https://api.openai.com/v1".to_string());

    let model = std::env::var("GITEYE_AI_MODEL")
        .or_else(|_| load_config_value(app_handle, "ai_model"))
        .unwrap_or_else(|_| "gpt-4o-mini".to_string());

    Ok(AiConfig {
        endpoint: endpoint.trim_end_matches('/').to_string(),
        api_key,
        model,
    })
}

fn load_config_value(app_handle: &tauri::AppHandle, key: &str) -> Result<String, AppError> {
    let dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let path = dir.join("ai_config.json");
    if !path.exists() {
        return Err(AppError::StorageError("not found".to_string()));
    }
    let data = fs::read_to_string(&path)
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    let config: serde_json::Value = serde_json::from_str(&data)
        .map_err(|e| AppError::SerializationError(e.to_string()))?;
    config[key]
        .as_str()
        .map(String::from)
        .ok_or_else(|| AppError::StorageError(format!("Key {key} not found")))
}

fn call_ai(config: &AiConfig, system_prompt: &str, user_prompt: &str) -> Result<String, AppError> {
    if config.api_key.is_empty() {
        return Err(AppError::GitError(
            "AI is not configured. Set the GITEYE_AI_API_KEY environment variable or add an api_key in ai_config.json.".to_string(),
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

    let response = client
        .post(format!("{}/chat/completions", config.endpoint))
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .map_err(|e| AppError::GitError(format!("AI API request failed: {e}")))?;

    let body: ChatResponse = response
        .json()
        .map_err(|e| AppError::GitError(format!("AI API response parse failed: {e}")))?;

    if let Some(error) = body.error {
        return Err(AppError::GitError(format!("AI API error: {}", error.message)));
    }

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
    let config = load_config(app_handle)?;

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
    let config = load_config(app_handle)?;

    let system = "You are a commit message assistant. Generate a concise, conventional commit message based on the diff. Use the format: <type>: <subject>. Types: feat, fix, refactor, docs, test, chore. Keep subject under 72 characters. If the diff is large, summarize the primary change.";

    let diff_text: String = diffs
        .iter()
        .map(|d| format!("File: {}\nStatus: {}\nDiff:\n{}", d.file_path, d.status, d.diff_text))
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");

    let user = format!("Generate a commit message for these changes:\n\n{}", diff_text);

    call_ai(&config, system, &user)
}

#[derive(Deserialize)]
pub struct CommitMessageDiff {
    pub file_path: String,
    pub status: String,
    pub diff_text: String,
}
