use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, AeadCore, Key,
};
use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

// Fixed 256-bit key — replace with master-password-derived key later
const FIXED_KEY: &[u8; 32] = b"termix-app-secret-key-0123456789";

fn cipher() -> Aes256Gcm {
    let key = Key::<Aes256Gcm>::from_slice(FIXED_KEY);
    Aes256Gcm::new(key)
}

pub fn encrypt(plaintext: &str) -> Result<String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }
    let cipher = cipher();
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
    let cipher = cipher();
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow::anyhow!("decryption failed: {}", e))?;

    String::from_utf8(plaintext).context("invalid UTF-8 after decryption")
}
