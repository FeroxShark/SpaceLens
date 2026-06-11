// Delete confirmation and "what is this?" explanation dialogs.

import { useState } from "react";
import { useI18n } from "../lib/i18n";
import { formatBytes } from "../lib/format";
import { explainPath, type Explanation } from "../lib/linuxDirs";
import { deletePaths } from "../lib/api";
import type { DeleteMode } from "../lib/settings";
import { SafetyBadge } from "./SafetyBadge";

export interface DeleteTarget {
  path: string;
  name: string;
  size: number;
  isDir?: boolean;
}

/// Shared block rendering an explanation as labelled sections.
function ExplanationBody({ ex }: { ex: Explanation }) {
  const { t } = useI18n();
  return (
    <div className={`explain-body safety-${ex.safety}`}>
      <SafetyBadge safety={ex.safety} />
      <div className="explain-section">
        <span className="explain-label">{t("explain.what")}</span>
        <p>{ex.what}</p>
      </div>
      <div className="explain-section">
        <span className="explain-label">{t("explain.risk")}</span>
        <p>{ex.risk}</p>
      </div>
      {ex.tip && (
        <div className="explain-section">
          <span className="explain-label">{t("explain.tip")}</span>
          <p className="explain-tip">{ex.tip}</p>
        </div>
      )}
      {ex.sourceNote && <p className="explain-source">{ex.sourceNote}</p>}
    </div>
  );
}

export function ConfirmDeleteDialog({
  target,
  mode,
  homeDir,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget;
  mode: DeleteMode;
  homeDir?: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t, lang } = useI18n();
  const explanation = explainPath(target.path, lang, t, {
    isDir: target.isDir,
    homeDir,
  });
  const isDanger = explanation.safety === "danger";
  const isUnknown = explanation.safety === "unknown";
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);

  const confirmDisabled = busy || (isDanger && typed !== target.name);

  const doDelete = async () => {
    setBusy(true);
    const errs = await deletePaths([target.path], mode);
    setBusy(false);
    if (errs.length > 0) {
      setErrors(errs);
    } else {
      onDeleted();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("del.title")}</h2>
        <div className="del-path" title={target.path}>{target.path}</div>
        <div className="del-row">
          <span className="muted">{t("del.size")}</span>
          <strong>{formatBytes(target.size)}</strong>
        </div>

        <ExplanationBody ex={explanation} />

        {isUnknown && <div className="warn-box">{t("del.unknownWarn")}</div>}

        <p className={mode === "permanent" ? "warn-text" : "muted"}>
          {mode === "permanent" ? t("del.permanent") : t("del.toTrash")}
        </p>

        {isDanger && (
          <div className="del-confirm-type">
            <label>{t("del.confirmType")}</label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={target.name}
              spellCheck={false}
            />
          </div>
        )}

        {errors && (
          <div className="del-errors">
            <p>{t("del.errors")}</p>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            {t("del.cancel")}
          </button>
          <button
            className="btn danger"
            disabled={confirmDisabled}
            onClick={doDelete}
          >
            {busy ? t("del.deleting") : t("del.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExplainDialog({
  path,
  name,
  isDir,
  homeDir,
  onClose,
}: {
  path: string;
  name: string;
  isDir?: boolean;
  homeDir?: string;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const explanation = explainPath(path, lang, t, { isDir, homeDir });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{name}</h2>
        <div className="del-path" title={path}>{path}</div>
        <ExplanationBody ex={explanation} />
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
