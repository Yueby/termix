import { invoke } from "@tauri-apps/api/core";

export interface ConnectPayload {
  host: string;
  port: number;
  username: string;
  auth_method:
    | { type: "password"; password: string }
    | { type: "key"; key_path: string; passphrase?: string }
    | { type: "key_content"; key_content: string; passphrase?: string };
}

export interface ConnectResult {
  session_id: string;
}

export interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
  modified?: number;
  permissions?: string;
  kind: string;
}

// SSH commands
export const sshConnect = (payload: ConnectPayload) =>
  invoke<ConnectResult>("ssh_connect", { payload });

export const sshDisconnect = (sessionId: string) =>
  invoke<void>("ssh_disconnect", { sessionId });

export const sshWrite = (sessionId: string, data: number[]) =>
  invoke<void>("ssh_write", { sessionId, data });

export const sshResize = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("ssh_resize", { sessionId, cols, rows });

export const sshListSessions = () =>
  invoke<string[]>("ssh_list_sessions");

// SFTP commands
export const sftpConnect = (payload: ConnectPayload) =>
  invoke<ConnectResult>("sftp_connect", { payload });

export const sftpDisconnect = (sessionId: string) =>
  invoke<void>("sftp_disconnect", { sessionId });

export const sftpHomeDir = (sessionId: string) =>
  invoke<string>("sftp_home_dir", { sessionId });

export const sftpListDir = (sessionId: string, path: string) =>
  invoke<FileEntry[]>("sftp_list_dir", { sessionId, path });

export const sftpReadFile = (sessionId: string, remotePath: string, localPath: string) =>
  invoke<void>("sftp_read_file", { sessionId, remotePath, localPath });

export const sftpWriteFile = (sessionId: string, localPath: string, remotePath: string) =>
  invoke<void>("sftp_write_file", { sessionId, localPath, remotePath });

export const sftpMkdir = (sessionId: string, path: string) =>
  invoke<void>("sftp_mkdir", { sessionId, path });

export const sftpRemove = (sessionId: string, path: string, isDir: boolean) =>
  invoke<void>("sftp_remove", { sessionId, path, isDir });

export const sftpRename = (sessionId: string, oldPath: string, newPath: string) =>
  invoke<void>("sftp_rename", { sessionId, oldPath, newPath });

export const sftpChmod = (sessionId: string, path: string, mode: number) =>
  invoke<void>("sftp_chmod", { sessionId, path, mode });

// Local filesystem commands
export const localListDir = (path: string) =>
  invoke<FileEntry[]>("local_list_dir", { path });

export const localGetHomeDir = () =>
  invoke<string>("local_get_home_dir");

export const localGetDrives = () =>
  invoke<string[]>("local_get_drives");

export const localCreateDir = (path: string) =>
  invoke<void>("local_create_dir", { path });

export const localRemove = (path: string, isDir: boolean) =>
  invoke<void>("local_remove", { path, isDir });

export const localRename = (oldPath: string, newPath: string) =>
  invoke<void>("local_rename", { oldPath, newPath });

export const localCopy = (src: string, dest: string, isDir: boolean) =>
  invoke<void>("local_copy", { src, dest, isDir });

export const localStat = (path: string) =>
  invoke<FileEntry>("local_stat", { path });

// Local terminal commands
export interface LocalOpenResult {
  session_id: string;
}

export interface ShellProfile {
  id: string;
  name: string;
  path: string;
  args: string[];
}

export const localOpen = (
  cols: number,
  rows: number,
  shell?: string,
  shellArgs?: string[]
) =>
  invoke<LocalOpenResult>("local_open", { cols, rows, shell: shell ?? null, shellArgs: shellArgs ?? null });

export const detectShells = () =>
  invoke<ShellProfile[]>("detect_shells");

export const localWrite = (sessionId: string, data: number[]) =>
  invoke<void>("local_write", { sessionId, data });

export const localResize = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("local_resize", { sessionId, cols, rows });

export const localClose = (sessionId: string) =>
  invoke<void>("local_close", { sessionId });

// Connection CRUD
export interface ConnectionInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  group: string;
  password: string;
  keyPath: string;
  keyPassphrase: string;
  keychainId: string;
}

export const getConnections = () =>
  invoke<ConnectionInfo[]>("get_connections");

export const saveConnection = (conn: ConnectionInfo) =>
  invoke<void>("save_connection", { conn });

export const deleteConnection = (id: string) =>
  invoke<void>("delete_connection", { id });

// Settings CRUD
export interface AppSettings {
  theme: string;
  fontFamily: string;
  fontSize: number;
  cursorStyle: string;
  scrollBack: number;
  terminalThemeId: string;
  defaultShell: string;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavRemoteDir: string;
  syncEncryptionPassword: string;
}

export const getSettings = () =>
  invoke<AppSettings>("get_settings");

export const saveSettings = (settings: AppSettings) =>
  invoke<void>("save_settings", { settings });

// Snippet CRUD
export interface Snippet {
  id: string;
  name: string;
  content: string;
  tags: string[];
}

export const getSnippets = () =>
  invoke<Snippet[]>("get_snippets");

export const saveSnippet = (snippet: Snippet) =>
  invoke<void>("save_snippet", { snippet });

export const deleteSnippet = (id: string) =>
  invoke<void>("delete_snippet", { id });

// Keychain CRUD
export interface KeychainItem {
  id: string;
  name: string;
  keyType: string;
  privateKey: string;
  publicKey: string;
  certificate: string;
  passphrase: string;
}

export const getKeychainItems = () =>
  invoke<KeychainItem[]>("get_keychain_items");

export const saveKeychainItem = (item: KeychainItem) =>
  invoke<void>("save_keychain_item", { item });

export const deleteKeychainItem = (id: string) =>
  invoke<void>("delete_keychain_item", { id });

export const importKeyFile = (path: string) =>
  invoke<string>("import_key_file", { path });

export interface GeneratedKey {
  privateKey: string;
  publicKey: string;
  keyType: string;
}

export const generateSshKey = (keyType: string, bits?: number) =>
  invoke<GeneratedKey>("generate_ssh_key", { keyType, bits });

// Sync
export const syncPush = () =>
  invoke<string>("sync_push");

export const syncPull = () =>
  invoke<string>("sync_pull");

export const syncTestConnection = () =>
  invoke<string>("sync_test_connection");
