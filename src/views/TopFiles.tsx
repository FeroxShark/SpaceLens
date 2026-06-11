// Flat list of the largest individual files in the current scan.

import { useEffect, useState } from "react";
import { getTopFiles, openInFileManager, type TopFile } from "../lib/api";
import { formatBytes } from "../lib/format";
import { colorForName } from "../lib/filetypes";
import { useI18n } from "../lib/i18n";

export function TopFiles({ scanReady }: { scanReady: boolean }) {
  const { t } = useI18n();
  const [files, setFiles] = useState<TopFile[]>([]);

  useEffect(() => {
    if (scanReady) getTopFiles(100).then(setFiles).catch(() => setFiles([]));
    else setFiles([]);
  }, [scanReady]);

  if (!scanReady) {
    return (
      <div className="view">
        <div className="empty-state">{t("top.empty")}</div>
      </div>
    );
  }

  return (
    <div className="view topfiles-view">
      <div className="view-head">
        <h1>{t("top.heading")}</h1>
      </div>
      <div className="topfiles-list">
        {files.map((f, i) => {
          const slash = f.path.lastIndexOf("/");
          const name = slash >= 0 ? f.path.slice(slash + 1) : f.path;
          const dir = slash >= 0 ? f.path.slice(0, slash) : "";
          return (
            <div className="topfile-row" key={i}>
              <span className="topfile-rank">{i + 1}</span>
              <span className="topfile-dot" style={{ background: colorForName(name) }} />
              <span className="topfile-size">{formatBytes(f.size)}</span>
              <span className="topfile-name" title={f.path}>
                {name}
                <span className="topfile-dir">{dir}</span>
              </span>
              <button className="btn small ghost" onClick={() => openInFileManager(f.path)}>
                {t("top.open")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
