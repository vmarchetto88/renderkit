//! Auto-saving render library.
//!
//! Every successful render is written to `<app_data_dir>/library/<id>.<ext>`
//! and recorded in `library/index.json`. The gallery in the UI lists these and
//! loads the image files directly via Tauri's asset protocol (no base64 bloat).

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

static SEQ: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryItem {
    pub id: String,
    /// File name within the library dir.
    pub file: String,
    /// Absolute path on disk (used by the UI via convertFileSrc).
    pub path: String,
    pub mime: String,
    pub prompt: String,
    pub model: String,
    pub resolution: String,
    pub source_name: String,
    /// Unix epoch milliseconds.
    pub created_at: u64,
    #[serde(default)]
    pub favorite: bool,
    /// Color label key ("red"/"yellow"/"green"/"blue"/"purple") or "" for none.
    #[serde(default)]
    pub color: String,
    /// Project name this render belongs to ("" = untitled).
    #[serde(default)]
    pub project: String,
    /// Auto-incrementing version number within the project (1-based).
    #[serde(default)]
    pub version: u32,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn library_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve data dir: {e}"))?
        .join("library");
    fs::create_dir_all(&dir).map_err(|e| format!("could not create library dir: {e}"))?;
    Ok(dir)
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(library_dir(app)?.join("index.json"))
}

fn read_index(app: &AppHandle) -> Result<Vec<LibraryItem>, String> {
    let path = index_path(app)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("could not read library: {e}"))?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

fn write_index(app: &AppHandle, items: &[LibraryItem]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(items).map_err(|e| e.to_string())?;
    fs::write(index_path(app)?, json).map_err(|e| format!("could not write library: {e}"))
}

fn ext_for(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        _ => "png",
    }
}

/// Decode a rendered image and add it to the library. Returns the new item.
#[tauri::command]
pub fn save_to_library(
    app: AppHandle,
    image_base64: String,
    mime: String,
    prompt: String,
    model: String,
    resolution: String,
    source_name: String,
    project: String,
) -> Result<LibraryItem, String> {
    let bytes = STANDARD
        .decode(image_base64.as_bytes())
        .map_err(|e| format!("invalid image data: {e}"))?;

    let created_at = now_millis();
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let id = format!("{created_at}-{seq}");
    let file = format!("{id}.{}", ext_for(&mime));
    let full = library_dir(&app)?.join(&file);
    fs::write(&full, &bytes).map_err(|e| format!("could not save render: {e}"))?;

    let mut items = read_index(&app)?;
    // Version = next number within this project (commands are serialized on the
    // main thread, so a batch of renders increments cleanly).
    let version = items
        .iter()
        .filter(|i| i.project == project)
        .map(|i| i.version)
        .max()
        .unwrap_or(0)
        + 1;

    let item = LibraryItem {
        id,
        file,
        path: full.to_string_lossy().to_string(),
        mime,
        prompt,
        model,
        resolution,
        source_name,
        created_at,
        favorite: false,
        color: String::new(),
        project,
        version,
    };

    items.push(item.clone());
    write_index(&app, &items)?;
    Ok(item)
}

/// All library items, newest first.
#[tauri::command]
pub fn load_library(app: AppHandle) -> Result<Vec<LibraryItem>, String> {
    let mut items = read_index(&app)?;
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(items)
}

/// Toggle the favorite flag on a library item.
#[tauri::command]
pub fn set_favorite(app: AppHandle, id: String, favorite: bool) -> Result<(), String> {
    let mut items = read_index(&app)?;
    if let Some(it) = items.iter_mut().find(|i| i.id == id) {
        it.favorite = favorite;
        write_index(&app, &items)?;
    }
    Ok(())
}

/// Set (or clear, with "") the color label on a library item.
#[tauri::command]
pub fn set_color(app: AppHandle, id: String, color: String) -> Result<(), String> {
    let mut items = read_index(&app)?;
    if let Some(it) = items.iter_mut().find(|i| i.id == id) {
        it.color = color;
        write_index(&app, &items)?;
    }
    Ok(())
}

/// Delete a library item (file + index entry).
#[tauri::command]
pub fn delete_library_item(app: AppHandle, id: String) -> Result<(), String> {
    let mut items = read_index(&app)?;
    if let Some(pos) = items.iter().position(|i| i.id == id) {
        let removed = items.remove(pos);
        let _ = fs::remove_file(&removed.path);
        write_index(&app, &items)?;
    }
    Ok(())
}

/// Absolute path to the library folder (for "reveal in Finder").
#[tauri::command]
pub fn library_path(app: AppHandle) -> Result<String, String> {
    Ok(library_dir(&app)?.to_string_lossy().to_string())
}
