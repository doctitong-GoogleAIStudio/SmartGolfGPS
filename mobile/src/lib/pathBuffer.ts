export type PathPoint = { lat: number; lng: number; t: number };
type Store = { getItem(key: string, fallback: string): Promise<string | null>; setItem(key: string, value: string): Promise<boolean> };
const keyFor = (p: PathPoint) => `${p.t}:${p.lat}:${p.lng}`;

/** Preserves the existing serialized key; this is not a transactional multi-process outbox. */
export class BackgroundPathBuffer {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private store: Store, private key = "sg_bg_path") {}
  private operation<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);this.queue = result.catch(() => undefined);return result;
  }
  private async read(): Promise<PathPoint[]> {
    const raw = await this.store.getItem(this.key, "");if (!raw) return [];
    const value = JSON.parse(raw);if (!Array.isArray(value)) throw new Error("Existing location history format requires review");return value;
  }
  private async write(points: PathPoint[]) {
    if (!await this.store.setItem(this.key, JSON.stringify(points))) throw new Error("Location history could not be saved");
  }
  peek(): Promise<PathPoint[]> { return this.operation(() => this.read()); }
  append(points: PathPoint[]): Promise<void> {
    return this.operation(async () => {
      const existing = await this.read();
      if (existing.length + points.length > 10000) throw new Error("Location buffer is full; existing history retained");
      await this.write([...existing, ...points]);
    });
  }
  acknowledge(points: PathPoint[]): Promise<void> {
    return this.operation(async () => {
      const existing = await this.read(), acknowledged = new Set(points.map(keyFor));
      await this.write(existing.filter((p) => !acknowledged.has(keyFor(p))));
    });
  }
}
