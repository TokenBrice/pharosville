export const HULL_STATION_OFFSETS = [-0.42, -0.21, 0, 0.21, 0.42];

/** Per-pose heading and five hull stations, reused without changing separation/grid iteration order. */
export class HullStations {
  data = new Float64Array(0);
  static readonly stride = 12;

  update(index: number, heading: number, loa: number, count: number): void {
    if (this.data.length < count * HullStations.stride) this.data = new Float64Array(count * HullStations.stride);
    const a = this.data, o = index * HullStations.stride;
    const fx = Math.sin(heading), fz = Math.cos(heading), x = fx * loa, z = fz * loa;
    a[o + 10] = fx; a[o + 11] = fz;
    for (let k = 0; k < 5; k++) {
      const t = HULL_STATION_OFFSETS[k];
      a[o + k] = x * t; a[o + 5 + k] = z * t;
    }
  }
}
