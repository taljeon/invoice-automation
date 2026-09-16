/** Server PDF rasterization: scale 2 (about 144 dpi), JPEG quality 0.85, max 20 pages. */
import { createCanvas } from '@napi-rs/canvas'
import { MAX_PAGES, MAX_PDF_BYTES } from './security'

export async function pdfPagesToImagesOnServer(fileBuffer: Buffer): Promise<string[]> {
  if (!fileBuffer.length || fileBuffer.length > MAX_PDF_BYTES) throw new Error('Invalid PDF size')
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) })
  try {
    const pdf = await loadingTask.promise
    // Reject the whole document rather than silently losing pages after page 20.
    if (!pdf.numPages || pdf.numPages > MAX_PAGES) throw new Error('PDF must contain 1–20 pages')
    const images: string[] = []
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index)
      const viewport = page.getViewport({ scale: 2 })
      if (viewport.width * viewport.height > 20_000_000) throw new Error('PDF page dimensions exceed the rendering limit')
      const canvas = createCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d')
      await page.render({ canvas: canvas as any, canvasContext: context as any, viewport }).promise
      images.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
      page.cleanup()
    }
    return images
  } finally {
    await loadingTask.destroy()
  }
}
