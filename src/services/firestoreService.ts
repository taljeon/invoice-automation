import { collection, getDocs, doc, updateDoc, deleteDoc, Timestamp, setDoc } from 'firebase/firestore'
import { db, IS_DEMO_MODE } from '../config/firebase'
import { captureDataSession, type DataSession } from '../demo/session'
import { demoStore } from '../demo/store'
import type { LineItem } from '../types'

type NewLineItem = Omit<LineItem, 'id'> & { id?: string }

function ownedCollection(session: DataSession) {
  session.assertActive()
  if (!session.uid) throw new Error('ログインが必要です。')
  return collection(db, 'users', session.uid, 'lineItems')
}

// File objects remain in the current browser session, never in Firestore.
function serializableFields(item: Partial<LineItem>): Record<string, unknown> {
  const { id: _id, pdfFile: _file, ...fields } = item
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}

export async function saveLineItemToFirestore(item: NewLineItem, session = captureDataSession()): Promise<string> {
  const id = item.id || crypto.randomUUID()
  const savedItem = { ...item, id, createdAt: item.createdAt || Timestamp.now() }
  if (IS_DEMO_MODE) {
    demoStore.save(savedItem)
  } else {
    await setDoc(doc(ownedCollection(session), id), {
      ...serializableFields(savedItem), updatedAt: Timestamp.now(),
    })
  }
  session.assertActive()
  return id
}

export async function getLineItemsFromFirestore(session = captureDataSession()): Promise<LineItem[]> {
  if (IS_DEMO_MODE) return demoStore.list()
  const snapshot = await getDocs(ownedCollection(session))
  session.assertActive()
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as LineItem)
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
}

export async function updateLineItemInFirestore(id: string, updates: Partial<LineItem>, session = captureDataSession()): Promise<void> {
  if (IS_DEMO_MODE) {
    demoStore.update(id, updates)
    return
  }
  await updateDoc(doc(ownedCollection(session), id), {
    ...serializableFields(updates), updatedAt: Timestamp.now(),
  })
  session.assertActive()
}

export async function deleteLineItemFromFirestore(id: string, session = captureDataSession()): Promise<void> {
  if (IS_DEMO_MODE) {
    demoStore.delete(id)
    return
  }
  await deleteDoc(doc(ownedCollection(session), id))
  session.assertActive()
}

// Retention is operator-controlled. Saving never automatically deletes older rows.
export async function saveLineItemsToFirestore(items: NewLineItem[], session = captureDataSession()): Promise<string[]> {
  const ids: string[] = []
  for (const item of items) ids.push(await saveLineItemToFirestore(item, session))
  session.assertActive()
  return ids
}

/** Persist only additions, actual changes and explicit removals from an edited table. */
export async function persistLineItemChanges(previous: LineItem[], next: LineItem[], session = captureDataSession()): Promise<LineItem[]> {
  const before = new Map(previous.map(item => [item.id, item]))
  const afterIds = new Set(next.map(item => item.id))
  const saved: LineItem[] = []
  for (const item of next) {
    const existing = before.get(item.id)
    if (!existing) {
      saved.push({ ...item, id: await saveLineItemToFirestore(item, session) })
    } else {
      const changed = Object.entries(item).some(([key, value]) =>
        key !== 'pdfFile' && key !== 'createdAt' && value !== existing[key as keyof LineItem])
      if (changed) await updateLineItemInFirestore(item.id, item, session)
      saved.push(item)
    }
  }
  for (const item of previous) {
    if (!afterIds.has(item.id)) await deleteLineItemFromFirestore(item.id, session)
  }
  session.assertActive()
  return saved
}
