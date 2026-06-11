// Delete confirmation and "what is this?" explanation dialogs.

import { useState } from "react";
import { useI18n } from "../lib/i18n";
import { formatBytes } from "../lib/format";
import { explainPath } from "../lib/linuxDirs";
import { deletePaths } from "../lib/api";
import type { DeleteMode } from "../lib/settings";
import { SafetyBadge } from "./SafetyBadge";

export interface DeleteTarget {
  path: string;
  name: string;
  size: number;
}

export function ConfirmDeleteDialog({
  target,
  mode,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget;
  mode: DeleteMode;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t, lang } = useI18n();
  const explanation = explainPath(target.path, lang);
  const isDanger = explanation?.safety === "danger";
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
        {explanation && (
          <div className="del-explain">
            <SafetyBadge safety={explanation.safety} />
            <p>{explanation.text}</p>
          </div>
        )}
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
  onClose,
}: {
  path: string;
  name: string;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const explanation = explainPath(path, lang);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{name}</h2>
        <div className="del-path" title={path}>{path}</div>
        {explanation ? (
          <div className="del-explain">
            <SafetyBadge safety={explanation.safety} />
            <p>{explanation.text}</p>
          </div>
        ) : (
          <p className="muted">{t("explain.unknown")}</p>
        )}
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
