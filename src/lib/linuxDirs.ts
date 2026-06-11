// Match a filesystem path against the known-directory knowledge base and
// return a plain-language explanation plus a safety level.

import rules from "../data/linux-dirs.json";

export type Safety = "safe" | "caution" | "danger";

interface Rule {
  type: "exact" | "prefix" | "suffix" | "basename";
  value: string;
  safety: Safety;
  en: string;
  es: string;
}

export interface Explanation {
  safety: Safety;
  text: string;
}

const RULES = rules as Rule[];

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

/// Find the most specific matching rule for `path`. Priority: exact match,
/// then suffix, then basename, then the longest matching prefix.
export function explainPath(
  path: string,
  lang: "en" | "es",
): Explanation | null {
  if (!path) return null;

  let exact: Rule | null = null;
  let suffix: Rule | null = null;
  let base: Rule | null = null;
  let prefix: Rule | null = null;

  const name = basename(path);

  for (const r of RULES) {
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

  const chosen = exact ?? suffix ?? base ?? prefix;
  if (!chosen) return null;
  return { safety: chosen.safety, text: lang === "es" ? chosen.es : chosen.en };
}
