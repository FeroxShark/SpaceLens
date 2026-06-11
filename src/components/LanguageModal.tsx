// First-run language picker. English is preselected (the default).

import { useState } from "react";
import { useI18n, type Lang } from "../lib/i18n";

export function LanguageModal({ onChoose }: { onChoose: (l: Lang) => void }) {
  const { t, setLang } = useI18n();
  const [sel, setSel] = useState<Lang>("en");

  const pick = (l: Lang) => {
    setSel(l);
    setLang(l); // live preview of the choice
  };

  return (
    <div className="modal-overlay">
      <div className="modal lang-modal">
        <h2>{t("lang.title")}</h2>
        <p className="muted">{t("lang.subtitle")}</p>
        <div className="lang-options">
          <button
            className={`lang-option ${sel === "en" ? "selected" : ""}`}
            onClick={() => pick("en")}
          >
            <span className="flag">🇬🇧</span> English
          </button>
          <button
            className={`lang-option ${sel === "es" ? "selected" : ""}`}
            onClick={() => pick("es")}
          >
            <span className="flag">🇦🇷</span> Español
          </button>
        </div>
        <button className="btn primary wide" onClick={() => onChoose(sel)}>
          {t("lang.continue")}
        </button>
      </div>
    </div>
  );
}
