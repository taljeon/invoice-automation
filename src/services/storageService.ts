import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage, requireCloudUser } from '../config/firebase'

/** Legacy direct upload. The active OCR path uses uploads/{jobId}/{filename}. */
export async function uploadPDFToStorage(file: File, fileName: string): Promise<string> {
  const user = requireCloudUser()
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `invoices/${user.uid}/${crypto.randomUUID()}_${safeName}`
  const snapshot = await uploadBytes(ref(storage, storagePath), file, { contentType: 'application/pdf' })
  return getDownloadURL(snapshot.ref)
}

export async function deletePDFFromStorage(filePath: string): Promise<void> {
  requireCloudUser()
  await deleteObject(ref(storage, filePath))
}

export function extractFilePathFromURL(downloadURL: string): string | null {
  try {
    const pathMatch = new URL(downloadURL).pathname.match(/\/o\/(.+)$/)
    return pathMatch ? decodeURIComponent(pathMatch[1]) : null
  } catch {
    return null
  }
}
