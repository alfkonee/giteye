use std::sync::Mutex;

pub struct AppState {
    pub active_repo_path: Mutex<Option<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            active_repo_path: Mutex::new(None),
        }
    }
}
