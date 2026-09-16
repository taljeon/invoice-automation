import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LineItem } from '../src/types'

const state = vi.hoisted(() => ({
  currentUser: { uid: 'synthetic-owner-a' } as { uid: string } | null,
  writes: [] as string[],
  switchOnWrite: false,
  switchOnRead: false,
}))
vi.mock('../src/config/firebase', () => ({
  IS_DEMO_MODE: false, db: {},
  requireCloudUser: () => {
    if (!state.currentUser) throw new Error('Authentication required')
    return state.currentUser
  },
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  doc: (path: string, id: string) => `${path}/${id}`,
  Timestamp: { now: () => ({ toMillis: () => 1 }) },
  setDoc: async (path: string) => {
    state.writes.push(path)
    if (state.switchOnWrite) state.currentUser = { uid: 'synthetic-owner-b' }
  },
  updateDoc: async (path: string) => { state.writes.push(path) },
  deleteDoc: async (path: string) => { state.writes.push(path) },
  getDocs: async () => {
    if (state.switchOnRead) state.currentUser = { uid: 'synthetic-owner-b' }
    return { docs: [{ id: 'owner-a-row', data: () => ({ 商品名: '架空明細' }) }] }
  },
}))
import { captureDataSession } from '../src/demo/session'
import { getLineItemsFromFirestore, saveLineItemsToFirestore, deleteLineItemFromFirestore } from '../src/services/firestoreService'

const row: LineItem = {
  id: 'row-1', 仕入日: '2026-01-01', 伝票番号: 'DEMO-001', 仕入先コード: '201', 仕入先名: 'サンプル部品株式会社',
  商品コード: 'D1', 商品名: '架空部品', 数量: 1, 単価: 100, 金額: 100, 課税区分: '課税10.0%',
}

beforeEach(() => {
  state.currentUser = { uid: 'synthetic-owner-a' }
  state.writes.length = 0
  state.switchOnWrite = false
  state.switchOnRead = false
})

describe('immutable operation owner across account transitions', () => {
  it('aborts a multi-row save after switching users and never writes into the next account', async () => {
    state.switchOnWrite = true
    await expect(saveLineItemsToFirestore([row, { ...row, id: 'row-2' }])).rejects.toThrow('認証状態')
    expect(state.writes).toEqual(['users/synthetic-owner-a/lineItems/row-1'])
  })

  it('discards an old account read result when auth changes during the request', async () => {
    state.switchOnRead = true
    await expect(getLineItemsFromFirestore()).rejects.toThrow('認証状態')
  })

  it('rejects an old operation before deletion when a new sign-in even has the same UID', async () => {
    const session = captureDataSession()
    state.currentUser = { uid: 'synthetic-owner-a' }
    await expect(deleteLineItemFromFirestore('row-1', session)).rejects.toThrow('認証状態')
    expect(state.writes).toEqual([])
  })

  it('retains one owner for every row when the auth session stays unchanged', async () => {
    await saveLineItemsToFirestore([row, { ...row, id: 'row-2' }])
    expect(state.writes).toEqual(['users/synthetic-owner-a/lineItems/row-1', 'users/synthetic-owner-a/lineItems/row-2'])
  })
})
