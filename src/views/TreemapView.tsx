// Interactive treemap: drill-down navigation, breadcrumb, hover tooltip,
// right-click actions, and two coloring modes.
//
// Hover performance: the full map is rendered once into an offscreen canvas;
// each mousemove only blits it and strokes the highlight (rAF-throttled), and
// the React tooltip re-renders only when the hovered node changes — its
// position follows the cursor imperatively.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  computeTreemap,
  drawTreemap,
  drawHighlight,
  hitTest,
  AGE_BUCKETS,
  type ColorMode,
  type LaidRect,
} from "../lib/treemap";
import { getTree, openInFileManager, type TreeNode } from "../lib/api";
import { CATEGORY_COLORS, ALL_CATEGORIES, type Category } from "../lib/filetypes";
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
  homeDir,
  freeBytes,
  diskUsed,
  onRescan,
}: {
  root: TreeNode;
  deleteMode: DeleteMode;
  homeDir?: string;
  freeBytes?: number;
  diskUsed?: number;
  onRescan: () => void;
}) {
  const { t, lang } = useI18n();
  const [stack, setStack] = useState<TreeNode[]>([root]);
  const [colorMode, setColorMode] = useState<ColorMode>("age");
  const [showFree, setShowFree] = useState(false);
  const [activeCats, setActiveCats] = useState<Set<Category> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoverNode, setHoverNode] = useState<LaidRect | null>(null);
  const [ctx, setCtx] = useState<{
    x: number;
    y: number;
    target: ContextTarget;
    node: TreeNode;
    ancestors: TreeNode[];
  } | null>(null);
  const [delTarget, setDelTarget] = useState<DeleteTarget | null>(null);
  const [explain, setExplain] = useState<{ path: string; name: string; isDir: boolean } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const rectsRef = useRef<LaidRect[]>([]);
  const hoverRef = useRef<LaidRect | null>(null);
  const lastPosRef = useRef({ x: 0, y: 0, cx: 0, cy: 0 });
  const rafRef = useRef(0);

  const current = stack[stack.length - 1];

  // At the scan root, optionally append synthetic blocks for the disk's free
  // space and for used space the scan couldn't see (denied dirs, other btrfs
  // subvolumes / filesystems) — otherwise the free block looks way out of
  // proportion against a partial scan.
  const displayRoot = useMemo<TreeNode>(() => {
    if (!showFree || !freeBytes || freeBytes <= 0 || stack.length > 1) return current;
    const synth: TreeNode[] = [];
    const unscanned = Math.max(0, (diskUsed ?? 0) - current.size);
    // Only show the unscanned block when it's a meaningful share of the disk.
    if (diskUsed && unscanned > (current.size + freeBytes) * 0.01) {
      synth.push({
        id: -3,
        name: t("tree.unscanned"),
        path: "",
        size: unscanned,
        is_dir: false,
        denied: false,
        mtime: 0,
        children: [],
        is_unscanned: true,
      });
    }
    synth.push({
      id: -2,
      name: t("tree.free"),
      path: "",
      size: freeBytes,
      is_dir: false,
      denied: false,
      mtime: 0,
      children: [],
      is_free: true,
    });
    const extra = synth.reduce((s, n) => s + n.size, 0);
    return { ...current, size: current.size + extra, children: [...current.children, ...synth] };
  }, [current, showFree, freeBytes, diskUsed, stack.length, t]);

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

  // Copy the pre-rendered base map to the visible canvas, plus the highlight.
  const blit = useCallback((highlight: LaidRect | null) => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const c = canvas.getContext("2d");
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(base, 0, 0);
    if (highlight) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawHighlight(c, highlight);
    }
  }, []);

  // Recompute layout and re-render the base map on node / size / color change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;

    if (!baseRef.current) baseRef.current = document.createElement("canvas");
    const base = baseRef.current;
    base.width = size.w * dpr;
    base.height = size.h * dpr;
    const bc = base.getContext("2d");
    if (!bc) return;
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);

    rectsRef.current = computeTreemap(displayRoot, size.w, size.h);
    drawTreemap(bc, rectsRef.current, colorMode, {
      activeCats: colorMode === "type" ? activeCats : null,
    });

    hoverRef.current = null;
    setHoverNode(null);
    blit(null);
  }, [displayRoot, size, colorMode, activeCats, blit]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const drillInto = useCallback(async (node: TreeNode) => {
    if (!node.is_dir || node.is_other || node.id < 0) return;
    const sub = await getTree(node.id, DEPTH, MIN_FRACTION);
    if (sub) setStack((s) => [...s, sub]);
  }, []);

  const toCss = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const positionTip = (x: number, y: number) => {
    const el = tipRef.current;
    if (!el) return;
    el.style.left = `${Math.min(x + 14, window.innerWidth - 280)}px`;
    el.style.top = `${Math.min(y + 14, window.innerHeight - 120)}px`;
  };

  // Place the tooltip as soon as it mounts for a newly hovered node.
  useLayoutEffect(() => {
    if (hoverNode) positionTip(lastPosRef.current.x, lastPosRef.current.y);
  }, [hoverNode]);

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    lastPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      cx: e.clientX - rect.left,
      cy: e.clientY - rect.top,
    };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const { x, y, cx, cy } = lastPosRef.current;
      const hit = hitTest(rectsRef.current, cx, cy);
      const valid = hit && !hit.node.is_other ? hit : null;
      positionTip(x, y);
      if ((valid?.node.path ?? null) !== (hoverRef.current?.node.path ?? null)) {
        hoverRef.current = valid;
        setHoverNode(valid);
        blit(valid);
      }
    });
  };

  const onLeave = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (hoverRef.current) {
      hoverRef.current = null;
      setHoverNode(null);
      blit(null);
    }
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
      // Every rect containing the point, shallow → deep, is the ancestor
      // chain of the clicked cell. Offering them in the menu beats trying to
      // aim at a container's thin border.
      const ancestors = rectsRef.current
        .filter(
          (r) =>
            r.depth > 0 &&
            r !== hit &&
            r.node.is_dir &&
            !r.node.is_other &&
            r.node.id >= 0 &&
            x >= r.x0 &&
            x <= r.x1 &&
            y >= r.y0 &&
            y <= r.y1,
        )
        .sort((a, b) => a.depth - b.depth)
        .map((r) => r.node);
      setCtx({
        x: e.clientX,
        y: e.clientY,
        target: { path: hit.node.path, name: hit.node.name, is_dir: hit.node.is_dir, size: hit.node.size },
        node: hit.node,
        ancestors,
      });
    }
  };

  const hoverExplain = useMemo(
    () =>
      hoverNode && hoverNode.node.path && !hoverNode.node.is_free && !hoverNode.node.is_unscanned
        ? explainPath(hoverNode.node.path, lang, t, {
            isDir: hoverNode.node.is_dir,
            homeDir,
          })
        : null,
    [hoverNode, lang, t, homeDir],
  );

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
              className={colorMode === "age" ? "active" : ""}
              onClick={() => setColorMode("age")}
            >
              {t("tree.color.age")}
            </button>
            <button
              className={colorMode === "type" ? "active" : ""}
              onClick={() => setColorMode("type")}
            >
              {t("tree.color.type")}
            </button>
          </div>
          {stack.length === 1 && !!freeBytes && (
            <button
              className={`btn small ghost toggle ${showFree ? "on" : ""}`}
              onClick={() => setShowFree((v) => !v)}
            >
              {showFree ? "☑" : "☐"} {t("tree.free")}
            </button>
          )}
          <button className="btn small ghost" onClick={onRescan}>
            ⟳ {t("tree.rescan")}
          </button>
        </div>
      </div>

      {colorMode === "type" && (
        <div className="legend">
          {ALL_CATEGORIES.map((cat) => {
            const inactive = activeCats !== null && !activeCats.has(cat);
            return (
              <button
                className={`legend-item clickable ${inactive ? "inactive" : ""}`}
                key={cat}
                title={t("tree.legendFilter")}
                onClick={() =>
                  setActiveCats((prev) => {
                    const next = new Set(prev ?? ALL_CATEGORIES);
                    if (next.has(cat)) next.delete(cat);
                    else next.add(cat);
                    // Everything off makes no sense — reset to all on.
                    if (next.size === 0 || next.size === ALL_CATEGORIES.length) return null;
                    return next;
                  })
                }
              >
                <span className="legend-swatch" style={{ background: CATEGORY_COLORS[cat] }} />
                {cat}
              </button>
            );
          })}
          {activeCats !== null && (
            <button className="legend-item clickable reset" onClick={() => setActiveCats(null)}>
              ✕ {t("tree.legendReset")}
            </button>
          )}
        </div>
      )}

      {colorMode === "age" && (
        <div className="legend">
          {AGE_BUCKETS.map((b) => (
            <span className="legend-item" key={b.key}>
              <span className="legend-swatch" style={{ background: b.color }} />
              {t(`age.${b.key}`)}
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
        {hoverNode && (
          <div className="tooltip" ref={tipRef}>
            <div className="tt-name">{hoverNode.node.name}</div>
            <div className="tt-size">
              {formatBytes(hoverNode.node.size)} · {percent(hoverNode.node.size, displayRoot.size)} {t("tree.ofparent")}
            </div>
            {hoverExplain && (
              <div className={`tt-explain safety-${hoverExplain.safety}`}>{hoverExplain.what}</div>
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
          ancestors={ctx.ancestors.map((n) => ({
            name: `${n.name} · ${formatBytes(n.size)}`,
            size: n.size,
            onZoom: () => drillInto(n),
          }))}
          onZoom={() => drillInto(ctx.node)}
          onOpen={() => openInFileManager(ctx.target.path)}
          onCopy={() => navigator.clipboard.writeText(ctx.target.path)}
          onDelete={() =>
            setDelTarget({
              path: ctx.target.path,
              name: ctx.target.name,
              size: ctx.target.size,
              isDir: ctx.node.is_dir,
            })
          }
          onExplain={() =>
            setExplain({ path: ctx.target.path, name: ctx.target.name, isDir: ctx.node.is_dir })
          }
          onClose={() => setCtx(null)}
        />
      )}

      {delTarget && (
        <ConfirmDeleteDialog
          target={delTarget}
          mode={deleteMode}
          homeDir={homeDir}
          onClose={() => setDelTarget(null)}
          onDeleted={() => {
            setDelTarget(null);
            onRescan();
          }}
        />
      )}

      {explain && (
        <ExplainDialog
          path={explain.path}
          name={explain.name}
          isDir={explain.isDir}
          homeDir={homeDir}
          onClose={() => setExplain(null)}
        />
      )}
    </div>
  );
}
