// A static, searchable reference of what the folders on a Linux system are
// for and how risky each is to delete — rendered from the same knowledge
// base the treemap uses. Aimed at newcomers exploring `/` for the first time.

import { useMemo, useState } from "react";
import { allRules, type Rule, type Safety } from "../lib/linuxDirs";
import { useI18n } from "../lib/i18n";
import { SafetyBadge } from "../components/SafetyBadge";
import type { SystemInfo } from "../lib/api";

const GROUP_ORDER: Rule["group"][] = ["system", "home", "dev", "cache"];
const LEGEND: Safety[] = ["safe", "caution", "danger", "unknown"];

export function GuideView({ system }: { system: SystemInfo | null }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");

  const rules = allRules();
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return rules;
    return rules.filter((r) => {
      const loc = lang === "es" ? r.es : r.en;
      return (
        r.value.toLowerCase().includes(q) ||
        loc.what.toLowerCase().includes(q) ||
        loc.risk.toLowerCase().includes(q)
      );
    });
  }, [rules, q, lang]);

  const managers = system?.package_managers ?? [];

  return (
    <div className="view guide-view">
      <div className="view-head">
        <h1>{t("guide.heading")}</h1>
      </div>
      <p className="muted intro">{t("guide.intro")}</p>

      <div className="guide-system">
        <div className="gs-item">
          <span className="gs-label">{t("guide.yourSystem")}</span>
          {system?.distro_name || t("guide.unknownDistro")}
        </div>
        <div className="gs-item">
          <span className="gs-label">{t("guide.manager")}</span>
          {managers.length > 0 ? managers.join(", ") : "—"}
        </div>
      </div>

      <div className="guide-legend">
        {LEGEND.map((s) => (
          <div className="leg-row" key={s}>
            <SafetyBadge safety={s} />
            <span>{t(`legend.${s}`)}</span>
          </div>
        ))}
      </div>

      <input
        className="guide-search"
        placeholder={t("guide.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        spellCheck={false}
      />

      {filtered.length === 0 ? (
        <div className="empty-state">{t("guide.noResults")}</div>
      ) : (
        GROUP_ORDER.map((group) => {
          const entries = filtered.filter((r) => r.group === group);
          if (entries.length === 0) return null;
          return (
            <section className="guide-group" key={group}>
              <h2>{t(`guide.group.${group}`)}</h2>
              {entries.map((r) => {
                const loc = lang === "es" ? r.es : r.en;
                return (
                  <div className={`guide-entry safety-${r.safety}`} key={r.type + r.value}>
                    <div className="guide-entry-head">
                      <span className="guide-path">{r.value}</span>
                      <SafetyBadge safety={r.safety} />
                    </div>
                    <p className="guide-what">{loc.what}</p>
                    <p className="guide-risk">
                      <b>{t("explain.risk")}:</b> {loc.risk}
                    </p>
                    {loc.tip && <p className="guide-tip">{loc.tip}</p>}
                  </div>
                );
              })}
            </section>
          );
        })
      )}
    </div>
  );
}
