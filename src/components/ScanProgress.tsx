// Full-screen overlay shown while a scan is running.

import { useI18n } from "../lib/i18n";
import { formatBytes } from "../lib/format";
import type { ScanProgress as Progress } from "../lib/api";

export function ScanProgress({
  progress,
  onCancel,
}: {
  progress: Progress;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="modal-overlay">
      <div className="modal scan-modal">
        <div className="spinner" />
        <h2>{t("scan.scanning")}</h2>
        <div className="scan-stats">
          <span className="big">{formatBytes(progress.bytes)}</span>
          <span className="muted">
            {progress.files.toLocaleString()} {t("scan.files")} {t("scan.found")}
          </span>
        </div>
        <div className="scan-current" title={progress.current}>
          {progress.current}
        </div>
        <button className="btn ghost" onClick={onCancel}>
          {t("scan.cancel")}
        </button>
      </div>
    </div>
  );
}
