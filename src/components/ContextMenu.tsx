// Right-click menu for a treemap cell. Positioned at the cursor; the parent
// renders a transparent backdrop that closes it on outside click.

import { useI18n } from "../lib/i18n";

export interface ContextTarget {
  path: string;
  name: string;
  is_dir: boolean;
  size: number;
}

export function ContextMenu({
  x,
  y,
  target,
  canZoom,
  onZoom,
  onOpen,
  onCopy,
  onDelete,
  onExplain,
  onClose,
}: {
  x: number;
  y: number;
  target: ContextTarget;
  canZoom: boolean;
  onZoom: () => void;
  onOpen: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onExplain: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const item = (label: string, fn: () => void) => (
    <button
      className="ctx-item"
      onClick={() => {
        fn();
        onClose();
      }}
    >
      {label}
    </button>
  );

  // Keep the menu on-screen.
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 200),
  };

  return (
    <>
      <div className="ctx-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="ctx-menu" style={style}>
        <div className="ctx-title" title={target.path}>{target.name}</div>
        {canZoom && target.is_dir && item(t("ctx.zoom"), onZoom)}
        {item(t("ctx.explain"), onExplain)}
        {item(t("ctx.open"), onOpen)}
        {item(t("ctx.copy"), onCopy)}
        <div className="ctx-sep" />
        <button className="ctx-item danger" onClick={() => { onDelete(); onClose(); }}>
          {t("ctx.delete")}
        </button>
      </div>
    </>
  );
}
