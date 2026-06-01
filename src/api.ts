import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  LibraryItem,
  LoadedImage,
  ModelTier,
  Preset,
  RenderResult,
  Resolution,
} from "./types";

// ---- Keychain -------------------------------------------------------------

export const hasApiKey = () => invoke<boolean>("has_api_key");
export const setApiKey = (key: string) => invoke<void>("set_api_key", { key });
export const deleteApiKey = () => invoke<void>("delete_api_key");

// ---- Presets --------------------------------------------------------------

export const loadPresets = () => invoke<Preset[]>("load_presets");
export const savePresets = (presets: Preset[]) =>
  invoke<void>("save_presets", { presets });
export const presetsPath = () => invoke<string>("presets_path");

// ---- Images ---------------------------------------------------------------

export const readImageAsBase64 = (path: string) =>
  invoke<LoadedImage>("read_image_as_base64", { path });

export const exportImage = (path: string, base64: string) =>
  invoke<void>("export_image", { path, base64 });

export const copyFile = (src: string, dst: string) =>
  invoke<void>("copy_file", { src, dst });

// ---- Library --------------------------------------------------------------

export const saveToLibrary = (
  imageBase64: string,
  mime: string,
  prompt: string,
  model: ModelTier,
  resolution: Resolution,
  sourceName: string,
  project: string,
) =>
  invoke<LibraryItem>("save_to_library", {
    imageBase64,
    mime,
    prompt,
    model,
    resolution,
    sourceName,
    project,
  });

export const loadLibrary = () => invoke<LibraryItem[]>("load_library");
export const setFavorite = (id: string, favorite: boolean) =>
  invoke<void>("set_favorite", { id, favorite });
export const setColor = (id: string, color: string) =>
  invoke<void>("set_color", { id, color });
export const deleteLibraryItem = (id: string) =>
  invoke<void>("delete_library_item", { id });
export const libraryPath = () => invoke<string>("library_path");

/** Local file path → asset URL the webview can load in <img>. */
export const fileSrc = (path: string) => convertFileSrc(path);
/** Reveal a file in Finder/Explorer. */
export const revealInFinder = (path: string) => revealItemInDir(path);

// ---- Gemini ---------------------------------------------------------------

export const generateRender = (
  imageBase64: string,
  mime: string,
  prompt: string,
  model: ModelTier,
  resolution: Resolution,
) =>
  invoke<RenderResult>("generate_render", {
    imageBase64,
    mime,
    prompt,
    model,
    resolution,
  });

// ---- Native dialogs -------------------------------------------------------

export async function pickImage(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickSavePath(
  defaultName: string,
): Promise<string | null> {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "PNG image", extensions: ["png"] }],
  });
  return path ?? null;
}
