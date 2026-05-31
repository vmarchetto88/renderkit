//! API key storage in a local plaintext file (no OS keychain).
//!
//! The key is written to `gemini_api_key.txt` in the app config dir
//! (e.g. ~/Library/Application Support/com.vincentmarchetto.renderkit/ on
//! macOS). This deliberately avoids the OS keychain so saving the key never
//! triggers a system password prompt. The file lives outside the app bundle
//! and outside the git repo; on Unix it is chmod 0600 (owner read/write only).
//! Trade-off: the key is stored in plaintext on disk — acceptable for a
//! personal/internal tool, not for a shared distribution.

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn key_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("could not resolve config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create config dir: {e}"))?;
    Ok(dir.join("gemini_api_key.txt"))
}

/// Read the stored key. Used by the render path.
pub fn read_api_key(app: &AppHandle) -> Result<String, String> {
    let path = key_path(app)?;
    let key = fs::read_to_string(&path)
        .map_err(|_| "No API key set. Add one in Settings.".to_string())?
        .trim()
        .to_string();
    if key.is_empty() {
        return Err("No API key set. Add one in Settings.".into());
    }
    Ok(key)
}

/// Save (or overwrite) the key. Fast local write — no prompt.
#[tauri::command]
pub fn set_api_key(app: AppHandle, key: String) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("API key is empty".into());
    }
    let path = key_path(&app)?;
    fs::write(&path, trimmed).map_err(|e| format!("failed to save key: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Whether a non-empty key is stored.
#[tauri::command]
pub fn has_api_key(app: AppHandle) -> bool {
    key_path(&app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

/// Remove the stored key.
#[tauri::command]
pub fn delete_api_key(app: AppHandle) -> Result<(), String> {
    let path = key_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("failed to delete key: {e}"))?;
    }
    Ok(())
}
