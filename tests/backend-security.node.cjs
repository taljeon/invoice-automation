const test = require('node:test')
const assert = require('node:assert/strict')
const {
  authenticateBearer, parseUploadPath, ownsLegacyPath, ownsJobPath,
  canClaimJob, validatePageImages
} = require('../functions/lib/services/security.js')

const path = 'uploads/job-123/invoice.pdf'
const job = { userId: 'alice', status: 'pending', storagePath: path, fileName: 'invoice.pdf' }

test('authentication rejects absent, invalid and expired credentials', async () => {
  for (const header of [undefined, '', 'Basic token', 'Bearer ', 'Bearer token extra']) {
    await assert.rejects(authenticateBearer(header, async () => ({ uid: 'alice' })), { status: 401 })
  }
  await assert.rejects(authenticateBearer('Bearer expired', async () => { throw new Error('expired') }), { status: 401 })
  assert.equal(await authenticateBearer('Bearer valid-token', async token => {
    assert.equal(token, 'valid-token'); return { uid: 'alice' }
  }), 'alice')
})

test('PDF paths reject traversal, nested paths, URL input and non-PDF files', () => {
  assert.deepEqual(parseUploadPath(path), { jobId: 'job-123', fileName: 'invoice.pdf' })
  for (const value of [null, 123, 'uploads/job/../invoice.pdf', 'uploads/job/invoice..pdf',
    'uploads/job/sub/invoice.pdf', 'uploads/job/invoice.exe', 'https://example.test/invoice.pdf']) {
    assert.equal(parseUploadPath(value), null)
  }
})

test('job and legacy objects cannot be read across owners or substituted paths', () => {
  assert.equal(ownsJobPath(job, 'alice', path), true)
  assert.equal(ownsJobPath(job, 'bob', path), false)
  assert.equal(ownsJobPath(job, 'alice', 'uploads/job-123/other.pdf'), false)
  assert.equal(ownsJobPath({ ...job, fileName: 'other.pdf' }, 'alice', path), false)
  assert.equal(ownsLegacyPath('invoices/alice/invoice.pdf', 'alice'), true)
  assert.equal(ownsLegacyPath('invoices/alice/invoice.pdf', 'bob'), false)
  assert.equal(ownsLegacyPath('invoices/alice/../invoice.pdf', 'alice'), false)
})

test('only an owned, matching pending job can be claimed', () => {
  assert.equal(canClaimJob(job, path), true)
  for (const status of ['processing', 'completed', 'error']) {
    assert.equal(canClaimJob({ ...job, status }, path), false)
  }
  assert.equal(canClaimJob({ ...job, userId: null }, path), false)
  assert.equal(canClaimJob({ ...job, storagePath: 'uploads/other/invoice.pdf' }, path), false)
  assert.equal(canClaimJob(undefined, path), false)
})

test('legacy OCR requests have page and payload bounds', () => {
  assert.equal(validatePageImages(['abc']), true)
  assert.equal(validatePageImages([]), false)
  assert.equal(validatePageImages([123]), false)
  assert.equal(validatePageImages(new Array(21).fill('abc')), false)
  assert.equal(validatePageImages(['a'.repeat(8 * 1024 * 1024 + 1)]), false)
  assert.equal(validatePageImages(new Array(4).fill('a'.repeat(8 * 1024 * 1024))), false)
})
