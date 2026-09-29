use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use russh::keys::known_hosts;
use russh::keys::{Error as KeyError, HashAlg, PublicKeyOrCertificate};

/// Trust-on-first-use host key verification, shared by the SSH and SFTP clients.
///
/// `known_hosts::check_known_hosts` reports three distinct outcomes, and conflating them
/// is what makes a naive implementation useless:
///
/// - `Ok(true)` — the presented key matches what is recorded for this host.
/// - `Ok(false)` — nothing is recorded for this host, **or** something is recorded but of
///   a different key type.
/// - `Err(KeyChanged { line })` — a key of the same type is recorded and differs.
///
/// The second case is the trap. A bare "check, and record the key if it returned false"
/// trusts an attacker who simply presents, say, an RSA key to a host already recorded
/// with an ed25519 key. The `known_host_keys` lookup below is what separates "no entry
/// for this host" from "entries exist and none of them is this key".
///
/// Anything that cannot be read or parsed fails closed. Declining to connect is
/// recoverable; connecting to an impostor is not.
///
/// Returns `Ok(false)` to reject the key and `Err` when verification itself could not be
/// attempted — both refuse the connection, and the caller logs whichever applies.
pub fn verify_host_key(host: &str, port: u16, key: &PublicKeyOrCertificate) -> Result<bool> {
    verify_host_key_at(host, port, key, &default_path()?)
}

/// The path-taking form, so the policy can be tested against a fixture instead of the
/// real `~/.ssh/known_hosts`.
pub fn verify_host_key_at(
    host: &str,
    port: u16,
    key: &PublicKeyOrCertificate,
    path: &Path,
) -> Result<bool> {
    let pubkey = key.public_key();
    let fingerprint = pubkey.fingerprint(HashAlg::Sha256);

    match known_hosts::check_known_hosts_path(host, port, &pubkey, path) {
        Ok(true) => {
            log::debug!("Host key for {host}:{port} matches known_hosts ({fingerprint})");
            Ok(true)
        }
        Err(KeyError::KeyChanged { line }) => {
            log::error!(
                "Host key for {host}:{port} does not match the key recorded on line {line} of {}. \
                 Refusing to connect — this is what a man-in-the-middle looks like. Presented \
                 key: {fingerprint}. If the server's key genuinely changed, remove that line and \
                 connect again.",
                path.display()
            );
            Ok(false)
        }
        Ok(false) => {
            let recorded = known_hosts::known_host_keys_path(host, port, path)?;
            if !recorded.is_empty() {
                log::error!(
                    "Host {host}:{port} is recorded in {} under a different key type, and the \
                     presented {fingerprint} matches none of those entries. Refusing to connect.",
                    path.display()
                );
                return Ok(false);
            }

            known_hosts::learn_known_hosts_path(host, port, &pubkey, path)?;
            log::warn!(
                "First connection to {host}:{port}: recording its host key ({fingerprint}). \
                 Compare it against a source you trust if that matters."
            );
            Ok(true)
        }
        Err(e) => Err(anyhow!(
            "could not check the known_hosts entry for {host}:{port} in {}: {e}. Refusing to \
             connect rather than trusting a key that was never verified.",
            path.display()
        )),
    }
}

fn default_path() -> Result<PathBuf> {
    dirs::home_dir()
        .map(|home| home.join(".ssh").join("known_hosts"))
        .ok_or_else(|| anyhow!("cannot locate the home directory to find known_hosts"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use getrandom::{rand_core::UnwrapErr, SysRng};
    use russh::keys::{Algorithm, PrivateKey as SshPrivateKey};

    fn public_key() -> PublicKeyOrCertificate {
        let key = SshPrivateKey::random(&mut UnwrapErr(SysRng), Algorithm::Ed25519)
            .expect("key generation");
        PublicKeyOrCertificate::PublicKey {
            key: key.public_key().clone(),
            hash_alg: None,
        }
    }

    fn fixture(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("termix-host-keys-{name}"));
        let _ = std::fs::remove_file(&path);
        path
    }

    #[test]
    fn records_an_unknown_host_then_accepts_it() {
        let path = fixture("tofu");
        let key = public_key();

        assert!(
            verify_host_key_at("example.com", 22, &key, &path).expect("first use"),
            "an unknown host should be trusted on first use"
        );
        assert!(
            path.exists(),
            "the first-use key should be written to the file"
        );

        // Second time around it must be a plain match with no second entry appended.
        assert!(verify_host_key_at("example.com", 22, &key, &path).expect("second use"));
        let contents = std::fs::read_to_string(&path).expect("read");
        assert_eq!(
            contents.lines().filter(|l| !l.trim().is_empty()).count(),
            1,
            "a known key must not be appended again: {contents}"
        );
    }

    #[test]
    fn rejects_a_changed_key_for_a_known_host() {
        let path = fixture("changed");
        assert!(verify_host_key_at("example.com", 22, &public_key(), &path).expect("first use"));

        // A different key of the same type for the same host is the attack this exists to
        // stop, and it must not be quietly learned as a second entry.
        let changed = public_key();
        assert!(
            !verify_host_key_at("example.com", 22, &changed, &path).expect("changed key"),
            "a changed host key must be rejected"
        );
        let contents = std::fs::read_to_string(&path).expect("read");
        assert_eq!(
            contents.lines().filter(|l| !l.trim().is_empty()).count(),
            1,
            "a rejected key must not be recorded: {contents}"
        );
    }

    #[test]
    fn rejects_a_different_key_type_for_a_known_host() {
        let path = fixture("keytype");
        assert!(verify_host_key_at("example.com", 22, &public_key(), &path).expect("first use"));

        // `check_known_hosts` reports a key of a different type as `Ok(false)`, the same
        // answer it gives for a host it has never seen. Without the extra lookup this
        // would be learned as a new entry and the connection would proceed.
        let other_type = {
            let key = SshPrivateKey::random(
                &mut UnwrapErr(SysRng),
                Algorithm::Ecdsa {
                    curve: russh::keys::EcdsaCurve::NistP256,
                },
            )
            .expect("key generation");
            PublicKeyOrCertificate::PublicKey {
                key: key.public_key().clone(),
                hash_alg: None,
            }
        };

        assert!(
            !verify_host_key_at("example.com", 22, &other_type, &path).expect("other type"),
            "a key of a different type for a recorded host must be rejected"
        );
        let contents = std::fs::read_to_string(&path).expect("read");
        assert_eq!(
            contents.lines().filter(|l| !l.trim().is_empty()).count(),
            1,
            "the rejected key must not be recorded: {contents}"
        );
    }

    #[test]
    fn non_standard_ports_are_tracked_separately() {
        let path = fixture("ports");
        let key = public_key();

        assert!(verify_host_key_at("example.com", 2200, &key, &path).expect("first use"));
        let contents = std::fs::read_to_string(&path).expect("read");
        assert!(
            contents.contains("[example.com]:2200"),
            "a non-default port has to be recorded in the bracketed form ssh uses: {contents}"
        );

        // A key recorded for port 2200 says nothing about port 22 on the same host.
        assert!(verify_host_key_at("example.com", 22, &key, &path).expect("other port"));
        assert_eq!(
            std::fs::read_to_string(&path)
                .expect("read")
                .lines()
                .filter(|l| !l.trim().is_empty())
                .count(),
            2
        );
    }
}
