import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist'

interface PDFViewerProps { file: File }

/** Local canvas preview; no browser PDF plugin, upload, or external viewer is required. */
function PDFViewer({ file }: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | undefined
    setDocument(null); setPage(1); setError('')
    void (async () => {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      if (cancelled) return
      loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
      const loaded = await loadingTask.promise
      if (cancelled) { await loadingTask.destroy(); return }
      setDocument(loaded)
    })().catch(() => { if (!cancelled) setError('PDFを表示できません。PDF形式とファイル内容を確認してください。') })
    return () => { cancelled = true; if (loadingTask) void loadingTask.destroy() }
  }, [file])

  useEffect(() => {
    let cancelled = false
    let renderTask: { cancel(): void } | undefined
    if (!document || !canvasRef.current) return
    const canvas = canvasRef.current
    void document.getPage(page).then(pdfPage => {
      if (cancelled) return
      const initial = pdfPage.getViewport({ scale: 1 })
      const viewport = pdfPage.getViewport({ scale: Math.min(1.5, 1200 / Math.max(initial.width, initial.height)) })
      canvas.width = viewport.width; canvas.height = viewport.height
      const task = pdfPage.render({ canvas, viewport })
      renderTask = task
      return task.promise
    }).catch(error => {
      if (!cancelled && error?.name !== 'RenderingCancelledException') setError('PDFページを描画できません。')
    })
    return () => { cancelled = true; renderTask?.cancel() }
  }, [document, page])

  return <div style={{ width: '100%', minHeight: 400 }}>
    {error ? <p role="alert">{error}</p> : <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button disabled={!document || page <= 1} onClick={() => setPage(value => value - 1)}>前のページ</button>
        <span>{document ? `${page} / ${document.numPages} ページ` : 'PDF読み込み中...'}</span>
        <button disabled={!document || page >= document.numPages} onClick={() => setPage(value => value + 1)}>次のページ</button>
      </div>
      <canvas ref={canvasRef} role="img" aria-label={`${file.name} のPDFプレビュー、${page}ページ目`} style={{ display: 'block', maxWidth: '100%', height: 'auto', border: '1px solid #ddd', background: 'white' }} />
    </>}
  </div>
}
export default PDFViewer
