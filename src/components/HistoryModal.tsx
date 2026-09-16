import { useState, useEffect } from 'react'
import type { LineItem, PDFDocument } from '../types'
import { getLineItemsFromFirestore, persistLineItemChanges, deleteLineItemFromFirestore } from '../services/firestoreService'
import EditableLineItemsTable from './EditableLineItemsTable'
import PDFViewer from './PDFViewer'
import { IS_DEMO_MODE, requireCloudUser } from '../config/firebase'
import { captureDataSession } from '../demo/session'
import { downloadCSV, generatePurchaseCSV, generateSalesCSV, getExportErrors } from '../utils/csvExport'

interface HistoryModalProps {
  isOpen: boolean
  onClose: () => void
  onItemsChanged?: (deletedDocumentId?: string) => Promise<void>
}

function HistoryModal({ isOpen, onClose, onItemsChanged }: HistoryModalProps) {
  const [historyDocuments, setHistoryDocuments] = useState<PDFDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState('')
  const [pdfViewerFile, setPdfViewerFile] = useState<File | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadHistory()
    }
  }, [isOpen])

  const loadHistory = async () => {
    setIsLoading(true)
    try {
      const lineItems = await getLineItemsFromFirestore()
      const groups = new Map<string, LineItem[]>()
      for (const item of lineItems) {
        const id = item.sourceDocumentId || item.pdfStoragePath || item.id
        groups.set(id, [...(groups.get(id) || []), { ...item, sourceDocumentId: id }])
      }
      setPdfViewerFile(null)
      setHistoryDocuments([...groups].map(([id, items]) => ({
        id,
        file: items[0].pdfFile || new File([], items[0].pdfFileName || 'invoice.pdf', { type: 'application/pdf' }),
        uploadedAt: items[0].createdAt?.toDate?.() || new Date(),
        lineItems: items,
        status: 'completed',
      })))
      setLoadingStatus(IS_DEMO_MODE ? 'このページ内のデモ履歴です。再読み込みで消えます。' : '明細の削除はPDFやOCRジョブを削除しません。保管は管理者が別途管理してください。')
    } catch {
      setLoadingStatus('履歴を読み込めませんでした。接続・認証状態を確認してください。')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLineItemUpdate = async (documentId: string, updatedItems: LineItem[]) => {
    const document = historyDocuments.find(item => item.id === documentId)
    if (!document || isSaving) return
    const session = captureDataSession()
    setIsSaving(true)
    try {
      const saved = await persistLineItemChanges(document.lineItems, updatedItems.map(item => ({ ...item, sourceDocumentId: documentId })), session)
      setHistoryDocuments(previous => previous.map(item => item.id === documentId ? { ...item, lineItems: saved } : item))
      await onItemsChanged?.()
    } catch {
      alert('明細を保存できませんでした。再度履歴を開き、保存済みの内容を確認してください。')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteDocument = async (documentId: string) => {
    const document = historyDocuments.find(item => item.id === documentId)
    if (!document || !confirm(`${document.file.name} の明細を削除しますか？`)) return
    const session = captureDataSession()
    setIsSaving(true)
    try {
      for (const item of document.lineItems) await deleteLineItemFromFirestore(item.id, session)
      setHistoryDocuments(previous => previous.filter(item => item.id !== documentId))
      await onItemsChanged?.(documentId)
    } catch {
      alert('削除できませんでした。再度履歴を開き、保存済みの内容を確認してください。')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCSVDownload = (items: LineItem[], type: 'purchase' | 'sales' | 'both', pdfFileName?: string) => {
    const errors = getExportErrors(items)
    if (errors.length) { alert(errors.join('\n')); return }
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')

    // PDFファイル名から拡張子を除去してクリーンな名前を作成
    let cleanFileName = ''
    if (pdfFileName) {
      cleanFileName = pdfFileName.replace(/\.pdf$/i, '').replace(/[^\w\s-]/g, '_')
    }

    if (type === 'purchase') {
      const csv = generatePurchaseCSV(items)
      const fileName = cleanFileName
        ? `仕入伝票_${cleanFileName}_${today}.csv`
        : `仕入伝票_${today}.csv`
      downloadCSV(csv, fileName)
    } else if (type === 'sales') {
      const csv = generateSalesCSV(items)
      const fileName = cleanFileName
        ? `売上伝票_${cleanFileName}_${today}.csv`
        : `売上伝票_${today}.csv`
      downloadCSV(csv, fileName)
    } else {
      const purchaseCSV = generatePurchaseCSV(items)
      const salesCSV = generateSalesCSV(items)
      const purchaseFileName = cleanFileName
        ? `仕入伝票_${cleanFileName}_${today}.csv`
        : `仕入伝票_${today}.csv`
      const salesFileName = cleanFileName
        ? `売上伝票_${cleanFileName}_${today}.csv`
        : `売上伝票_${today}.csv`
      downloadCSV(purchaseCSV, purchaseFileName)
      setTimeout(() => downloadCSV(salesCSV, salesFileName), 100)
    }
  }

  const handleViewPDF = async (document: PDFDocument) => {
    const localFile = document.lineItems.find(item => item.pdfFile && item.pdfFile.size > 0)?.pdfFile
    if (localFile) {
      setPdfViewerFile(localFile)
      return
    }
    if (IS_DEMO_MODE || !document.lineItems[0]?.pdfStoragePath) {
      alert('このセッションにはPDFがありません。')
      return
    }
    try {
      const session = captureDataSession()
      const token = await requireCloudUser().getIdToken()
      session.assertActive()
      const response = await fetch('/api/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filePath: document.lineItems[0].pdfStoragePath }),
      })
      if (!response.ok) throw new Error('PDFの取得を許可されませんでした。')
      const data = await response.json()
      session.assertActive()
      if (typeof data.signedUrl !== 'string') throw new Error('PDFのURLを取得できませんでした。')
      const pdfResponse = await fetch(data.signedUrl)
      if (!pdfResponse.ok) throw new Error('PDFを読み込めませんでした。')
      const blob = await pdfResponse.blob()
      session.assertActive()
      setPdfViewerFile(new File([blob], document.file.name, { type: 'application/pdf' }))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'PDFを読み込めませんでした。')
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          width: '95%',
          maxWidth: '1400px',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>履歴</h2>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: 'white'
            }}
          >
            閉じる
          </button>
        </div>

        {loadingStatus && (
          <div style={{
            padding: '12px',
            marginBottom: '16px',
            backgroundColor: '#e3f2fd',
            borderRadius: '4px',
            color: '#1976d2'
          }}>
            {loadingStatus}
          </div>
        )}

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '4px solid #1976d2',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem',
              flexShrink: 0,
            }} />
            <p>読み込み中...</p>
          </div>
        ) : historyDocuments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <p>保存された履歴はありません</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#666', fontSize: '0.9rem' }}>
                合計: {historyDocuments.reduce((sum, doc) => sum + doc.lineItems.length, 0)}件の明細 / {historyDocuments.length}件のPDF
              </p>
            </div>

            {historyDocuments.map((doc) => (
              <div
                key={doc.id}
                style={{
                  marginBottom: '32px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: '#f5f5f5',
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 500 }}>
                      {doc.file.name}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                      {doc.lineItems.length}件の明細 | 実行日時: {doc.uploadedAt.toLocaleString('ja-JP')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleCSVDownload(doc.lineItems, 'purchase', doc.file.name)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        border: '1px solid #1976d2',
                        backgroundColor: '#1976d2',
                        color: 'white'
                      }}
                    >
                      仕入CSV
                    </button>
                    <button
                      onClick={() => handleCSVDownload(doc.lineItems, 'sales', doc.file.name)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        border: '1px solid #2e7d32',
                        backgroundColor: '#2e7d32',
                        color: 'white'
                      }}
                    >
                      売上CSV
                    </button>
                    <button
                      onClick={() => handleCSVDownload(doc.lineItems, 'both', doc.file.name)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        border: '1px solid #f57c00',
                        backgroundColor: '#f57c00',
                        color: 'white'
                      }}
                    >
                      両方
                    </button>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        border: '1px solid #d32f2f',
                        backgroundColor: 'white',
                        color: '#d32f2f'
                      }}
                    >
                      削除
                    </button>
                  </div>
                </div>
                <div style={{ padding: '16px', pointerEvents: isSaving ? 'none' : undefined, opacity: isSaving ? .6 : 1 }}>
                  <EditableLineItemsTable
                    items={doc.lineItems}
                    onUpdate={items => handleLineItemUpdate(doc.id, items)}
                    onViewPDF={() => handleViewPDF(doc)}
                    sourceDocument={{ id: doc.id, file: doc.file, pdfStoragePath: doc.lineItems[0]?.pdfStoragePath }}
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* PDFビューアー */}
      {pdfViewerFile && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px'
          }}
          onClick={() => setPdfViewerFile(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '900px',
              height: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '20px',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPdfViewerFile(null)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                padding: '8px 16px',
                fontSize: '0.9rem',
                cursor: 'pointer',
                borderRadius: '4px',
                border: '1px solid #ccc',
                backgroundColor: 'white',
                zIndex: 10
              }}
            >
              閉じる
            </button>
            <div style={{ flex: 1, overflow: 'hidden', paddingTop: '40px' }}>
              <PDFViewer file={pdfViewerFile} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HistoryModal
