import type { Vec3, WorldAnchor } from '../contracts/world';
/** Region-local spatial hash; collision work depends on nearby reservations. */
export function createOccupancy(cellSize = 4.8) {
    const buckets = new Map<string, Set<WorldAnchor>>();
    const keys = (position: Vec3, size: Vec3) => {
        const lo = position.map((v, i) => Math.floor((v - size[i] / 2) / cellSize)), hi = position.map((v, i) => Math.floor((v + size[i] / 2 - 1e-6) / cellSize));
        const result: string[] = [];
        for (let x = lo[0]; x <= hi[0]; x++)
            for (let y = lo[1]; y <= hi[1]; y++)
                for (let z = lo[2]; z <= hi[2]; z++)
                    result.push(`${x}:${y}:${z}`);
        return result;
    };
    return {
        add(anchor: WorldAnchor) { for (const key of keys(anchor.position, anchor.size)) {
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = new Set();
                buckets.set(key, bucket);
            }
            bucket.add(anchor);
        } },
        intersects(anchor: WorldAnchor) {
            const visited = new Set<WorldAnchor>();
            for (const key of keys(anchor.position, anchor.size))
                for (const prior of buckets.get(key) ?? []) {
                    if (visited.has(prior))
                        continue;
                    visited.add(prior);
                    if (anchor.position.every((v, i) => Math.abs(v - prior.position[i]) < (anchor.size[i] + prior.size[i]) / 2 - 1e-6))
                        return true;
                }
            return false;
        },
    };
}
