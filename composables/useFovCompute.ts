import { parseJson } from '~/utils/json'
import type { DbEncounterWall } from './useDb'

export interface WallSegment {
  x1: number; y1: number; x2: number; y2: number
  isBlocking: boolean  // false for open doors or when FOV disabled
}

export interface Point { x: number; y: number }

export function useFovCompute() {

  /**
   * Compute the visibility polygon from an origin point given
   * a set of blocking wall segments.
   *
   * Returns an array of Point forming the polygon in clockwise order.
   * The polygon is in the same coordinate space as the input.
   *
   * @param origin - viewer position in grid coordinates
   * @param segments - all blocking wall segments in grid coordinates
   * @param maxRange - max vision distance in grid units, Infinity for unlimited
   */
  function computeVisibilityPolygon(
    origin: Point,
    segments: WallSegment[],
    maxRange: number = Infinity,
    mapSize?: { w: number; h: number }
  ): Point[] {
    // When unlimited range and map size is known, clamp to map extent
    const useMapBounds = maxRange === Infinity && mapSize != null
    const range = useMapBounds ? Math.max(mapSize!.w, mapSize!.h) : (maxRange === Infinity ? 10000 : maxRange)

    const relevant = segments.filter(s => {
      if (!s.isBlocking) return false
      const minX = Math.min(s.x1, s.x2)
      const maxX = Math.max(s.x1, s.x2)
      const minY = Math.min(s.y1, s.y2)
      const maxY = Math.max(s.y1, s.y2)
      return !(
        maxX < origin.x - range || minX > origin.x + range ||
        maxY < origin.y - range || minY > origin.y + range
      )
    })

    // Use map edges as bounding box for unlimited range, otherwise a square around origin
    const bounds: WallSegment[] = useMapBounds
      ? [
          { x1: 0,          y1: 0,          x2: mapSize!.w, y2: 0,          isBlocking: true },
          { x1: mapSize!.w, y1: 0,          x2: mapSize!.w, y2: mapSize!.h, isBlocking: true },
          { x1: mapSize!.w, y1: mapSize!.h, x2: 0,          y2: mapSize!.h, isBlocking: true },
          { x1: 0,          y1: mapSize!.h, x2: 0,          y2: 0,          isBlocking: true },
        ]
      : [
          { x1: origin.x - range, y1: origin.y - range, x2: origin.x + range, y2: origin.y - range, isBlocking: true },
          { x1: origin.x + range, y1: origin.y - range, x2: origin.x + range, y2: origin.y + range, isBlocking: true },
          { x1: origin.x + range, y1: origin.y + range, x2: origin.x - range, y2: origin.y + range, isBlocking: true },
          { x1: origin.x - range, y1: origin.y + range, x2: origin.x - range, y2: origin.y - range, isBlocking: true },
        ]
    const allSegments = [...relevant, ...bounds]

    // Collect all unique endpoints
    const endpoints: Point[] = []
    for (const seg of allSegments) {
      endpoints.push({ x: seg.x1, y: seg.y1 })
      endpoints.push({ x: seg.x2, y: seg.y2 })
    }

    // For each endpoint, cast 3 rays: at angle, angle-ε, angle+ε
    const EPSILON = 0.0001
    const angles: number[] = []
    for (const pt of endpoints) {
      const angle = Math.atan2(pt.y - origin.y, pt.x - origin.x)
      angles.push(angle - EPSILON, angle, angle + EPSILON)
    }
    // Also cast rays at 0, π/2, π, 3π/2 to catch open areas
    angles.push(0, Math.PI / 2, Math.PI, -Math.PI / 2)

    // For each angle, find the closest intersection
    const intersections: Array<{angle: number; point: Point}> = []
    for (const angle of angles) {
      const dx = Math.cos(angle)
      const dy = Math.sin(angle)

      let minT = Infinity
      let hit: Point | null = null

      for (const seg of allSegments) {
        const t = raySegmentIntersect(
          origin.x, origin.y, dx, dy,
          seg.x1, seg.y1, seg.x2, seg.y2
        )
        if (t !== null && t >= 0 && t < minT) {
          minT = t
          hit = { x: origin.x + dx * t, y: origin.y + dy * t }
        }
      }

      if (hit) intersections.push({ angle, point: hit })
    }

    // Sort by angle and extract the polygon
    intersections.sort((a, b) => a.angle - b.angle)
    return intersections.map(i => i.point)
  }

  /**
   * Ray-segment intersection.
   * Returns t (distance along ray) or null if no intersection.
   */
  function raySegmentIntersect(
    rx: number, ry: number, rdx: number, rdy: number,
    x1: number, y1: number, x2: number, y2: number
  ): number | null {
    const dx = x2 - x1
    const dy = y2 - y1
    const denom = rdx * dy - rdy * dx
    if (Math.abs(denom) < 1e-10) return null  // parallel
    const t = ((x1 - rx) * dy - (y1 - ry) * dx) / denom
    const u = ((x1 - rx) * rdy - (y1 - ry) * rdx) / denom
    if (t >= 0 && u >= 0 && u <= 1) return t
    return null
  }

  /**
   * Build WallSegments from DbEncounterWall records.
   * Parses the points JSON and derives line segments.
   * Open doors are marked isBlocking: false.
   */
  function wallsToSegments(walls: DbEncounterWall[]): WallSegment[] {
    const segments: WallSegment[] = []
    for (const wall of walls) {
      const points: Point[] = parseJson<Point[]>(wall.points, [])
      const isOpen = wall.coverType === 'door' && wall.isOpen
      for (let i = 0; i < points.length - 1; i++) {
        segments.push({
          x1: points[i].x,     y1: points[i].y,
          x2: points[i + 1].x, y2: points[i + 1].y,
          isBlocking: !isOpen,
        })
      }
    }
    return segments
  }

  /**
   * Compute the visibility polygons for a group of tokens.
   * Returns one polygon per token — the render layer handles the union.
   */
  function computeGroupFov(
    tokens: Array<{
      position: Point
      visionRange: number | null
    }>,
    segments: WallSegment[],
    mapSize?: { w: number; h: number }
  ): Point[][] {
    return tokens.map(t =>
      computeVisibilityPolygon(
        t.position,
        segments,
        t.visionRange ?? Infinity,
        mapSize
      )
    )
  }

  return { computeVisibilityPolygon, wallsToSegments, computeGroupFov }
}
