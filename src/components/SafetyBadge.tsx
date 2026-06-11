import type { Safety } from "../lib/linuxDirs";
import { useI18n } from "../lib/i18n";

const ICON: Record<Safety, string> = {
  safe: "🟢",
  caution: "🟡",
  danger: "🔴",
};

export function SafetyBadge({ safety }: { safety: Safety }) {
  const { t } = useI18n();
  return (
    <span className={`safety-badge safety-${safety}`}>
      {ICON[safety]} {t(`explain.${safety}`)}
    </span>
  );
}
