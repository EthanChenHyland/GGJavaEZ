// Pass 5 real-JVM scale workloads and native picking for the lifecycle soak.
import { type Page } from '@playwright/test'
import { ready, selectEntity } from '../e2e/reference/harness'

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Selection inspector', exact: true })
async function closeInspector(page: Page) {
  if (await inspector(page).isVisible()) {
    await inspector(page).getByRole('button', { name: 'Close inspector', exact: true }).click()
    await ready(page)
  }
}


const ARRAY_LENGTH = 100_003
const ARRAY_INDEX = 99_991
const arraySource = `public class Main {
  public static void main(String[] args) {
    int[] values = new int[${ARRAY_LENGTH}];
    values[${ARRAY_INDEX}] = 17;
    int before = values[${ARRAY_INDEX}];
    int replacement = 29;
    values[${ARRAY_INDEX}] = replacement;
    int after = values[${ARRAY_INDEX}];
    System.out.println(before + ":" + after);
  }
}
`

const COLLECTION_SIZE = 64
const collectionSource = `import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.TreeMap;
import java.util.TreeSet;

public class Main {
  public static void main(String[] args) {
    var list = new ArrayList<Integer>();
    var set = new TreeSet<Integer>();
    var map = new TreeMap<Integer, Integer>();
    var deque = new ArrayDeque<Integer>();
    for (int i = 0; i < ${COLLECTION_SIZE}; i++) {
      list.add(i);
      set.add(${COLLECTION_SIZE} - 1 - i);
      map.put(i, i + 40);
      deque.addLast(${COLLECTION_SIZE} - 1 - i);
    }
    checkpoint(list, set, map, deque);
    System.out.println(list.size() + ":" + set.size() + ":" + map.size() + ":" + deque.size());
  }

  static void checkpoint(ArrayList<Integer> list, TreeSet<Integer> set,
      TreeMap<Integer, Integer> map, ArrayDeque<Integer> deque) {
    if (list.isEmpty() || set.isEmpty() || map.isEmpty() || deque.isEmpty()) {
      throw new IllegalStateException("Missing collection data");
    }
  }
}
`
const collectionKinds = ['List', 'Set', 'Map', 'Deque'] as const

const DENSE_OBJECTS = 96
const denseExceptionSource = `public class Main {
  static Entry root;

  public static void main(String[] args) {
    for (int i = 0; i < ${DENSE_OBJECTS}; i++) {
      root = new Entry(i, root);
    }
    try {
      dispatch("recoverable validation");
    } catch (IllegalArgumentException failure) {
      System.out.println("Recovered " + root.id + ": " + failure.getMessage());
    }
    dispatch("terminal validation");
  }

  static void dispatch(String message) {
    validate(message);
  }

  static void validate(String message) {
    throw new IllegalArgumentException(message);
  }
}

class Entry {
  final int id;
  final Entry previous;

  Entry(int id, Entry previous) {
    this.id = id;
    this.previous = previous;
  }
}
`

const inputValue = '  007  '
const makeLines = (prefix: string, count: number) => Array.from({ length: count }, (_, index) =>
  `${prefix} ${String(index).padStart(2, '0')}  ${'text-0123456789-'.repeat(index === count - 1 ? 70 : 15)} ${prefix}-end  \n`)
const stdoutRows = ['Ready\n', 'Consumed [7]\n', ...makeLines('OUT', 10)]
const stderrRows = makeLines('ERR', 8)
const ioSource = [
  'import java.util.Scanner;',
  'public class Main {',
  '  public static void main(String[] args) {',
  '    Scanner scanner = new Scanner(System.in);',
  '    System.out.println("Ready");',
  '    int value = scanner.nextInt();',
  '    System.out.println("Consumed [" + value + "]");',
  ...stdoutRows.slice(2).flatMap((row, index) => [
    `    System.out.print(${JSON.stringify(row)});`,
    ...(index < stderrRows.length ? [`    System.err.print(${JSON.stringify(stderrRows[index])});`] : []),
  ]),
  '  }',
  '}',
].join('\n')

async function selectBody(page: Page, id: string) {
  await closeInspector(page)
  const option = page.getByRole('listbox', { name: 'Runtime entities', exact: true })
    .locator(`[id="world-entity-${encodeURIComponent(id)}"]`)
  for (let step = 0; step < 16; step++) {
    const view = await page.evaluate(id => {
      const world = window.__ggjavaezWorld!, qa = window.__ggjavaezQA!, node = world.scene().entities[id]
      const cluster = world.plan().clusters.find(item => item.memberIds.includes(id))
      const body = world.worldProjection().entities.find(body => body.id === (cluster?.id ?? id))
      const face = body?.face, safe = qa.shellRects().safeFrame
      if (!face?.visible) return { node, cluster, point: null }
      const left = Math.max(face.x, safe.x), right = Math.min(face.x + face.width, safe.x + safe.width)
      const top = Math.max(face.y, safe.y), bottom = Math.min(face.y + face.height, safe.y + safe.height)
      return { node, cluster, point: right - left >= 14 && bottom - top >= 14 ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null }
    }, id)
    if (view.cluster && view.point) {
      const node = view.node
      if (node.kind !== 'array' && node.kind !== 'collection') throw new Error('Unexpected target kind')
      await pickCluster(page, id)
      await inspector(page).getByRole('list', { name: 'Cluster members', exact: true })
        .getByRole('button', { name: `Select ${node.title} #${node.displayId}`, exact: true }).click()
      await ready(page)
    } else if (await option.count()) {
      await selectEntity(page, id)
    } else if (view.point) {
      // A cropped face can be raycast even when its center is outside the
      // accessible catalog. The point comes from the real projected face.
      await page.mouse.click(view.point.x, view.point.y)
      await ready(page)
    }
    if (await page.evaluate(id => {
      const selected = window.__ggjavaezQA!.selection()
      return selected?.kind === 'object' && selected.id === id
    }, id)) return
    await closeInspector(page)
    await page.locator('.world-canvas').focus()
    await page.keyboard.press('-')
    await ready(page)
  }
  throw new Error(`Could not reach recorded body ${id} by native picking or zoom`)
}

// Only use the public rendered projection to choose coordinates. The selection
// must be committed by a real raycast, including on the production build.
async function pickCluster(page: Page, memberId?: string) {
  const candidates = await page.evaluate(target => {
    const world = window.__ggjavaezWorld!, qa = window.__ggjavaezQA!
    const safe = qa.shellRects().safeFrame
    const projection = world.worldProjection().entities
    return world.plan().clusters.flatMap(cluster => {
      if (target && !cluster.memberIds.includes(target)) return []
      const face = projection.find(body => body.id === cluster.id)?.face
      if (!face?.visible) return []
      const left = Math.max(face.x, safe.x), top = Math.max(face.y, safe.y)
      const right = Math.min(face.x + face.width, safe.x + safe.width)
      const bottom = Math.min(face.y + face.height, safe.y + safe.height)
      if (right - left < 6 || bottom - top < 6) return []
      return [{ id: cluster.id, left, right, top, bottom }]
    })
  }, memberId)
  for (const { id, left, right, top, bottom } of candidates) {
    for (const [u, v] of [[.5, .5], [.25, .5], [.75, .5], [.5, .25], [.5, .75]]) {
      const point = { x: left + (right - left) * u, y: top + (bottom - top) * v }
      const reachable = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.world-canvas'), point)
      if (!reachable) continue
      await page.mouse.click(point.x, point.y)
      await ready(page)
      const selected = await page.evaluate(() => window.__ggjavaezQA!.selection())
      if (selected?.kind === 'cluster' && selected.id === id) return id
      await closeInspector(page)
    }
  }
  throw new Error('No cluster hit among ' + candidates.length + ' projected candidates')
}

export { pickCluster, ARRAY_LENGTH, ARRAY_INDEX, COLLECTION_SIZE, DENSE_OBJECTS, arraySource, collectionSource, collectionKinds, denseExceptionSource, ioSource, inputValue, stdoutRows, stderrRows, selectBody, closeInspector }
