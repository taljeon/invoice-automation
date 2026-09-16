import { useState, useEffect, useMemo, useRef } from 'react'
import { onAuthStateChanged, signOut, User } from 'firebase/auth'
import { auth, IS_DEMO_MODE, cloudConfigurationError } from './config/firebase'
import { createDemoDocuments } from './demo/fixtures'
import { reconcileDocumentItems } from './demo/documentState'
import { captureDataSession } from './demo/session'
import LoginForm from './components/LoginForm'
import PDFUpload from './components/PDFUpload'
import PDFViewer from './components/PDFViewer'
import EditableLineItemsTable from './components/EditableLineItemsTable'
import CSVExport from './components/CSVExport'
import SettingsModal from './components/SettingsModal'
import HistoryModal from './components/HistoryModal'
import PasswordChangeModal from './components/PasswordChangeModal'
import type { PDFDocument, LineItem } from './types'
import { processPDFWithOCRAsync } from './services/ocrServiceAsync' // ⭐️ 비동기 버전 사용
import {
  saveLineItemsToFirestore,
  getLineItemsFromFirestore,
  persistLineItemChanges,
  deleteLineItemFromFirestore
} from './services/firestoreService'

function App() {
  const authGeneration = useRef(0)
  const [user, setUser] = useState<User | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(!IS_DEMO_MODE && !cloudConfigurationError)
  const [documents, setDocuments] = useState<PDFDocument[]>([])
  const [pdfViewerFile, setPdfViewerFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false)

  useEffect(() => {
    if (IS_DEMO_MODE || cloudConfigurationError) return
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      authGeneration.current += 1
      setUser(user)
      setDocuments([])
      setPdfViewerFile(null)
      setIsHistoryOpen(false)
      setIsPasswordChangeOpen(false)
      setIsProcessing(false)
      setIsSaving(false)
      setProcessingStatus('')
      setIsAuthLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // 全PDFの明細を結合
  const allLineItems: LineItem[] = useMemo(() => {
    return documents.flatMap(doc => doc.lineItems)
  }, [documents])

  const handleLoadDemo = async () => {
    setIsProcessing(true)
    try {
      const samples = createDemoDocuments()
      for (const document of samples) {
        const ids = await saveLineItemsToFirestore(document.lineItems)
        document.lineItems = document.lineItems.map((item, index) => ({ ...item, id: ids[index] }))
      }
      setDocuments(previous => [...previous, ...samples])
      setProcessingStatus('架空の請求書2件を読み込みました。OCRは実行していません。数量「?」を確認して編集できます。')
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePDFUpload = async (files: File[]) => {
    if (IS_DEMO_MODE) {
      setProcessingStatus('デモでは任意のPDFのOCRは実行しません。「サンプル2件を読み込む」を使ってください。')
      return
    }
    if (isProcessing || isSaving) return
    const generation = authGeneration.current
    const session = captureDataSession()
    setIsProcessing(true)
    const newDocs: PDFDocument[] = []
    const failures: string[] = []
    for (const file of files) {
      try {
        session.assertActive()
        if (generation !== authGeneration.current) return
        const ocrItems = await processPDFWithOCRAsync(file, message => {
          if (generation === authGeneration.current) setProcessingStatus(message)
        }, session)
        session.assertActive()
        if (generation !== authGeneration.current) return
        const documentId = ocrItems[0]?.sourceDocumentId || crypto.randomUUID()
        const items = ocrItems.map(item => ({ ...item, sourceDocumentId: documentId, pdfFile: file }))
        setProcessingStatus(`${file.name}: 明細を保存中...`)
        const ids = await saveLineItemsToFirestore(items, session)
        session.assertActive()
        if (generation !== authGeneration.current) return
        newDocs.push({
          id: documentId, file, uploadedAt: new Date(), status: 'completed',
          lineItems: items.map((item, index) => ({ ...item, id: ids[index] })),
        })
      } catch (error) {
        if (generation !== authGeneration.current) return
        failures.push(`${file.name}: ${error instanceof Error ? error.message : '処理に失敗しました。'}`)
      }
    }
    if (generation !== authGeneration.current) return
    setDocuments(previous => [...previous, ...newDocs])
    setProcessingStatus(failures.length ? failures.join(' / ') : '処理完了。CSV出力前に明細を確認してください。')
    setIsProcessing(false)
  }

  const handleLineItemUpdate = async (updatedItems: LineItem[]) => {
    if (isSaving || isProcessing) return
    const generation = authGeneration.current
    const session = captureDataSession()
    setIsSaving(true)
    try {
      const nextDocuments = reconcileDocumentItems(documents, updatedItems)
      const saved = await persistLineItemChanges(allLineItems, nextDocuments.flatMap(document => document.lineItems), session)
      session.assertActive()
      if (generation !== authGeneration.current) return
      setDocuments(reconcileDocumentItems(nextDocuments, saved))
    } catch (error) {
      if (generation !== authGeneration.current) return
      setProcessingStatus(`明細の保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
    } finally {
      if (generation === authGeneration.current) setIsSaving(false)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('このPDFの明細を削除しますか？クラウドのPDF・OCRジョブは別途管理します。')) return
    const document = documents.find(candidate => candidate.id === docId)
    if (!document || isSaving || isProcessing) return
    const generation = authGeneration.current
    const session = captureDataSession()
    try {
      for (const item of document.lineItems) await deleteLineItemFromFirestore(item.id, session)
      session.assertActive()
      if (generation !== authGeneration.current) return
      setDocuments(previous => previous.filter(candidate => candidate.id !== docId))
      if (pdfViewerFile === document.file) setPdfViewerFile(null)
    } catch (error) {
      if (generation !== authGeneration.current) return
      setProcessingStatus(`削除に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
    }
  }

  const syncHistoryChanges = async (deletedDocumentId?: string) => {
    const generation = authGeneration.current
    const session = captureDataSession()
    const saved = await getLineItemsFromFirestore(session)
    session.assertActive()
    if (generation !== authGeneration.current) return
    setDocuments(previous => previous.map(document => ({
      ...document,
      lineItems: saved.filter(item => item.sourceDocumentId === document.id || document.lineItems.some(old => old.id === item.id))
        .map(item => ({ ...item, pdfFile: document.file, sourceDocumentId: document.id })),
    })).filter(document => document.id !== deletedDocumentId))
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (cloudConfigurationError) {
    return <main style={{ padding: '2rem' }}><h1>クラウド設定が未完了です</h1><p>{cloudConfigurationError}</p><p>ローカルデモは VITE_DEMO_MODE を未設定にして起動できます。</p></main>
  }

  // 認証状態をチェック中の場合
  if (isAuthLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid #1976d2',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem',
          }} />
          <p>認証状態を確認中...</p>
        </div>
      </div>
    )
  }

  // ログインしていない場合
  if (!IS_DEMO_MODE && !user) {
    return <LoginForm onLoginSuccess={() => { }} />
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        backgroundColor: '#1976d2',
        color: 'white',
        padding: '1rem 2rem',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
          請求書自動化 / 弥生形式CSV デモ
        </h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.9rem',
            color: 'rgba(255, 255, 255, 0.8)',
            marginRight: '8px'
          }}>
            {IS_DEMO_MODE ? 'オフライン・デモ' : user?.email}
          </span>
          <button
            onClick={() => setIsHistoryOpen(true)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
            }}
          >
            📋 履歴
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
            }}
          >
            ⚙️ 実行設定
          </button>
          {!IS_DEMO_MODE && <button
            onClick={() => setIsPasswordChangeOpen(true)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
            }}
          >
            🔐 パスワード変更
          </button>}
          {!IS_DEMO_MODE && <button
            onClick={handleLogout}
            disabled={isProcessing || isSaving}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
            }}
          >
            🚪 ログアウト
          </button>}
        </div>
      </header>

      {IS_DEMO_MODE && <aside role="status" style={{ padding: '1rem 2rem', backgroundColor: '#fff3cd', color: '#634a00' }}>
        <strong>架空データ専用・オフラインデモ</strong> — OCR・クラウド送信は行いません。編集・CSV出力・履歴を試せます。再読み込みで履歴は消えます。
      </aside>}

      {/* 設定モーダル */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* 履歴モーダル */}
      <HistoryModal key={user?.uid || 'demo'} isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} onItemsChanged={syncHistoryChanges} />

      {/* パスワード変更モーダル */}
      {!IS_DEMO_MODE && <PasswordChangeModal key={user?.uid} isOpen={isPasswordChangeOpen} onClose={() => setIsPasswordChangeOpen(false)} />}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左サイドバー: PDFアップロード */}
        <div style={{
          width: '280px',
          backgroundColor: 'white',
          borderRight: '1px solid #ddd',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}>
          <div style={{ padding: '1.5rem' }}>
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 'bold' }}>請求書PDF</h2>
            {IS_DEMO_MODE && <button disabled={isProcessing || documents.length > 0} onClick={handleLoadDemo} style={{ padding: '.75rem', width: '100%', marginBottom: '1rem', border: 0, borderRadius: 6, backgroundColor: '#1976d2', color: 'white', cursor: 'pointer' }}>サンプル2件を読み込む</button>}
            <div style={{ pointerEvents: isProcessing || isSaving ? 'none' : undefined, opacity: isProcessing || isSaving ? .6 : 1 }}><PDFUpload onUpload={handlePDFUpload} /></div>
            {IS_DEMO_MODE && <p style={{ fontSize: '.8rem', color: '#666' }}>任意のPDFから抽出するにはクラウド設定が必要です。上のボタンは用意済みの架空明細を表示します。</p>}

            {/* 処理状態表示 */}
            {(isProcessing || processingStatus) && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                backgroundColor: isProcessing ? '#e3f2fd' : '#e8f5e9',
                borderRadius: '6px',
                border: `1px solid ${isProcessing ? '#1976d2' : '#4caf50'}`,
                fontSize: '0.85rem',
                color: isProcessing ? '#1976d2' : '#2e7d32',
              }}>
                {isProcessing && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid #1976d2',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      flexShrink: 0,
                    }} />
                    <span>{processingStatus}</span>
                  </div>
                )}
                {!isProcessing && processingStatus && (
                  <span>{processingStatus}</span>
                )}
              </div>
            )}
          </div>

          {documents.length > 0 && (
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: '0 1rem 1rem 1rem',
              borderTop: '1px solid #eee',
            }}>
              <div style={{
                padding: '1rem 0 0.5rem 0',
                fontSize: '0.9rem',
                fontWeight: 'bold',
                color: '#666',
              }}>
                アップロード済み ({documents.length}件)
              </div>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                    border: '1px solid #e0e0e0',
                    position: 'relative',
                  }}
                >
                  <div style={{
                    fontSize: '0.85rem',
                    marginBottom: '0.5rem',
                    wordBreak: 'break-all',
                    paddingRight: '2rem',
                  }}>
                    📄 {doc.file.name}
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#666',
                    marginBottom: '0.5rem',
                  }}>
                    {doc.lineItems.length}件の明細
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setPdfViewerFile(doc.file)}
                      style={{
                        flex: 1,
                        padding: '0.4rem 0.5rem',
                        backgroundColor: '#2e7d32',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      📄 表示
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDocument(doc.id)
                      }}
                      style={{
                        flex: 1,
                        padding: '0.4rem 0.5rem',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* メインエリア */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
          {documents.length > 0 ? (
            <>
              {/* 編集エリア */}
              <div style={{
                flex: pdfViewerFile ? 1 : '1 1 100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRight: pdfViewerFile ? '1px solid #ddd' : 'none',
              }}>
                <div style={{
                  padding: '1.5rem',
                  backgroundColor: 'white',
                  borderBottom: '1px solid #ddd',
                  flexShrink: 0,
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                  }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>
                      全明細データ ({allLineItems.length}件)
                    </h3>
                    {pdfViewerFile && (
                      <button
                        onClick={() => setPdfViewerFile(null)}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#666',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                        }}
                      >
                        ✕ PDFを閉じる
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem', backgroundColor: '#fafafa', pointerEvents: isSaving || isProcessing ? 'none' : undefined, opacity: isSaving || isProcessing ? .6 : 1 }}>
                  <EditableLineItemsTable
                    items={allLineItems}
                    onUpdate={handleLineItemUpdate}
                    onViewPDF={(file) => setPdfViewerFile(file)}
                    sourceDocument={documents[0] ? { id: documents[0].id, file: documents[0].file } : undefined}
                  />
                </div>

                <div style={{
                  padding: '1.5rem',
                  backgroundColor: 'white',
                  borderTop: '1px solid #ddd',
                  flexShrink: 0,
                }}>
                  <CSVExport items={allLineItems} />
                </div>
              </div>

              {/* PDFビューアエリア */}
              {pdfViewerFile && (
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'white',
                }}>
                  <div style={{
                    padding: '1rem 1.5rem',
                    backgroundColor: 'white',
                    borderBottom: '1px solid #ddd',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📄 {pdfViewerFile.name}</h3>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <PDFViewer file={pdfViewerFile} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>📄</div>
                <p style={{ fontSize: '1.3rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  {IS_DEMO_MODE ? '架空の請求書で動作を確認' : 'PDFをアップロードしてください'}
                </p>
                <p style={{ fontSize: '1rem', color: '#bbb' }}>
                  {IS_DEMO_MODE ? '左の「サンプル2件を読み込む」から開始してください' : '左のエリアからPDFファイルを選択またはドラッグ&ドロップ'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
