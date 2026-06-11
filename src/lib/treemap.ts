// Squarified treemap layout (via d3-hierarchy) plus a canvas renderer that
// gives the classic nested look: parent containers with header labels and
// colored leaf cells.

import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from "d3-hierarchy";
import type { TreeNode } from "./api";
import { categoryForName, CATEGORY_COLORS, type Category } from "./filetypes";
import { formatBytes } from "./format";

export interface LaidRect {
  node: TreeNode;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  depth: number;
}

const HEADER = 19;

/// Compute treemap rectangles for `root` within `w`x`h`. Leaf value is the
/// node's own size; parents are summed from their leaves so the layout stays
/// area-accurate.
export function computeTreemap(root: TreeNode, w: number, h: number): LaidRect[] {
  if (w <= 0 || h <= 0) return [];
  const h0 = hierarchy(root, (d) => d.children)
    .sum((d) => (!d.children || d.children.length === 0 ? d.size : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  // Generous padding so parent containers keep a visible, hoverable border
  // strip around their children (the padding area hit-tests as the parent).
  treemap<TreeNode>()
    .tile(treemapSquarify)
    .size([w, h])
    .paddingInner(3)
    .paddingTop((d) => (d.children && d.depth > 0 ? HEADER : 0))
    .paddingOuter(4)
    .round(true)(h0);

  return (h0.descendants() as HierarchyRectangularNode<TreeNode>[]).map((d) => ({
    node: d.data,
    x0: d.x0,
    y0: d.y0,
    x1: d.x1,
    y1: d.y1,
    depth: d.depth,
  }));
}

export type ColorMode = "age" | "type";

const DEPTH_PALETTE = [
  "#3a2d5c",
  "#4a3a73",
  "#5b4a8a",
  "#6d5aa3",
  "#7f6bbd",
  "#917cd6",
];

const FREE_COLOR = "#1f5c40";
const UNSCANNED_COLOR = "#46414f";
const DIM_COLOR = "#262230";
const UNKNOWN_AGE_COLOR = "#5a6270";

const DAY = 86400;

/// Age buckets (newest → oldest), with the i18n key suffix and the color used
/// in the map and the legend. Old data glows warm so reclaim candidates pop.
export const AGE_BUCKETS: { key: string; color: string; maxAgeDays: number }[] = [
  { key: "w", color: "#4ea3f2", maxAgeDays: 7 },
  { key: "m", color: "#4cc4b0", maxAgeDays: 30 },
  { key: "hy", color: "#7bc96f", maxAgeDays: 182 },
  { key: "y", color: "#f2c14e", maxAgeDays: 365 },
  { key: "y2", color: "#f2a65a", maxAgeDays: 730 },
  { key: "old", color: "#e85d75", maxAgeDays: Infinity },
];

function ageColor(mtime: number, now: number): string {
  if (!mtime || mtime <= 0) return UNKNOWN_AGE_COLOR;
  const days = Math.max(0, (now - mtime) / DAY);
  for (const b of AGE_BUCKETS) {
    if (days < b.maxAgeDays) return b.color;
  }
  return AGE_BUCKETS[AGE_BUCKETS.length - 1].color;
}

export interface DrawOpts {
  /// In "type" mode, categories to show in full color; others are dimmed.
  /// Null/undefined = all active.
  activeCats?: Set<Category> | null;
  /// Unix seconds for age bucketing (defaults to Date.now()/1000).
  now?: number;
}

function rectColor(r: LaidRect, mode: ColorMode, opts: DrawOpts): string {
  if (r.node.is_free) return FREE_COLOR;
  if (r.node.is_unscanned) return UNSCANNED_COLOR;
  if (r.node.is_other) return "#3a3f4b";
  const isLeaf = !r.node.children || r.node.children.length === 0;
  if (isLeaf && !r.node.is_dir) {
    if (mode === "type") {
      const cat = categoryForName(r.node.name);
      if (opts.activeCats && !opts.activeCats.has(cat)) return DIM_COLOR;
      return CATEGORY_COLORS[cat];
    }
    return ageColor(r.node.mtime, opts.now ?? Date.now() / 1000);
  }
  return DEPTH_PALETTE[Math.min(r.depth, DEPTH_PALETTE.length - 1)];
}

/// Draw the laid-out rectangles (the static base map). Hover highlights are
/// overlaid separately via drawHighlight so mousemove never repaints this.
export function drawTreemap(
  ctx: CanvasRenderingContext2D,
  rects: LaidRect[],
  mode: ColorMode,
  opts: DrawOpts = {},
) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.restore();

  for (const r of rects) {
    if (r.depth === 0) continue; // skip the outermost container fill
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    if (w < 1 || h < 1) continue;

    const isLeaf = !r.node.children || r.node.children.length === 0;
    ctx.fillStyle = rectColor(r, mode, opts);
    ctx.fillRect(r.x0, r.y0, w, h);

    // Container border + header label for directories with children. Shallow
    // (parent) containers get a thicker, brighter border so their hoverable
    // edge is easy to spot and aim at.
    if (!isLeaf) {
      if (r.depth === 1) {
        ctx.strokeStyle = "rgba(176,108,255,0.55)";
        ctx.lineWidth = 2.5;
      } else if (r.depth === 2) {
        ctx.strokeStyle = "rgba(176,108,255,0.3)";
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
      }
      ctx.strokeRect(r.x0 + 0.5, r.y0 + 0.5, w - 1, h - 1);
      if (h > HEADER && w > 30) {
        // Darker strip behind the header text for legibility.
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(r.x0 + 1, r.y0 + 1, w - 2, HEADER - 2);
        ctx.font = "11px system-ui, sans-serif";
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x0 + 3, r.y0, w - 6, HEADER);
        ctx.clip();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillText(r.node.name, r.x0 + 5, r.y0 + 13);
        // Right-aligned size in the header when there's room for both.
        const sizeText = formatBytes(r.node.size);
        const sw = ctx.measureText(sizeText).width;
        const nw = ctx.measureText(r.node.name).width;
        if (nw + sw + 18 < w - 10) {
          ctx.fillStyle = "rgba(255,255,255,0.65)";
          ctx.fillText(sizeText, r.x1 - sw - 6, r.y0 + 13);
        }
        ctx.restore();
      }
    } else if (w > 40 && h > 16) {
      // Leaf labels: name, plus the size on a second line when it fits.
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x0 + 2, r.y0, w - 4, h);
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText(r.node.name, r.x0 + 4, r.y0 + 12);
      if (h > 28) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText(formatBytes(r.node.size), r.x0 + 4, r.y0 + 24);
      }
      ctx.restore();
    }
  }
}

/// Draw just the hover outline for one rect, on top of an already-drawn map.
export function drawHighlight(ctx: CanvasRenderingContext2D, r: LaidRect) {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  if (w < 1 || h < 1) return;
  ctx.fillStyle = "rgba(212,179,255,0.12)";
  ctx.fillRect(r.x0, r.y0, w, h);
  ctx.strokeStyle = "#d4b3ff";
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x0 + 1, r.y0 + 1, w - 2, h - 2);
}

/// Topmost (deepest) rect under a point, for hit testing.
export function hitTest(rects: LaidRect[], x: number, y: number): LaidRect | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (r.depth === 0) continue;
    if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
  }
  return null;
}
