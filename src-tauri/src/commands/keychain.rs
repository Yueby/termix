use serde::{Deserialize, Serialize};
use ssh_key::{Algorithm, LineEnding, PrivateKey as SshPrivateKey};
use tauri::State;

use crate::services::db::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeychainItem {
    pub id: String,
    pub name: String,
    pub key_type: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub private_key: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub public_key: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub certificate: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub passphrase: String,
}

#[tauri::command]
pub async fn get_keychain_items(db: State<'_, Database>) -> Result<Vec<KeychainItem>, String> {
    db.get_keychain_items().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_keychain_item(
    item: KeychainItem,
    db: State<'_, Database>,
) -> Result<(), String> {
    db.save_keychain_item(&item).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_keychain_item(
    id: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    db.delete_keychain_item(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_key_file(path: String) -> Result<String, String> {
    let canonical = std::path::Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("Invalid path '{}': {}", path, e))?;

    let meta = tokio::fs::metadata(&canonical).await
        .map_err(|e| format!("Cannot access '{}': {}", path, e))?;
    if !meta.is_file() {
        return Err(format!("'{}' is not a regular file", path));
    }
    const MAX_KEY_SIZE: u64 = 64 * 1024;
    if meta.len() > MAX_KEY_SIZE {
        return Err(format!("File too large ({} bytes, max {})", meta.len(), MAX_KEY_SIZE));
    }

    tokio::fs::read_to_string(&canonical)
        .await
        .map_err(|e| format!("Failed to read key file '{}': {}", path, e))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedKey {
    pub private_key: String,
    pub public_key: String,
    pub key_type: String,
}

#[tauri::command]
pub async fn generate_ssh_key(
    key_type: String,
    bits: Option<u32>,
) -> Result<GeneratedKey, String> {
    use aes_gcm::aead::OsRng;

    let (algorithm, type_label) = match key_type.as_str() {
        "ed25519" => (Algorithm::Ed25519, "ed25519"),
        "ecdsa-256" | "ecdsa256" => (
            Algorithm::Ecdsa {
                curve: ssh_key::EcdsaCurve::NistP256,
            },
            "ecdsa-sha2-nistp256",
        ),
        "ecdsa-384" | "ecdsa384" => (
            Algorithm::Ecdsa {
                curve: ssh_key::EcdsaCurve::NistP384,
            },
            "ecdsa-sha2-nistp384",
        ),
        "ecdsa-521" | "ecdsa521" => (
            Algorithm::Ecdsa {
                curve: ssh_key::EcdsaCurve::NistP521,
            },
            "ecdsa-sha2-nistp521",
        ),
        "rsa" => {
            let _bits = bits.unwrap_or(4096);
            (Algorithm::Rsa { hash: None }, "rsa")
        }
        _ => return Err(format!("Unsupported key type: {}", key_type)),
    };

    let key = SshPrivateKey::random(&mut OsRng, algorithm)
        .map_err(|e| format!("Key generation failed: {}", e))?;

    let private_key_str = key
        .to_openssh(LineEnding::LF)
        .map_err(|e| format!("Failed to encode private key: {}", e))?
        .to_string();

    let public_key_str = key.public_key().to_openssh()
        .map_err(|e| format!("Failed to encode public key: {}", e))?;

    Ok(GeneratedKey {
        private_key: private_key_str,
        public_key: public_key_str,
        key_type: type_label.to_string(),
    })
}
