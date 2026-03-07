#![allow(dead_code)]
use anyhow::Result;
use keyring::Entry;

const SERVICE_NAME: &str = "com.termix.app";

pub struct CredentialStore;

impl CredentialStore {
    pub fn store_password(connection_id: &str, password: &str) -> Result<()> {
        let entry = Entry::new(SERVICE_NAME, connection_id)?;
        entry.set_password(password)?;
        Ok(())
    }

    pub fn get_password(connection_id: &str) -> Result<Option<String>> {
        let entry = Entry::new(SERVICE_NAME, connection_id)?;
        match entry.get_password() {
            Ok(pw) => Ok(Some(pw)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete_password(connection_id: &str) -> Result<()> {
        let entry = Entry::new(SERVICE_NAME, connection_id)?;
        match entry.delete_credential() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}
