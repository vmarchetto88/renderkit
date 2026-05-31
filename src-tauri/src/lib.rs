mod apikey;
mod files;
mod gemini;
mod library;
mod presets;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // api key (local file store)
            apikey::set_api_key,
            apikey::has_api_key,
            apikey::delete_api_key,
            // presets
            presets::load_presets,
            presets::save_presets,
            presets::presets_path,
            // files
            files::read_image_as_base64,
            files::export_image,
            files::copy_file,
            // library
            library::save_to_library,
            library::load_library,
            library::set_favorite,
            library::set_color,
            library::delete_library_item,
            library::library_path,
            // gemini
            gemini::generate_render,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
