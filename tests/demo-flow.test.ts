import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoDocuments } from '../src/demo/fixtures'
import { reconcileDocumentItems } from '../src/demo/documentState'
import { demoStore } from '../src/demo/store'
import type { LineItem } from '../src/types'

const cloudAccess = vi.hoisted(() => vi.fn(() => { throw new Error('Unexpected cloud access') }))
vi.mock('../src/config/firebase', () => ({ IS_DEMO_MODE: true, db: {}, requireCloudUser: cloudAccess }))
import { getLineItemsFromFirestore, saveLineItemsToFirestore, persistLineItemChanges, deleteLineItemFromFirestore } from '../src/services/firestoreService'
import { processPDFWithOCRAsync } from '../src/services/ocrServiceAsync'

beforeEach(() => {
  for (const item of demoStore.list()) demoStore.delete(item.id)
  cloudAccess.mockClear()
})

describe('offline demo and document lineage', () => {
  it('creates only synthetic PDF assets and explicit unresolved review data', async () => {
    const documents = createDemoDocuments()
    expect(documents).toHaveLength(2)
    expect(documents.flatMap(document => document.lineItems)).toHaveLength(3)
    expect(documents[1].lineItems[0].数量).toBeNull()
    const pdf = await documents[0].file.text()
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('SYNTHETIC INVOICE - DEMO ONLY')
    expect(pdf).toContain('No OCR was performed.')
    expect(new Set(documents.flatMap(document => document.lineItems.map(item => item.id))).size).toBe(3)
  })

  it('retains IDs, edit/add/delete and local File attachments without a cloud call', async () => {
    const original = createDemoDocuments().flatMap(document => document.lineItems)
    const ids = await saveLineItemsToFirestore(original)
    expect(ids).toEqual(original.map(item => item.id))
    const added = { ...original[0], id: crypto.randomUUID(), 商品名: '追加した架空部品' }
    const edited = [{ ...original[0], 商品名: '修正した架空部品' }, original[2], added]
    await persistLineItemChanges(original, edited)
    const saved = await getLineItemsFromFirestore()
    expect(saved.map(item => item.id).sort()).toEqual(edited.map(item => item.id).sort())
    expect(saved.find(item => item.id === original[0].id)?.商品名).toBe('修正した架空部品')
    expect(saved[0].pdfFile).toBe(original[0].pdfFile)
    await deleteLineItemFromFirestore(added.id)
    expect(await getLineItemsFromFirestore()).toHaveLength(2)
    expect(cloudAccess).not.toHaveBeenCalled()
  })

  it('never removes old history merely because more than 100 rows exist', async () => {
    const sample = createDemoDocuments()[0].lineItems[0]
    const items = Array.from({ length: 103 }, (_, index) => ({ ...sample, id: `synthetic-${index}` }))
    await saveLineItemsToFirestore(items)
    expect(await getLineItemsFromFirestore()).toHaveLength(103)
    expect(cloudAccess).not.toHaveBeenCalled()
  })

  it('preserves ownership when the combined table edits, removes and adds rows', () => {
    const documents = createDemoDocuments()
    // Identical filenames must not merge unrelated source documents.
    documents[1].file = new File([], documents[0].file.name)
    const first = documents[0].lineItems[0]
    const second = documents[1].lineItems[0]
    const added = { ...second, id: crypto.randomUUID(), 商品名: '新しい架空部品' }
    const updated = reconcileDocumentItems(documents, [{ ...first, 商品名: '編集済み' }, second, added])
    expect(updated.map(document => document.lineItems.length)).toEqual([1, 2])
    expect(updated[0].lineItems[0].id).toBe(first.id)
    expect(updated[1].lineItems.every(item => item.sourceDocumentId === documents[1].id)).toBe(true)
    expect(updated.flatMap(document => document.lineItems)).toHaveLength(3)
    expect(reconcileDocumentItems(updated, []).every(document => document.lineItems.length === 0)).toBe(true)
  })

  it('rejects duplicate or unowned row IDs instead of duplicating across PDFs', () => {
    const documents = createDemoDocuments()
    const sample = documents[0].lineItems[0]
    expect(() => reconcileDocumentItems(documents, [sample, sample])).toThrow('重複')
    const unowned: LineItem = { ...sample, id: 'unowned', sourceDocumentId: undefined, pdfFile: undefined }
    expect(() => reconcileDocumentItems(documents, [unowned])).toThrow('元PDF')
  })

  it('refuses a direct OCR call while cloud authentication is unavailable', async () => {
    await expect(processPDFWithOCRAsync(new File(['not an invoice'], 'arbitrary.pdf'))).rejects.toThrow('Unexpected cloud access')
  })
})
