// Interactive treemap: drill-down navigation, breadcrumb, hover tooltip,
// right-click actions, and two coloring modes.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeTreemap,
  drawTreemap,
  hitTest,
  type ColorMode,
  type LaidRect,
} from "../lib/treemap";
import { getTree, openInFileManager, type TreeNode } from "../lib/api";
import { CATEGORY_COLORS, ALL_CATEGORIES } from "../lib/filetypes";
import { formatBytes, percent } from "../lib/format";
import { explainPath } from "../lib/linuxDirs";
import { useI18n } from "../lib/i18n";
import { ContextMenu, type ContextTarget } from "../components/ContextMenu";
import { ConfirmDeleteDialog, ExplainDialog, type DeleteTarget } from "../components/Dialogs";
import type { DeleteMode } from "../lib/settings";

const DEPTH = 3;
const MIN_FRACTION = 0.001;

function basename(path: string): string {
  const p = path.replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) || "/" : p;
}

export function TreemapView({
  root,
  deleteMode,
  onRescan,
}: {
  root: TreeNode;
  deleteMode: DeleteMode;
  onRescan: () => void;
}) {
  const { t, lang } = useI18n();
  const [stack, setStack] = useState<TreeNode[]>([root]);
  const [colorMode, setColorMode] = useState<ColorMode>("depth");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ rect: LaidRect; x: number; y: number } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; target: ContextTarget; node: TreeNode } | null>(null);
  const [delTarget, setDelTarget] = useState<DeleteTarget | null>(null);
  const [explain, setExplain] = useState<{ path: string; name: string } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rectsRef = useRef<LaidRect[]>([]);

  const current = stack[stack.length - 1];

  // Reset navigation when a new scan root arrives.
  useEffect(() => {
    setStack([root]);
  }, [root]);

  // Track container size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const redraw = useCallback(
    (highlight: string | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const c = canvas.getContext("2d");
      if (!c) return;
      drawTreemap(c, rectsRef.current, colorMode, highlight);
    },
    [colorMode],
  );

  // Recompute layout on node / size / color change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const c = canvas.getContext("2d");
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    rectsRef.current = computeTreemap(current, size.w, size.h);
    redraw(hover?.rect.node.path ?? null);
  }, [current, size, colorMode, redraw]); // eslint-disable-line react-hooks/exhaustive-deps

  const drillInto = useCallback(async (node: TreeNode) => {
    if (!node.is_dir || node.is_other || node.id < 0) return;
    const sub = await getTree(node.id, DEPTH, MIN_FRACTION);
    if (sub) setStack((s) => [...s, sub]);
  }, []);

  const toCss = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMove = (e: React.MouseEvent) => {
    const { x, y } = toCss(e);
    const hit = hitTest(rectsRef.current, x, y);
    if (hit && !hit.node.is_other) {
      const prev = hover?.rect.node.path;
      setHover({ rect: hit, x: e.clientX, y: e.clientY });
      if (prev !== hit.node.path) redraw(hit.node.path);
    } else {
      if (hover) {
        setHover(null);
        redraw(null);
      }
    }
  };

  const onLeave = () => {
    setHover(null);
    redraw(null);
  };

  const onClick = (e: React.MouseEvent) => {
    const { x, y } = toCss(e);
    const hit = hitTest(rectsRef.current, x, y);
    if (hit) drillInto(hit.node);
  };

  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = toCss(e);
    const hit = hitTest(rectsRef.current, x, y);
    if (hit && !hit.node.is_other && hit.node.path) {
      setCtx({
        x: e.clientX,
        y: e.clientY,
        target: { path: hit.node.path, name: hit.node.name, is_dir: hit.node.is_dir, size: hit.node.size },
        node: hit.node,
      });
    }
  };

  const hoverExplain = hover ? explainPath(hover.rect.node.path, lang) : null;

  return (
    <div className="view treemap-view">
      <div className="treemap-toolbar">
        <div className="breadcrumb">
          {stack.length > 1 && (
            <button className="btn small ghost" onClick={() => setStack((s) => s.slice(0, -1))}>
              ← {t("tree.back")}
            </button>
          )}
          {stack.map((n, i) => (
            <span key={i} className="crumb">
              {i > 0 && <span className="crumb-sep">/</span>}
              <button
                className="crumb-btn"
                disabled={i === stack.length - 1}
                onClick={() => setStack((s) => s.slice(0, i + 1))}
              >
                {i === 0 ? n.path : basename(n.path)}
              </button>
            </span>
          ))}
        </div>
        <div className="toolbar-right">
          <div className="seg">
            <button
              className={colorMode === "depth" ? "active" : ""}
              onClick={() => setColorMode("depth")}
            >
              {t("tree.color.depth")}
            </button>
            <button
              className={colorMode === "type" ? "active" : ""}
              onClick={() => setColorMode("type")}
            >
              {t("tree.color.type")}
            </button>
          </div>
          <button className="btn small ghost" onClick={onRescan}>
            ⟳ {t("tree.rescan")}
          </button>
        </div>
      </div>

      {colorMode === "type" && (
        <div className="legend">
          {ALL_CATEGORIES.map((cat) => (
            <span className="legend-item" key={cat}>
              <span className="legend-swatch" style={{ background: CATEGORY_COLORS[cat] }} />
              {cat}
            </span>
          ))}
        </div>
      )}

      <div className="treemap-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={onClick}
          onContextMenu={onContext}
        />
        {hover && (
          <div
            className="tooltip"
            style={{
              left: Math.min(hover.x + 14, window.innerWidth - 280),
              top: Math.min(hover.y + 14, window.innerHeight - 120),
            }}
          >
            <div className="tt-name">{hover.rect.node.name}</div>
            <div className="tt-size">
              {formatBytes(hover.rect.node.size)} · {percent(hover.rect.node.size, current.size)} {t("tree.ofparent")}
            </div>
            {hoverExplain && (
              <div className={`tt-explain safety-${hoverExplain.safety}`}>{hoverExplain.text}</div>
            )}
          </div>
        )}
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          target={ctx.target}
          canZoom={ctx.node.is_dir}
          onZoom={() => drillInto(ctx.node)}
          onOpen={() => openInFileManager(ctx.target.path)}
          onCopy={() => navigator.clipboard.writeText(ctx.target.path)}
          onDelete={() =>
            setDelTarget({ path: ctx.target.path, name: ctx.target.name, size: ctx.target.size })
          }
          onExplain={() => setExplain({ path: ctx.target.path, name: ctx.target.name })}
          onClose={() => setCtx(null)}
        />
      )}

      {delTarget && (
        <ConfirmDeleteDialog
          target={delTarget}
          mode={deleteMode}
          onClose={() => setDelTarget(null)}
          onDeleted={() => {
            setDelTarget(null);
            onRescan();
          }}
        />
      )}

      {explain && (
        <ExplainDialog path={explain.path} name={explain.name} onClose={() => setExplain(null)} />
      )}
    </div>
  );
}
