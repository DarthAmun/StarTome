import { parseJson } from "~/utils/json";
import * as PIXI from "pixi.js";
import { useEncounterStore } from "../stores/encounter";
import type { EncounterToken } from "../stores/encounter";
import type { DbEncounterWall } from "./useDb";
import { useFovCompute, type Point } from "./useFovCompute";
import { AlphaFilter, Container } from "pixi.js";
import { visibleConditions, getConditionColorHex, hpColorHex, hexColorToNumber, healthState } from "./useConditions";

export type ShapeType = "circle" | "square" | "cone";

export interface ShapeOverlay {
  id: string;
  type: ShapeType;
  anchorCol: number;
  anchorRow: number;
  endCol: number;
  endRow: number;
  colorHex: number;
}

export interface CanvasOptions {
  container: HTMLElement;
  isDmMode: boolean;
  getActiveTool: () => string;
  getFogMode?: () => "add" | "remove";
  getFogBrushSize?: () => number;
  getShapeType?: () => ShapeType;
  getShapeColor?: () => number;
  getActiveTurnTokenId?: () => number | null;
  onTokenMoved?: (instanceId: number, gridX: number, gridY: number) => void;
  onFogToggle?: (cellKey: string, newState: "revealed" | "hidden") => void;
  onShapeCommit?: (
    anchorCol: number,
    anchorRow: number,
    endCol: number,
    endRow: number,
  ) => void;
  onWallComplete?: (data: {
    points: Array<{ x: number; y: number }>;
    coverType: DbEncounterWall["coverType"];
  }) => void;
  onTokenPointerEnter?: (tokenId: number) => void;
  onTokenPointerLeave?: (tokenId: number) => void;
  /** Ping tool click, or a long press on the map in select mode. `focus` = Shift held. */
  onPing?: (col: number, row: number, focus: boolean) => void;
}

const PING_COLOR = 0xffd24a;
const PING_DURATION = 2200; // ms
const PING_RIPPLES = [0, 350, 700]; // ripple start offsets (ms)
const PING_RIPPLE_LIFE = 1100; // ms per ripple
const LONG_PRESS_MS = 550;
const LONG_PRESS_SLOP = 6; // px of movement that cancels a long press

export function useEncounterCanvas(options: CanvasOptions) {
  const store = useEncounterStore();
  let app: PIXI.Application | null = null;
  let worldContainer: PIXI.Container | null = null;
  let mapSprite: PIXI.Sprite | null = null;
  let gridGraphics: PIXI.Graphics | null = null;
  let shapesContainer: PIXI.Container | null = null;
  let fogContainer: PIXI.Container | null = null;
  let tokenContainer: PIXI.Container | null = null;
  let rulerLayer: PIXI.Container | null = null;
  let shapePreviewLayer: PIXI.Container | null = null;

  let viewport = { x: 0, y: 0, scale: 1 };
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let panViewStart = { x: 0, y: 0 };

  let fogPaintActive = false;
  let fogPaintMode: "revealed" | "hidden" = "hidden";

  let rulerStart: { col: number; row: number } | null = null;
  let shapeAnchor: { col: number; row: number } | null = null;
  const shapeGraphicsMap = new Map<string, PIXI.Graphics>();
  const shapeDataMap = new Map<string, ShapeOverlay>();

  // ── FOV overlay (screen-space, on app.stage above everything) ────────────
  let fovContainer: PIXI.Container | null = null;
  let fovDarkGraphics: PIXI.Graphics | null = null;
  let fovEraseGraphics: PIXI.Graphics | null = null;
  let fovOutlineGraphics: PIXI.Graphics | null = null;
  let lastFovPolygons: Point[][] = [];
  let lastFovOutlinePolygons: Point[][] = [];

  const FOV_OUTLINE_COLORS = [0x4ecdc4, 0xff9f43, 0xff6b6b, 0xa29bfe, 0x55efc4, 0xfd79a8];

  // ── Ping layer (screen-space, so ripples keep their size at any zoom) ─────
  let pingLayer: PIXI.Container | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressStart: { x: number; y: number } | null = null;
  let panTween: ((ticker: PIXI.Ticker) => void) | null = null;

  // ── Wall layers + state ───────────────────────────────────────────────────
  let wallsGraphics: PIXI.Graphics | null = null;
  let wallDraftGraphics: PIXI.Graphics | null = null;
  let wallDraftPoints: Array<{ x: number; y: number }> = [];
  let wallSnapPreview: { x: number; y: number } | null = null;
  let activeCoverType: DbEncounterWall["coverType"] = "full";
  let wallLastClickTime = 0;
  let wallKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

  const WALL_COLORS: Record<string, number> = {
    full: 0xffffff,
    greater: 0xb8860b,
    standard: 0xc86414,
    lesser: 0xc83214,
    door: 0x64c8dc,
  };
  const WALL_ALPHA: Record<string, number> = {
    full: 0.9,
    greater: 0.85,
    standard: 0.85,
    lesser: 0.75,
    door: 0.9,
  };

  // Snaps to nearest half-cell: 0.0=corner, 0.5=tile-center, 1.0=next corner, etc.
  function screenToHalfGrid(
    screenX: number,
    screenY: number,
    enc: { gridSize: number; gridOffsetX: number; gridOffsetY: number },
  ) {
    const worldX = (screenX - viewport.x) / viewport.scale;
    const worldY = (screenY - viewport.y) / viewport.scale;
    const col = Math.round(((worldX - enc.gridOffsetX) / enc.gridSize) * 2) / 2;
    const row = Math.round(((worldY - enc.gridOffsetY) / enc.gridSize) * 2) / 2;
    return { col, row };
  }

  // ── Fog painting ───────────────────────────────────────────────────────────
  function paintFogAtScreen(screenX: number, screenY: number) {
    const enc = store.current;
    if (!enc) return;
    const { gridSize, gridOffsetX, gridOffsetY } = enc;
    const worldX = (screenX - viewport.x) / viewport.scale;
    const worldY = (screenY - viewport.y) / viewport.scale;
    const centerCol = Math.floor((worldX - gridOffsetX) / gridSize);
    const centerRow = Math.floor((worldY - gridOffsetY) / gridSize);

    const brushSize = options.getFogBrushSize?.() ?? 1;
    const half = Math.floor(brushSize / 2);

    for (let dc = -half; dc <= half; dc++) {
      for (let dr = -half; dr <= half; dr++) {
        const col = centerCol + dc;
        const row = centerRow + dr;
        if (col < 0 || row < 0) continue;
        options.onFogToggle?.(`${col},${row}`, fogPaintMode);
      }
    }
  }

  // ── Ruler ──────────────────────────────────────────────────────────────────
  function drawRuler(endCol: number, endRow: number) {
    if (!rulerLayer || !rulerStart) return;
    const enc = store.current;
    if (!enc) return;
    const { gridSize, gridOffsetX, gridOffsetY } = enc;

    rulerLayer.removeChildren();

    const x1 = gridOffsetX + rulerStart.col * gridSize;
    const y1 = gridOffsetY + rulerStart.row * gridSize;
    const x2 = gridOffsetX + endCol * gridSize;
    const y2 = gridOffsetY + endRow * gridSize;

    const dx = endCol - rulerStart.col;
    const dy = endRow - rulerStart.row;
    const distance = Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;

    const g = new PIXI.Graphics();

    // Draw line
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke({ color: 0xffcc44, width: 2 / viewport.scale, alpha: 0.9 });

    // Endpoint dots
    g.circle(x1, y1, 5 / viewport.scale);
    g.fill({ color: 0xffcc44, alpha: 1 });
    g.circle(x2, y2, 5 / viewport.scale);
    g.fill({ color: 0xffcc44, alpha: 1 });

    rulerLayer.addChild(g);

    // Distance label
    const text = new PIXI.Text({
      text: `${distance} sq`,
      style: {
        fontSize: 14 / viewport.scale,
        fill: 0xffcc44,
        fontFamily: "system-ui",
        fontWeight: "bold",
        stroke: { color: 0x000000, width: 3 / viewport.scale },
      },
    });
    text.anchor.set(0.5);
    text.x = (x1 + x2) / 2;
    text.y = (y1 + y2) / 2 - 18 / viewport.scale;
    rulerLayer.addChild(text);
  }

  function clearRuler() {
    rulerLayer?.removeChildren();
    rulerStart = null;
  }

  // ── Shape overlays ─────────────────────────────────────────────────────────
  function drawShapeGraphics(g: PIXI.Graphics, shape: ShapeOverlay) {
    const enc = store.current;
    if (!enc) return;
    const { gridSize, gridOffsetX, gridOffsetY } = enc;

    const ax = gridOffsetX + shape.anchorCol * gridSize;
    const ay = gridOffsetY + shape.anchorRow * gridSize;
    const ex = gridOffsetX + shape.endCol * gridSize;
    const ey = gridOffsetY + shape.endRow * gridSize;
    const dx = ex - ax;
    const dy = ey - ay;
    const dist = Math.sqrt(dx * dx + dy * dy);

    g.clear();
    if (dist < 1) return;

    if (shape.type === "circle") {
      g.circle(ax, ay, dist);
      g.fill({ color: shape.colorHex, alpha: 0.22 });
      g.circle(ax, ay, dist);
      g.stroke({ color: shape.colorHex, width: 2, alpha: 0.85 });
    } else if (shape.type === "square") {
      g.rect(ax - dist, ay - dist, dist * 2, dist * 2);
      g.fill({ color: shape.colorHex, alpha: 0.22 });
      g.rect(ax - dist, ay - dist, dist * 2, dist * 2);
      g.stroke({ color: shape.colorHex, width: 2, alpha: 0.85 });
    } else if (shape.type === "cone") {
      const angle = Math.atan2(dy, dx);
      const perp = angle + Math.PI / 2;
      const halfWidth = dist * 0.5;
      const farX = ax + Math.cos(angle) * dist;
      const farY = ay + Math.sin(angle) * dist;
      const lx = farX + Math.cos(perp) * halfWidth;
      const ly = farY + Math.sin(perp) * halfWidth;
      const rx = farX - Math.cos(perp) * halfWidth;
      const ry = farY - Math.sin(perp) * halfWidth;
      g.poly([ax, ay, lx, ly, rx, ry]);
      g.fill({ color: shape.colorHex, alpha: 0.22 });
      g.poly([ax, ay, lx, ly, rx, ry]);
      g.stroke({ color: shape.colorHex, width: 2, alpha: 0.85 });
    }
  }

  function drawShapePreview(endCol: number, endRow: number) {
    if (!shapePreviewLayer || !shapeAnchor) return;
    const enc = store.current;
    if (!enc) return;
    const { gridSize, gridOffsetX, gridOffsetY } = enc;

    shapePreviewLayer.removeChildren();

    const preview: ShapeOverlay = {
      id: "preview",
      type: options.getShapeType?.() ?? "circle",
      anchorCol: shapeAnchor.col,
      anchorRow: shapeAnchor.row,
      endCol,
      endRow,
      colorHex: options.getShapeColor?.() ?? 0xe84040,
    };

    const g = new PIXI.Graphics();
    drawShapeGraphics(g, preview);
    g.alpha = 0.65;
    shapePreviewLayer.addChild(g);

    // Anchor dot
    const dot = new PIXI.Graphics();
    const ax = gridOffsetX + shapeAnchor.col * gridSize;
    const ay = gridOffsetY + shapeAnchor.row * gridSize;
    dot.circle(ax, ay, 5 / viewport.scale);
    dot.fill({ color: preview.colorHex, alpha: 0.9 });
    shapePreviewLayer.addChild(dot);
  }

  function addShapeOverlay(shape: ShapeOverlay) {
    if (!shapesContainer) return;
    const g = new PIXI.Graphics();
    drawShapeGraphics(g, shape);
    shapeGraphicsMap.set(shape.id, g);
    shapeDataMap.set(shape.id, shape);
    shapesContainer.addChild(g);
  }

  function removeShapeOverlay(id: string) {
    const g = shapeGraphicsMap.get(id);
    if (g) {
      shapesContainer?.removeChild(g);
      shapeGraphicsMap.delete(id);
      shapeDataMap.delete(id);
    }
  }

  function clearShapeOverlays() {
    shapesContainer?.removeChildren();
    shapeGraphicsMap.clear();
    shapeDataMap.clear();
  }

  // ── Shape hit-testing ──────────────────────────────────────────────────────
  function triSign(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ) {
    return (px - bx) * (ay - by) - (ax - bx) * (py - by);
  }

  function pointInTriangle(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
  ) {
    const d1 = triSign(px, py, ax, ay, bx, by);
    const d2 = triSign(px, py, bx, by, cx, cy);
    const d3 = triSign(px, py, cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }

  function hitTestShape(
    shape: ShapeOverlay,
    worldX: number,
    worldY: number,
  ): boolean {
    const enc = store.current;
    if (!enc) return false;
    const { gridSize, gridOffsetX, gridOffsetY } = enc;
    const ax = gridOffsetX + shape.anchorCol * gridSize;
    const ay = gridOffsetY + shape.anchorRow * gridSize;
    const ex = gridOffsetX + shape.endCol * gridSize;
    const ey = gridOffsetY + shape.endRow * gridSize;
    const dx = ex - ax;
    const dy = ey - ay;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return false;

    if (shape.type === "circle") {
      const px = worldX - ax;
      const py = worldY - ay;
      return Math.sqrt(px * px + py * py) <= dist;
    } else if (shape.type === "square") {
      return (
        worldX >= ax - dist &&
        worldX <= ax + dist &&
        worldY >= ay - dist &&
        worldY <= ay + dist
      );
    } else {
      const angle = Math.atan2(dy, dx);
      const perp = angle + Math.PI / 2;
      const hw = dist * 0.5;
      const farX = ax + Math.cos(angle) * dist;
      const farY = ay + Math.sin(angle) * dist;
      return pointInTriangle(
        worldX,
        worldY,
        ax,
        ay,
        farX + Math.cos(perp) * hw,
        farY + Math.sin(perp) * hw,
        farX - Math.cos(perp) * hw,
        farY - Math.sin(perp) * hw,
      );
    }
  }

  function getShapeAtScreen(
    screenX: number,
    screenY: number,
  ): ShapeOverlay | null {
    const worldX = (screenX - viewport.x) / viewport.scale;
    const worldY = (screenY - viewport.y) / viewport.scale;
    // Iterate in reverse insertion order so the topmost shape wins
    const entries = [...shapeDataMap.entries()].reverse();
    for (const [, shape] of entries) {
      if (hitTestShape(shape, worldX, worldY)) return shape;
    }
    return null;
  }

  function clearShapeAnchor() {
    shapeAnchor = null;
    shapePreviewLayer?.removeChildren();
  }

  // ── Wall helpers ──────────────────────────────────────────────────────────
  function drawDashedLine(
    g: PIXI.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dashLen: number,
    gapLen: number,
    color: number,
    alpha: number,
  ) {
    const dx = x2 - x1,
      dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const nx = dx / len,
      ny = dy / len;
    let pos = 0,
      drawing = true;
    g.setStrokeStyle({ width: 2, color, alpha });
    while (pos < len) {
      const segLen = Math.min(drawing ? dashLen : gapLen, len - pos);
      if (drawing) {
        g.moveTo(x1 + nx * pos, y1 + ny * pos);
        g.lineTo(x1 + nx * (pos + segLen), y1 + ny * (pos + segLen));
        g.stroke();
      }
      pos += segLen;
      drawing = !drawing;
    }
  }

  function getWallSnapPoint(
    screenX: number,
    screenY: number,
  ): { x: number; y: number } {
    const enc = store.current;
    if (!enc) return { x: 0, y: 0 };
    const { gridSize, gridOffsetX, gridOffsetY } = enc;
    const worldX = (screenX - viewport.x) / viewport.scale;
    const worldY = (screenY - viewport.y) / viewport.scale;
    const gx = worldX - gridOffsetX;
    const gy = worldY - gridOffsetY;
    const cellX = Math.floor(gx / gridSize);
    const cellY = Math.floor(gy / gridSize);
    const candidates = [
      { x: cellX, y: cellY },
      { x: cellX + 1, y: cellY },
      { x: cellX, y: cellY + 1 },
      { x: cellX + 1, y: cellY + 1 },
      { x: cellX + 0.5, y: cellY },
      { x: cellX + 0.5, y: cellY + 1 },
      { x: cellX, y: cellY + 0.5 },
      { x: cellX + 1, y: cellY + 0.5 },
      { x: cellX + 0.5, y: cellY + 0.5 },
    ];
    let best = candidates[0],
      bestDist = Infinity;
    for (const c of candidates) {
      const dist = Math.sqrt(
        (gx - c.x * gridSize) ** 2 + (gy - c.y * gridSize) ** 2,
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best;
  }

  function redrawWalls() {
    if (!wallsGraphics) return;
    wallsGraphics.clear();
    if (!options.isDmMode) return;
    const enc = store.current;
    if (!enc) return;
    const { gridSize, gridOffsetX, gridOffsetY } = enc;
    const walls = store.walls;
    const wpx = (pt: { x: number; y: number }) => ({
      wx: gridOffsetX + pt.x * gridSize,
      wy: gridOffsetY + pt.y * gridSize,
    });

    for (const wall of walls) {
      const pts: Array<{ x: number; y: number }> = parseJson<Array<{ x: number; y: number }>>(wall.points, []);
      if (pts.length < 2) continue;
      const color = WALL_COLORS[wall.coverType] ?? 0xffffff;
      const alpha = WALL_ALPHA[wall.coverType] ?? 0.9;

      if (wall.coverType === "door" && wall.isOpen) {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = wpx(pts[i]),
            b = wpx(pts[i + 1]);
          drawDashedLine(
            wallsGraphics!,
            a.wx,
            a.wy,
            b.wx,
            b.wy,
            6,
            4,
            color,
            alpha * 0.6,
          );
        }
      } else {
        wallsGraphics!.setStrokeStyle({ width: 2, color, alpha });
        const first = wpx(pts[0]);
        wallsGraphics!.moveTo(first.wx, first.wy);
        for (let i = 1; i < pts.length; i++) {
          const p = wpx(pts[i]);
          wallsGraphics!.lineTo(p.wx, p.wy);
        }
        wallsGraphics!.stroke();
      }

      if (wall.coverType === "door") {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = wpx(pts[i]),
            b = wpx(pts[i + 1]);
          const mx = (a.wx + b.wx) / 2,
            my = (a.wy + b.wy) / 2;
          const sz = wall.isOpen ? 4 : 6;
          wallsGraphics!.rect(mx - sz / 2, my - sz / 2, sz, sz);
          wallsGraphics!.fill({ color, alpha });
        }
      }
    }
  }

  function renderWallDraft() {
    if (!wallDraftGraphics) return;
    wallDraftGraphics.clear();
    const enc = store.current;
    if (!enc) return;
    const { gridSize, gridOffsetX, gridOffsetY } = enc;
    const color = WALL_COLORS[activeCoverType] ?? 0xffffff;
    const toWorld = (pt: { x: number; y: number }) => ({
      wx: gridOffsetX + pt.x * gridSize,
      wy: gridOffsetY + pt.y * gridSize,
    });

    if (wallDraftPoints.length >= 2) {
      wallDraftGraphics.setStrokeStyle({ width: 2, color, alpha: 0.9 });
      const first = toWorld(wallDraftPoints[0]);
      wallDraftGraphics.moveTo(first.wx, first.wy);
      for (let i = 1; i < wallDraftPoints.length; i++) {
        const p = toWorld(wallDraftPoints[i]);
        wallDraftGraphics.lineTo(p.wx, p.wy);
      }
      wallDraftGraphics.stroke();
    }

    for (const pt of wallDraftPoints) {
      const { wx, wy } = toWorld(pt);
      wallDraftGraphics.circle(wx, wy, 4);
      wallDraftGraphics.fill({ color, alpha: 0.9 });
    }

    if (wallSnapPreview !== null) {
      const snap = toWorld(wallSnapPreview);
      if (wallDraftPoints.length > 0) {
        const last = toWorld(wallDraftPoints[wallDraftPoints.length - 1]);
        drawDashedLine(
          wallDraftGraphics,
          last.wx,
          last.wy,
          snap.wx,
          snap.wy,
          6,
          4,
          color,
          0.55,
        );
      }
      wallDraftGraphics.circle(snap.wx, snap.wy, 6);
      wallDraftGraphics.setStrokeStyle({ width: 1.5, color, alpha: 0.7 });
      wallDraftGraphics.stroke();
    }
  }

  function pointToSegmentDistance(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): number {
    const dx = bx - ax,
      dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq),
    );
    return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
  }

  function getWallAtPoint(
    screenX: number,
    screenY: number,
    threshold = 8,
  ): { wall: DbEncounterWall; segmentIndex: number } | null {
    const enc = store.current;
    if (!enc) return null;
    const { gridSize, gridOffsetX, gridOffsetY } = enc;
    const worldX = (screenX - viewport.x) / viewport.scale;
    const worldY = (screenY - viewport.y) / viewport.scale;
    const worldThreshold = threshold / viewport.scale;
    for (const wall of store.walls) {
      const pts: Array<{ x: number; y: number }> = parseJson<Array<{ x: number; y: number }>>(wall.points, []);
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = gridOffsetX + pts[i].x * gridSize;
        const ay = gridOffsetY + pts[i].y * gridSize;
        const bx = gridOffsetX + pts[i + 1].x * gridSize;
        const by = gridOffsetY + pts[i + 1].y * gridSize;
        if (
          pointToSegmentDistance(worldX, worldY, ax, ay, bx, by) <=
          worldThreshold
        ) {
          return { wall, segmentIndex: i };
        }
      }
    }
    return null;
  }

  function setActiveCoverType(type: DbEncounterWall["coverType"]) {
    activeCoverType = type;
  }

  function commitWallDraft() {
    if (wallDraftPoints.length >= 2) {
      options.onWallComplete?.({
        points: [...wallDraftPoints],
        coverType: activeCoverType,
      });
    }
    wallDraftPoints = [];
    wallSnapPreview = null;
    wallDraftGraphics?.clear();
  }

  // ── FOV helpers ───────────────────────────────────────────────────────────
  function gridToScreen(p: Point): { x: number; y: number } {
    const enc = store.current;
    if (!enc) return { x: 0, y: 0 };
    const worldX = enc.gridOffsetX + p.x * enc.gridSize;
    const worldY = enc.gridOffsetY + p.y * enc.gridSize;
    return {
      x: worldX * viewport.scale + viewport.x,
      y: worldY * viewport.scale + viewport.y,
    };
  }

  function renderFovOverlay(polygons: Point[][], isGmCanvas: boolean) {
    lastFovPolygons = polygons;
    if (!fovDarkGraphics || !fovEraseGraphics || !app) return;
    fovDarkGraphics.clear();
    fovEraseGraphics.clear();
    if (!polygons.length) return;

    const mapScreenX = viewport.x;
    const mapScreenY = viewport.y;
    const mapScreenW =
      (mapSprite?.texture.width ?? app.screen.width) * viewport.scale;
    const mapScreenH =
      (mapSprite?.texture.height ?? app.screen.height) * viewport.scale;

    fovDarkGraphics.rect(mapScreenX, mapScreenY, mapScreenW, mapScreenH);
    fovDarkGraphics.fill({
      color: 0x000011,
      alpha: isGmCanvas ? 0.72 : 0.92,
    });

    // Erase blend punches transparent holes in the dark overlay. Overlapping
    // polygons (group mode) are idempotent — erased alpha never goes below 0,
    // so no double-darkening and no earcut issues on zoom.
    for (const poly of polygons) {
      if (poly.length < 3) continue;
      const flat = poly.flatMap((p) => {
        const s = gridToScreen(p);
        return [s.x, s.y];
      });
      fovEraseGraphics.poly(flat);
      fovEraseGraphics.fill({ color: 0xffffff, alpha: 1 });
    }
  }

  function renderFovOutlines(polygons: Point[][]) {
    lastFovOutlinePolygons = polygons;
    if (!fovOutlineGraphics) return;
    fovOutlineGraphics.clear();
    if (!polygons.length) return;
    for (let i = 0; i < polygons.length; i++) {
      const poly = polygons[i];
      if (poly.length < 3) continue;
      const color = FOV_OUTLINE_COLORS[i % FOV_OUTLINE_COLORS.length];
      const flat = poly.flatMap((p) => {
        const s = gridToScreen(p);
        return [s.x, s.y];
      });
      fovOutlineGraphics.poly(flat);
      fovOutlineGraphics.stroke({ color, width: 1.5, alpha: 0.75 });
    }
  }

  function getMapSize(): { w: number; h: number } | undefined {
    const enc = store.current;
    if (!enc || !mapSprite?.texture) return undefined;
    return {
      w: (mapSprite.texture.width - enc.gridOffsetX) / enc.gridSize,
      h: (mapSprite.texture.height - enc.gridOffsetY) / enc.gridSize,
    };
  }

  function recomputeFov() {
    const enc = store.current;
    if (!enc) return;

    if (!enc.fovEnabled) {
      renderFovOverlay([], options.isDmMode);
      renderFovOutlines([]);
      return;
    }

    const { computeGroupFov, wallsToSegments } = useFovCompute();
    const segments = wallsToSegments(store.walls);
    const mapSize = getMapSize();

    const activeId = options.getActiveTurnTokenId?.();
    const activeToken = enc.tokens.find((t: EncounterToken) => t.id === activeId);

    const toFovInput = (t: EncounterToken) => ({
      position: { x: t.gridX + t.size / 2, y: t.gridY + t.size / 2 },
      visionRange: t.visionRange,
    });

    // Helper: compute a single-token outline polygon for the active token
    const activeOutline = (): Point[][] => {
      if (!activeToken) return [];
      return computeGroupFov([toFovInput(activeToken)], segments, mapSize);
    };

    // GM mode: DM sees no overlay, just the active token's outline; player gets group FOV
    // with outline for the active token if it is a player token
    if (store.fovMode === "gm") {
      renderFovOverlay([], options.isDmMode);
      if (options.isDmMode) {
        renderFovOutlines(activeOutline());
      } else {
        renderFovOutlines([]);
      }
      return;
    }

    let tokensForFov: Array<{ position: Point; visionRange: number | null }>;

    if (store.fovMode === "active") {
      if (!activeToken) return;
      tokensForFov = [toFovInput(activeToken)];
    } else {
      tokensForFov = enc.tokens
        .filter((t: EncounterToken) => t.isPlayerToken)
        .map(toFovInput);
    }

    if (!tokensForFov.length) {
      renderFovOverlay([], options.isDmMode);
      renderFovOutlines([]);
      return;
    }

    const polygons = computeGroupFov(tokensForFov, segments, mapSize);
    renderFovOverlay(polygons, options.isDmMode);
    // Group mode: outline the active token only if it's a player token
    const groupOutline =
      store.fovMode === "group" && activeToken?.isPlayerToken
        ? activeOutline()
        : [];
    renderFovOutlines(groupOutline);
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    app = new PIXI.Application();
    await app.init({
      resizeTo: options.container,
      backgroundColor: 0x0e0e1a,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    options.container.appendChild(app.canvas);

    worldContainer = new PIXI.Container();
    app.stage.addChild(worldContainer);

    mapSprite = new PIXI.Sprite();
    gridGraphics = new PIXI.Graphics();
    shapesContainer = new PIXI.Container();
    fogContainer = new PIXI.Container();
    wallsGraphics = new PIXI.Graphics();
    tokenContainer = new PIXI.Container();
    wallDraftGraphics = new PIXI.Graphics();
    rulerLayer = new PIXI.Container();
    shapePreviewLayer = new PIXI.Container();

    worldContainer.addChild(mapSprite);
    worldContainer.addChild(gridGraphics);
    worldContainer.addChild(shapesContainer);
    worldContainer.addChild(fogContainer);
    worldContainer.addChild(wallsGraphics); // above fog, below tokens (GM only)
    worldContainer.addChild(tokenContainer);
    worldContainer.addChild(wallDraftGraphics); // above tokens for visibility
    worldContainer.addChild(rulerLayer);
    worldContainer.addChild(shapePreviewLayer);

    // FOV overlay: render group isolates erase blend so it only punches holes
    // in the dark overlay without affecting the scene below.
    fovContainer = new PIXI.Container();
    fovContainer.filters = [new AlphaFilter()];
    fovContainer.enableRenderGroup();
    fovDarkGraphics = new PIXI.Graphics();
    fovEraseGraphics = new PIXI.Graphics();
    (fovEraseGraphics as any).blendMode = "erase";
    fovContainer.addChild(fovDarkGraphics);
    fovContainer.addChild(fovEraseGraphics);
    app.stage.sortableChildren = true;
    (fovContainer as any).zIndex = 900;
    app.stage.addChild(fovContainer);

    // Token FOV outlines — drawn above the dark overlay
    fovOutlineGraphics = new PIXI.Graphics();
    (fovOutlineGraphics as any).zIndex = 901;
    app.stage.addChild(fovOutlineGraphics);

    // Pings sit above the FOV darkness so they read even in unseen areas
    pingLayer = new PIXI.Container();
    pingLayer.eventMode = "none";
    (pingLayer as any).zIndex = 950;
    app.stage.addChild(pingLayer);

    setupInteraction();
    return app;
  }

  // ── Map ────────────────────────────────────────────────────────────────────
  // Textures loaded through PIXI.Assets stay cached (keyed by their multi-MB
  // data URL) until unloaded, even after app.destroy() (PERF-08).
  const loadedAssets = new Set<string>();
  let currentMapUrl: string | null = null;
  let mapGeneration = 0;

  async function loadTexture(url: string) {
    loadedAssets.add(url);
    return PIXI.Assets.load(url);
  }

  function unloadAsset(url: string) {
    if (!loadedAssets.delete(url)) return;
    PIXI.Assets.unload(url).catch(() => { /* already gone */ });
  }

  async function loadMap(source: string, _type: "file" | "url") {
    if (!app || !worldContainer || !mapSprite) return;

    // Two quick map changes can finish out of order; only the latest wins (BUG-16)
    const generation = ++mapGeneration;
    const texture = await loadTexture(source);
    if (generation !== mapGeneration || !app || !mapSprite) return;
    const previous = currentMapUrl;
    currentMapUrl = source;
    mapSprite.texture = texture;
    if (previous && previous !== source) unloadAsset(previous);
    mapSprite.x = 0;
    mapSprite.y = 0;

    viewport.x = (app.screen.width - texture.width * viewport.scale) / 2;
    viewport.y = (app.screen.height - texture.height * viewport.scale) / 2;
    applyViewport();

    drawGrid();
    redrawFog();
  }

  // ── Grid ───────────────────────────────────────────────────────────────────
  function drawGrid() {
    if (!gridGraphics || !mapSprite) return;
    const enc = store.current;
    if (!enc) return;

    gridGraphics.clear();
    const { gridSize, gridOffsetX, gridOffsetY } = enc;
    const mapW = mapSprite.texture.width;
    const mapH = mapSprite.texture.height;

    gridGraphics.setStrokeStyle({
      width: 1 / viewport.scale,
      color: 0xeeeeee,
      alpha: 0.35,
    });
    gridGraphics.beginPath();

    for (let x = gridOffsetX % gridSize; x < mapW; x += gridSize) {
      gridGraphics.moveTo(x, 0);
      gridGraphics.lineTo(x, mapH);
    }
    for (let y = gridOffsetY % gridSize; y < mapH; y += gridSize) {
      gridGraphics.moveTo(0, y);
      gridGraphics.lineTo(mapW, y);
    }
    gridGraphics.stroke();
  }

  // ── Fog of War ─────────────────────────────────────────────────────────────
  function redrawFog() {
    if (!fogContainer || !mapSprite) return;
    fogContainer.removeChildren();
    const enc = store.current;
    if (!enc) return;

    const { gridSize, gridOffsetX, gridOffsetY, fogData } = enc;
    const mapW = mapSprite.texture.width;
    const mapH = mapSprite.texture.height;
    const allHidden = (fogData as any)._allHidden === "hidden";

    const cols = Math.ceil((mapW - gridOffsetX) / gridSize) + 1;
    const rows = Math.ceil((mapH - gridOffsetY) / gridSize) + 1;

    if (
      !allHidden &&
      Object.keys(fogData).filter((k) => k !== "_allHidden").length === 0
    )
      return;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${col},${row}`;
        const state = fogData[key];

        let alpha = 0;
        if (allHidden && !state) alpha = 0.92;
        else if (state === "hidden") alpha = 0.92;
        else if (state === "partial") alpha = 0.55;
        else continue;

        const cell = new PIXI.Graphics();
        cell.rect(
          gridOffsetX + col * gridSize,
          gridOffsetY + row * gridSize,
          gridSize,
          gridSize,
        );
        cell.fill({ color: 0x0a0a19, alpha });
        fogContainer.addChild(cell);
      }
    }
  }

  // ── Tokens ─────────────────────────────────────────────────────────────────
  async function renderTokens() {
    if (!tokenContainer || !app) return;
    tokenContainer.removeChildren();
    const enc = store.current;
    if (!enc) return;

    const tokens = options.isDmMode
      ? enc.tokens
      : enc.tokens.filter((t: any) => t.isVisible);
    for (const token of tokens) {
      await renderToken(token);
    }
  }

  // Degrees → canvas radians (0° = top, clockwise)
  const toCanvasRad = (deg: number) => (deg - 90) * Math.PI / 180;

  // ── Dash-arc helper: batches all dash subpaths into a single stroke() call ──
  function drawDashedArc(
    g: PIXI.Graphics,
    cx: number, cy: number, r: number,
    startDeg: number, endDeg: number,
    color: number, alpha: number,
    strokeWidth: number,
    dashPx = 3, gapPx = 4,
  ) {
    const totalDeg = endDeg - startDeg;
    const arcLen = Math.abs((totalDeg * Math.PI / 180) * r);
    let pos = 0;
    let drawing = true;
    while (pos < arcLen) {
      const segLen = Math.min(drawing ? dashPx : gapPx, arcLen - pos);
      if (drawing && segLen > 0) {
        const a0 = toCanvasRad(startDeg + (pos / arcLen) * totalDeg);
        const a1 = toCanvasRad(startDeg + ((pos + segLen) / arcLen) * totalDeg);
        g.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
        g.arc(cx, cy, r, a0, a1);
      }
      pos += segLen;
      drawing = !drawing;
    }
    g.stroke({ color, alpha, width: strokeWidth, cap: "round" });
  }

  async function renderToken(token: any) {
    if (!tokenContainer || !app) return;
    const enc = store.current;
    if (!enc) return;

    const { gridSize, gridOffsetX, gridOffsetY } = enc;
    const pixelX = gridOffsetX + token.gridX * gridSize;
    const pixelY = gridOffsetY + token.gridY * gridSize;
    const pixelSize = gridSize * token.size;
    const R = pixelSize / 2;
    const cx = R, cy = R; // center within container

    const screenCell = enc.gridSize * viewport.scale;
    const tier: "full" | "dots" | "pip" = screenCell >= 54 ? "full" : screenCell >= 32 ? "dots" : "pip";

    const container = new PIXI.Container();
    container.x = pixelX;
    container.y = pixelY;
    container.label = `token-${token.id}`;

    // ── Base faction ring (pure disposition, no condition color) ─────────────
    const ring = new PIXI.Graphics();
    const factionColor = token.isDead
      ? 0x8b2030
      : !token.isVisible
        ? 0x2d2d50
        : (token.isPlayerToken ? 0x1a8070 : 0xc0392b);
    ring.circle(cx, cy, R);
    ring.fill({ color: factionColor, alpha: 0.3 });
    ring.circle(cx, cy, R);
    ring.stroke({ color: factionColor, width: token.isDead ? 3 : 2, alpha: 0.9 });
    container.addChild(ring);

    // ── Portrait / fallback initial ──────────────────────────────────────────
    if (token.imageSource) {
      try {
        const texture = await loadTexture(token.imageSource);
        const sprite = new PIXI.Sprite(texture);
        const scale = (pixelSize - 4) / Math.min(texture.width, texture.height);
        sprite.scale.set(scale);
        sprite.x = (pixelSize - sprite.width) / 2;
        sprite.y = (pixelSize - sprite.height) / 2;

        const mask = new PIXI.Graphics();
        mask.circle(cx, cy, R - 2);
        mask.fill(0xffffff);
        container.addChild(mask);
        container.addChild(sprite);
        sprite.mask = mask;

        if (token.isDead) sprite.tint = 0x662222;
        if (!token.isVisible && options.isDmMode) sprite.alpha = 0.5;
      } catch {
        const text = new PIXI.Text({
          text: token.name.charAt(0).toUpperCase(),
          style: { fontSize: pixelSize * 0.45, fill: 0xc8c8e8, fontFamily: "Cinzel", fontWeight: "600" },
        });
        text.anchor.set(0.5);
        text.x = cx;
        text.y = cy;
        container.addChild(text);
      }
    } else {
      const text = new PIXI.Text({
        text: token.name.charAt(0).toUpperCase(),
        style: { fontSize: pixelSize * 0.45, fill: 0xc8c8e8, fontFamily: "Cinzel", fontWeight: "600" },
      });
      text.anchor.set(0.5);
      text.x = cx;
      text.y = cy;
      container.addChild(text);
    }

    // ── Health tint (player view, non-PC tokens) ─────────────────────────────
    if (!options.isDmMode && !token.isPlayerToken && !token.isDead) {
      // Prefer the synced health-state word; fall back to computing from raw HP
      // (raw HP is available on the initial DB load before any DM sync arrives)
      const hs = token.playerHealthState ?? (token.hpMax ? healthState(token) : "healthy");
      const tintAlpha = hs === "critical" ? 0.45 : hs === "bloodied" ? 0.28 : 0;
      if (tintAlpha > 0) {
        const tint = new PIXI.Graphics();
        tint.circle(cx, cy, R - 2);
        tint.fill({ color: 0x780f19, alpha: tintAlpha });
        container.addChild(tint);
      }
    }

    // ── Dead skull overlay ───────────────────────────────────────────────────
    if (token.isDead) {
      // Simple X cross as skull substitute (texture loads would be async)
      const skull = new PIXI.Graphics();
      const s = R * 0.3;
      skull.moveTo(cx - s, cy - s); skull.lineTo(cx + s, cy + s);
      skull.stroke({ color: 0xe8d5d5, width: 2.5, alpha: 0.85, cap: "round" });
      skull.moveTo(cx + s, cy - s); skull.lineTo(cx - s, cy + s);
      skull.stroke({ color: 0xe8d5d5, width: 2.5, alpha: 0.85, cap: "round" });
      container.addChild(skull);
    }

    // ── HP arc (DM view only) ────────────────────────────────────────────────
    if (options.isDmMode && !token.isDead && token.hpMax && token.hpCurrent !== null) {
      const f = Math.max(0, token.hpCurrent / token.hpMax);
      if (f < 0.999) {
        const arcR = R - 4.5;
        const hpG = new PIXI.Graphics();
        // Track (full circle minus 1° gap at top)
        hpG.arc(cx, cy, arcR, toCanvasRad(1), toCanvasRad(359));
        hpG.stroke({ color: 0x05050f, alpha: 0.55, width: 3 });
        // Fill arc
        if (f > 0.01) {
          const sweep = 358 * f;
          hpG.arc(cx, cy, arcR, toCanvasRad(1), toCanvasRad(1 + sweep));
          hpG.stroke({ color: hpColorHex(f), alpha: 0.95, width: 3, cap: "round" });
        }
        container.addChild(hpG);
      }
    }

    // ── Status ring (condition segments) ─────────────────────────────────────
    const conds = visibleConditions(token.conditions ?? [], options.isDmMode);
    if (conds.length > 0) {
      const n = conds.length;
      const ringR = R + 4;
      const gap = n > 1 ? 10 : 0;
      const seg = 360 / n;
      const strokeW = tier === "pip" ? 3 : 4.5;
      // Round caps overhang the arc endpoint by strokeW/2 px. Shrink each arc
      // inward by that angle so the cap tip lands exactly at the gap boundary.
      const capInsetDeg = n > 1
        ? Math.asin((strokeW / 2) / ringR) * (180 / Math.PI)
        : 0;
      for (let i = 0; i < n; i++) {
        const cond = conds[i];
        const a0 = i * seg + gap / 2 + capInsetDeg;
        const a1 = (i + 1) * seg - gap / 2 - capInsetDeg;
        const color = cond.color
          ? hexColorToNumber(cond.color)
          : getConditionColorHex(cond.name);

        const segG = new PIXI.Graphics();
        if (cond.hidden) {
          drawDashedArc(segG, cx, cy, ringR, a0, a1, color, 0.7, strokeW);
        } else {
          segG.arc(cx, cy, ringR, toCanvasRad(a0), toCanvasRad(a1));
          segG.stroke({ color, alpha: 0.95, width: strokeW, cap: "round" });
        }
        container.addChild(segG);
      }
    }

    // ── Nameplate + player health pip ────────────────────────────────────────
    if ((options.isDmMode || token.isVisible) && tier !== "pip") {
      const label = new PIXI.Text({
        text: token.label || token.name,
        style: { fontSize: 10, fill: 0xc8c8e8, fontFamily: "system-ui", stroke: { color: 0x000000, width: 3 } },
      });
      label.anchor.set(0.5, 0);
      label.x = cx;
      label.y = pixelSize + 2;
      container.addChild(label);
    }

    // ── DM hidden-token badge ────────────────────────────────────────────────
    if (options.isDmMode && !token.isVisible) {
      const badge = new PIXI.Graphics();
      badge.circle(pixelSize - 8, 8, 7);
      badge.fill({ color: 0x333355, alpha: 0.9 });
      badge.stroke({ color: 0x6b6b9a, width: 1 });
      container.addChild(badge);
      const eye = new PIXI.Text({
        text: "◌",
        style: { fontSize: 8, fill: 0x8888aa, fontFamily: "system-ui" },
      });
      eye.anchor.set(0.5);
      eye.x = pixelSize - 8;
      eye.y = 8;
      container.addChild(eye);
    }

    // ── Elevation badge ──────────────────────────────────────────────────────
    if (token.elevation !== null && token.elevation !== undefined) {
      const elvLabel = token.elevation >= 0 ? `↑${token.elevation}` : `↓${Math.abs(token.elevation)}`;
      const elvColor = token.elevation >= 0 ? 0x88ccff : 0xffaa55;
      const elvBg = new PIXI.Graphics();
      elvBg.roundRect(1, pixelSize - 15, 22, 13, 3);
      elvBg.fill({ color: 0x0a1a2a, alpha: 0.88 });
      elvBg.stroke({ color: elvColor, width: 1, alpha: 0.8 });
      container.addChild(elvBg);
      const elvText = new PIXI.Text({
        text: elvLabel,
        style: { fontSize: 8, fill: elvColor, fontFamily: "system-ui", fontWeight: "bold", stroke: { color: 0x000000, width: 2 } },
      });
      elvText.anchor.set(0.5, 0.5);
      elvText.x = 12;
      elvText.y = pixelSize - 9;
      container.addChild(elvText);
    }

    // ── Timer badge (top-left): soonest running timer, or ✓ when one is up ──
    const timers: Array<{ remaining: number; visibleToPlayers?: boolean }> = (token.timers ?? [])
      .filter((t: any) => options.isDmMode || t.visibleToPlayers);
    if (timers.length) {
      const anyUp = timers.some((t) => t.remaining <= 0);
      const soonest = Math.min(...timers.filter((t) => t.remaining > 0).map((t) => t.remaining));
      const tmrColor = anyUp ? 0xffd24a : 0xd9a066;
      const tmrBg = new PIXI.Graphics();
      tmrBg.circle(8, 8, 7.5);
      tmrBg.fill({ color: anyUp ? 0x3a2a05 : 0x1a1208, alpha: 0.92 });
      tmrBg.stroke({ color: tmrColor, width: anyUp ? 1.5 : 1, alpha: 0.95 });
      container.addChild(tmrBg);
      const tmrText = new PIXI.Text({
        text: anyUp ? "✓" : String(soonest),
        style: { fontSize: 8.5, fill: tmrColor, fontFamily: "system-ui", fontWeight: "bold", stroke: { color: 0x000000, width: 2 } },
      });
      tmrText.anchor.set(0.5);
      tmrText.x = 8;
      tmrText.y = 8;
      container.addChild(tmrText);
    }

    // ── Active-turn gold ring (placed outside the condition ring at R+4) ────
    if (options.getActiveTurnTokenId?.() === token.id) {
      const activeRing = new PIXI.Graphics();
      // Condition ring outer edge ≈ R+6.25 — start well clear of it
      activeRing.circle(cx, cy, R + 10);
      activeRing.stroke({ color: 0xffd700, width: 3, alpha: 0.95 });
      activeRing.circle(cx, cy, R + 15);
      activeRing.stroke({ color: 0xffd700, width: 1.5, alpha: 0.3 });
      container.addChild(activeRing);
    }

    // ── Interaction (drag + hover events) ────────────────────────────────────
    container.interactive = true;
    container.on("pointerenter", () => {
      options.onTokenPointerEnter?.(token.id);
    });
    container.on("pointerleave", () => {
      options.onTokenPointerLeave?.(token.id);
    });

    if (options.isDmMode) {
      container.cursor = "grab";
      let dragging = false;
      let dragOffX = 0;
      let dragOffY = 0;

      container.on("pointerdown", (e) => {
        if (e.button === 2) return;
        if (options.getActiveTool() !== "select") return;
        e.stopPropagation();
        dragging = true;
        container.cursor = "grabbing";
        container.zIndex = 1000;
        const local = worldContainer!.toLocal(e.global);
        dragOffX = local.x - container.x;
        dragOffY = local.y - container.y;
      });

      app!.stage.on("pointermove", (e) => {
        if (!dragging) return;
        const local = worldContainer!.toLocal(e.global);
        container.x = local.x - dragOffX;
        container.y = local.y - dragOffY;
      });

      app!.stage.on("pointerup", () => {
        if (!dragging) return;
        dragging = false;
        container.cursor = "grab";
        container.zIndex = 0;
        const snappedX = Math.round((container.x - gridOffsetX) / gridSize);
        const snappedY = Math.round((container.y - gridOffsetY) / gridSize);
        container.x = gridOffsetX + snappedX * gridSize;
        container.y = gridOffsetY + snappedY * gridSize;
        options.onTokenMoved?.(token.id, snappedX, snappedY);
      });
    }

    tokenContainer.addChild(container);
  }

  // ── Ping ───────────────────────────────────────────────────────────────────
  function screenToGrid(screenX: number, screenY: number) {
    const enc = store.current;
    if (!enc) return null;
    return {
      col: ((screenX - viewport.x) / viewport.scale - enc.gridOffsetX) / enc.gridSize,
      row: ((screenY - viewport.y) / viewport.scale - enc.gridOffsetY) / enc.gridSize,
    };
  }

  /** Plays the ping animation at a grid position (fractional col/row). */
  function showPing(col: number, row: number) {
    if (!app || !pingLayer) return;
    const g = new PIXI.Graphics();
    pingLayer.addChild(g);
    const start = performance.now();
    const easeOut = (p: number) => 1 - (1 - p) ** 3;

    const tick = () => {
      const t = performance.now() - start;
      if (t >= PING_DURATION || !app) {
        app?.ticker.remove(tick);
        g.destroy();
        return;
      }
      // Recompute every frame so the ping stays pinned to the map while panning
      const s = gridToScreen({ x: col, y: row });
      g.clear();
      for (const offset of PING_RIPPLES) {
        const p = (t - offset) / PING_RIPPLE_LIFE;
        if (p < 0 || p > 1) continue;
        g.circle(s.x, s.y, 10 + easeOut(p) * 62);
        g.stroke({ color: PING_COLOR, width: 4 * (1 - p) + 1, alpha: 1 - p });
      }
      const fade = t > PING_DURATION - 400 ? (PING_DURATION - t) / 400 : 1;
      const pulse = 1 + 0.18 * Math.sin(t / 90);
      g.circle(s.x, s.y, 9 * pulse);
      g.fill({ color: PING_COLOR, alpha: 0.35 * fade });
      g.circle(s.x, s.y, 5);
      g.fill({ color: PING_COLOR, alpha: 0.95 * fade });
      g.stroke({ color: 0x000000, width: 1.5, alpha: 0.6 * fade });
    };
    app.ticker.add(tick);
  }

  /** Smoothly pans so the grid position sits at the centre of the canvas. */
  function centerOn(col: number, row: number) {
    const enc = store.current;
    if (!app || !enc) return;
    const worldX = enc.gridOffsetX + col * enc.gridSize;
    const worldY = enc.gridOffsetY + row * enc.gridSize;
    const from = { x: viewport.x, y: viewport.y };
    const to = {
      x: app.screen.width / 2 - worldX * viewport.scale,
      y: app.screen.height / 2 - worldY * viewport.scale,
    };
    if (panTween) app.ticker.remove(panTween);
    const start = performance.now();
    const DURATION = 450;
    panTween = () => {
      const p = Math.min(1, (performance.now() - start) / DURATION);
      const e = 1 - (1 - p) ** 3;
      viewport.x = from.x + (to.x - from.x) * e;
      viewport.y = from.y + (to.y - from.y) * e;
      applyViewport();
      if (p >= 1 && panTween) {
        app?.ticker.remove(panTween);
        panTween = null;
      }
    };
    app.ticker.add(panTween);
  }

  function emitPing(screenX: number, screenY: number, focus: boolean) {
    const pos = screenToGrid(screenX, screenY);
    if (!pos) return;
    showPing(pos.col, pos.row);
    options.onPing?.(pos.col, pos.row, focus);
  }

  function cancelLongPress() {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressStart = null;
  }

  // ── Viewport / Interaction ─────────────────────────────────────────────────
  function setupInteraction() {
    if (!app) return;

    app.stage.interactive = true;
    app.stage.hitArea = { contains: () => true } as any;

    app.stage.on("pointerdown", (e) => {
      const tool = options.getActiveTool();
      const enc = store.current;
      const shiftKey = !!(e.originalEvent as unknown as PointerEvent)?.shiftKey;

      // Ping tool: every left click pings
      if (options.isDmMode && tool === "ping" && e.button === 0) {
        emitPing(e.global.x, e.global.y, shiftKey);
        return;
      }

      // Door toggle: select tool left-click on a door wall
      if (options.isDmMode && tool === "select" && e.button === 0) {
        const doorHit = getWallAtPoint(e.global.x, e.global.y);
        if (doorHit && doorHit.wall.coverType === "door") {
          store.toggleDoor(doorHit.wall.id!).then(() => {
            redrawWalls();
            recomputeFov();
          });
          return;
        }
      }

      // Long press on the map (select tool) pings without switching tools.
      // Token presses stop propagation, so this only fires on empty map.
      if (
        options.isDmMode && tool === "select" && e.button === 0 && options.onPing &&
        !(e.originalEvent as unknown as PointerEvent)?.altKey
      ) {
        cancelLongPress();
        const at = { x: e.global.x, y: e.global.y };
        longPressStart = at;
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          longPressStart = null;
          emitPing(at.x, at.y, shiftKey);
        }, LONG_PRESS_MS);
      }

      // Wall drawing
      if (options.isDmMode && tool === "wall") {
        if (e.button === 2) {
          commitWallDraft();
          return;
        }
        if (e.button === 0 && enc) {
          const now = Date.now();
          const isDoubleClick = now - wallLastClickTime < 300;
          wallLastClickTime = now;
          if (isDoubleClick) {
            commitWallDraft();
          } else {
            wallDraftPoints.push(getWallSnapPoint(e.global.x, e.global.y));
            renderWallDraft();
          }
        }
        return;
      }

      // Fog painting
      if (options.isDmMode && tool === "fog" && e.button === 0) {
        if (enc) {
          const mode = options.getFogMode?.() ?? "add";
          fogPaintMode = mode === "add" ? "hidden" : "revealed";
          fogPaintActive = true;
          paintFogAtScreen(e.global.x, e.global.y);
        }
        return;
      }

      // Ruler: first click sets start, second click clears
      if (tool === "measure" && e.button === 0) {
        if (enc) {
          const { col, row } = screenToHalfGrid(e.global.x, e.global.y, enc);
          if (rulerStart) {
            clearRuler();
          } else {
            rulerStart = { col, row };
            drawRuler(col, row);
          }
        }
        return;
      }

      // Shape placement — two-click: anchor then end
      if (options.isDmMode && tool === "shapes") {
        if (e.button === 2) {
          clearShapeAnchor();
          return;
        }
        if (e.button === 0 && enc) {
          const { col, row } = screenToHalfGrid(e.global.x, e.global.y, enc);
          if (!shapeAnchor) {
            shapeAnchor = { col, row };
            drawShapePreview(col, row);
          } else {
            options.onShapeCommit?.(shapeAnchor.col, shapeAnchor.row, col, row);
            clearShapeAnchor();
          }
        }
        return;
      }

      // Pan — middle mouse or alt+left
      if (
        e.button === 1 ||
        (e.button === 0 && (e.originalEvent as unknown as PointerEvent)?.altKey)
      ) {
        isPanning = true;
        panStart = { x: e.global.x, y: e.global.y };
        panViewStart = { x: viewport.x, y: viewport.y };
        app!.canvas.style.cursor = "grabbing";
      }
    });

    app.stage.on("pointermove", (e) => {
      if (
        longPressStart &&
        Math.hypot(e.global.x - longPressStart.x, e.global.y - longPressStart.y) > LONG_PRESS_SLOP
      ) {
        cancelLongPress();
      }

      if (fogPaintActive) {
        paintFogAtScreen(e.global.x, e.global.y);
        return;
      }

      const tool = options.getActiveTool();

      // Wall snap preview
      if (options.isDmMode && tool === "wall") {
        wallSnapPreview = getWallSnapPoint(e.global.x, e.global.y);
        renderWallDraft();
        return;
      }

      // Update shape preview
      if (tool === "shapes" && shapeAnchor) {
        const enc = store.current;
        if (enc) {
          const { col, row } = screenToHalfGrid(e.global.x, e.global.y, enc);
          drawShapePreview(col, row);
        }
        return;
      }

      // Update ruler preview
      if (tool === "measure" && rulerStart) {
        const enc = store.current;
        if (enc) {
          const { col, row } = screenToHalfGrid(e.global.x, e.global.y, enc);
          drawRuler(col, row);
        }
        return;
      }

      if (!isPanning) return;
      viewport.x = panViewStart.x + (e.global.x - panStart.x);
      viewport.y = panViewStart.y + (e.global.y - panStart.y);
      applyViewport();
    });

    app.stage.on("pointerupoutside", cancelLongPress);
    app.stage.on("pointerup", () => {
      cancelLongPress();
      fogPaintActive = false;
      if (isPanning) {
        isPanning = false;
        app!.canvas.style.cursor = "default";
        store.updateViewport({ ...viewport });
      }
    });

    wallKeydownHandler = (e: KeyboardEvent) => {
      if (!options.isDmMode || options.getActiveTool() !== "wall") return;
      if (e.key === "Backspace") {
        e.preventDefault();
        wallDraftPoints.pop();
        renderWallDraft();
      }
    };
    document.addEventListener("keydown", wallKeydownHandler);

    app.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        const worldX = (mouseX - viewport.x) / viewport.scale;
        const worldY = (mouseY - viewport.y) / viewport.scale;
        viewport.scale = Math.min(
          4,
          Math.max(0.1, viewport.scale * zoomFactor),
        );
        viewport.x = mouseX - worldX * viewport.scale;
        viewport.y = mouseY - worldY * viewport.scale;
        applyViewport();
        drawGrid();
      },
      { passive: false },
    );
  }

  function applyViewport() {
    if (!worldContainer) return;
    worldContainer.x = viewport.x;
    worldContainer.y = viewport.y;
    worldContainer.scale.set(viewport.scale);
    if (lastFovPolygons.length)
      renderFovOverlay(lastFovPolygons, options.isDmMode);
    renderFovOutlines(lastFovOutlinePolygons);
  }

  function applyExternalViewport(vp: { x: number; y: number; scale: number }) {
    viewport = { ...vp };
    applyViewport();
  }

  function getTokenScreenBounds(
    tokenId: number,
  ): { x: number; y: number; w: number; h: number } | null {
    const enc = store.current;
    if (!enc) return null;
    const token = enc.tokens.find((t: any) => t.id === tokenId);
    if (!token) return null;
    const { gridSize, gridOffsetX, gridOffsetY } = enc;
    const pixelX = gridOffsetX + token.gridX * gridSize;
    const pixelY = gridOffsetY + token.gridY * gridSize;
    const pixelSize = gridSize * token.size;
    return {
      x: pixelX * viewport.scale + viewport.x,
      y: pixelY * viewport.scale + viewport.y,
      w: pixelSize * viewport.scale,
      h: pixelSize * viewport.scale,
    };
  }

  function getGridPosFromScreen(screenX: number, screenY: number) {
    const enc = store.current;
    if (!enc || !worldContainer) return { gridX: 0, gridY: 0 };
    const { gridSize, gridOffsetX, gridOffsetY } = enc;
    const worldX = (screenX - viewport.x) / viewport.scale;
    const worldY = (screenY - viewport.y) / viewport.scale;
    return {
      gridX: Math.round((worldX - gridOffsetX) / gridSize),
      gridY: Math.round((worldY - gridOffsetY) / gridSize),
    };
  }

  function forceResize() {
    if (!app) return;
    app.resize();
    drawGrid();
    redrawFog();
    if (lastFovPolygons.length)
      renderFovOverlay(lastFovPolygons, options.isDmMode);
    renderFovOutlines(lastFovOutlinePolygons);
  }

  function destroy() {
    cancelLongPress();
    if (wallKeydownHandler)
      document.removeEventListener("keydown", wallKeydownHandler);
    mapGeneration++;
    app?.destroy(true);
    app = null;
    for (const url of [...loadedAssets]) unloadAsset(url);
    currentMapUrl = null;
  }

  function getViewport() {
    return { ...viewport };
  }

  return {
    init,
    loadMap,
    drawGrid,
    redrawFog,
    renderTokens,
    forceResize,
    applyExternalViewport,
    getGridPosFromScreen,
    getTokenScreenBounds,
    getViewport,
    addShapeOverlay,
    removeShapeOverlay,
    clearShapeOverlays,
    clearShapeAnchor,
    clearRuler,
    getShapeAtScreen,
    redrawWalls,
    getWallAtPoint,
    setActiveCoverType,
    renderFovOverlay,
    renderFovOutlines,
    recomputeFov,
    showPing,
    centerOn,
    destroy,
  };
}
