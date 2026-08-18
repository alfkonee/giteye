use crate::errors::AppError;
use crate::models::job::GitJobRecord;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use tauri::Manager;

static APP_SETTINGS_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static RECOVERY_JOBS_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct RecentRepo {
    pub path: String,
    pub name: String,
    pub last_opened_at: String,
    pub parent_path: Option<String>,
    pub parent_name: Option<String>,
    pub relationship_kind: Option<String>,
    pub is_stale: bool,
}

impl Default for RecentRepo {
    fn default() -> Self {
        Self {
            path: String::new(),
            name: String::new(),
            last_opened_at: String::new(),
            parent_path: None,
            parent_name: None,
            relationship_kind: None,
            is_stale: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct FavoriteRepo {
    pub path: String,
    pub name: String,
    pub favorited_at: String,
    pub parent_path: Option<String>,
    pub parent_name: Option<String>,
    pub relationship_kind: Option<String>,
}

impl Default for FavoriteRepo {
    fn default() -> Self {
        Self {
            path: String::new(),
            name: String::new(),
            favorited_at: String::new(),
            parent_path: None,
            parent_name: None,
            relationship_kind: None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
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

fn interrupted_git_jobs_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    Ok(get_storage_dir(app_handle)?.join("interrupted_git_jobs.json"))
}

/// Loads jobs that had not reached a terminal state when GitEye last exited.
pub fn load_interrupted_git_jobs(app_handle: &tauri::AppHandle) -> Result<Vec<GitJobRecord>, AppError> {
    let path = interrupted_git_jobs_path(app_handle)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(path).map_err(|error| AppError::StorageError(error.to_string()))?;
    serde_json::from_str(&data).map_err(|error| AppError::SerializationError(error.to_string()))
}

/// Atomically persists jobs that need recovery. Terminal history remains in memory only.
pub fn save_interrupted_git_jobs(
    app_handle: &tauri::AppHandle,
    jobs: &[GitJobRecord],
) -> Result<(), AppError> {
    let _guard = RECOVERY_JOBS_LOCK
        .lock()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let path = interrupted_git_jobs_path(app_handle)?;
    if jobs.is_empty() {
        if path.exists() {
            fs::remove_file(path).map_err(|error| AppError::StorageError(error.to_string()))?;
        }
        return Ok(());
    }

    let data = serde_json::to_vec_pretty(jobs)
        .map_err(|error| AppError::SerializationError(error.to_string()))?;
    let temporary = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let mut file =
        fs::File::create(&temporary).map_err(|error| AppError::StorageError(error.to_string()))?;
    file.write_all(&data)
        .and_then(|_| file.sync_all())
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    fs::rename(&temporary, path).map_err(|error| AppError::StorageError(error.to_string()))
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
            parent_path: None,
            parent_name: None,
            relationship_kind: None,
            is_stale: false,
        },
    );

    // Limit to 20
    recents.truncate(20);

    write_recent_repositories(app_handle, &recents)
}

pub fn remove_recent_repository(
    app_handle: &tauri::AppHandle,
    repo_path: &str,
) -> Result<Vec<RecentRepo>, AppError> {
    let normalized_path = normalize_repo_path(repo_path);
    let mut recents = load_recent_repositories(app_handle)?;
    recents.retain(|r| r.path != normalized_path);
    write_recent_repositories(app_handle, &recents)?;
    Ok(recents)
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
                parent_path: None,
                parent_name: None,
                relationship_kind: None,
            },
        );
    }

    write_favorite_repositories(app_handle, &favorites)?;
    Ok(favorites)
}

pub fn load_app_settings(app_handle: &tauri::AppHandle) -> Result<AppSettings, AppError> {
    with_app_settings_lock(app_handle, || load_app_settings_unlocked(app_handle))
}

fn load_app_settings_unlocked(app_handle: &tauri::AppHandle) -> Result<AppSettings, AppError> {
    let path = app_settings_path(app_handle)?;
    if !path.exists() {
        let backup = path.with_extension("json.backup");
        if backup.exists() {
            fs::rename(&backup, &path)
                .map_err(|error| AppError::StorageError(error.to_string()))?;
        } else {
            return Ok(AppSettings::default());
        }
    }
    let data = fs::read_to_string(&path).map_err(|e| AppError::StorageError(e.to_string()))?;
    let parsed_settings = serde_json::from_str::<AppSettings>(&data).ok();
    let recovered_from_backup = parsed_settings.is_none();
    let raw_settings = parsed_settings.or_else(|| {
        fs::read_to_string(path.with_extension("json.backup"))
            .ok()
            .and_then(|backup| serde_json::from_str::<AppSettings>(&backup).ok())
    });
    let settings = normalize_app_settings(raw_settings.clone().unwrap_or_default());
    if recovered_from_backup || raw_settings.as_ref() != Some(&settings) {
        write_app_settings(app_handle, &settings)?;
    }
    Ok(settings)
}

fn save_app_settings_unlocked(
    app_handle: &tauri::AppHandle,
    settings: AppSettings,
) -> Result<AppSettings, AppError> {
    let settings = normalize_app_settings(settings);
    write_app_settings(app_handle, &settings)?;
    Ok(settings)
}

pub fn update_git_executable_path(
    app_handle: &tauri::AppHandle,
    executable_path: Option<String>,
) -> Result<AppSettings, AppError> {
    with_app_settings_lock(app_handle, || {
        let mut settings = load_app_settings_unlocked(app_handle)?;
        settings.git_executable_path = executable_path;
        save_app_settings_unlocked(app_handle, settings)
    })
}

pub fn save_app_settings_preserving_git_path(
    app_handle: &tauri::AppHandle,
    mut settings: AppSettings,
) -> Result<AppSettings, AppError> {
    with_app_settings_lock(app_handle, || {
        settings.git_executable_path = load_app_settings_unlocked(app_handle)?.git_executable_path;
        save_app_settings_unlocked(app_handle, settings)
    })
}

fn with_app_settings_lock<T>(
    app_handle: &tauri::AppHandle,
    operation: impl FnOnce() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let _guard = APP_SETTINGS_LOCK
        .lock()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let lock_path = get_storage_dir(app_handle)?.join("app_settings.lock");
    let lock_file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(lock_path)
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    lock_file
        .lock_exclusive()
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    let result = operation();
    let _ = lock_file.unlock();
    result
}

fn write_app_settings(
    app_handle: &tauri::AppHandle,
    settings: &AppSettings,
) -> Result<(), AppError> {
    let path = app_settings_path(app_handle)?;
    let data = serde_json::to_string_pretty(settings)
        .map_err(|e| AppError::SerializationError(e.to_string()))?;
    let temporary = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let backup = path.with_extension("json.backup");
    let mut file =
        fs::File::create(&temporary).map_err(|error| AppError::StorageError(error.to_string()))?;
    file.write_all(data.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|error| AppError::StorageError(error.to_string()))?;
    if path.exists() {
        let _ = fs::remove_file(&backup);
        fs::rename(&path, &backup).map_err(|error| AppError::StorageError(error.to_string()))?;
    }
    if let Err(error) = fs::rename(&temporary, &path) {
        let _ = fs::rename(&backup, &path);
        return Err(AppError::StorageError(error.to_string()));
    }
    let _ = fs::remove_file(backup);
    Ok(())
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
                ..RecentRepo::default()
            },
            RecentRepo {
                path: "/tmp/project".to_string(),
                name: "second".to_string(),
                last_opened_at: "2026-06-03T11:00:00Z".to_string(),
                ..RecentRepo::default()
            },
            RecentRepo {
                path: "/tmp/other".to_string(),
                name: "other".to_string(),
                last_opened_at: "2026-06-03T12:00:00Z".to_string(),
                ..RecentRepo::default()
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
                ..FavoriteRepo::default()
            },
            FavoriteRepo {
                path: "/tmp/other".to_string(),
                name: "other".to_string(),
                favorited_at: "2026-06-03T11:00:00Z".to_string(),
                ..FavoriteRepo::default()
            },
            FavoriteRepo {
                path: "/tmp/project/".to_string(),
                name: "newer".to_string(),
                favorited_at: "2026-06-03T12:00:00Z".to_string(),
                ..FavoriteRepo::default()
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

    #[test]
    fn app_settings_deserializes_partial_files_with_defaults() {
        let settings = serde_json::from_str::<AppSettings>(r#"{"theme":"light"}"#)
            .expect("partial settings use defaults");

        assert_eq!(settings.theme, "light");
        assert_eq!(settings.diff_mode, "unified");
        assert_eq!(settings.git_executable_path, None);
    }
}
