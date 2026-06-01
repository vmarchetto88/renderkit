export interface Preset {
  id: string;
  label: string;
  prompt: string;
  category: string;
  /** Built-in presets: title-only, prompt hidden & uneditable. */
  locked: boolean;
}

export type ModelTier = "flash" | "pro";

export type Resolution = "1K" | "2K" | "4K";

export interface LoadedImage {
  base64: string;
  mime: string;
}

export interface RenderResult {
  image_base64: string;
  mime: string;
  text: string;
}

export interface LibraryItem {
  id: string;
  file: string;
  path: string;
  mime: string;
  prompt: string;
  model: string;
  resolution: string;
  source_name: string;
  created_at: number;
  favorite: boolean;
  /** Color label key or "" for none. */
  color: string;
  project: string;
  version: number;
}
