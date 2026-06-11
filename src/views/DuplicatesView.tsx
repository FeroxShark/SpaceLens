// Find groups of identical files in the current scan and let the user delete
// the extra copies. Guard: refuses to delete when a whole group is selected,
// so at least one copy always survives.

import { useMemo, useState } from "react";
import { getDuplicates, deletePaths, type DupGroup } from "../lib/api";
import { formatBytes } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { explainPath } from "../lib/linuxDirs";
import type { DeleteMode } from "../lib/settings";

const MIN_SIZE = 1024 * 1024; // only consider files >= 1 MiB

export function DuplicatesView({
  scanReady,
  deleteMode,
  homeDir,
}: {
  scanReady: boolean;
  deleteMode: DeleteMode;
  homeDir?: string;
}) {
  const { t, lang } = useI18n();
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);

  const search = async () => {
    setBusy(true);
    setSelected(new Set());
    setErrors(null);
    try {
      setGroups(await getDuplicates(MIN_SIZE));
    } catch {
      setGroups([]);
    }
    setBusy(false);
  };

  const toggle = (path: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const totalSelected = useMemo(() => {
    if (!groups) return 0;
    let sum = 0;
    for (const g of groups) {
      for (const p of g.paths) if (selected.has(p)) sum += g.size;
    }
    return sum;
  }, [groups, selected]);

  // True when some group has every copy selected — deleting would lose the file.
  const wholeGroupSelected = useMemo(
    () => (groups ?? []).some((g) => g.paths.length > 0 && g.paths.every((p) => selected.has(p))),
    [groups, selected],
  );

  const doDelete = async () => {
    setDeleting(true);
    const errs = await deletePaths(Array.from(selected), deleteMode);
    setDeleting(false);
    setConfirming(false);
    if (errs.length > 0) setErrors(errs);
    await search();
  };

  if (!scanReady) {
    return (
      <div className="view">
        <div className="empty-state">{t("dup.needScan")}</div>
      </div>
    );
  }

  return (
    <div className="view dup-view">
      <div className="view-head">
        <h1>{t("dup.heading")}</h1>
        <button className="btn small" onClick={search} disabled={busy}>
          ⌕ {t("dup.scan")}
        </button>
      </div>
      <p className="muted intro">{t("dup.intro")}</p>
      <div className="warn-box">{t("dup.warn")}</div>

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

      {busy && (
        <div className="empty-state">
          <div className="spinner" />
          {t("dup.scanning")}
        </div>
      )}

      {!busy && groups !== null && groups.length === 0 && (
        <div className="empty-state">{t("dup.empty")}</div>
      )}

      {!busy &&
        groups !== null &&
        groups.map((g, gi) => (
          <div className="dup-group" key={gi}>
            <div className="dup-group-head">
              <span>
                <strong>{formatBytes(g.size)}</strong> {t("dup.each")} ·{" "}
                {t("dup.copies", { n: g.count })}
              </span>
              <span className="dup-wasted">
                {formatBytes(g.wasted)} {t("dup.reclaimable")}
              </span>
            </div>
            {g.paths.map((p) => {
              const ex = explainPath(p, lang, t, { isDir: false, homeDir });
              return (
                <label className="dup-row" key={p}>
                  <input
                    type="checkbox"
                    checked={selected.has(p)}
                    onChange={() => toggle(p)}
                  />
                  <span
                    className={`safety-dot safety-${ex.safety}`}
                    title={`${ex.what} ${ex.risk}`}
                  />
                  <span className="dup-path" title={`${ex.what} ${ex.risk}`}>
                    {p}
                  </span>
                </label>
              );
            })}
          </div>
        ))}

      {selected.size > 0 && (
        <div className="cleanup-footer">
          <span>
            {t("cleanup.total")}: <strong>{formatBytes(totalSelected)}</strong>
          </span>
          {wholeGroupSelected && <span className="warn-text">{t("dup.keepWarn")}</span>}
          <button
            className="btn danger"
            disabled={wholeGroupSelected}
            onClick={() => setConfirming(true)}
          >
            {t("dup.delete")}
          </button>
        </div>
      )}

      {confirming && (
        <div className="modal-overlay" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t("dup.delete")}</h2>
            <p className={deleteMode === "permanent" ? "warn-text" : "muted"}>
              {deleteMode === "permanent" ? t("del.permanent") : t("del.toTrash")}
            </p>
            <ul className="confirm-list">
              {Array.from(selected).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirming(false)}>
                {t("del.cancel")}
              </button>
              <button className="btn danger" disabled={deleting} onClick={doDelete}>
                {deleting ? t("del.deleting") : t("del.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
