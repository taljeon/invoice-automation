export interface LineItem {
  id: string
  sourceDocumentId?: string  // Stable grouping across current view and history
  仕入日: string
  伝票番号: string
  仕入先コード: string
  仕入先名: string
  得意先コード?: string  // 船コード（売上伝票用）
  得意先名?: string      // 船名（売上伝票用）
  商品コード: string     // 得意先コード（船名コード）を使用
  商品名: string         // 部品番号を含む完全な商品名
  数量: number | null    // null の場合はユーザーが手動入力
  単価: number
  金額: number
  課税区分: string
  摘要?: string          // 機械型式等
  pdfFileName?: string  // どのPDFの明細かを識別
  pdfFile?: File        // PDFファイル参照（ローカルのみ）
  pdfUrl?: string       // Firebase StorageのPDF URL（クラウド保存時）
  pdfStoragePath?: string  // Firebase Storageのファイルパス
  createdAt?: any       // Firestore Timestamp (実行時刻の識別用)
}

export interface PDFDocument {
  id: string
  file: File
  uploadedAt: Date
  lineItems: LineItem[]
  status: 'uploaded' | 'processing' | 'completed' | 'error'
}

export interface ExportData {
  purchase: LineItem[]
  sales: LineItem[]
}
