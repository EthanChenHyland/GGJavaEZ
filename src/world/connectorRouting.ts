import type { Vec3, WorldAnchor } from '../contracts/world'

export function curvedPath(from: Vec3, to: Vec3, left = false): Vec3[] {
  const reach = Math.max(.6, Math.min(3, Math.abs(to[0] - from[0]) * .35 + Math.abs(to[1] - from[1]) * .1));
  const a: Vec3 = [from[0] + (left ? -reach : reach), from[1], from[2] + .5];
  const b: Vec3 = [to[0] - reach, to[1], to[2] + .5];
  return Array.from({ length: 33 }, (_, i) => {
    const t = i / 32, u = 1 - t;
    return from.map((v, axis) => u ** 3 * v + 3 * u ** 2 * t * a[axis] + 3 * u * t ** 2 * b[axis] + t ** 3 * to[axis]) as unknown as Vec3;
  });
}

/** Short quadratic fillets retain the exterior corridor instead of bowing a
 * cubic spline back through labels. Endpoints stay exact canonical ports. */
export function roundedConnectorPoints(points: readonly Vec3[], radius = .025): Vec3[] {
  const unique = points.filter((point, i) => !i || point.some((value, axis) => value !== points[i - 1][axis]))
  if (unique.length < 3) return [...unique]
  const distance = (a: Vec3, b: Vec3) => Math.hypot(...a.map((value, axis) => value - b[axis]))
  const result: Vec3[] = [unique[0]]
  for (let i = 1; i < unique.length - 1; i++) {
    const prior = unique[i - 1], point = unique[i], next = unique[i + 1]
    const incoming = distance(prior, point), outgoing = distance(point, next), inset = Math.min(radius, incoming / 3, outgoing / 3)
    const a = point.map((value, axis) => value + (prior[axis] - value) * inset / incoming) as unknown as Vec3
    const b = point.map((value, axis) => value + (next[axis] - value) * inset / outgoing) as unknown as Vec3
    result.push(a)
    for (let step = 1; step <= 4; step++) {
      const t = step / 4, u = 1 - t
      result.push(point.map((value, axis) => u * u * a[axis] + 2 * u * t * value + t * t * b[axis]) as unknown as Vec3)
    }
  }
  result.push(unique.at(-1)!)
  return result
}

/** Face clearance admits only the departure and arrival inside their own
 * terminals. A path that returns through an intervening face is rejected. */
export function connectorClearsFaces(points: readonly Vec3[], source: WorldAnchor, target: WorldAnchor, bodies: readonly WorldAnchor[]): boolean {
  return prepareConnectorFaceClearance(bodies)(points,source,target)
}

/** Prepare represented face bounds once for all routes in one presentation cut. */
export function prepareConnectorFaceClearance(bodies:readonly WorldAnchor[]){
  const rectangle = (body: WorldAnchor) => ({ left: body.position[0] - body.size[0] / 2 - .035, right: body.position[0] + body.size[0] / 2 + .035, bottom: body.position[1] - body.size[1] / 2 - .14, top: body.position[1] + body.size[1] / 2 + .14 })
  // Bodies block their real depth. Labels/chips are proud of the front face;
  // extending that caption space behind the back would erase real deck gaps.
  const face=(body:WorldAnchor)=>({id:body.entityId,...rectangle(body),front:body.position[2]+body.size[2]/2+.75,back:body.position[2]-body.size[2]/2})
  const faces=bodies.map(face)
  return (points:readonly Vec3[],source:WorldAnchor,target:WorldAnchor):boolean=>{
  if(points.length<2)return false
  const sourceRect=face(source),targetRect=face(target)
  const inside = (point: Vec3, rect: ReturnType<typeof face>) => point[0] > rect.left && point[0] < rect.right && point[1] > rect.bottom && point[1] < rect.top&&point[2]>=rect.back&&point[2]<=rect.front
  let departure = 1, arrival = points.length - 1
  while (departure < points.length - 1 && inside(points[departure], sourceRect)) departure++
  while (arrival > 1 && inside(points[arrival - 1], targetRect)) arrival--
  const bounds=new Float64Array(Math.max(0,points.length-1)*6)
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],offset=(i-1)*6
    bounds[offset]=Math.min(a[0],b[0]);bounds[offset+1]=Math.max(a[0],b[0])
    bounds[offset+2]=Math.min(a[1],b[1]);bounds[offset+3]=Math.max(a[1],b[1])
    bounds[offset+4]=Math.min(a[2],b[2]);bounds[offset+5]=Math.max(a[2],b[2])
  }
  for (const rect of faces) {
    for (let i = 1; i < points.length; i++) {
      const offset=(i-1)*6
      if (rect.front < bounds[offset+4] || rect.back > bounds[offset+5]) continue
      if(bounds[offset]>=rect.right||bounds[offset+1]<=rect.left||bounds[offset+2]>=rect.top||bounds[offset+3]<=rect.bottom)continue
      // Clip the actual segment, not its XY bounding box. A diagonal passing
      // above a corner must not be mistaken for a face crossing.
      const a=points[i-1],b=points[i]
      let enter=0,leave=1
      const lower=[rect.left,rect.bottom,rect.back],upper=[rect.right,rect.top,rect.front]
      for(let axis=0;axis<3&&enter<=leave;axis++){
        const delta=b[axis]-a[axis]
        if(Math.abs(delta)<1e-12){if(a[axis]<lower[axis]||a[axis]>upper[axis])enter=2;continue}
        const first=(lower[axis]-a[axis])/delta,last=(upper[axis]-a[axis])/delta
        enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last))
      }
      if(enter>leave)continue
      const terminal=(point:Vec3,body:WorldAnchor,departing:boolean)=>{
        const side=point[0]>=body.position[0]?1:-1
        if((b[0]-a[0])*side*(departing?1:-1)<-1e-7)return false
        for(const t of[enter,leave]){
          const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t
          if((x-point[0])*side<-1e-7||Math.abs(y-point[1])>.14+1e-7)return false
        }
        return true
      }
      if(rect.id===source.entityId&&i<=departure&&terminal(points[0],source,true))continue
      if(rect.id===target.entityId&&i>=arrival&&terminal(points.at(-1)!,target,false))continue
      return false
    }
  }
  return true
  }
}

/** Connect real ports through exterior side/roof channels. Geometry, IDs and
 * values are untouched; the detour protects information faces from crossings. */
export function surfaceConnectorPoints(from: Vec3, to: Vec3, source: WorldAnchor, target: WorldAnchor, obstacles: readonly WorldAnchor[] = []): Vec3[] {
  const outward = (point: Vec3, anchor: WorldAnchor) => {
    const side = point[0] >= anchor.position[0] ? 1 : -1
    // Array cells have only 0.16 units between them. A half-unit exit would
    // cross the neighboring information face before reaching a roof channel.
    const clearance = obstacles.length && anchor.size[0] < 2 ? 0.07 : 0.5
    return anchor.position[0] + side * (anchor.size[0] / 2 + clearance)
  }
  const exitX = outward(from, source), entryX = outward(to, target)
  const roof = Math.max(source.position[1] + source.size[1] / 2, target.position[1] + target.size[1] / 2) + 0.65
  const front = Math.max(from[2], to[2]) + 0.08
  if (obstacles.length) {
    const route = faceClearPath([exitX, from[1], front], [entryX, to[1], front], obstacles, roof, Math.min(from[2], to[2]))
    if (route) return [from, [exitX, from[1], from[2]], ...route, [entryX, to[1], to[2]], to]
  }
  return [from, [exitX, from[1], from[2]], [exitX, roof, front],
    [entryX, roof, front], [entryX, to[1], to[2]], to]
}

/** Bounded orthogonal visibility grid around actual represented bodies. The
 * front corridor includes proud faces/captions, not empty array envelopes.
 * This is presentation routing; it never reserves or moves a runtime anchor. */
function faceClearPath(start: Vec3, end: Vec3, bodies: readonly WorldAnchor[], roof: number, minimumZ: number): Vec3[] | null {
  const rects = bodies.filter(body => body.position[2] + body.size[2] / 2 + 0.75 >= minimumZ
    && body.position[2] - body.size[2] / 2 <= start[2])
    .map(body => ({ left: body.position[0] - body.size[0] / 2 - 0.035, right: body.position[0] + body.size[0] / 2 + 0.035,
      bottom: body.position[1] - body.size[1] / 2 - 0.14, top: body.position[1] + body.size[1] / 2 + 0.14 }))
    .filter(rect => rect.right > Math.min(start[0], end[0]) - 3 && rect.left < Math.max(start[0], end[0]) + 3
      && rect.top > Math.min(start[1], end[1]) - 3 && rect.bottom < Math.max(roof, start[1], end[1]) + 3)
    .sort((a, b) => Math.abs((a.left + a.right) / 2 - start[0]) + Math.abs((a.top + a.bottom) / 2 - start[1])
      - Math.abs((b.left + b.right) / 2 - start[0]) - Math.abs((b.top + b.bottom) / 2 - start[1])).slice(0, 48)
  const xs = [...new Set([start[0], end[0], ...rects.flatMap(rect => [rect.left - 0.025, rect.right + 0.025])])].sort((a, b) => a - b)
  const ys = [...new Set([start[1], end[1], roof, ...rects.flatMap(rect => [rect.bottom - 0.025, rect.top + 0.025])])].sort((a, b) => a - b)
  const index = (x: number, y: number) => y * xs.length + x
  const first = index(xs.indexOf(start[0]), ys.indexOf(start[1])), last = index(xs.indexOf(end[0]), ys.indexOf(end[1]))
  const cost = new Float64Array(xs.length * ys.length).fill(Infinity), previous = new Int32Array(cost.length).fill(-1), closed = new Uint8Array(cost.length)
  const pending: Array<{ id: number; cost: number; score: number }> = []
  const push = (id: number) => {
    const item = { id, cost: cost[id], score: cost[id] + Math.abs(xs[id % xs.length] - end[0]) + Math.abs(ys[Math.floor(id / xs.length)] - end[1]) }
    let index = pending.length; pending.push(item)
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (pending[parent].score <= item.score) break
      pending[index] = pending[parent]; index = parent
    }
    pending[index] = item
  }
  const pop = () => {
    const best = pending[0], tail = pending.pop()!
    if (pending.length) {
      let index = 0
      while (index * 2 + 1 < pending.length) {
        let child = index * 2 + 1
        if (child + 1 < pending.length && pending[child + 1].score < pending[child].score) child++
        if (tail.score <= pending[child].score) break
        pending[index] = pending[child]; index = child
      }
      pending[index] = tail
    }
    return best
  }
  cost[first] = 0; push(first)
  while (pending.length) {
    const best = pop(), current = best.id
    if (closed[current] || best.cost !== cost[current]) continue
    if (current === last) {
      const points: Vec3[] = []
      for (let id = last; id !== -1; id = previous[id]) points.unshift([xs[id % xs.length], ys[Math.floor(id / xs.length)], start[2]])
      return points.filter((point, i) => !i || i === points.length - 1 ||
        (point[0] - points[i - 1][0]) * (points[i + 1][1] - point[1]) !== (point[1] - points[i - 1][1]) * (points[i + 1][0] - point[0]))
    }
    closed[current] = 1
    const x = current % xs.length, y = Math.floor(current / xs.length)
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || nx >= xs.length || ny < 0 || ny >= ys.length) continue
      const next = index(nx, ny)
      if (closed[next]) continue
      const left = Math.min(xs[x], xs[nx]), right = Math.max(xs[x], xs[nx]), bottom = Math.min(ys[y], ys[ny]), top = Math.max(ys[y], ys[ny])
      if (rects.some(rect => left < rect.right && right > rect.left && bottom < rect.top && top > rect.bottom)) continue
      const distance = cost[current] + right - left + top - bottom
      if (distance >= cost[next]) continue
      cost[next] = distance; previous[next] = current; push(next)
    }
  }
  return null
}
