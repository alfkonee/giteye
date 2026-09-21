use crate::errors::AppError;
use crate::git::ai_service;
use crate::storage;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExportBundle {
    pub version: String,
    pub exported_at: String,
    pub theme: String,
    pub diff_mode: String,
    #[serde(default)]
    pub background_pull_request_loading: bool,
    #[serde(default)]
    pub ai_config: Option<AiExportConfig>,
    pub recent_repositories: Vec<storage::RecentRepo>,
    pub favorite_repositories: Vec<storage::FavoriteRepo>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiExportConfig {
    pub provider: crate::git::ai_service::AiProvider,
    pub model: String,
    #[serde(default)]
    pub prompts: Option<ai_service::AiPrompts>,
    #[serde(default)]
    pub merge_resolution: Option<ai_service::AiWorkflowConfig>,
}

#[tauri::command]
pub async fn export_settings(
    app_handle: tauri::AppHandle,
    output_path: String,
    theme: String,
    diff_mode: String,
    background_pull_request_loading: bool,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let recents = storage::load_recent_repositories(&app_handle)?;
        let favorites = storage::load_favorite_repositories(&app_handle)?;
        let ai_config = ai_service::get_ai_config(&app_handle)?;

        let bundle = ExportBundle {
            version: env!("CARGO_PKG_VERSION").to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            theme,
            diff_mode,
            background_pull_request_loading,
            ai_config: Some(AiExportConfig {
                provider: ai_config.provider,
                model: ai_config.model,
                prompts: Some(ai_config.prompts),
                merge_resolution: ai_config.merge_resolution,
            }),
            recent_repositories: recents,
            favorite_repositories: favorites,
        };

        let json = serde_json::to_string_pretty(&bundle)
            .map_err(|e| AppError::SerializationError(e.to_string()))?;

        fs::write(Path::new(&output_path), json)
            .map_err(|e| AppError::StorageError(e.to_string()))?;

        Ok(format!("Settings exported to {output_path}"))
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[tauri::command]
pub async fn import_settings(
    app_handle: tauri::AppHandle,
    input_path: String,
) -> Result<ExportBundle, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let data = fs::read_to_string(Path::new(&input_path))
            .map_err(|e| AppError::StorageError(e.to_string()))?;

        let bundle: ExportBundle = serde_json::from_str(&data)
            .map_err(|e| AppError::SerializationError(format!("Invalid settings file: {}", e)))?;

        for repo in &bundle.recent_repositories {
            let _ = storage::save_recent_repository(&app_handle, &repo.path, &repo.name);
        }

        for fav in &bundle.favorite_repositories {
            let _ = storage::set_repository_favorite(&app_handle, &fav.path, &fav.name, true);
        }

        if let Some(ai_config) = &bundle.ai_config {
            let prompts = match ai_config.prompts.clone() {
                Some(prompts) => prompts,
                None => ai_service::get_ai_config(&app_handle)?.default_prompts,
            };
            let _ = ai_service::save_ai_config(
                &app_handle,
                ai_service::SaveAiConfigRequest {
                    provider: Some(ai_config.provider),
                    model: Some(ai_config.model.clone()),
                    prompts: Some(ai_service::AiPromptUpdate {
                        commit_message: Some(prompts.commit_message),
                        conflict_resolution: Some(prompts.conflict_resolution),
                    }),
                    // An old bundle without the field explicitly restores inheritance.
                    merge_resolution: Some(ai_config.merge_resolution.clone()),
                    ..ai_service::SaveAiConfigRequest::default()
                },
            )?;
        }

        Ok(bundle)
    })
    .await
    .map_err(|error| AppError::IoError(error.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portable_ai_config_round_trips_workflow_and_prompts_but_not_credentials() {
        let config: AiExportConfig = serde_json::from_value(serde_json::json!({
            "provider": "openai",
            "model": "default-model",
            "apiKey": "legacy-secret",
            "mergeApiKey": "merge-secret",
            "mergeResolution": {"provider": "claude", "model": "merge-model"},
            "prompts": {
                "commitMessage": "Commit instructions",
                "conflictResolution": "Merge instructions",
            },
        }))
        .unwrap();
        let encoded = serde_json::to_string(&config).unwrap();
        assert!(!encoded.contains("legacy-secret"));
        assert!(!encoded.contains("merge-secret"));
        let restored: AiExportConfig = serde_json::from_str(&encoded).unwrap();
        assert_eq!(restored.merge_resolution.unwrap().model, "merge-model");
        assert_eq!(
            restored.prompts.unwrap().conflict_resolution,
            "Merge instructions"
        );
    }

    #[test]
    fn older_ai_exports_deserialize_to_workflow_inheritance() {
        let old: AiExportConfig =
            serde_json::from_str(r#"{"provider":"deepseek","model":"deepseek-chat"}"#).unwrap();
        assert!(old.merge_resolution.is_none());
        assert!(old.prompts.is_none());
    }
}
