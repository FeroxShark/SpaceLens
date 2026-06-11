// Match a filesystem path against the known-directory knowledge base and
// always return a plain-language explanation: what it is, the risk of
// deleting it, and an optional tip. When no rule matches directly we fall
// back to ancestor inheritance, then name/extension heuristics, and finally
// an honest "we're not sure" — so the user is never left with a dead end.

import rules from "../data/linux-dirs.json";
import { categoryForName, type Category } from "./filetypes";

export type Safety = "safe" | "caution" | "danger" | "unknown";
export type Source = "known" | "inherited" | "heuristic" | "unknown";

/// A translator compatible with the i18n `t` helper.
export type Translate = (key: string, params?: Record<string, string | number>) => string;

interface Localized {
  what: string;
  risk: string;
  tip?: string;
}

export interface Rule {
  type: "exact" | "prefix" | "suffix" | "basename";
  value: string;
  safety: "safe" | "caution" | "danger";
  group: "system" | "home" | "dev" | "cache";
  en: Localized;
  es: Localized;
}

export interface Explanation {
  safety: Safety;
  what: string;
  risk: string;
  tip?: string;
  source: Source;
  /// A short note shown when the info isn't a direct match (inherited/guessed).
  sourceNote?: string;
}

const RAW_RULES = rules as Rule[];

export function allRules(): Rule[] {
  return RAW_RULES;
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) || "/" : trimmed;
}

function parent(path: string): string | null {
  const trimmed = path.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return null;
  const idx = trimmed.lastIndexOf("/");
  if (idx < 0) return null;
  return idx === 0 ? "/" : trimmed.slice(0, idx);
}

// Rules that reference the home folder (`~/...`) need the real home path to
// match. Expand them once per home directory and cache the result.
let expandCache: { home: string; rules: Rule[] } | null = null;

function expandedRules(homeDir?: string): Rule[] {
  const home = homeDir ?? "";
  if (!home) return RAW_RULES;
  if (expandCache && expandCache.home === home) return expandCache.rules;
  const out = RAW_RULES.map((r) =>
    r.value.startsWith("~/")
      ? { ...r, value: home.replace(/\/+$/, "") + r.value.slice(1) }
      : r,
  );
  expandCache = { home, rules: out };
  return out;
}

/// Find the most specific rule that matches `path` directly. Priority:
/// exact match, then suffix, then basename, then the longest matching prefix.
function findRule(path: string, ruleset: Rule[]): Rule | null {
  let exact: Rule | null = null;
  let suffix: Rule | null = null;
  let base: Rule | null = null;
  let prefix: Rule | null = null;

  const name = basename(path);

  for (const r of ruleset) {
    switch (r.type) {
      case "exact":
        if (path === r.value) exact = r;
        break;
      case "suffix":
        if (path.endsWith(r.value)) {
          if (!suffix || r.value.length > suffix.value.length) suffix = r;
        }
        break;
      case "basename":
        if (name === r.value) base = r;
        break;
      case "prefix":
        if (path === r.value || path.startsWith(r.value + "/")) {
          if (!prefix || r.value.length > prefix.value.length) prefix = r;
        }
        break;
    }
  }
  return exact ?? suffix ?? base ?? prefix;
}

function fromRule(rule: Rule, lang: "en" | "es"): Explanation {
  const loc = lang === "es" ? rule.es : rule.en;
  return {
    safety: rule.safety,
    what: loc.what,
    risk: loc.risk,
    tip: loc.tip,
    source: "known",
    sourceNote: undefined,
  };
}

// Names that strongly hint at regenerable scratch data.
function looksLikeCache(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("cache") ||
    n.includes("tmp") ||
    n === "temp" ||
    n === "logs" ||
    n === "log"
  );
}

/// Resolve a plain-language explanation for any path. Always returns a value.
/// `t` translates the generated fallback texts; `opts.homeDir` enables `~`
/// rules and `opts.isDir` refines the file-type heuristic.
export function explainPath(
  path: string,
  lang: "en" | "es",
  t: Translate,
  opts?: { isDir?: boolean; homeDir?: string },
): Explanation {
  if (!path) {
    return {
      safety: "unknown",
      what: t("explain.unknownWhat"),
      risk: t("explain.notSure"),
      source: "unknown",
    };
  }

  const ruleset = expandedRules(opts?.homeDir);
  const name = basename(path);

  // 1. Direct match (prefix rules also cover everything beneath them).
  const direct = findRule(path, ruleset);
  if (direct) return fromRule(direct, lang);

  // 2. Inherit from the nearest ancestor that has a rule (covers children of
  //    basename/exact/suffix rules like node_modules/, ~/.wine/, etc.).
  let p = parent(path);
  while (p) {
    const anc = findRule(p, ruleset);
    if (anc) {
      const loc = lang === "es" ? anc.es : anc.en;
      return {
        safety: anc.safety,
        what: t("heur.insideOf", { parent: basename(p), what: loc.what }),
        risk: t("heur.insideRisk"),
        tip: loc.tip,
        source: "inherited",
        sourceNote: t("explain.inheritedFrom", { path: p }),
      };
    }
    p = parent(p);
  }

  // 3. Heuristics from the name / extension.
  const isDir = opts?.isDir ?? false;

  if (looksLikeCache(name)) {
    return {
      safety: "caution",
      what: t("heur.cacheLike", { name }),
      risk: t("heur.cacheRisk"),
      source: "heuristic",
      sourceNote: t("explain.guessByName"),
    };
  }

  if (isDir && name.startsWith(".")) {
    return {
      safety: "caution",
      what: t("heur.appData", { name }),
      risk: t("heur.appDataRisk"),
      source: "heuristic",
      sourceNote: t("explain.guessByName"),
    };
  }

  if (!isDir) {
    const cat: Category = categoryForName(name);
    if (cat !== "other") {
      return {
        safety: "caution",
        what: t("heur.fileOfType", { type: t(`cat.${cat}`) }),
        risk: t("heur.fileRisk"),
        source: "heuristic",
        sourceNote: t("explain.guessByType"),
      };
    }
  }

  // 4. Honestly unknown.
  return {
    safety: "unknown",
    what: t("explain.unknownWhat"),
    risk: t("explain.notSure"),
    source: "unknown",
  };
}
