use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;

use anyhow::{anyhow, Result};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

#[derive(Clone, Serialize)]
pub struct LocalDataEvent {
    pub session_id: String,
    pub data: Vec<u8>,
}

#[derive(Clone, Serialize)]
pub struct LocalDisconnectEvent {
    pub session_id: String,
    pub reason: String,
}

#[derive(Clone, Serialize, Debug)]
pub struct ShellProfile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub args: Vec<String>,
}

struct LocalSession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    #[allow(dead_code)]
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub struct LocalTerminalManager {
    sessions: Mutex<HashMap<String, LocalSession>>,
}

impl LocalTerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub async fn spawn(
        &self,
        app: AppHandle,
        cols: u16,
        rows: u16,
        shell: Option<String>,
        shell_args: Option<Vec<String>>,
    ) -> Result<String> {
        let session_id = uuid::Uuid::new_v4().to_string();

        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let shell_path = shell.unwrap_or_else(|| auto_detect_best_shell());
        let mut cmd = CommandBuilder::new(&shell_path);
        if let Some(args) = shell_args {
            for arg in &args {
                cmd.arg(arg);
            }
        }

        let child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);

        let reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        let session = LocalSession {
            writer,
            master: pair.master,
            child,
        };

        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), session);

        let sid = session_id.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let mut reader = reader;
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let event = LocalDataEvent {
                            session_id: sid.clone(),
                            data: buf[..n].to_vec(),
                        };
                        if app.emit("local_data", &event).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            let _ = app.emit(
                "local_disconnect",
                &LocalDisconnectEvent {
                    session_id: sid,
                    reason: "Process exited".to_string(),
                },
            );
        });

        Ok(session_id)
    }

    pub async fn write(&self, session_id: &str, data: &[u8]) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| anyhow!("Local session not found: {}", session_id))?;
        session
            .writer
            .write_all(data)
            .map_err(|e| anyhow!("Write failed: {}", e))?;
        session
            .writer
            .flush()
            .map_err(|e| anyhow!("Flush failed: {}", e))?;
        Ok(())
    }

    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("Local session not found: {}", session_id))?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| anyhow!("Resize failed: {}", e))?;
        Ok(())
    }

    pub async fn close(&self, session_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        if let Some(mut session) = sessions.remove(session_id) {
            let _ = session.child.kill();
        }
        Ok(())
    }
}

fn auto_detect_best_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        if which_exists("pwsh") {
            return "pwsh.exe".to_string();
        }
        "powershell.exe".to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

fn which_exists(name: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("where")
            .arg(name)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("which")
            .arg(name)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

pub fn detect_available_shells() -> Vec<ShellProfile> {
    let mut shells = Vec::new();

    #[cfg(target_os = "windows")]
    {
        detect_windows_shells(&mut shells);
    }

    #[cfg(not(target_os = "windows"))]
    {
        detect_unix_shells(&mut shells);
    }

    shells
}

#[cfg(target_os = "windows")]
fn detect_windows_shells(shells: &mut Vec<ShellProfile>) {
    if which_exists("pwsh") {
        shells.push(ShellProfile {
            id: "pwsh".to_string(),
            name: "PowerShell 7+".to_string(),
            path: "pwsh.exe".to_string(),
            args: vec![],
        });
    }

    let ps_path = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
    if Path::new(ps_path).exists() {
        shells.push(ShellProfile {
            id: "powershell".to_string(),
            name: "Windows PowerShell".to_string(),
            path: ps_path.to_string(),
            args: vec![],
        });
    }

    let cmd_path = r"C:\Windows\System32\cmd.exe";
    if Path::new(cmd_path).exists() {
        shells.push(ShellProfile {
            id: "cmd".to_string(),
            name: "Command Prompt".to_string(),
            path: cmd_path.to_string(),
            args: vec![],
        });
    }

    for git_bash in &[
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ] {
        if Path::new(git_bash).exists() {
            shells.push(ShellProfile {
                id: "git-bash".to_string(),
                name: "Git Bash".to_string(),
                path: git_bash.to_string(),
                args: vec!["--login".to_string(), "-i".to_string()],
            });
            break;
        }
    }

    detect_wsl_distros(shells);
}

#[cfg(target_os = "windows")]
fn detect_wsl_distros(shells: &mut Vec<ShellProfile>) {
    let output = std::process::Command::new("wsl")
        .args(["--list", "--quiet"])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let raw_bytes = &out.stdout;
            let u16s: Vec<u16> = raw_bytes
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            let raw = String::from_utf16_lossy(&u16s);
            for line in raw.lines() {
                let distro = line.trim().trim_start_matches('\u{feff}');
                if distro.is_empty() {
                    continue;
                }
                let id = format!("wsl-{}", distro.to_lowercase().replace(' ', "-"));
                shells.push(ShellProfile {
                    id,
                    name: format!("{} (WSL)", distro),
                    path: "wsl.exe".to_string(),
                    args: vec!["-d".to_string(), distro.to_string()],
                });
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_unix_shells(shells: &mut Vec<ShellProfile>) {
    if let Ok(content) = std::fs::read_to_string("/etc/shells") {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if !Path::new(line).exists() {
                continue;
            }
            let name = Path::new(line)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(line);
            let id = name.to_string();
            let display = match name {
                "zsh" => "Zsh",
                "bash" => "Bash",
                "fish" => "Fish",
                "sh" => "Shell (sh)",
                "dash" => "Dash",
                "ksh" => "Korn Shell",
                "tcsh" => "Tcsh",
                "csh" => "C Shell",
                other => other,
            };
            if shells.iter().any(|s| s.id == id) {
                continue;
            }
            shells.push(ShellProfile {
                id,
                name: display.to_string(),
                path: line.to_string(),
                args: vec![],
            });
        }
    }

    if shells.is_empty() {
        let fallback = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let name = Path::new(&fallback)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("bash");
        shells.push(ShellProfile {
            id: name.to_string(),
            name: name.to_string(),
            path: fallback,
            args: vec![],
        });
    }
}
