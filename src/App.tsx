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
  type ScanProgress as TProgress,
  type TreeNode,
} from "./lib/api";
import { DisksOverview } from "./views/DisksOverview";
import { TreemapView } from "./views/TreemapView";
import { TopFiles } from "./views/TopFiles";
import { Cleanup } from "./views/Cleanup";
import { Settings } from "./views/Settings";
import { ScanProgress } from "./components/ScanProgress";
import { LanguageModal } from "./components/LanguageModal";

type View = "disks" | "treemap" | "topfiles" | "cleanup" | "settings";
type ScanStatus = "idle" | "scanning" | "done";

export function App({ settings: initialSettings }: { settings: TSettings }) {
  const { t, lang } = useI18n();
  const [settings, setSettings] = useState<TSettings>(initialSettings);
  const [view, setView] = useState<View>("disks");

  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState<TProgress>({ files: 0, bytes: 0, current: "" });
  const [scanRoot, setScanRoot] = useState<TreeNode | null>(null);
  const [lastPath, setLastPath] = useState<string>("");

  const update = useCallback(async (partial: Partial<TSettings>) => {
    setSettings((s) => ({ ...s, ...partial }));
    await saveSettings(partial);
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
      startScan(path, settings.oneFilesystem);
    },
    [settings.oneFilesystem],
  );

  const scanReady = scanRoot !== null;

  const tabs: { id: View; label: string }[] = [
    { id: "disks", label: t("tab.disks") },
    { id: "treemap", label: t("tab.treemap") },
    { id: "topfiles", label: t("tab.topfiles") },
    { id: "cleanup", label: t("tab.cleanup") },
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
              onRescan={() => beginScan(lastPath)}
            />
          ) : (
            <EmptyScan onGo={() => setView("disks")} />
          ))}

        {view === "topfiles" && <TopFiles scanReady={scanReady} />}

        {view === "cleanup" && <Cleanup deleteMode={settings.deleteMode} />}

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
