//! File helpers for reading source images and exporting rendered output.

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct LoadedImage {
    pub base64: String,
    pub mime: String,
}

fn mime_for(path: &Path) -> Result<String, String> {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => Ok("image/png".into()),
        Some("jpg") | Some("jpeg") => Ok("image/jpeg".into()),
        other => Err(format!(
            "Unsupported image type: {}. Use PNG or JPG.",
            other.unwrap_or("unknown")
        )),
    }
}

/// Read an image file from disk and return it base64-encoded with its MIME type.
#[tauri::command]
pub fn read_image_as_base64(path: String) -> Result<LoadedImage, String> {
    let p = Path::new(&path);
    let mime = mime_for(p)?;
    let bytes = fs::read(p).map_err(|e| format!("could not read image: {e}"))?;
    Ok(LoadedImage {
        base64: STANDARD.encode(bytes),
        mime,
    })
}

/// Decode base64 image data and write it to the chosen destination path.
#[tauri::command]
pub fn export_image(path: String, base64: String) -> Result<(), String> {
    let bytes = STANDARD
        .decode(base64.as_bytes())
        .map_err(|e| format!("invalid image data: {e}"))?;
    fs::write(&path, bytes).map_err(|e| format!("could not save image: {e}"))
}

/// Copy a file from `src` to `dst` (used to export an image from the library).
#[tauri::command]
pub fn copy_file(src: String, dst: String) -> Result<(), String> {
    fs::copy(&src, &dst).map_err(|e| format!("could not export: {e}"))?;
    Ok(())
}
