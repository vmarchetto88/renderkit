import { useEffect, useMemo, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  exportImage,
  generateRender,
  hasApiKey,
  loadLibrary,
  loadPresets,
  pickImage,
  pickSavePath,
  readImageAsBase64,
  savePresets,
  saveToLibrary,
  setColor,
  setFavorite,
} from "./api";
import type { LibraryItem, ModelTier, Preset, Resolution } from "./types";
import { SettingsModal } from "./components/SettingsModal";
import { PresetManager } from "./components/PresetManager";
import { LibraryModal } from "./components/LibraryModal";
import "./App.css";

interface SourceImage {
  base64: string;
  mime: string;
  name: string;
}

const BATCH = 4;

type TileStatus = "idle" | "loading" | "done" | "error";

interface Tile {
  status: TileStatus;
  base64?: string;
  mime?: string;
  text?: string;
  error?: string;
}

const emptyTiles = (): Tile[] =>
  Array.from({ length: BATCH }, () => ({ status: "idle" as TileStatus }));

function isSupported(path: string): boolean {
  return /\.(png|jpe?g)$/i.test(path);
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function App() {
  const [source, setSource] = useState<SourceImage | null>(null);
  const [project, setProject] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelTier>("flash");
  const [resolution, setResolution] = useState<Resolution>("2K");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("");

  const [tiles, setTiles] = useState<Tile[]>(emptyTiles);
  const [error, setError] = useState<string | null>(null);
  const rendering = tiles.some((t) => t.status === "loading");

  const [keyPresent, setKeyPresent] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [viewer, setViewer] = useState<{ base64: string; mime: string } | null>(
    null,
  );
  const [savingPreset, setSavingPreset] = useState(false);
  const [newPresetTitle, setNewPresetTitle] = useState("");

  const activePresetObj = useMemo(
    () => presets.find((p) => p.id === activePreset) ?? null,
    [presets, activePreset],
  );
  const lockedActive = !!activePresetObj?.locked;

  const categories = useMemo(
    () => [...new Set(presets.map((p) => p.category || "Uncategorized"))],
    [presets],
  );
  const visiblePresets = useMemo(
    () =>
      presets.filter(
        (p) => (p.category || "Uncategorized") === activeCategory,
      ),
    [presets, activeCategory],
  );

  // Keep the active category valid as presets change.
  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.includes(activeCategory)) setActiveCategory(categories[0]);
  }, [categories, activeCategory]);

  // Initial load: presets + key status + library.
  useEffect(() => {
    loadPresets().then(setPresets).catch((e) => setError(String(e)));
    hasApiKey().then(setKeyPresent).catch(() => setKeyPresent(false));
    loadLibrary().then(setLibrary).catch(() => {});
  }, []);

  // Native (OS-level) drag-and-drop of files onto the window.
  useEffect(() => {
    // Guard: the Tauri webview APIs only exist inside the app, not in a plain
    // browser preview. Without this, getCurrentWebview() throws on load.
    if (!("__TAURI_INTERNALS__" in window)) return;
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "over" || p.type === "enter") {
        setDragActive(true);
      } else if (p.type === "leave") {
        setDragActive(false);
      } else if (p.type === "drop") {
        setDragActive(false);
        const path = p.paths.find(isSupported);
        if (path) {
          loadFromPath(path);
        } else if (p.paths.length > 0) {
          setError("Unsupported file. Drop a PNG or JPG.");
        }
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  async function loadFromPath(path: string) {
    setError(null);
    try {
      const img = await readImageAsBase64(path);
      setSource({ base64: img.base64, mime: img.mime, name: basename(path) });
      setTiles(emptyTiles());
    } catch (e) {
      setError(String(e));
    }
  }

  async function browse() {
    const path = await pickImage();
    if (path) loadFromPath(path);
  }

  function applyPreset(p: Preset) {
    setActivePreset(p.id);
    setSavingPreset(false);
    // Locked (built-in) presets: keep the prompt hidden — don't load text into
    // the editable field. Custom presets are the user's own, so show them.
    setPrompt(p.locked ? "" : p.prompt);
  }

  // Switch from a locked preset to writing a custom prompt.
  function writeCustom() {
    setActivePreset(null);
    setPrompt("");
  }

  // Resolve the prompt actually sent to the API, and a non-revealing label to
  // store in the library (locked presets never expose their text).
  function currentPrompts(): { api: string; label: string } {
    const ap = presets.find((p) => p.id === activePreset);
    if (ap?.locked) return { api: ap.prompt, label: `Preset: ${ap.label}` };
    return { api: prompt, label: prompt };
  }

  // Validate that we can render; surface a helpful error otherwise.
  function ensureReady(): boolean {
    if (!source) {
      setError("Add a source image first.");
      return false;
    }
    if (!keyPresent) {
      setError("Set your Gemini API key in Settings first.");
      setShowSettings(true);
      return false;
    }
    if (!currentPrompts().api.trim()) {
      setError("Pick a preset or write a custom prompt first.");
      return false;
    }
    return true;
  }

  // Fire a single generation into tile `idx` and auto-save the result.
  // `apiPrompt` is sent to the model; `libraryLabel` is stored (never reveals a
  // locked preset's text).
  function renderOne(
    idx: number,
    src: SourceImage,
    apiPrompt: string,
    libraryLabel: string,
    curModel: ModelTier,
    res: Resolution,
  ) {
    generateRender(src.base64, src.mime, apiPrompt, curModel, res)
      .then(async (result) => {
        setTiles((prev) =>
          prev.map((t, j) =>
            j === idx
              ? {
                  status: "done",
                  base64: result.image_base64,
                  mime: result.mime,
                  text: result.text,
                }
              : t,
          ),
        );
        try {
          const item = await saveToLibrary(
            result.image_base64,
            result.mime,
            libraryLabel,
            curModel,
            res,
            src.name,
            project.trim(),
          );
          setLibrary((prev) => [item, ...prev]);
        } catch (e) {
          console.error("library save failed", e);
        }
      })
      .catch((e) => {
        setTiles((prev) =>
          prev.map((t, j) =>
            j === idx ? { status: "error", error: String(e) } : t,
          ),
        );
      });
  }

  // Render just one box (the one clicked). Other boxes are untouched.
  function renderTile(idx: number) {
    if (!ensureReady() || !source) return;
    if (tiles[idx].status === "loading") return;
    setError(null);
    const res: Resolution = model === "pro" ? resolution : "1K";
    const { api, label } = currentPrompts();
    setTiles((prev) =>
      prev.map((t, j) => (j === idx ? { status: "loading" } : t)),
    );
    renderOne(idx, source, api, label, model, res);
  }

  // Render a single image into the first open box (the Render button).
  function renderSingle() {
    let idx = tiles.findIndex((t) => t.status === "idle");
    if (idx < 0) idx = tiles.findIndex((t) => t.status !== "loading");
    if (idx < 0) idx = 0;
    renderTile(idx);
  }

  // Render all 4 boxes at once (the Render ×4 button).
  function renderAll() {
    if (!ensureReady() || !source || rendering) return;
    setError(null);
    const res: Resolution = model === "pro" ? resolution : "1K";
    const { api, label } = currentPrompts();
    setTiles(Array.from({ length: BATCH }, () => ({ status: "loading" })));
    for (let i = 0; i < BATCH; i++) {
      renderOne(i, source, api, label, model, res);
    }
  }

  // Save the current custom prompt text as a new (unlocked) preset.
  async function saveCustomPreset() {
    const title = newPresetTitle.trim();
    const body = prompt.trim();
    if (!title || !body) return;
    const np: Preset = {
      id: `custom-${crypto.randomUUID()}`,
      label: title,
      prompt: body,
      category: "My Prompts",
      locked: false,
    };
    const next = [...presets, np];
    try {
      await savePresets(next);
      setPresets(next);
      setActivePreset(np.id);
      setSavingPreset(false);
      setNewPresetTitle("");
    } catch (e) {
      setError(String(e));
    }
  }

  // "Use as source": adopt a finished tile as the new source, then clear the
  // grid so you can render fresh variations of it one box at a time.
  function useAsSource(tile: Tile) {
    if (tile.status !== "done" || !tile.base64 || !tile.mime) return;
    setSource({
      base64: tile.base64,
      mime: tile.mime,
      name: source?.name ?? "render.png",
    });
    setTiles(emptyTiles());
  }

  // Click a box: a finished render opens full-screen; an empty/failed box
  // renders into that slot.
  function onTileClick(tile: Tile, idx: number) {
    if (tile.status === "loading") return;
    if (tile.status === "done" && tile.base64 && tile.mime) {
      setViewer({ base64: tile.base64, mime: tile.mime });
    } else {
      renderTile(idx);
    }
  }

  async function exportTile(tile: Tile, i: number) {
    if (tile.status !== "done" || !tile.base64) return;
    const stem = source ? source.name.replace(/\.[^.]+$/, "") : "render";
    const suffix = model === "pro" ? `nbpro-${resolution}` : "flash";
    const path = await pickSavePath(`${stem}-v${i + 1}-${suffix}.png`);
    if (!path) return;
    try {
      await exportImage(path, tile.base64);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/mhs-logo.png" alt="MHS" />
          MHS Render
          <span className="tag">Gemini renders for 3D viewport shots</span>
        </div>
        <div className="project-field">
          <span className="pf-label">Project</span>
          <input
            className="pf-input"
            placeholder="Untitled"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
        </div>
        <div className="topbar-actions">
          <button className="ghost" onClick={() => setShowLibrary(true)}>
            🖼 Library{library.length > 0 ? ` (${library.length})` : ""}
          </button>
          <button className="ghost" onClick={() => setShowSettings(true)}>
            {keyPresent ? "🔑 API Key" : "⚠ Set API Key"}
          </button>
        </div>
      </header>

      <section className="presets">
        <select
          className="category-select"
          value={activeCategory}
          onChange={(e) => setActiveCategory(e.target.value)}
          disabled={categories.length === 0}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="preset-buttons">
          {visiblePresets.map((p) => (
            <button
              key={p.id}
              className={`chip ${activePreset === p.id ? "active" : ""} ${
                p.locked ? "" : "custom"
              }`}
              onClick={() => applyPreset(p)}
              title={p.label}
            >
              {p.label}
            </button>
          ))}
          {presets.length === 0 && (
            <span className="muted">No presets — add some →</span>
          )}
        </div>
        <button
          className="ghost small"
          onClick={() => setShowPresetManager(true)}
        >
          Manage
        </button>
      </section>

      <section className="prompt-bar">
        <div className="prompt-area">
          {lockedActive ? (
            <div className="locked-prompt">
              <div className="locked-text">
                <span className="lock-line">
                  🔒 Using preset: <b>{activePresetObj!.label}</b>
                </span>
                <span className="muted small">Prompt is hidden</span>
              </div>
              <button className="ghost small" onClick={writeCustom}>
                Write custom prompt →
              </button>
            </div>
          ) : (
            <>
              <textarea
                className="prompt-input"
                placeholder="Write a custom prompt… (or pick a preset above)"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setActivePreset(null);
                  setSavingPreset(false);
                }}
                rows={3}
              />
              {savingPreset ? (
                <div className="save-preset-row">
                  <input
                    className="text-input"
                    placeholder="Name this preset…"
                    value={newPresetTitle}
                    onChange={(e) => setNewPresetTitle(e.target.value)}
                    autoFocus
                  />
                  <button
                    className="ghost small"
                    onClick={() => {
                      setSavingPreset(false);
                      setNewPresetTitle("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary small"
                    onClick={saveCustomPreset}
                    disabled={!newPresetTitle.trim() || !prompt.trim()}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  className="ghost small save-preset-btn"
                  onClick={() => setSavingPreset(true)}
                  disabled={!prompt.trim()}
                >
                  ＋ Save as preset
                </button>
              )}
            </>
          )}
        </div>
        <div className="controls">
          <div className="model-toggle" role="group" aria-label="Model tier">
            <button
              className={model === "flash" ? "seg active" : "seg"}
              onClick={() => setModel("flash")}
            >
              ⚡ Flash
              <small>fast iteration</small>
            </button>
            <button
              className={model === "pro" ? "seg active" : "seg"}
              onClick={() => setModel("pro")}
            >
              ✦ Nano Banana Pro
              <small>final output · up to 4K</small>
            </button>
          </div>
          <div className="res-row">
            <div
              className={`model-toggle res-toggle ${
                model === "pro" ? "" : "disabled"
              }`}
              role="group"
              aria-label="Output resolution"
            >
              {(["1K", "2K", "4K"] as Resolution[]).map((r) => (
                <button
                  key={r}
                  className={resolution === r ? "seg active" : "seg"}
                  onClick={() => setResolution(r)}
                  disabled={model !== "pro"}
                  title={
                    model === "pro"
                      ? `Output at ${r}${r === "4K" ? " (slower)" : ""}`
                      : "Resolution is available on Nano Banana Pro"
                  }
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              className="ghost render-btn"
              onClick={renderSingle}
              disabled={
                !source || tiles.every((t) => t.status === "loading")
              }
              title="Render one image into the next open box"
            >
              Render
            </button>
            <button
              className="primary render-btn"
              onClick={renderAll}
              disabled={rendering || !source}
            >
              {rendering
                ? "Rendering ×4…"
                : `Render ×4${model === "pro" ? ` · ${resolution}` : ""} →`}
            </button>
          </div>
        </div>
      </section>

      {error && <div className="error banner">{error}</div>}

      <section className="canvas">
        <div className="pane">
          <div className="pane-head">
            <span>Source</span>
            <button className="ghost small" onClick={browse}>
              Choose file…
            </button>
          </div>
          <div
            className={`drop ${dragActive ? "drag" : ""}`}
            onClick={!source ? browse : undefined}
          >
            {source ? (
              <img
                src={`data:${source.mime};base64,${source.base64}`}
                alt={source.name}
              />
            ) : (
              <div className="placeholder">
                <div className="big">⤓</div>
                <p>Drag a PNG or JPG here</p>
                <p className="muted">or click to browse</p>
              </div>
            )}
          </div>
          {source && <div className="pane-foot mono small">{source.name}</div>}
        </div>

        <div className="pane">
          <div className="pane-head">
            <span>Renders</span>
            <span className="muted small">
              click empty to render · click a result to view
            </span>
          </div>
          <div className="result-grid">
            {tiles.map((tile, i) => {
              const title =
                tile.status === "done"
                  ? "Click to view full screen"
                  : tile.status === "error"
                    ? tile.error
                    : tile.status === "idle"
                      ? "Click to render this box"
                      : undefined;
              return (
                <div
                  key={i}
                  className={`tile ${tile.status}`}
                  onClick={() => onTileClick(tile, i)}
                  title={title}
                >
                  {tile.status === "loading" && <div className="spinner" />}
                  {tile.status === "done" && tile.base64 && (
                    <>
                      <img
                        src={`data:${tile.mime};base64,${tile.base64}`}
                        alt={`Render ${i + 1}`}
                      />
                      <div className="tile-overlay">
                        <button
                          className="ghost small"
                          onClick={(e) => {
                            e.stopPropagation();
                            renderTile(i);
                          }}
                        >
                          ↻ Redo
                        </button>
                        <button
                          className="ghost small"
                          onClick={(e) => {
                            e.stopPropagation();
                            useAsSource(tile);
                          }}
                        >
                          Use as source
                        </button>
                        <button
                          className="ghost small"
                          onClick={(e) => {
                            e.stopPropagation();
                            exportTile(tile, i);
                          }}
                        >
                          Export
                        </button>
                      </div>
                    </>
                  )}
                  {tile.status === "error" && (
                    <div className="tile-error">⚠ failed — click to retry</div>
                  )}
                  {tile.status === "idle" && (
                    <div className="tile-num">+</div>
                  )}
                </div>
              );
            })}
          </div>
          {model === "pro" && resolution === "4K" && rendering && (
            <div className="pane-foot small muted">
              4K — each of the 4 can take a few minutes.
            </div>
          )}
        </div>
      </section>

      {showSettings && (
        <SettingsModal
          hasKey={keyPresent}
          onClose={() => setShowSettings(false)}
          onChanged={setKeyPresent}
        />
      )}
      {showPresetManager && (
        <PresetManager
          presets={presets}
          onClose={() => setShowPresetManager(false)}
          onSaved={setPresets}
        />
      )}
      {viewer && (
        <div className="lightbox" onClick={() => setViewer(null)}>
          <img
            src={`data:${viewer.mime};base64,${viewer.base64}`}
            alt="Full-screen render"
          />
          <button
            className="lightbox-close"
            onClick={() => setViewer(null)}
            title="Close"
          >
            ✕
          </button>
        </div>
      )}
      {showLibrary && (
        <LibraryModal
          items={library}
          onClose={() => setShowLibrary(false)}
          onDeleted={(id) =>
            setLibrary((prev) => prev.filter((x) => x.id !== id))
          }
          onToggleFavorite={(id, favorite) => {
            setLibrary((prev) =>
              prev.map((x) => (x.id === id ? { ...x, favorite } : x)),
            );
            setFavorite(id, favorite).catch((e) =>
              console.error("favorite save failed", e),
            );
          }}
          onSetColor={(id, color) => {
            setLibrary((prev) =>
              prev.map((x) => (x.id === id ? { ...x, color } : x)),
            );
            setColor(id, color).catch((e) =>
              console.error("color save failed", e),
            );
          }}
        />
      )}
    </div>
  );
}

export default App;
