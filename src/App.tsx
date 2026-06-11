// Application shell: tab navigation, scan lifecycle, and settings/first-run
// handling. Wraps the four views plus the settings panel.

import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { useI18n } from "./lib/i18n";
import { saveSettings, type Settings as TSettings } from "./lib/settings";
import {
  startScan,
  cancelScan,
  onScanProgress,
  onScanComplete,
  getSystemInfo,
  listDisks,
  type ScanProgress as TProgress,
  type SystemInfo,
  type TreeNode,
} from "./lib/api";
import { DisksOverview } from "./views/DisksOverview";
import { TreemapView } from "./views/TreemapView";
import { TopFiles } from "./views/TopFiles";
import { Cleanup } from "./views/Cleanup";
import { DuplicatesView } from "./views/DuplicatesView";
import { GuideView } from "./views/GuideView";
import { Settings } from "./views/Settings";
import { ScanProgress } from "./components/ScanProgress";
import { LanguageModal } from "./components/LanguageModal";

type View = "disks" | "treemap" | "topfiles" | "dup" | "cleanup" | "guide" | "settings";
type ScanStatus = "idle" | "scanning" | "done";

export function App({ settings: initialSettings }: { settings: TSettings }) {
  const { t, lang } = useI18n();
  const [settings, setSettings] = useState<TSettings>(initialSettings);
  const [view, setView] = useState<View>("disks");

  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState<TProgress>({ files: 0, bytes: 0, current: "" });
  const [scanRoot, setScanRoot] = useState<TreeNode | null>(null);
  const [lastPath, setLastPath] = useState<string>("");
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [freeBytes, setFreeBytes] = useState(0);
  const [diskUsed, setDiskUsed] = useState(0);

  const update = useCallback(async (partial: Partial<TSettings>) => {
    setSettings((s) => ({ ...s, ...partial }));
    await saveSettings(partial);
  }, []);

  // Detect the distribution once, for the guide and `~` rule expansion.
  useEffect(() => {
    getSystemInfo().then(setSystem).catch(() => setSystem(null));
  }, []);

  // Wire scan events once.
  useEffect(() => {
    let unsubP: (() => void) | undefined;
    let unsubC: (() => void) | undefined;
    onScanProgress(setProgress).then((u) => (unsubP = u));
    onScanComplete((c) => {
      setScanRoot(c.root);
      setStatus("done");
      setView("treemap");
    }).then((u) => (unsubC = u));
    return () => {
      unsubP?.();
      unsubC?.();
    };
  }, []);

  const beginScan = useCallback(
    (path: string) => {
      setLastPath(path);
      setProgress({ files: 0, bytes: 0, current: "" });
      setStatus("scanning");
      // Free space for the "show free" toggle: only meaningful when the
      // scanned path is a disk's mount point.
      listDisks()
        .then((disks) => {
          const d = disks.find((d) => d.mount_point === path);
          setFreeBytes(d?.available ?? 0);
          setDiskUsed(d?.used ?? 0);
        })
        .catch(() => {
          setFreeBytes(0);
          setDiskUsed(0);
        });
      startScan(path, settings.oneFilesystem);
    },
    [settings.oneFilesystem],
  );

  const scanReady = scanRoot !== null;

  const tabs: { id: View; label: string }[] = [
    { id: "disks", label: t("tab.disks") },
    { id: "treemap", label: t("tab.treemap") },
    { id: "topfiles", label: t("tab.topfiles") },
    { id: "dup", label: t("tab.dup") },
    { id: "cleanup", label: t("tab.cleanup") },
    { id: "guide", label: t("tab.guide") },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◧</span>
          <span className="brand-name">{t("app.title")}</span>
          <span className="brand-tag">{t("app.tagline")}</span>
        </div>
        <nav className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab ${view === tab.id ? "active" : ""}`}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <button
            className={`tab icon ${view === "settings" ? "active" : ""}`}
            onClick={() => setView("settings")}
            title={t("tab.settings")}
          >
            ⚙
          </button>
        </nav>
      </header>

      <main className="content">
        {view === "disks" && <DisksOverview onScan={beginScan} />}

        {view === "treemap" &&
          (scanReady ? (
            <TreemapView
              root={scanRoot!}
              deleteMode={settings.deleteMode}
              homeDir={system?.home}
              freeBytes={freeBytes}
              diskUsed={diskUsed}
              onRescan={() => beginScan(lastPath)}
            />
          ) : (
            <EmptyScan onGo={() => setView("disks")} />
          ))}

        {view === "topfiles" && <TopFiles scanReady={scanReady} />}

        {view === "dup" && (
          <DuplicatesView
            scanReady={scanReady}
            deleteMode={settings.deleteMode}
            homeDir={system?.home}
          />
        )}

        {view === "cleanup" && <Cleanup deleteMode={settings.deleteMode} />}

        {view === "guide" && <GuideView system={system} />}

        {view === "settings" && <Settings settings={settings} onChange={update} />}
      </main>

      {status === "scanning" && (
        <ScanProgress progress={progress} onCancel={() => cancelScan()} />
      )}

      {!settings.langChosen && (
        <LanguageModal onChoose={(l) => update({ lang: l, langChosen: true })} />
      )}

      {/* lang is read so the shell re-renders on language change */}
      <span hidden>{lang}</span>
    </div>
  );
}

function EmptyScan({ onGo }: { onGo: () => void }) {
  const { t } = useI18n();
  return (
    <div className="view">
      <div className="empty-state">
        {t("scan.empty")}
        <button className="btn primary" onClick={onGo}>
          {t("scan.gotodisks")}
        </button>
      </div>
    </div>
  );
}
