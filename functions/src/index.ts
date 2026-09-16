import * as functions from 'firebase-functions/v1'
import { initializeApp, getApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { ImageAnnotatorClient } from '@google-cloud/vision'
import { defineSecret } from 'firebase-functions/params'
import { Storage } from '@google-cloud/storage'
import { pdfPagesToImagesOnServer } from './services/pdfProcessor'
import { structureInvoiceData } from './services/gptService'
import { findBestCompanyMatchOnServer, matchShipName } from './services/matchingService'
import { convertToLineItems } from './services/lineItemConverter'
import {
  authenticateBearer, canClaimJob, MAX_PDF_BYTES, ownsJobPath,
  ownsLegacyPath, parseUploadPath, RequestError, validatePageImages
} from './services/security'

initializeApp()
const visionClient = new ImageAnnotatorClient()
const storage = new Storage()
const openaiApiKey = defineSecret('OPENAI_API_KEY')
const region = process.env.FUNCTIONS_REGION || 'asia-northeast1'
const cloudEnabled = () => process.env.CLOUD_PROCESSING_ENABLED === 'true'

function bucketName(): string {
  const name = process.env.STORAGE_BUCKET || getApp().options.storageBucket
  if (!name) throw new RequestError(503, 'Storage bucket is not configured')
  return name
}

/** All HTTP routes require an ID token. CORS never replaces authentication. */
async function authorizeRequest(req: functions.https.Request, res: functions.Response): Promise<string | null> {
  const origin = req.get('Origin')
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  if (origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: 'Origin is not configured' })
    return null
  }
  if (origin) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin') }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') { res.status(204).send(''); return null }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return null }
  if (!cloudEnabled()) { res.status(503).json({ error: 'Cloud processing is disabled' }); return null }
  return authenticateBearer(req.get('Authorization'), token => getAuth().verifyIdToken(token, true))
}

function respondError(res: functions.Response, error: unknown, operation: string): void {
  // Never log provider response bodies, OCR text, supplier names or file paths.
  functions.logger.error(`${operation} failed`, { category: error instanceof RequestError ? 'request' : 'internal' })
  res.status(error instanceof RequestError ? error.status : 500).json({
    error: error instanceof RequestError ? error.message : `${operation} failed`
  })
}

/** Owner-only, short-lived PDF URL. Stored documents retain paths, never public URLs. */
export const generateSignedUrl = functions.region(region).https.onRequest(async (req, res) => {
  try {
    const uid = await authorizeRequest(req, res)
    if (!uid) return
    const path: unknown = req.body?.filePath
    const parsed = parseUploadPath(path)
    if (typeof path !== 'string' || (!parsed && !ownsLegacyPath(path, uid))) {
      throw new RequestError(403, 'Object access denied')
    }
    if (parsed) {
      const job = await getFirestore().collection('ocr_jobs').doc(parsed.jobId).get()
      if (!ownsJobPath(job.data(), uid, path)) throw new RequestError(403, 'Object access denied')
    }
    const file = storage.bucket(bucketName()).file(path)
    const [exists] = await file.exists()
    if (!exists) throw new RequestError(404, 'File not found')
    const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 15 * 60 * 1000 })
    res.json({ signedUrl })
  } catch (error) { respondError(res, error, 'Signed URL creation') }
})

async function extractTextWithVisionAPI(base64Image: string): Promise<string> {
  const cleanBase64 = base64Image.replace(/^data:image\/[^;]+;base64,/, '').replace(/\s/g, '')
  if (!cleanBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleanBase64)) throw new Error('Invalid image data')
  const [result] = await visionClient.documentTextDetection({
    image: { content: cleanBase64 }, imageContext: { languageHints: ['ja', 'en'] }
  })
  if (result.error?.message) throw new Error('Vision provider rejected image')
  return result.fullTextAnnotation?.text || ''
}

/** Retained legacy endpoint: browser renders PDF pages, server OCRs and structures them. */
export const processOCRHttp = functions.region(region).runWith({
  timeoutSeconds: 300, memory: '8GB', secrets: [openaiApiKey]
}).https.onRequest(async (req, res) => {
  try {
    if (!await authorizeRequest(req, res)) return
    const { pageImages, pdfFileName } = req.body || {}
    if (!validatePageImages(pageImages) || typeof pdfFileName !== 'string' || !pdfFileName) {
      throw new RequestError(400, 'Provide 1–20 bounded page images and a PDF filename')
    }
    const apiKey = openaiApiKey.value()
    if (!apiKey) throw new RequestError(503, 'OCR provider is not configured')
    const started = Date.now()
    const texts = []
    for (const page of pageImages) texts.push(await extractTextWithVisionAPI(page))
    const invoice = await structureInvoiceData(texts.join('\n\n--- ページ区切り ---\n\n'), apiKey)
    const ships = invoice.ships.map(ship => ({ ...ship, ship_name: matchShipName(ship.ship_name || undefined) }))
      .filter(ship => ship.ship_name !== null)
    res.json({ success: true, data: { ...invoice, ships }, processingTime: Date.now() - started })
  } catch (error) { respondError(res, error, 'OCR processing') }
})

/** Retained legacy similarity endpoint; matching uses the configured synthetic company master. */
export const processSimilarityHttp = functions.region(region).runWith({
  timeoutSeconds: 60, memory: '2GB'
}).https.onRequest(async (req, res) => {
  try {
    if (!await authorizeRequest(req, res)) return
    const started = Date.now()
    const { supplierName, batchMode = false, supplierList = [] } = req.body || {}
    const validName = (name: unknown): name is string => typeof name === 'string' && name.trim().length > 0 && name.length <= 200
    const match = async (name: string) => {
      const { similarityResult: result } = await findBestCompanyMatchOnServer(name)
      return {
        originalOCR: name, matchedCompany: result.term, similarity: result.score,
        method: result.method, confidence: result.score,
        processingStage: `${result.method}_match`
      }
    }
    if (!batchMode && validName(supplierName)) {
      res.json({ success: true, data: await match(supplierName), processingTime: Date.now() - started, mode: 'single' })
      return
    }
    if (batchMode === true && Array.isArray(supplierList) && supplierList.length > 0 && supplierList.length <= 50 && supplierList.every(validName)) {
      const data = await Promise.all(supplierList.map(async (name: string) => ({ input: name, result: await match(name) })))
      res.json({ success: true, data, processingTime: Date.now() - started, mode: 'batch' })
      return
    }
    throw new RequestError(400, 'Provide a supplierName or a batch of 1–50 supplier names')
  } catch (error) { respondError(res, error, 'Similarity matching') }
})

/** Primary pipeline: owner creates pending job → PDF upload → atomic claim → OCR → result. */
export const processOCROnStorage = functions.region(region).runWith({
  timeoutSeconds: 540, memory: '4GB', secrets: [openaiApiKey]
}).storage.object().onFinalize(async object => {
  if (!cloudEnabled()) return
  const filePath = object.name
  const parsed = parseUploadPath(filePath)
  if (!parsed || !filePath || object.bucket !== bucketName()) return
  const size = Number(object.size)
  if (object.contentType !== 'application/pdf' || !Number.isFinite(size) || size <= 0 || size > MAX_PDF_BYTES) return
  const db = getFirestore()
  const jobRef = db.collection('ocr_jobs').doc(parsed.jobId)
  let claimed = false
  try {
    // Transaction means at-least-once finalize delivery cannot repeat paid provider calls.
    claimed = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(jobRef)
      if (!canClaimJob(snapshot.data(), filePath)) return false
      transaction.update(jobRef, {
        status: 'processing', message: 'PDFをダウンロード中...',
        objectGeneration: object.generation || null,
        updatedAt: FieldValue.serverTimestamp()
      })
      return true
    })
    if (!claimed) return
    const progress = (message: string) => jobRef.update({ message, updatedAt: FieldValue.serverTimestamp() })
    const file = storage.bucket(object.bucket).file(filePath, { generation: object.generation })
    const [buffer] = await file.download()
    await progress('PDFを画像に変換中...')
    const images = await pdfPagesToImagesOnServer(buffer)
    await progress(`${images.length}ページのOCR処理中...`)
    const texts = await Promise.all(images.map(extractTextWithVisionAPI))
    await progress('GPTでデータ構造化中...')
    const apiKey = openaiApiKey.value()
    if (!apiKey) throw new Error('OCR provider not configured')
    const invoice = await structureInvoiceData(texts.join('\n\n--- ページ区切り ---\n\n'), apiKey)
    await progress('仕入先名マッチング中...')
    const { finalSupplierName } = await findBestCompanyMatchOnServer(invoice.仕入先名)
    await progress('LineItem変換中...')
    const results = await convertToLineItems(invoice, finalSupplierName, filePath, parsed.jobId)
    await jobRef.update({ status: 'completed', results, message: '処理完了', updatedAt: FieldValue.serverTimestamp() })
  } catch {
    functions.logger.error('Asynchronous OCR failed', { category: 'processing' })
    if (claimed) await jobRef.update({
      status: 'error', error: 'OCR処理に失敗しました。PDFと設定を確認して新しいジョブで再試行してください。',
      updatedAt: FieldValue.serverTimestamp()
    })
  }
})
