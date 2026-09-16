import React from 'react'
import type { LineItem } from '../types'

interface LineItemsTableProps {
  items: LineItem[]
  onUpdate: (items: LineItem[]) => void
}

function LineItemsTable({ items }: LineItemsTableProps) {
  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
        明細データがありません
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.9rem'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={headerStyle}>仕入日</th>
            <th style={headerStyle}>伝票番号</th>
            <th style={headerStyle}>仕入先コード</th>
            <th style={headerStyle}>仕入先名</th>
            <th style={headerStyle}>商品コード</th>
            <th style={headerStyle}>商品名</th>
            <th style={headerStyle}>数量</th>
            <th style={headerStyle}>単価</th>
            <th style={headerStyle}>金額</th>
            <th style={headerStyle}>課税区分</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={cellStyle}>{item.仕入日}</td>
              <td style={cellStyle}>{item.伝票番号}</td>
              <td style={cellStyle}>{item.仕入先コード}</td>
              <td style={cellStyle}>{item.仕入先名}</td>
              <td style={cellStyle}>{item.商品コード}</td>
              <td style={cellStyle}>{item.商品名}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{item.数量}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{item.単価.toLocaleString()}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{item.金額.toLocaleString()}</td>
              <td style={cellStyle}>{item.課税区分}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: '#f9f9f9', fontWeight: 'bold' }}>
            <td colSpan={8} style={{ ...cellStyle, textAlign: 'right' }}>合計</td>
            <td style={{ ...cellStyle, textAlign: 'right' }}>
              {items.reduce((sum, item) => sum + item.金額, 0).toLocaleString()}
            </td>
            <td style={cellStyle}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  padding: '0.75rem',
  textAlign: 'left',
  borderBottom: '2px solid #ddd',
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
}

const cellStyle: React.CSSProperties = {
  padding: '0.75rem',
  whiteSpace: 'nowrap',
}

export default LineItemsTable
