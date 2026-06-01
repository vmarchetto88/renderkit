import { useEffect, useMemo, useState } from "react";
import {
  copyFile,
  deleteLibraryItem,
  fileSrc,
  libraryPath,
  pickSavePath,
  revealInFinder,
} from "../api";
import type { LibraryItem } from "../types";

interface Props {
  items: LibraryItem[];
  onClose: () => void;
  onDeleted: (id: string) => void;
  onToggleFavorite: (id: string, favorite: boolean) => void;
  onSetColor: (id: string, color: string) => void;
}

const COLORS: { key: string; hex: string; name: string }[] = [
  { key: "red", hex: "#ff5c5c", name: "Red" },
  { key: "yellow", hex: "#ffce5c", name: "Yellow" },
  { key: "green", hex: "#46d39a", name: "Green" },
  { key: "blue", hex: "#5b8cff", name: "Blue" },
  { key: "purple", hex: "#b57bff", name: "Purple" },
];

function colorHex(key: string): string | null {
  return COLORS.find((c) => c.key === key)?.hex ?? null;
}

function modelLabel(m: string): string {
  return m === "pro" ? "Nano Banana Pro" : "Flash";
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "render";
}

export function LibraryModal({
  items,
  onClose,
  onDeleted,
  onToggleFavorite,
  onSetColor,
}: Props) {
  const [dir, setDir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [filterColor, setFilterColor] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    libraryPath().then(setDir).catch(() => {});
  }, []);

  const favCount = useMemo(
    () => items.filter((i) => i.favorite).length,
    [items],
  );
  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (!favOnly || i.favorite) && (!filterColor || i.color === filterColor),
      ),
    [items, favOnly, filterColor],
  );
  const selected = selectedId
    ? items.find((i) => i.id === selectedId) ?? null
    : null;
  const navIdx = selected ? shown.findIndex((x) => x.id === selected.id) : -1;

  // Step to the previous/next image within the currently shown (filtered) set.
  function go(dir: number) {
    if (navIdx < 0) return;
    const ni = navIdx + dir;
    if (ni >= 0 && ni < shown.length) setSelectedId(shown[ni].id);
  }

  // Arrow-key navigation (and Esc) while the full-image view is open.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, shown]);

  async function exportItem(item: LibraryItem) {
    setError(null);
    try {
      const suffix =
        item.model === "pro" ? `nbpro-${item.resolution}` : "flash";
      const dest = await pickSavePath(`${stem(item.source_name)}-${suffix}.png`);
      if (dest) await copyFile(item.path, dest);
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(item: LibraryItem) {
    setError(null);
    try {
      await deleteLibraryItem(item.id);
      onDeleted(item.id);
      if (selectedId === item.id) setSelectedId(null);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal wide library-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="library-head">
          <h2>Library ({items.length})</h2>
          <div className="lib-filter" role="group" aria-label="Filter">
            <button
              className={!favOnly && !filterColor ? "seg active" : "seg"}
              onClick={() => {
                setFavOnly(false);
                setFilterColor(null);
              }}
            >
              All
            </button>
            <button
              className={favOnly ? "seg active" : "seg"}
              onClick={() => setFavOnly((v) => !v)}
            >
              ★ Favorites ({favCount})
            </button>
          </div>
          <div className="color-filter" aria-label="Filter by color">
            {COLORS.map((c) => (
              <button
                key={c.key}
                className={`color-dot ${filterColor === c.key ? "active" : ""}`}
                style={{ background: c.hex }}
                title={`Filter: ${c.name}`}
                onClick={() =>
                  setFilterColor((cur) => (cur === c.key ? null : c.key))
                }
              />
            ))}
          </div>
          <div className="spacer" />
          {dir && (
            <button
              className="ghost small"
              onClick={() => revealInFinder(dir).catch(() => {})}
            >
              Open folder
            </button>
          )}
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {shown.length === 0 ? (
          <p className="muted">
            {filterColor
              ? "No renders with this color label."
              : favOnly
                ? "No favorites yet. Tap the ☆ on any thumbnail."
                : "No renders yet. Every image you generate is saved here automatically."}
          </p>
        ) : (
          <div className="library-grid">
            {shown.map((item) => (
              <div className="lib-cell" key={item.id}>
                <div className="lib-thumb">
                <img
                  src={fileSrc(item.path)}
                  alt={item.prompt}
                  loading="lazy"
                  onClick={() => setSelectedId(item.id)}
                />
                <button
                  className="del-btn"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmId(item.id);
                  }}
                >
                  🗑
                </button>
                <button
                  className={`fav-btn ${item.favorite ? "on" : ""}`}
                  title={item.favorite ? "Remove favorite" : "Favorite"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(item.id, !item.favorite);
                  }}
                >
                  {item.favorite ? "★" : "☆"}
                </button>
                {colorHex(item.color) && (
                  <span
                    className="color-flag"
                    style={{ background: colorHex(item.color)! }}
                  />
                )}
                {confirmId === item.id && (
                  <div
                    className="tile-confirm"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>Delete this render?</span>
                    <div className="tile-confirm-actions">
                      <button
                        className="ghost small"
                        onClick={() => setConfirmId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => {
                          remove(item);
                          setConfirmId(null);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
                </div>
                <div className="lib-caption">
                  {item.project || "Untitled"}
                  {item.version ? ` · v${item.version}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div
            className="lib-detail-backdrop"
            onClick={() => setSelectedId(null)}
          >
            <button
              className="nav-arrow left"
              disabled={navIdx <= 0}
              title="Previous (←)"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
            >
              ‹
            </button>
            {shown.length > 1 && (
              <div className="nav-counter">
                {navIdx + 1} / {shown.length}
              </div>
            )}
            <div className="lib-detail" onClick={(e) => e.stopPropagation()}>
              <div className="lib-detail-img">
                <img src={fileSrc(selected.path)} alt={selected.prompt} />
              </div>
              <div className="lib-detail-info">
                <div className="lib-detail-meta">
                  <div className="kv">
                    <span>Project</span>
                    <b>
                      {selected.project || "Untitled"}
                      {selected.version ? ` · v${selected.version}` : ""}
                    </b>
                  </div>
                  <div className="kv">
                    <span>Model</span>
                    <b>
                      {modelLabel(selected.model)}
                      {selected.model === "pro" ? ` · ${selected.resolution}` : ""}
                    </b>
                  </div>
                  <div className="kv">
                    <span>Source</span>
                    <b>{selected.source_name || "—"}</b>
                  </div>
                  <div className="kv">
                    <span>Created</span>
                    <b>{new Date(selected.created_at).toLocaleString()}</b>
                  </div>
                  <div className="kv col">
                    <span>Color</span>
                    <div className="color-swatches">
                      {COLORS.map((c) => (
                        <button
                          key={c.key}
                          className={`color-dot ${
                            selected.color === c.key ? "active" : ""
                          }`}
                          style={{ background: c.hex }}
                          title={c.name}
                          onClick={() =>
                            onSetColor(
                              selected.id,
                              selected.color === c.key ? "" : c.key,
                            )
                          }
                        />
                      ))}
                      <button
                        className={`color-dot none ${
                          selected.color ? "" : "active"
                        }`}
                        title="No color"
                        onClick={() => onSetColor(selected.id, "")}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="kv col">
                    <span>Prompt</span>
                    <p className="lib-detail-prompt">
                      {selected.prompt || "(no prompt)"}
                    </p>
                  </div>
                </div>
                <div className="lib-detail-actions">
                  <button
                    className={`ghost ${selected.favorite ? "fav-on" : ""}`}
                    onClick={() =>
                      onToggleFavorite(selected.id, !selected.favorite)
                    }
                  >
                    {selected.favorite ? "★ Favorited" : "☆ Favorite"}
                  </button>
                  <button className="ghost" onClick={() => exportItem(selected)}>
                    Export…
                  </button>
                  <button
                    className="ghost"
                    onClick={() => revealInFinder(selected.path).catch(() => {})}
                  >
                    Reveal
                  </button>
                  <button
                    className="ghost danger"
                    onClick={() => remove(selected)}
                  >
                    Delete
                  </button>
                  <div className="spacer" />
                  <button
                    className="primary"
                    onClick={() => setSelectedId(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
            <button
              className="nav-arrow right"
              disabled={navIdx < 0 || navIdx >= shown.length - 1}
              title="Next (→)"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
