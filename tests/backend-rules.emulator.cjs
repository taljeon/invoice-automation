/** Run only under `firebase emulators:exec --only firestore,storage --project demo-invoice-public ...`. */
const assert = require('node:assert/strict')
const { initializeApp, deleteApp } = require('firebase/app')
const { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, updateDoc, serverTimestamp, terminate, setLogLevel } = require('firebase/firestore')
const { getStorage, connectStorageEmulator, ref, uploadBytes, getMetadata } = require('firebase/storage')

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error('This synthetic rules check requires both local emulators')
}
const [dbHost, dbPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
const [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':')
setLogLevel('silent')
const sessions = []
function session(uid) {
  const app = initializeApp({ projectId: 'demo-invoice-public', storageBucket: 'demo-invoice-public.appspot.com', apiKey: 'demo-only' }, uid || 'anonymous')
  const db = getFirestore(app)
  const storage = getStorage(app)
  const options = uid ? { mockUserToken: { sub: uid } } : {}
  connectFirestoreEmulator(db, dbHost, Number(dbPort), options)
  connectStorageEmulator(storage, storageHost, Number(storagePort), options)
  sessions.push({ app, db })
  return { db, storage }
}
async function main() {
  const alice = session('alice')
  const bob = session('bob')
  const anonymous = session(null)
  const path = 'uploads/job-123/invoice.pdf'
  const pending = { status: 'pending', userId: 'alice', storagePath: path, fileName: 'invoice.pdf', createdAt: serverTimestamp() }
  await assert.rejects(setDoc(doc(anonymous.db, 'ocr_jobs/job-123'), pending), /permission/i)
  await assert.rejects(setDoc(doc(bob.db, 'ocr_jobs/job-123'), pending), /permission/i)
  await assert.rejects(setDoc(doc(alice.db, 'ocr_jobs/job-bad'), { ...pending, status: 'completed' }), /permission/i)
  await assert.rejects(setDoc(doc(alice.db, 'ocr_jobs/job-extra'), { ...pending, results: [] }), /permission/i)
  await setDoc(doc(alice.db, 'ocr_jobs/job-123'), pending)
  assert.equal((await getDoc(doc(alice.db, 'ocr_jobs/job-123'))).data().userId, 'alice')
  await assert.rejects(getDoc(doc(bob.db, 'ocr_jobs/job-123')), /permission/i)
  await assert.rejects(updateDoc(doc(alice.db, 'ocr_jobs/job-123'), { status: 'completed' }), /permission/i)
  await setDoc(doc(alice.db, 'users/alice/lineItems/row-1'), { 商品名: 'Synthetic item' })
  await assert.rejects(getDoc(doc(bob.db, 'users/alice/lineItems/row-1')), /permission/i)
  await assert.rejects(setDoc(doc(bob.db, 'users/alice/lineItems/row-1'), { 商品名: 'forbidden' }), /permission/i)
  const syntheticPdf = new Uint8Array(Buffer.from('%PDF-1.4\n% synthetic test only\n'))
  await assert.rejects(uploadBytes(ref(bob.storage, path), syntheticPdf, { contentType: 'application/pdf' }), /permission|unauthorized/i)
  await assert.rejects(uploadBytes(ref(alice.storage, path), syntheticPdf, { contentType: 'text/plain' }), /permission|unauthorized/i)
  await uploadBytes(ref(alice.storage, path), syntheticPdf, { contentType: 'application/pdf' })
  assert.equal((await getMetadata(ref(alice.storage, path))).contentType, 'application/pdf')
  await assert.rejects(getMetadata(ref(bob.storage, path)), /permission|unauthorized/i)
  await assert.rejects(uploadBytes(ref(alice.storage, path), syntheticPdf, { contentType: 'application/pdf' }), /permission|unauthorized/i)
  await assert.rejects(uploadBytes(ref(alice.storage, 'uploads/job-123/other.pdf'), syntheticPdf, { contentType: 'application/pdf' }), /permission|unauthorized/i)
  await assert.rejects(uploadBytes(ref(anonymous.storage, 'invoices/alice/file.pdf'), syntheticPdf, { contentType: 'application/pdf' }), /permission|unauthorized/i)
  await uploadBytes(ref(alice.storage, 'invoices/alice/file.pdf'), syntheticPdf, { contentType: 'application/pdf' })
  await assert.rejects(getMetadata(ref(bob.storage, 'invoices/alice/file.pdf')), /permission|unauthorized/i)
  console.log('PASS: synthetic Firestore and Storage owner/immutable-job/PDF rules checks')
}
main().catch(error => { console.error(error.stack); process.exitCode = 1 }).finally(async () => {
  for (const { app, db } of sessions) { await terminate(db); await deleteApp(app) }
})
