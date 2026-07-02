use crate::errors::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepo {
    pub path: String,
    pub name: String,
    pub last_opened_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteRepo {
    pub path: String,
    pub name: String,
    pub favorited_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub git_executable_path: Option<String>,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub diff_mode: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            git_executable_path: None,
            user_name: None,
            user_email: None,
            diff_mode: "unified".to_string(),
        }
    }
}

fn get_storage_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::StorageError(e.to_string()))?;
    fs::create_dir_all(&dir).map_err(|e| AppError::StorageError(e.to_string()))?;
    Ok(dir)
}

fn recent_repos_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    Ok(get_storage_dir(app_handle)?.join("recent_repositories.json"))
}

fn favorite_repos_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    Ok(get_storage_dir(app_handle)?.join("favorite_repositories.json"))
}

fn app_settings_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    Ok(get_storage_dir(app_handle)?.join("app_settings.json"))
}

fn clean_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_app_settings(mut settings: AppSettings) -> AppSettings {
    let default = AppSettings::default();
    if !matches!(settings.theme.as_str(), "dark" | "light") {
        settings.theme = default.theme;
    }
    if !matches!(settings.diff_mode.as_str(), "unified" | "split") {
        settings.diff_mode = default.diff_mode;
    }
    settings.git_executable_path = clean_optional_string(settings.git_executable_path);
    settings.user_name = clean_optional_string(settings.user_name);
    settings.user_email = clean_optional_string(settings.user_email);
    settings
}

fn normalize_repo_path(path: &str) -> String {
    let path_buf = PathBuf::from(path);
    path_buf
        .canonicalize()
        .unwrap_or(path_buf)
        .to_string_lossy()
        .trim_end_matches(&['/', '\\'][..])
        .to_string()
}

fn dedupe_favorites_by_path(mut favorites: Vec<FavoriteRepo>) -> Vec<FavoriteRepo> {
    favorites.sort_by(|a, b| b.favorited_at.cmp(&a.favorited_at));
    let mut deduped = Vec::with_capacity(favorites.len());

    for mut favorite in favorites {
        favorite.path = normalize_repo_path(&favorite.path);
        if !deduped
            .iter()
            .any(|existing: &FavoriteRepo| existing.path == favorite.path)
        {
            deduped.push(favorite);
        }
    }

    deduped
}

fn dedupe_by_path(recents: Vec<RecentRepo>) -> Vec<RecentRepo> {
    let mut deduped = Vec::with_capacity(recents.len());
    for mut repo in recents {
        repo.path = normalize_repo_path(&repo.path);
        if !deduped
            .iter()
            .any(|existing: &RecentRepo| existing.path == repo.path)
        {
            deduped.push(repo);
        }
    }
    deduped
}

fn write_recent_repositories(
    app_handle: &tauri::AppHandle,
    recents: &[RecentRepo],
) -> Result<(), AppError> {
    let path = recent_repos_path(app_handle)?;
    let data = serde_json::to_string_pretty(recents)
        .map_err(|e| AppError::SerializationError(e.to_string()))?;
    fs::write(&path, data).map_err(|e| AppError::StorageError(e.to_string()))
}

pub fn load_recent_repositories(
    app_handle: &tauri::AppHandle,
) -> Result<Vec<RecentRepo>, AppError> {
    let path = recent_repos_path(app_handle)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = fs::read_to_string(&path).map_err(|e| AppError::StorageError(e.to_string()))?;
    let recents: Vec<RecentRepo> =
        serde_json::from_str(&data).map_err(|e| AppError::SerializationError(e.to_string()))?;
    let deduped = dedupe_by_path(recents.clone());
    if deduped != recents {
        write_recent_repositories(app_handle, &deduped)?;
    }
    Ok(deduped)
}

pub fn save_recent_repository(
    app_handle: &tauri::AppHandle,
    repo_path: &str,
    name: &str,
) -> Result<(), AppError> {
    let normalized_path = normalize_repo_path(repo_path);
    let mut recents = dedupe_by_path(load_recent_repositories(app_handle)?);

    recents.retain(|r| r.path != normalized_path);

    recents.insert(
        0,
        RecentRepo {
            path: normalized_path,
            name: name.to_string(),
            last_opened_at: chrono::Utc::now().to_rfc3339(),
        },
    );

    // Limit to 20
    recents.truncate(20);

    write_recent_repositories(app_handle, &recents)
}

fn write_favorite_repositories(
    app_handle: &tauri::AppHandle,
    favorites: &[FavoriteRepo],
) -> Result<(), AppError> {
    let path = favorite_repos_path(app_handle)?;
    let data = serde_json::to_string_pretty(favorites)
        .map_err(|e| AppError::SerializationError(e.to_string()))?;
    fs::write(&path, data).map_err(|e| AppError::StorageError(e.to_string()))
}

pub fn load_favorite_repositories(
    app_handle: &tauri::AppHandle,
) -> Result<Vec<FavoriteRepo>, AppError> {
    let path = favorite_repos_path(app_handle)?;
    if !path.exists() {
        return Ok(vec![]);
    }

    let data = fs::read_to_string(&path).map_err(|e| AppError::StorageError(e.to_string()))?;
    let favorites: Vec<FavoriteRepo> =
        serde_json::from_str(&data).map_err(|e| AppError::SerializationError(e.to_string()))?;
    let favorites = dedupe_favorites_by_path(favorites);
    write_favorite_repositories(app_handle, &favorites)?;
    Ok(favorites)
}

pub fn set_repository_favorite(
    app_handle: &tauri::AppHandle,
    repo_path: &str,
    name: &str,
    favorite: bool,
) -> Result<Vec<FavoriteRepo>, AppError> {
    let normalized_path = normalize_repo_path(repo_path);
    let mut favorites = load_favorite_repositories(app_handle)?;
    favorites.retain(|repo| repo.path != normalized_path);

    if favorite {
        favorites.insert(
            0,
            FavoriteRepo {
                path: normalized_path,
                name: name.to_string(),
                favorited_at: chrono::Utc::now().to_rfc3339(),
            },
        );
    }

    write_favorite_repositories(app_handle, &favorites)?;
    Ok(favorites)
}

pub fn load_app_settings(app_handle: &tauri::AppHandle) -> Result<AppSettings, AppError> {
    let path = app_settings_path(app_handle)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let data = fs::read_to_string(&path).map_err(|e| AppError::StorageError(e.to_string()))?;
    let raw_settings = serde_json::from_str::<AppSettings>(&data).ok();
    let settings = normalize_app_settings(raw_settings.clone().unwrap_or_default());
    if raw_settings.as_ref() != Some(&settings) {
        write_app_settings(app_handle, &settings)?;
    }
    Ok(settings)
}

pub fn save_app_settings(
    app_handle: &tauri::AppHandle,
    settings: AppSettings,
) -> Result<AppSettings, AppError> {
    let settings = normalize_app_settings(settings);
    write_app_settings(app_handle, &settings)?;
    Ok(settings)
}

fn write_app_settings(
    app_handle: &tauri::AppHandle,
    settings: &AppSettings,
) -> Result<(), AppError> {
    let path = app_settings_path(app_handle)?;
    let data = serde_json::to_string_pretty(settings)
        .map_err(|e| AppError::SerializationError(e.to_string()))?;
    fs::write(&path, data).map_err(|e| AppError::StorageError(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedupe_by_path_keeps_first_recent_for_each_normalized_path() {
        let recents = vec![
            RecentRepo {
                path: "/tmp/project/".to_string(),
                name: "first".to_string(),
                last_opened_at: "2026-06-03T10:00:00Z".to_string(),
            },
            RecentRepo {
                path: "/tmp/project".to_string(),
                name: "second".to_string(),
                last_opened_at: "2026-06-03T11:00:00Z".to_string(),
            },
            RecentRepo {
                path: "/tmp/other".to_string(),
                name: "other".to_string(),
                last_opened_at: "2026-06-03T12:00:00Z".to_string(),
            },
        ];

        let deduped = dedupe_by_path(recents);

        assert_eq!(deduped.len(), 2);
        assert_eq!(deduped[0].name, "first");
        assert_eq!(deduped[0].path, "/tmp/project");
        assert_eq!(deduped[1].path, "/tmp/other");
    }

    #[test]
    fn dedupe_favorites_by_path_keeps_newest_favorite_for_each_normalized_path() {
        let favorites = vec![
            FavoriteRepo {
                path: "/tmp/project".to_string(),
                name: "older".to_string(),
                favorited_at: "2026-06-03T10:00:00Z".to_string(),
            },
            FavoriteRepo {
                path: "/tmp/other".to_string(),
                name: "other".to_string(),
                favorited_at: "2026-06-03T11:00:00Z".to_string(),
            },
            FavoriteRepo {
                path: "/tmp/project/".to_string(),
                name: "newer".to_string(),
                favorited_at: "2026-06-03T12:00:00Z".to_string(),
            },
        ];

        let deduped = dedupe_favorites_by_path(favorites);

        assert_eq!(deduped.len(), 2);
        assert_eq!(deduped[0].name, "newer");
        assert_eq!(deduped[0].path, "/tmp/project");
        assert_eq!(deduped[1].path, "/tmp/other");
    }

    #[test]
    fn normalize_app_settings_rejects_unknown_values_and_trims_optional_fields() {
        let settings = normalize_app_settings(AppSettings {
            theme: "solarized".to_string(),
            git_executable_path: Some("  /usr/bin/git  ".to_string()),
            user_name: Some("  ".to_string()),
            user_email: Some(" user@example.com ".to_string()),
            diff_mode: "side-by-side".to_string(),
        });

        assert_eq!(settings.theme, "dark");
        assert_eq!(
            settings.git_executable_path.as_deref(),
            Some("/usr/bin/git")
        );
        assert_eq!(settings.user_name, None);
        assert_eq!(settings.user_email.as_deref(), Some("user@example.com"));
        assert_eq!(settings.diff_mode, "unified");
    }
}
