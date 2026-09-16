import React from 'react'
import type { PDFDocument } from '../types'

interface PDFListProps {
  documents: PDFDocument[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onViewPDF: (file: File) => void
}

function PDFList({ documents, selectedId, onSelect, onDelete, onViewPDF }: PDFListProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getStatusLabel = (status: PDFDocument['status']) => {
    const labels = {
      uploaded: 'アップロード済',
      processing: '処理中',
      completed: '完了',
      error: 'エラー',
    }
    return labels[status]
  }

  const getStatusColor = (status: PDFDocument['status']) => {
    const colors = {
      uploaded: '#2196f3',
      processing: '#ff9800',
      completed: '#4caf50',
      error: '#f44336',
    }
    return colors[status]
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.9rem'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
            <th style={headerStyle}>ファイル名</th>
            <th style={headerStyle}>アップロード日時</th>
            <th style={headerStyle}>ファイルサイズ</th>
            <th style={headerStyle}>明細数</th>
            <th style={headerStyle}>ステータス</th>
            <th style={headerStyle}>操作</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr
              key={doc.id}
              onClick={() => onSelect(doc.id)}
              style={{
                borderBottom: '1px solid #eee',
                backgroundColor: selectedId === doc.id ? '#e3f2fd' : 'transparent',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                if (selectedId !== doc.id) {
                  e.currentTarget.style.backgroundColor = '#f5f5f5'
                }
              }}
              onMouseLeave={(e) => {
                if (selectedId !== doc.id) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              <td style={cellStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>📄</span>
                  <span style={{ fontWeight: selectedId === doc.id ? 'bold' : 'normal' }}>
                    {doc.file.name}
                  </span>
                </div>
              </td>
              <td style={cellStyle}>{formatDate(doc.uploadedAt)}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>
                {formatFileSize(doc.file.size)}
              </td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>
                {doc.lineItems.length}件
              </td>
              <td style={cellStyle}>
                <span style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: getStatusColor(doc.status) + '20',
                  color: getStatusColor(doc.status),
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                }}>
                  {getStatusLabel(doc.status)}
                </span>
              </td>
              <td style={cellStyle}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(doc.id)
                    }}
                    style={{
                      padding: '0.25rem 0.75rem',
                      backgroundColor: '#1976d2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    明細表示
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onViewPDF(doc.file)
                    }}
                    style={{
                      padding: '0.25rem 0.75rem',
                      backgroundColor: '#2e7d32',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    PDF確認
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`${doc.file.name} を削除しますか？`)) {
                        onDelete(doc.id)
                      }
                    }}
                    style={{
                      padding: '0.25rem 0.75rem',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    削除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  padding: '0.75rem',
  textAlign: 'left',
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
}

const cellStyle: React.CSSProperties = {
  padding: '0.75rem',
  whiteSpace: 'nowrap',
}

export default PDFList
