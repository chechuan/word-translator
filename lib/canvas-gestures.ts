export type CanvasCamera = { x: number; y: number; zoom: number };
export type CanvasPoint = { x: number; y: number };
type TouchFrame = { camera: CanvasCamera; points: CanvasPoint[] };

export function clampCanvasZoom(zoom: number) {
  return Math.max(0.1, Math.min(1.8, zoom));
}

const midpoint = (a: CanvasPoint, b: CanvasPoint): CanvasPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: CanvasPoint, b: CanvasPoint) => Math.hypot(a.x - b.x, a.y - b.y);

// Tracks every finger, including touches that begin over a node button.
export class CanvasTouchGesture {
  private points = new Map<number, CanvasPoint>();
  private frame: TouchFrame | null = null;
  didMove = false;

  get pointerIds() { return [...this.points.keys()]; }
  has(pointerId: number) { return this.points.has(pointerId); }

  private rebase(camera: CanvasCamera) {
    this.frame = this.points.size ? { camera: { ...camera }, points: [...this.points.values()].slice(0, 2) } : null;
  }

  start(pointerId: number, point: CanvasPoint, camera: CanvasCamera) {
    if (!this.points.size) this.didMove = false;
    this.points.set(pointerId, point);
    this.rebase(camera);
    if (this.points.size > 1) this.didMove = true;
  }

  move(pointerId: number, point: CanvasPoint): CanvasCamera | null {
    if (!this.points.has(pointerId) || !this.frame) return null;
    this.points.set(pointerId, point);
    const current = [...this.points.values()].slice(0, 2);
    const { camera, points: start } = this.frame;
    if (current.length === 1) {
      const dx = point.x - start[0].x, dy = point.y - start[0].y;
      if (!this.didMove && Math.hypot(dx, dy) < 5) return null;
      this.didMove = true;
      return { ...camera, x: camera.x + dx, y: camera.y + dy };
    }
    const before = midpoint(start[0], start[1]), after = midpoint(current[0], current[1]);
    const zoom = clampCanvasZoom(camera.zoom * distance(current[0], current[1]) / Math.max(1, distance(start[0], start[1])));
    const ratio = zoom / camera.zoom;
    return { zoom, x: after.x - (before.x - camera.x) * ratio, y: after.y - (before.y - camera.y) * ratio };
  }

  end(pointerId: number, camera: CanvasCamera) {
    if (this.points.delete(pointerId)) this.rebase(camera);
  }

  clear() { this.points.clear(); this.frame = null; }
}
