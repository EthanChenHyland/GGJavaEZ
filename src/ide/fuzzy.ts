/** Case-insensitive subsequence matching, with contiguous and word-boundary bonuses. */
export function fuzzyScore(query: string, text: string): number | null {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return 0
  const lower = text.toLowerCase()
  let total = 0
  for (const term of terms) {
    let cursor = 0, previous = -2, score = 0
    for (const character of term) {
      const index = lower.indexOf(character, cursor)
      if (index < 0) return null
      const boundary = index === 0 || /[\s/_.\-:]/.test(text[index - 1]) || text[index] !== lower[index] && text[index - 1] === lower[index - 1]
      score += 10 + (boundary ? 12 : 0) + (index === previous + 1 ? 14 : 0) - (index - cursor) * .4
      previous = index; cursor = index + 1
    }
    if (lower === term) score += 80
    else if (lower.startsWith(term)) score += 30
    total += score
  }
  return total - text.length * .025
}
export interface SearchableItem { id: string; label: string; detail?: string; keywords?: string }
export function rankPickerItems<T extends SearchableItem>(items: readonly T[], query: string): T[] {
  return items.flatMap((item, index) => {
    const label = fuzzyScore(query, item.label)
    const all = fuzzyScore(query, `${item.label} ${item.detail ?? ''} ${item.keywords ?? ''}`)
    if (label === null && all === null) return []
    return [{ item, index, score: Math.max(label === null ? -Infinity : label + (query.trim() ? 20 : 0), all ?? -Infinity) }]
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(({ item }) => item)
}
