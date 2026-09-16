import type { LineItem } from '../types'

// Deliberately memory-only: reloading closes the demo session and discards edits.
const items = new Map<string, LineItem>()
export const demoStore = {
  list(): LineItem[] {
    return [...items.values()].map(item => ({ ...item }))
  },
  save(item: LineItem): void {
    items.set(item.id, { ...item })
  },
  update(id: string, updates: Partial<LineItem>): void {
    const item = items.get(id)
    if (!item) throw new Error('更新対象の明細が見つかりません。')
    items.set(id, { ...item, ...updates, id })
  },
  delete(id: string): void {
    items.delete(id)
  },
}
