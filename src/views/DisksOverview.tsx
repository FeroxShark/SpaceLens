// Landing view: disk cards with usage bars plus entry points to start a scan.

import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listDisks, homeDir, type Disk } from "../lib/api";
import { formatBytes, percent } from "../lib/format";
import { useI18n } from "../lib/i18n";

export function DisksOverview({ onScan }: { onScan: (path: string) => void }) {
  const { t } = useI18n();
  const [disks, setDisks] = useState<Disk[]>([]);
  const [home, setHome] = useState<string>("");

  useEffect(() => {
    listDisks().then(setDisks).catch(() => setDisks([]));
    homeDir().then(setHome);
  }, []);

  const chooseFolder = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") onScan(picked);
  };

  return (
    <div className="view disks-view">
      <div className="view-head">
        <h1>{t("disks.heading")}</h1>
        <div className="head-actions">
          {home && (
            <button className="btn ghost" onClick={() => onScan(home)}>
              🏠 {t("disks.home")}
            </button>
          )}
          <button className="btn primary" onClick={chooseFolder}>
            📂 {t("disks.choose")}
          </button>
        </div>
      </div>

      <div className="disk-grid">
        {disks.map((d) => {
          const usedPct = d.total > 0 ? (d.used / d.total) * 100 : 0;
          const danger = usedPct > 90;
          return (
            <div className="disk-card" key={d.mount_point}>
              <div className="disk-card-top">
                <div>
                  <div className="disk-mount">{d.mount_point}</div>
                  <div className="disk-fs">
                    {d.file_system}
                    {d.is_removable && <span className="pill"> {t("disks.removable")}</span>}
                  </div>
                </div>
                <button className="btn small primary" onClick={() => onScan(d.mount_point)}>
                  {t("disks.scan")}
                </button>
              </div>

              <div className="usage-bar">
                <div
                  className={`usage-fill ${danger ? "danger" : ""}`}
                  style={{ width: `${usedPct}%` }}
                />
              </div>

              <div className="disk-card-bottom">
                <span>
                  <strong>{formatBytes(d.used)}</strong> {t("disks.used")} ({percent(d.used, d.total, 0)})
                </span>
                <span className="muted">
                  {formatBytes(d.available)} {t("disks.free")} {t("disks.of")} {formatBytes(d.total)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
