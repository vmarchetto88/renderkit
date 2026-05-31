import { useState } from "react";
import { deleteApiKey, setApiKey } from "../api";

interface Props {
  hasKey: boolean;
  onClose: () => void;
  onChanged: (hasKey: boolean) => void;
}

export function SettingsModal({ hasKey, onClose, onChanged }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await setApiKey(value.trim());
      onChanged(true);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      await deleteApiKey();
      onChanged(false);
      setValue("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Gemini API Key</h2>
        <p className="muted">
          Saved to a local config file on this Mac (not in the app bundle, not
          in git). Paste it once — no Keychain prompt. Read only at render time.
        </p>

        <div className="status-line">
          Status:{" "}
          {hasKey ? (
            <span className="ok">A key is stored</span>
          ) : (
            <span className="warn">No key set</span>
          )}
        </div>

        <input
          type="password"
          className="text-input"
          placeholder={hasKey ? "Enter a new key to replace…" : "Paste your API key…"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          {hasKey && (
            <button className="ghost danger" onClick={clear} disabled={busy}>
              Remove key
            </button>
          )}
          <div className="spacer" />
          <button className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={save}
            disabled={busy || value.trim().length === 0}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
