use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key,
};
use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use std::path::PathBuf;
use std::sync::Mutex;

const KEY_FILE_NAME: &str = ".termix_key";

static CACHED_KEY: Mutex<Option<[u8; 32]>> = Mutex::new(None);

/// Decrypts a stored secret, or explains why it could not be decrypted.
///
/// The pattern this replaces — `decrypt(..).unwrap_or_else(|_| String::new())` — turned a
/// missing or mismatched key file into blank credentials, and the next save wrote those
/// blanks back over the ciphertext, so a recoverable problem became permanent loss. A
/// failure now stops the read and leaves the stored value untouched.
///
/// An empty stored value still reads back as empty: that is a credential the user
/// deliberately cleared, which is a different thing from one that cannot be read.
pub fn decrypt_secret(encoded: &str, what: &str) -> Result<String> {
    if encoded.is_empty() {
        return Ok(String::new());
    }
    decrypt(encoded).map_err(|e| {
        anyhow::anyhow!(
            "Could not decrypt {what}: {e}. The encryption key file is missing, or it does not belong to this database. The stored value has been left as it is."
        )
    })
}

fn key_file_path() -> Result<PathBuf> {
    let app_dir = dirs::data_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| anyhow::anyhow!("Cannot determine app data directory"))?;
    Ok(app_dir.join("com.termix.app").join(KEY_FILE_NAME))
}

fn get_or_create_key() -> Result<[u8; 32]> {
    let mut cached = CACHED_KEY
        .lock()
        .map_err(|e| anyhow::anyhow!("Lock poisoned: {}", e))?;
    if let Some(key) = *cached {
        return Ok(key);
    }

    let path = key_file_path()?;

    let key = if path.exists() {
        let encoded = std::fs::read_to_string(&path).context("Failed to read key file")?;
        let bytes = BASE64
            .decode(encoded.trim())
            .context("Failed to decode key from file")?;
        if bytes.len() != 32 {
            anyhow::bail!("Invalid encryption key length in key file");
        }
        let mut k = [0u8; 32];
        k.copy_from_slice(&bytes);
        k
    } else {
        let mut k = [0u8; 32];
        getrandom::fill(&mut k).map_err(|e| anyhow::anyhow!("system RNG unavailable: {e}"))?;
        let encoded = BASE64.encode(k);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).context("Failed to create key file directory")?;
        }
        std::fs::write(&path, &encoded).context("Failed to write key file")?;
        log::info!(
            "New random encryption key generated and stored at {:?}",
            path
        );
        k
    };

    *cached = Some(key);
    Ok(key)
}

fn cipher() -> Result<Aes256Gcm> {
    let key_bytes = get_or_create_key()?;
    Ok(Aes256Gcm::new(&Key::<Aes256Gcm>::from(key_bytes)))
}

/// `aead` 0.6 removed `AeadCore::generate_nonce`, so the nonce bytes are drawn
/// here. A 12-byte random nonce per message is what this format has always used
/// (nonce || ciphertext), so existing ciphertexts stay readable.
fn random_nonce() -> Result<[u8; 12]> {
    let mut bytes = [0u8; 12];
    getrandom::fill(&mut bytes).map_err(|e| anyhow::anyhow!("system RNG unavailable: {e}"))?;
    Ok(bytes)
}

pub fn encrypt(plaintext: &str) -> Result<String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }
    let cipher = cipher()?;
    let nonce = random_nonce()?;
    let ciphertext = cipher
        .encrypt(&nonce.into(), plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("encryption failed: {}", e))?;

    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&combined))
}

pub fn decrypt(encoded: &str) -> Result<String> {
    if encoded.is_empty() {
        return Ok(String::new());
    }
    let combined = BASE64.decode(encoded).context("base64 decode failed")?;

    if combined.len() < 12 {
        anyhow::bail!("ciphertext too short");
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = aes_gcm::Nonce::try_from(nonce_bytes).context("invalid nonce")?;
    let cipher = cipher()?;
    let plaintext = cipher
        .decrypt(&nonce, ciphertext)
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
    let cipher = Aes256Gcm::new(&Key::<Aes256Gcm>::from(key));
    let nonce = random_nonce()?;
    let ciphertext = cipher
        .encrypt(&nonce.into(), plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("encryption failed: {}", e))?;

    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&combined))
}

pub fn decrypt_with_password(encoded: &str, password: &str) -> Result<String> {
    if encoded.is_empty() {
        return Ok(String::new());
    }
    let combined = BASE64.decode(encoded).context("base64 decode failed")?;

    if combined.len() < 12 {
        anyhow::bail!("ciphertext too short");
    }

    let key = derive_key_from_password(password)?;
    let cipher = Aes256Gcm::new(&Key::<Aes256Gcm>::from(key));
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = aes_gcm::Nonce::try_from(nonce_bytes).context("invalid nonce")?;
    let plaintext = cipher
        .decrypt(&nonce, ciphertext)
        .map_err(|e| anyhow::anyhow!("decryption failed (wrong sync password?): {}", e))?;

    String::from_utf8(plaintext).context("invalid UTF-8 after decryption")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Covers the aes-gcm 0.11 migration: `aead` 0.6 no longer generates the
    /// nonce for us, so only a round trip proves the bytes still line up.
    /// The password path is used because it derives its key and therefore never
    /// touches the on-disk key file.
    #[test]
    fn password_round_trip_bypasses_nothing() {
        let plaintext = "ssh-ed25519 AAAA ciphertext 中文 round trip";
        let encoded = encrypt_with_password(plaintext, "correct horse").expect("encrypt");

        // Format is unchanged from the pre-0.11 code: nonce || ciphertext || tag.
        let raw = BASE64.decode(&encoded).expect("base64");
        assert_eq!(raw.len(), 12 + plaintext.len() + 16);

        let decoded = decrypt_with_password(&encoded, "correct horse").expect("decrypt");
        assert_eq!(decoded, plaintext);
        assert!(decrypt_with_password(&encoded, "wrong horse").is_err());
    }

    /// A nonce must not be reused, and a flipped ciphertext bit must fail the tag.
    #[test]
    fn nonces_differ_and_tampering_is_rejected() {
        let a = encrypt_with_password("same", "pw").expect("encrypt a");
        let b = encrypt_with_password("same", "pw").expect("encrypt b");
        assert_ne!(a, b, "two encryptions produced identical output");

        let mut raw = BASE64.decode(&a).expect("base64");
        let last = raw.len() - 1;
        raw[last] ^= 0x01;
        let tampered = BASE64.encode(&raw);
        assert!(decrypt_with_password(&tampered, "pw").is_err());
    }
}
