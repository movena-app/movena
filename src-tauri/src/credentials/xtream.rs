use super::{CREDENTIAL_ACCOUNT, CREDENTIAL_SERVICE};

fn entry() -> Result<keyring::v1::Entry, String> {
    keyring::v1::Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT)
        .map_err(|error| format!("Credential store is unavailable: {error}"))
}

#[tauri::command(async)]
pub fn credential_store(password: String) -> Result<(), String> {
    if password.is_empty() {
        return Err("Cannot store an empty provider password".to_string());
    }
    entry()?
        .set_password(&password)
        .map_err(|error| format!("Failed to store provider password: {error}"))
}

#[tauri::command(async)]
pub fn credential_load() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::v1::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to load provider password: {error}")),
    }
}

#[tauri::command(async)]
pub fn credential_delete() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::v1::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to delete provider password: {error}")),
    }
}
