import type { LineItem } from '../types'
import { generatePurchaseCSV, generateSalesCSV, downloadCSV, getExportErrors, getSalesSummary, DEMO_SALES_POLICY } from '../utils/csvExport'

interface CSVExportProps { items: LineItem[] }

function CSVExport({ items }: CSVExportProps) {
  const handlePurchaseDownload = () => {
    const csv = generatePurchaseCSV(items)
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
    downloadCSV(csv, `仕入伝票_${today}.csv`)
  }

  const handleSalesDownload = () => {
    const csv = generateSalesCSV(items)
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
    downloadCSV(csv, `売上伝票_${today}.csv`)
  }

  const handleBulkDownload = () => {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')

    // 仕入CSVダウンロード
    const purchaseCSV = generatePurchaseCSV(items)
    downloadCSV(purchaseCSV, `仕入伝票_${today}.csv`)

    // 売上CSVダウンロード（少し遅延させて同時ダウンロード）
    setTimeout(() => {
      const salesCSV = generateSalesCSV(items)
      downloadCSV(salesCSV, `売上伝票_${today}.csv`)
    }, 100)
  }

  if (items.length === 0) {
    return (
      <div style={{ color: '#999' }}>
        明細データがないため、CSVを生成できません
      </div>
    )
  }

  const { purchaseTotal: totalAmount, rate: salesRate, salesTotal } = getSalesSummary(items)
  const errors = getExportErrors(items)
  if (errors.length) return <div role="alert">CSV出力前に明細を修正してください。<ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>

  return (
    <div>
      {/* 一括ダウンロードボタン */}
      <div style={{
        marginBottom: '1.5rem',
        padding: '1.5rem',
        backgroundColor: '#e3f2fd',
        borderRadius: '8px',
        border: '2px solid #1976d2',
        textAlign: 'center',
      }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#1976d2' }}>
          一括ダウンロード
        </h3>
        <button
          onClick={handleBulkDownload}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1565c0'
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#1976d2'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'
          }}
        >
          📥 仕入・売上CSV 一括ダウンロード
        </button>
        <p style={{ margin: '1rem 0 0 0', fontSize: '0.85rem', color: '#666' }}>
          仕入伝票と売上伝票のCSVファイルを同時にダウンロードします
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        <div style={{
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          border: '1px solid #ddd'
        }}>
          <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>仕入伝票</h4>
          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
            明細数: {items.length}件
          </p>
          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
            合計金額: ¥{totalAmount.toLocaleString()}
          </p>
          <button
            onClick={handlePurchaseDownload}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.5rem',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            仕入CSVダウンロード
          </button>
        </div>

        <div style={{
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          border: '1px solid #ddd'
        }}>
          <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>売上伝票</h4>
          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
            明細数: {items.length}件
          </p>
          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
            合計金額: ¥{salesTotal.toLocaleString()} (掛率: {`+${Math.round((salesRate - 1) * 100)}%`})
          </p>
          <button
            onClick={handleSalesDownload}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.5rem',
              backgroundColor: '#2e7d32',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            売上CSVダウンロード
          </button>
        </div>
      </div>

      <div style={{
        padding: '1rem',
        backgroundColor: '#fff3cd',
        borderRadius: '4px',
        border: '1px solid #ffc107',
        fontSize: '0.9rem'
      }}>
        <strong>注意:</strong>
        <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.5rem' }}>
          <li>売上単価は仕入単価に掛率を適用して自動計算されます</li>
          <li>デモ用の仮定: 選択明細の合計が{DEMO_SALES_POLICY.threshold.toLocaleString()}円未満は+10%、以上は+5%（実取引の条件ではありません）</li>
        </ul>
      </div>
    </div>
  )
}

export default CSVExport
