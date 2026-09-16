import React, { useState, useMemo } from 'react'
import type { LineItem } from '../types'

interface EditableLineItemsTableProps {
  items: LineItem[]
  onUpdate: (items: LineItem[]) => void
  onViewPDF: (file: File | null) => void
  sourceDocument?: { id: string; file: File; pdfStoragePath?: string }
}

/**
 * URLからファイル名を抽出するヘルパー関数
 */
function extractFileName(url: string): string {
  try {
    const decodedUrl = decodeURIComponent(url)
    const parts = decodedUrl.split('/')
    const fileName = parts[parts.length - 1]
    return fileName || '不明'
  } catch {
    return '不明'
  }
}

function EditableLineItemsTable({ items, onUpdate, onViewPDF, sourceDocument }: EditableLineItemsTableProps) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: keyof LineItem } | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  const itemsWithIndex = useMemo(() => {
    return items.map((item, index) => ({
      ...item,
      __index: index,
    }))
  }, [items])

  const handleCellChange = (
    rowIndex: number,       // 元の items 配列の index
    field: keyof LineItem,
    value: any
  ) => {

    const updated = [...items]

    // 数値フィールドの処理
    let processedValue = value
    if (['数量', '単価', '金額'].includes(field)) {
      if (value === '' || value === null || value === undefined) {
        processedValue = field === '数量' ? null : 0
      } else {
        const numValue = typeof value === 'string'
          ? parseFloat(value.replace(/,/g, ''))
          : value
        processedValue = Number.isFinite(numValue) ? numValue : (field === '数量' ? null : 0)
      }
    }

    updated[rowIndex] = { ...updated[rowIndex], [field]: processedValue }


    onUpdate(updated)  // ★ 親コンポーネントに必ず返す
  }

  const handleCellBlur = () => {
    if (!editingCell) return
    const rowIndex = items.findIndex(item => item.id === editingCell.id)
    if (rowIndex >= 0) handleCellChange(rowIndex, editingCell.field, editValue)
    setEditingCell(null)
    setEditValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellBlur()
    } else if (e.key === 'Escape') {
      setEditingCell(null)
      setEditValue('')
    }
  }

  const handleCellClick = (itemIndex: number, field: keyof LineItem, currentValue: any) => {
    if (field === 'id') return // IDは編集不可
    setEditingCell({ id: items[itemIndex].id, field })
    setEditValue(currentValue === null || currentValue === undefined ? '' : String(currentValue))
  }

  const handleAddRow = () => {
    const firstItem = items[0]
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      仕入日: new Date().toISOString().split('T')[0],
      伝票番号: '',
      仕入先コード: '',
      仕入先名: '',
      商品コード: '',
      商品名: '',
      数量: null,  // ★ null に変更
      単価: 0,
      金額: 0,
      課税区分: '課税10.0%',
      sourceDocumentId: firstItem?.sourceDocumentId || sourceDocument?.id,
      pdfFileName: firstItem?.pdfFileName || sourceDocument?.file.name || '新規',
      pdfFile: firstItem?.pdfFile || sourceDocument?.file,
      pdfUrl: firstItem?.pdfUrl,
      pdfStoragePath: firstItem?.pdfStoragePath || sourceDocument?.pdfStoragePath,
    }
    onUpdate([...items, newItem])
  }

  const handleDeleteRow = (rowIndex: number) => {
    if (confirm('この行を削除しますか?')) {
      const updated = items.filter((_, idx) => idx !== rowIndex)
      onUpdate(updated)
    }
  }

  // ステップ1: PDFごとにグループ化 (Array.reduce使用)
  const groupedByPdf = useMemo(() => {
    return itemsWithIndex.reduce((acc, item) => {
      const pdfKey = item.sourceDocumentId || item.pdfStoragePath || item.pdfFileName || '不明'
      if (!acc[pdfKey]) {
        acc[pdfKey] = []
      }
      acc[pdfKey].push(item)
      return acc
    }, {} as Record<string, (LineItem & { __index: number })[]>)
  }, [itemsWithIndex])

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
        <p>明細データがありません</p>
        <button
          onClick={handleAddRow}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          + 行を追加
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button
          onClick={handleAddRow}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 'bold',
          }}
        >
          ➕ 行を追加
        </button>
        <span style={{ fontSize: '0.9rem', color: '#666' }}>
          ※セルをクリックで編集できます。「行を追加」は先頭のPDFに追加します。
        </span>
      </div>

      <div style={{
        overflowX: 'auto',
        width: '100%',
        maxWidth: '100vw'
      }}>
        {Object.entries(groupedByPdf).map(([pdfKey, pdfItems], pdfIndex) => {
          const filteredItems = pdfItems
          const pdfTotalAmount = filteredItems.reduce((sum, item) => sum + (item.金額 || 0), 0)
          const fileName = pdfItems[0]?.pdfFileName || (pdfKey.startsWith('http') ? extractFileName(pdfKey) : pdfKey)

          return (
            <div key={pdfKey} style={{ marginBottom: '3rem' }}>
              {/* PDFグループヘッダー */}
              <div style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#1976d2',
                color: 'white',
                borderRadius: '6px 6px 0 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: pdfIndex > 0 ? '2rem' : '0',
              }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>
                  📄 {fileName} <span style={{ fontSize: '0.9rem', fontWeight: 'normal' }}>(合計 {filteredItems.length}件)</span>
                </h3>
                <button
                  onClick={() => {
                    const firstItem = filteredItems[0]
                    if (firstItem?.pdfFile) {
                      onViewPDF(firstItem.pdfFile)
                    } else {
                      onViewPDF(null)
                    }
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#2e7d32',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                  }}
                >
                  📄 PDFを表示
                </button>
              </div>

              {/* 統合テーブル */}
              <table style={{
                width: '100%',
                minWidth: '1200px',
                borderCollapse: 'collapse',
                fontSize: '0.9rem',
                border: '1px solid #ddd',
                tableLayout: 'fixed',
              }}>
                <thead>
                  <tr style={{ backgroundColor: '#f5f5f5' }}>
                    <th style={{ ...headerStyle, width: '80px' }}>仕入日</th>
                    <th style={{ ...headerStyle, width: '90px' }}>伝票番号</th>
                    <th style={{ ...headerStyle, width: '70px' }}>仕入先コード</th>
                    <th style={{ ...headerStyle, width: '100px' }}>仕入先名</th>
                    <th style={{ ...headerStyle, width: '70px' }}>得意先コード</th>
                    <th style={{ ...headerStyle, width: '80px' }}>船名</th>
                    <th style={{ ...headerStyle, width: '80px' }}>商品コード</th>
                    <th style={{ ...headerStyle, width: '200px' }}>商品名</th>
                    <th style={{ ...headerStyle, width: '50px' }}>数量</th>
                    <th style={{ ...headerStyle, width: '80px' }}>単価</th>
                    <th style={{ ...headerStyle, width: '80px' }}>金額</th>
                    <th style={{ ...headerStyle, width: '70px' }}>課税区分</th>
                    <th style={{ ...headerStyle, width: '150px' }}>摘要</th>
                    <th style={{ ...headerStyle, width: '50px' }}>削除</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const rowIndex = item.__index  // ★ 原本 index を取得

                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                        {/* 文字列フィールド */}
                        {(['仕入日', '伝票番号', '仕入先コード', '仕入先名', '得意先コード', '得意先名', '商品コード', '商品名'] as const).map(field => (
                          <td
                            key={field}
                            style={{
                              ...(field === '商品名' ? productNameCellStyle : cellStyle),
                              cursor: 'pointer',
                              backgroundColor: editingCell?.id === item.id && editingCell?.field === field ? '#fff3cd' : 'transparent',
                            }}
                            onClick={() => handleCellClick(rowIndex, field, item[field])}
                          >
                            {editingCell?.id === item.id && editingCell?.field === field ? (
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={handleKeyDown}
                                autoFocus
                                style={{
                                  width: '100%',
                                  padding: '0.25rem',
                                  border: '2px solid #1976d2',
                                  borderRadius: '4px',
                                  fontSize: '0.9rem',
                                }}
                              />
                            ) : (
                              item[field] || '-'
                            )}
                          </td>
                        ))}

                        {/* 数値フィールド (数量・単価・金額) */}
                        {(['数量', '単価', '金額'] as const).map(field => (
                          <td
                            key={field}
                            style={{
                              ...numberCellStyle,
                              cursor: 'pointer',
                              backgroundColor: editingCell?.id === item.id && editingCell?.field === field ? '#fff3cd' : 'transparent',
                            }}
                            onClick={() => handleCellClick(rowIndex, field, item[field])}
                          >
                            {editingCell?.id === item.id && editingCell?.field === field ? (
                              <input
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={handleKeyDown}
                                autoFocus
                                style={{
                                  width: '100%',
                                  padding: '0.25rem',
                                  border: '2px solid #1976d2',
                                  borderRadius: '4px',
                                  fontSize: '0.9rem',
                                  textAlign: 'right',
                                }}
                              />
                            ) : (
                              // ★ null の場合は ? を表示、数値の場合はカンマ区切り
                              item[field] === null || item[field] === undefined
                                ? (field === '数量' ? '?' : '0')  // 数量は?、単価・金額は0
                                : typeof item[field] === 'number'
                                  ? item[field].toLocaleString()
                                  : item[field]
                            )}
                          </td>
                        ))}

                        {/* 課税区分 (ドロップダウン) */}
                        <td
                          style={{
                            ...cellStyle,
                            cursor: 'pointer',
                            backgroundColor: editingCell?.id === item.id && editingCell?.field === '課税区分' ? '#fff3cd' : 'transparent',
                          }}
                          onClick={() => handleCellClick(rowIndex, '課税区分', item.課税区分)}
                        >
                          {editingCell?.id === item.id && editingCell?.field === '課税区分' ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellBlur}
                              onKeyDown={handleKeyDown}
                              autoFocus
                              style={{
                                width: '100%',
                                padding: '0.25rem',
                                border: '2px solid #1976d2',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                              }}
                            >
                              <option value="課税10.0%">課税10.0%</option>
                              <option value="課税8.0%">課税8.0%</option>
                              <option value="非課税">非課税</option>
                              <option value="不課税">不課税</option>
                            </select>
                          ) : (
                            item.課税区分
                          )}
                        </td>

                        {/* 摘要 */}
                        <td
                          style={{
                            ...remarksCellStyle,
                            cursor: 'pointer',
                            backgroundColor: editingCell?.id === item.id && editingCell?.field === '摘要' ? '#fff3cd' : 'transparent',
                          }}
                          onClick={() => handleCellClick(rowIndex, '摘要', item.摘要)}
                        >
                          {editingCell?.id === item.id && editingCell?.field === '摘要' ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellBlur}
                              onKeyDown={handleKeyDown}
                              autoFocus
                              style={{
                                width: '100%',
                                padding: '0.25rem',
                                border: '2px solid #1976d2',
                                borderRadius: '4px',
                                fontSize: '0.9rem',
                              }}
                            />
                          ) : (
                            item.摘要 || '-'
                          )}
                        </td>

                        {/* 削除ボタン */}
                        <td style={cellStyle}>
                          <button
                            onClick={() => handleDeleteRow(rowIndex)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: '#f44336',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                            }}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* PDF合計フッター */}
              <div style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#1976d2',
                color: 'white',
                borderRadius: '0 0 6px 6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 'bold',
                fontSize: '1rem',
              }}>
                <span>📄 {fileName} 合計</span>
                <span>¥{pdfTotalAmount.toLocaleString()}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  padding: '0.75rem 0.5rem',
  textAlign: 'left',
  borderBottom: '2px solid #ddd',
  fontWeight: 'bold',
  fontSize: '0.85rem',
  minWidth: '100px',
}

const cellStyle: React.CSSProperties = {
  padding: '0.4rem',
  fontSize: '0.8rem',
  verticalAlign: 'top',
  lineHeight: '1.3',
}

// 商品名用スタイル (2-3行で表示)
const productNameCellStyle: React.CSSProperties = {
  ...cellStyle,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
  maxHeight: '4em',
  overflow: 'hidden',
}

// 摘要用スタイル (複数行表示)
const remarksCellStyle: React.CSSProperties = {
  ...cellStyle,
  wordBreak: 'break-word',
  whiteSpace: 'pre-wrap',
}

// 金額関連スタイル (1行で表示)
const numberCellStyle: React.CSSProperties = {
  ...cellStyle,
  whiteSpace: 'nowrap',
  textAlign: 'right',
}

export default EditableLineItemsTable
