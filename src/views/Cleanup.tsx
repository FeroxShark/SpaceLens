// Known cleanable locations with sizes; lets the user reclaim selected items.

import { useEffect, useState } from "react";
import {
  getCleanupSuggestions,
  deletePaths,
  type CleanupItem,
} from "../lib/api";
import { formatBytes } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { DeleteMode } from "../lib/settings";

export function Cleanup({ deleteMode }: { deleteMode: DeleteMode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<CleanupItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);

  const load = () => {
    setItems(null);
    setSelected(new Set());
    setErrors(null);
    getCleanupSuggestions()
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(load, []);

  const toggle = (path: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const selectedItems = (items ?? []).filter((i) => selected.has(i.path));
  const total = selectedItems.reduce((sum, i) => sum + i.size, 0);

  const reclaim = async () => {
    setBusy(true);
    const errs = await deletePaths(Array.from(selected), deleteMode);
    setBusy(false);
    setConfirming(false);
    if (errs.length > 0) setErrors(errs);
    load();
  };

  if (items === null) {
    return (
      <div className="view">
        <div className="empty-state">
          <div className="spinner" />
          {t("cleanup.scanning")}
        </div>
      </div>
    );
  }

  return (
    <div className="view cleanup-view">
      <div className="view-head">
        <h1>{t("cleanup.heading")}</h1>
        <button className="btn small ghost" onClick={load}>
          ⟳ {t("cleanup.refresh")}
        </button>
      </div>
      <p className="muted intro">{t("cleanup.intro")}</p>

      {errors && (
        <div className="del-errors inline">
          <p>{t("del.errors")}</p>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">{t("cleanup.empty")}</div>
      ) : (
        <div className="cleanup-list">
          {items.map((item) => (
            <label className="cleanup-row" key={item.path}>
              <input
                type="checkbox"
                checked={selected.has(item.path)}
                onChange={() => toggle(item.path)}
              />
              <span className={`safety-dot safety-${item.safety}`} />
              <span className="cleanup-text">
                <span className="cleanup-label">{t(`cleanup.${item.key}.label`)}</span>
                <span className="cleanup-desc">{t(`cleanup.${item.key}.desc`)}</span>
              </span>
              <span className="cleanup-size">{formatBytes(item.size)}</span>
            </label>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="cleanup-footer">
          <span>
            {t("cleanup.total")}: <strong>{formatBytes(total)}</strong>
          </span>
          <button className="btn danger" onClick={() => setConfirming(true)}>
            {t("cleanup.reclaim")}
          </button>
        </div>
      )}

      {confirming && (
        <div className="modal-overlay" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t("cleanup.reclaim")}</h2>
            <p className={deleteMode === "permanent" ? "warn-text" : "muted"}>
              {deleteMode === "permanent" ? t("del.permanent") : t("del.toTrash")}
            </p>
            <ul className="confirm-list">
              {selectedItems.map((i) => (
                <li key={i.path}>
                  {t(`cleanup.${i.key}.label`)} — {formatBytes(i.size)}
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirming(false)}>
                {t("del.cancel")}
              </button>
              <button className="btn danger" disabled={busy} onClick={reclaim}>
                {busy ? t("del.deleting") : t("del.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
