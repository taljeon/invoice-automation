import { ref, uploadBytes } from 'firebase/storage'
import { doc, onSnapshot, setDoc, serverTimestamp, type Unsubscribe } from 'firebase/firestore'
import { db, storage, requireCloudUser } from '../config/firebase'
import type { LineItem } from '../types'
import { captureDataSession, type DataSession } from '../demo/session'

/** Explicit cloud path: authenticated job → Storage trigger → owner-only subscription. */
export async function processPdfFileAsync(
  pdfFile: File,
  pdfFileName: string,
  onProgress: (message: string) => void,
  userId: string,
  session: DataSession = captureDataSession()
): Promise<LineItem[]> {
  session.assertActive()
  const user = requireCloudUser()
  if (user.uid !== userId || session.uid !== userId) throw new Error('認証ユーザーとジョブ所有者が一致しません。')
  if (!/\.pdf$/i.test(pdfFileName) || pdfFile.size === 0 || pdfFile.size > 20 * 1024 * 1024) {
    throw new Error('空でない20MiB以下のPDFを選択してください。')
  }
  const jobId = crypto.randomUUID()
  const safeName = 'invoice.pdf' // A job-specific directory carries uniqueness; never put personal names in object paths.
  const storagePath = `uploads/${jobId}/${safeName}`
  const jobRef = doc(db, 'ocr_jobs', jobId)
  // Create before subscribing: owner-only rules need an existing job to authorize read.
  await setDoc(jobRef, {
    status: 'pending', fileName: safeName, storagePath, userId, createdAt: serverTimestamp(),
  })
  session.assertActive()

  return new Promise((resolve, reject) => {
    let unsubscribe: Unsubscribe | undefined
    let settled = false
    const finish = (error?: Error, results?: LineItem[]) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      unsubscribe?.()
      if (error) reject(error)
      else resolve(results || [])
    }
    const timeoutId = setTimeout(() => {
      finish(new Error('5分で応答を確認できませんでした。ジョブはサーバーで継続する場合があります。'))
    }, 5 * 60 * 1000)

    unsubscribe = onSnapshot(jobRef, snapshot => {
      try { session.assertActive() } catch (error) { finish(error as Error); return }
      const job = snapshot.data()
      if (!job) return
      if (job.status === 'completed') {
        if (!Array.isArray(job.results)) {
          finish(new Error('OCR結果の形式が不正です。'))
          return
        }
        const results = job.results.map((item: Partial<LineItem>, index: number) => ({
          ...item,
          id: item.id || `${jobId}-${index}`,
          伝票番号: item.伝票番号 || '',
          sourceDocumentId: jobId,
          pdfFileName,
          pdfStoragePath: storagePath,
        })) as LineItem[]
        onProgress('OCR結果を受信しました。内容を確認してください。')
        finish(undefined, results)
      } else if (job.status === 'error') {
        finish(new Error(job.error || 'OCR処理に失敗しました。'))
      } else {
        onProgress(job.status === 'processing' ? 'サーバーでOCR処理中...' : 'サーバー処理を待機中...')
      }
    }, error => finish(error))

    session.assertActive()
    onProgress('PDFをアップロード中...')
    uploadBytes(ref(storage, storagePath), pdfFile, { contentType: 'application/pdf' })
      .catch(error => finish(error))
  })
}

export async function processPDFWithOCRAsync(
  file: File,
  onProgress: (message: string) => void = () => {},
  session: DataSession = captureDataSession()
): Promise<LineItem[]> {
  return processPdfFileAsync(file, file.name, onProgress, requireCloudUser().uid, session)
}
