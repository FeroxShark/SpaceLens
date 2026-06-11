import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./lib/i18n";
import { loadSettings, saveSettings, type Settings } from "./lib/settings";
import "./index.css";

// Bootstrap: load persisted settings before mounting the app so language and
// preferences are available on first paint.
function Bootstrap() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  return (
    <I18nProvider
      initialLang={settings.lang}
      onLangChange={(l) => saveSettings({ lang: l })}
    >
      <App settings={settings} />
    </I18nProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>,
);
