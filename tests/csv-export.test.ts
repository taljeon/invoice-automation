import { describe, expect, it } from 'vitest'
import type { LineItem } from '../src/types'
import { createCSVRows, generatePurchaseCSV, generateSalesCSV, getSalesSummary, getExportErrors, encodeShiftJIS } from '../src/utils/csvExport'

const item: LineItem = {
  id: 'synthetic-row', 仕入日: '2026/01/15', 伝票番号: 'DEMO-001',
  仕入先コード: '201', 仕入先名: 'サンプル部品株式会社', 得意先コード: '101',
  得意先名: 'サンプル一号', 商品コード: 'D1', 商品名: 'ガスケット, "A"',
  数量: 3, 単価: 105, 金額: 315, 課税区分: 'sample',
}

describe('accounting export contract using synthetic rows', () => {
  it('keeps all 40 positions and different purchase/sales mapping semantics', () => {
    const p = createCSVRows([item], 'purchase')[0]
    const s = createCSVRows([item], 'sales')[0]
    expect(p).toHaveLength(40); expect(s).toHaveLength(40)
    expect(p[5]).toBe('14'); expect(s[5]).toBe('24')
    expect(p[10]).toBe('101'); expect(s[10]).toBe('101')
    expect(p[15]).toBe('D1'); expect(s[15]).toBe('201')
    expect(p[17]).toBe('ｶﾞｽｹｯﾄ, "A"')
    expect(p[36]).toBe('2'); expect(s[36]).toBe('')
    expect(p[25]).toBe(315); expect(s[25]).toBe(348)
  })
  it('uses exact threshold boundary and row-level rounding for preview and download', () => {
    expect(getSalesSummary([{ ...item, 金額: 99_999 }]).rate).toBe(1.10)
    expect(getSalesSummary([{ ...item, 金額: 100_000 }]).rate).toBe(1.05)
    const rows = [item, { ...item, id: 'second' }]
    const exported = createCSVRows(rows, 'sales').reduce((sum, row) => sum + Number(row[25]), 0)
    expect(getSalesSummary(rows).salesTotal).toBe(exported)
    expect(exported).toBe(696)
  })
  it('quotes commas and quotes and uses CRLF, no header', () => {
    const csv = generatePurchaseCSV([item, { ...item, id: 'second' }])
    expect(csv).toContain('"ｶﾞｽｹｯﾄ, ""A"""')
    expect(csv.split('\r\n')).toHaveLength(2)
    expect(csv.startsWith('"1","1","","2026/01/15"')).toBe(true)
    expect(generatePurchaseCSV([])).toBe('')
  })
  it('refuses unresolved quantity and nonfinite money rather than emitting misleading zeros', () => {
    expect(getExportErrors([{ ...item, 数量: null }])[0]).toContain('数量')
    expect(() => generateSalesCSV([{ ...item, 数量: null }])).toThrow()
    expect(() => generatePurchaseCSV([{ ...item, 単価: Number.NaN }])).toThrow()
    expect(() => generatePurchaseCSV([{ ...item, 商品名: ' ' }])).toThrow()
  })
  it('preserves zero and negative values intentionally and emits Shift-JIS bytes', () => {
    expect(createCSVRows([{ ...item, 数量: 0, 金額: 0 }], 'sales')[0][25]).toBe(0)
    expect(createCSVRows([{ ...item, 数量: -1, 金額: -105 }], 'sales')[0][25]).toBe(-116)
    expect(new TextDecoder('shift_jis').decode(encodeShiftJIS('仮想 ｶﾞｽｹｯﾄ'))).toBe('仮想 ｶﾞｽｹｯﾄ')
  })
})
