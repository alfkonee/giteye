use crate::errors::AppError;

/// Stable service name under which GitEye stores provider API keys in the OS keychain.
const SERVICE: &str = "com.giteye.app";

fn entry(account: &str) -> Result<keyring::Entry, AppError> {
    keyring::Entry::new(SERVICE, account).map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn store(account: &str, secret: &str) -> Result<(), AppError> {
    entry(account)?
        .set_password(secret)
        .map_err(|error| AppError::StorageError(error.to_string()))
}

pub fn load(account: &str) -> Option<String> {
    // An absent or unavailable keychain is indistinguishable from "no key configured":
    // reading must never fail configuration loading or block an environment-key override.
    let Ok(entry) = entry(account) else {
        return None;
    };
    entry.get_password().ok()
}

pub fn delete(account: &str) -> Result<(), AppError> {
    match entry(account)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(AppError::StorageError(error.to_string())),
    }
}
