// Squarified treemap layout (via d3-hierarchy) plus a canvas renderer that
// gives the classic nested look: parent containers with header labels and
// colored leaf cells.

import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from "d3-hierarchy";
import type { TreeNode } from "./api";
import { colorForName } from "./filetypes";

export interface LaidRect {
  node: TreeNode;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  depth: number;
}

const HEADER = 16;

/// Compute treemap rectangles for `root` within `w`x`h`. Leaf value is the
/// node's own size; parents are summed from their leaves so the layout stays
/// area-accurate.
export function computeTreemap(root: TreeNode, w: number, h: number): LaidRect[] {
  if (w <= 0 || h <= 0) return [];
  const h0 = hierarchy(root, (d) => d.children)
    .sum((d) => (!d.children || d.children.length === 0 ? d.size : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  treemap<TreeNode>()
    .tile(treemapSquarify)
    .size([w, h])
    .paddingInner(2)
    .paddingTop((d) => (d.children && d.depth > 0 ? HEADER : 0))
    .paddingOuter(2)
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

export type ColorMode = "depth" | "type";

const DEPTH_PALETTE = [
  "#3a2d5c",
  "#4a3a73",
  "#5b4a8a",
  "#6d5aa3",
  "#7f6bbd",
  "#917cd6",
];

function rectColor(r: LaidRect, mode: ColorMode): string {
  const isLeaf = !r.node.children || r.node.children.length === 0;
  if (mode === "type" && isLeaf && !r.node.is_dir) {
    return colorForName(r.node.name);
  }
  if (r.node.is_other) return "#3a3f4b";
  return DEPTH_PALETTE[Math.min(r.depth, DEPTH_PALETTE.length - 1)];
}

/// Draw the laid-out rectangles. `highlight` is the path of the hovered node.
export function drawTreemap(
  ctx: CanvasRenderingContext2D,
  rects: LaidRect[],
  mode: ColorMode,
  highlightPath: string | null,
) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  for (const r of rects) {
    if (r.depth === 0) continue; // skip the outermost container fill
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    if (w < 1 || h < 1) continue;

    const isLeaf = !r.node.children || r.node.children.length === 0;
    ctx.fillStyle = rectColor(r, mode);
    ctx.fillRect(r.x0, r.y0, w, h);

    // Container border + header label for directories with children.
    if (!isLeaf) {
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x0 + 0.5, r.y0 + 0.5, w - 1, h - 1);
      if (h > HEADER && w > 30) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = "11px system-ui, sans-serif";
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x0 + 3, r.y0, w - 6, HEADER);
        ctx.clip();
        ctx.fillText(r.node.name, r.x0 + 4, r.y0 + 11);
        ctx.restore();
      }
    } else if (w > 40 && h > 16) {
      // Leaf label when there's room.
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "10px system-ui, sans-serif";
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x0 + 2, r.y0, w - 4, h);
      ctx.clip();
      ctx.fillText(r.node.name, r.x0 + 4, r.y0 + 12);
      ctx.restore();
    }

    if (highlightPath && r.node.path === highlightPath && r.node.path) {
      ctx.strokeStyle = "#d4b3ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x0 + 1, r.y0 + 1, w - 2, h - 2);
    }
  }
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
