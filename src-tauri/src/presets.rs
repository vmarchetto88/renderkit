//! Editable preset prompt store, persisted as `prompts.json` in the app config
//! directory (e.g. ~/Library/Application Support/com.vincentmarchetto.renderkit
//! on macOS). Seeded with sensible defaults for rendering flat 3D-viewport
//! screenshots on first launch.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: String,
    pub label: String,
    pub prompt: String,
    /// Category group (e.g. "01 — Time of Day Conversions"). Optional so older
    /// prompts.json files without it still parse.
    #[serde(default)]
    pub category: String,
    /// Built-in MHS presets are locked: the UI shows only their title and never
    /// reveals or edits the prompt text. Recomputed on every load (a preset is
    /// locked iff its id is one of the bundled defaults), so this self-heals.
    #[serde(default)]
    pub locked: bool,
}

/// Default preset library, generated from the MHS Notion prompt library and
/// embedded at compile time. Seeded into prompts.json on first run.
const DEFAULTS_JSON: &str = include_str!("../default_prompts.json");

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("could not resolve config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create config dir: {e}"))?;
    Ok(dir.join("prompts.json"))
}

fn defaults() -> Vec<Preset> {
    serde_json::from_str(DEFAULTS_JSON).unwrap_or_default()
}

/// Load presets, seeding the file with defaults if it does not yet exist.
/// Built-in presets (those whose id is a bundled default) are marked `locked`.
#[tauri::command]
pub fn load_presets(app: AppHandle) -> Result<Vec<Preset>, String> {
    let path = store_path(&app)?;
    let mut items: Vec<Preset> = if !path.exists() {
        let defs = defaults();
        let json = serde_json::to_string_pretty(&defs).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| format!("could not seed prompts.json: {e}"))?;
        defs
    } else {
        let raw =
            fs::read_to_string(&path).map_err(|e| format!("could not read prompts.json: {e}"))?;
        serde_json::from_str(&raw).map_err(|e| format!("prompts.json is invalid: {e}"))?
    };

    let builtin: std::collections::HashSet<String> =
        defaults().into_iter().map(|p| p.id).collect();
    for it in &mut items {
        it.locked = builtin.contains(&it.id);
    }
    Ok(items)
}

/// Persist the full ordered list of presets back to disk.
#[tauri::command]
pub fn save_presets(app: AppHandle, presets: Vec<Preset>) -> Result<(), String> {
    let path = store_path(&app)?;
    let json = serde_json::to_string_pretty(&presets).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("could not write prompts.json: {e}"))
}

/// Absolute path to prompts.json, so the UI can show where it lives.
#[tauri::command]
pub fn presets_path(app: AppHandle) -> Result<String, String> {
    Ok(store_path(&app)?.to_string_lossy().to_string())
}
