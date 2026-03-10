use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, AeadCore, Key,
};
use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use std::path::PathBuf;
use std::sync::Mutex;

const KEY_FILE_NAME: &str = ".termix_key";

static CACHED_KEY: Mutex<Option<[u8; 32]>> = Mutex::new(None);

fn key_file_path() -> Result<PathBuf> {
    let app_dir = dirs::data_dir()
        .or_else(|| dirs::home_dir())
        .ok_or_else(|| anyhow::anyhow!("Cannot determine app data directory"))?;
    Ok(app_dir.join("com.termix.app").join(KEY_FILE_NAME))
}

fn get_or_create_key() -> Result<[u8; 32]> {
    let mut cached = CACHED_KEY.lock().map_err(|e| anyhow::anyhow!("Lock poisoned: {}", e))?;
    if let Some(key) = *cached {
        return Ok(key);
    }

    let path = key_file_path()?;

    let key = if path.exists() {
        let encoded = std::fs::read_to_string(&path).context("Failed to read key file")?;
        let bytes = BASE64.decode(encoded.trim()).context("Failed to decode key from file")?;
        if bytes.len() != 32 {
            anyhow::bail!("Invalid encryption key length in key file");
        }
        let mut k = [0u8; 32];
        k.copy_from_slice(&bytes);
        k
    } else {
        use aes_gcm::aead::rand_core::RngCore;
        let mut k = [0u8; 32];
        OsRng.fill_bytes(&mut k);
        let encoded = BASE64.encode(k);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .context("Failed to create key file directory")?;
        }
        std::fs::write(&path, &encoded).context("Failed to write key file")?;
        log::info!("New random encryption key generated and stored at {:?}", path);
        k
    };

    *cached = Some(key);
    Ok(key)
}

fn cipher() -> Result<Aes256Gcm> {
    let key_bytes = get_or_create_key()?;
    Ok(Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes)))
}

pub fn encrypt(plaintext: &str) -> Result<String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }
    let cipher = cipher()?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("encryption failed: {}", e))?;

    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&combined))
}

pub fn decrypt(encoded: &str) -> Result<String> {
    if encoded.is_empty() {
        return Ok(String::new());
    }
    let combined = BASE64
        .decode(encoded)
        .context("base64 decode failed")?;

    if combined.len() < 12 {
        anyhow::bail!("ciphertext too short");
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = aes_gcm::Nonce::from_slice(nonce_bytes);
    let cipher = cipher()?;
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow::anyhow!("decryption failed: {}", e))?;

    String::from_utf8(plaintext).context("invalid UTF-8 after decryption")
}

const SYNC_SALT: &[u8] = b"termix-sync-v1";

fn derive_key_from_password(password: &str) -> Result<[u8; 32]> {
    use argon2::Argon2;

    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), SYNC_SALT, &mut key)
        .map_err(|e| anyhow::anyhow!("key derivation failed: {}", e))?;
    Ok(key)
}

pub fn encrypt_with_password(plaintext: &str, password: &str) -> Result<String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }
    let key = derive_key_from_password(password)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("encryption failed: {}", e))?;

    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&combined))
}

pub fn decrypt_with_password(encoded: &str, password: &str) -> Result<String> {
    if encoded.is_empty() {
        return Ok(String::new());
    }
    let combined = BASE64
        .decode(encoded)
        .context("base64 decode failed")?;

    if combined.len() < 12 {
        anyhow::bail!("ciphertext too short");
    }

    let key = derive_key_from_password(password)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = aes_gcm::Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow::anyhow!("decryption failed (wrong sync password?): {}", e))?;

    String::from_utf8(plaintext).context("invalid UTF-8 after decryption")
}
