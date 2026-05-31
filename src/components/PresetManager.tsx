import { useEffect, useMemo, useState } from "react";
import { presetsPath, savePresets } from "../api";
import type { Preset } from "../types";

interface Props {
  presets: Preset[];
  onClose: () => void;
  onSaved: (presets: Preset[]) => void;
}

function newId(): string {
  // crypto.randomUUID is available in the Tauri webview.
  return `custom-${crypto.randomUUID()}`;
}

export function PresetManager({ presets, onClose, onSaved }: Props) {
  // Built-in (locked) presets are never editable here — preserve them as-is and
  // only manage the user's own custom prompts.
  const builtins = useMemo(() => presets.filter((p) => p.locked), [presets]);
  const [items, setItems] = useState<Preset[]>(() =>
    presets.filter((p) => !p.locked).map((p) => ({ ...p })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState("");

  useEffect(() => {
    presetsPath().then(setPath).catch(() => {});
  }, []);

  function update(id: string, patch: Partial<Preset>) {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function add() {
    setItems((xs) => [
      ...xs,
      {
        id: newId(),
        label: "New prompt",
        prompt: "",
        category: "My Prompts",
        locked: false,
      },
    ]);
  }

  function remove(id: string) {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }

  function move(index: number, dir: -1 | 1) {
    setItems((xs) => {
      const next = [...xs];
      const target = index + dir;
      if (target < 0 || target >= next.length) return xs;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const cleaned = items
      .map((x) => ({
        ...x,
        label: x.label.trim(),
        prompt: x.prompt.trim(),
        category: x.category.trim() || "My Prompts",
        locked: false,
      }))
      .filter((x) => x.label.length > 0);
    // Merge the untouched built-ins back with the edited custom prompts.
    const merged = [...builtins, ...cleaned];
    try {
      await savePresets(merged);
      onSaved(merged);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>My Custom Prompts</h2>
        <p className="muted small">
          The built-in MHS presets are locked (title-only) and aren’t shown here.
          These are your own prompts.
        </p>
        {path && <p className="muted mono small">{path}</p>}

        <datalist id="preset-categories">
          {[...new Set(items.map((x) => x.category).filter(Boolean))].map(
            (c) => (
              <option key={c} value={c} />
            ),
          )}
        </datalist>

        <div className="preset-list">
          {items.length === 0 && (
            <p className="muted">
              No custom prompts yet. Add one below, or use “Save as preset” under
              the prompt box.
            </p>
          )}
          {items.map((item, i) => (
            <div className="preset-row" key={item.id}>
              <div className="reorder">
                <button
                  className="icon-btn"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="icon-btn"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  title="Move down"
                >
                  ↓
                </button>
              </div>
              <div className="preset-fields">
                <div className="preset-meta">
                  <input
                    className="text-input"
                    value={item.label}
                    placeholder="Prompt name"
                    onChange={(e) => update(item.id, { label: e.target.value })}
                  />
                  <input
                    className="text-input category-input"
                    value={item.category}
                    placeholder="Category"
                    list="preset-categories"
                    onChange={(e) =>
                      update(item.id, { category: e.target.value })
                    }
                  />
                </div>
                <textarea
                  className="text-area"
                  value={item.prompt}
                  placeholder="Prompt text…"
                  rows={3}
                  onChange={(e) => update(item.id, { prompt: e.target.value })}
                />
              </div>
              <button
                className="icon-btn danger"
                onClick={() => remove(item.id)}
                title="Delete prompt"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button className="ghost" onClick={add} disabled={busy}>
            + Add prompt
          </button>
          <div className="spacer" />
          <button className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
