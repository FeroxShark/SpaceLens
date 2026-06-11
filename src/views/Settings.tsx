// User preferences: language, delete behavior, scan scope.

import { useI18n, type Lang } from "../lib/i18n";
import type { DeleteMode, Settings as S } from "../lib/settings";

export function Settings({
  settings,
  onChange,
}: {
  settings: S;
  onChange: (partial: Partial<S>) => void;
}) {
  const { t, setLang } = useI18n();

  const changeLang = (l: Lang) => {
    setLang(l);
    onChange({ lang: l });
  };

  return (
    <div className="view settings-view">
      <div className="view-head">
        <h1>{t("settings.heading")}</h1>
      </div>

      <section className="settings-group">
        <h3>{t("settings.language")}</h3>
        <div className="seg wide">
          <button className={settings.lang === "en" ? "active" : ""} onClick={() => changeLang("en")}>
            🇬🇧 English
          </button>
          <button className={settings.lang === "es" ? "active" : ""} onClick={() => changeLang("es")}>
            🇦🇷 Español
          </button>
        </div>
      </section>

      <section className="settings-group">
        <h3>{t("settings.deleteMode")}</h3>
        {(["trash", "permanent"] as DeleteMode[]).map((m) => (
          <label className="radio-row" key={m}>
            <input
              type="radio"
              name="deleteMode"
              checked={settings.deleteMode === m}
              onChange={() => onChange({ deleteMode: m })}
            />
            <span className={m === "permanent" ? "warn-text" : ""}>
              {t(`settings.deleteMode.${m}`)}
            </span>
          </label>
        ))}
      </section>

      <section className="settings-group">
        <h3>{t("settings.oneFs")}</h3>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.oneFilesystem}
            onChange={(e) => onChange({ oneFilesystem: e.target.checked })}
          />
          <span className="muted">{t("settings.oneFs.desc")}</span>
        </label>
      </section>

      <section className="settings-group">
        <h3>{t("settings.about")}</h3>
        <p className="muted">{t("settings.aboutText")}</p>
      </section>
    </div>
  );
}
