use super::CREDENTIAL_SERVICE;

pub(crate) fn validate_source_id(source_id: &str) -> Result<(), String> {
    if source_id.len() < 3
        || source_id.len() > 80
        || !source_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("Invalid playlist source id".to_string());
    }
    Ok(())
}

pub(crate) fn source_secret_entry(source_id: &str) -> Result<keyring::v1::Entry, String> {
    validate_source_id(source_id)?;
    keyring::v1::Entry::new(CREDENTIAL_SERVICE, &format!("m3u-source-{source_id}"))
        .map_err(|error| format!("Credential store is unavailable: {error}"))
}

#[tauri::command(async)]
pub(crate) fn source_secret_store(source_id: String, value: String) -> Result<(), String> {
    if value.is_empty() || value.len() > 32 * 1024 {
        return Err("Invalid playlist connection secret".to_string());
    }
    source_secret_entry(&source_id)?
        .set_password(&value)
        .map_err(|error| format!("Failed to store playlist connection: {error}"))
}

#[tauri::command(async)]
pub(crate) fn source_secret_load(source_id: String) -> Result<Option<String>, String> {
    match source_secret_entry(&source_id)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::v1::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to load playlist connection: {error}")),
    }
}

#[tauri::command(async)]
pub(crate) fn source_secret_delete(source_id: String) -> Result<(), String> {
    match source_secret_entry(&source_id)?.delete_credential() {
        Ok(()) | Err(keyring::v1::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to delete playlist connection: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::validate_source_id;

    #[test]
    fn validates_source_ids() {
        assert!(validate_source_id("m3u-12345678").is_ok());
        assert!(validate_source_id("../cache").is_err());
    }
}
