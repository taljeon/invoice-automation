import type { LineItem, PDFDocument } from '../types'

/** Stable row ownership prevents a combined table update from copying every row into every PDF. */
export function reconcileDocumentItems(documents: PDFDocument[], updatedItems: LineItem[]): PDFDocument[] {
  const ownerById = new Map(documents.flatMap(document => document.lineItems.map(item => [item.id, document.id] as const)))
  const grouped = new Map(documents.map(document => [document.id, [] as LineItem[]]))
  const ids = new Set<string>()
  for (const item of updatedItems) {
    if (!item.id || ids.has(item.id)) throw new Error('明細IDが空、または重複しています。')
    ids.add(item.id)
    const ownerId = ownerById.get(item.id) || item.sourceDocumentId ||
      documents.find(document => document.file === item.pdfFile)?.id
    const document = documents.find(candidate => candidate.id === ownerId)
    if (!document) throw new Error('明細の元PDFを特定できません。')
    grouped.get(document.id)!.push({
      ...item, sourceDocumentId: document.id, pdfFile: document.file, pdfFileName: document.file.name,
    })
  }
  return documents.map(document => ({ ...document, lineItems: grouped.get(document.id)! }))
}
