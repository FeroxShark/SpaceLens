// Right-click menu for a treemap cell. Positioned at the cursor; the parent
// renders a transparent backdrop that closes it on outside click.

import { useI18n } from "../lib/i18n";

export interface ContextTarget {
  path: string;
  name: string;
  is_dir: boolean;
  size: number;
}

/// An ancestor folder of the clicked cell, offered for direct zoom — much
/// easier than aiming at a container's thin border.
export interface AncestorItem {
  name: string;
  size: number;
  onZoom: () => void;
}

export function ContextMenu({
  x,
  y,
  target,
  canZoom,
  ancestors = [],
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
  ancestors?: AncestorItem[];
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
        {ancestors.length > 0 && (
          <>
            <div className="ctx-sep" />
            <div className="ctx-label">{t("ctx.ancestors")}</div>
            {ancestors.map((a, i) => (
              <button
                key={i}
                className="ctx-item ancestor"
                style={{ paddingLeft: 8 + i * 12 }}
                onClick={() => {
                  a.onZoom();
                  onClose();
                }}
              >
                📁 {a.name}
              </button>
            ))}
            <div className="ctx-sep" />
          </>
        )}
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
