import type { LineItem } from '../types'
import Encoding from 'encoding-japanese'
import { toHalfWidthKatakana } from './katakanaConverter'
import { getShipCode } from './shipCodeMapping'
import { getSupplierCode } from './supplierCodeMapping'
import { getCustomerCode } from './customerCodeMapping'

/** Invented sample pricing. Replace with an approved policy for your own application. */
export const DEMO_SALES_POLICY = {
  threshold: 100_000,
  regularMultiplier: 1.10,
  volumeMultiplier: 1.05,
} as const

export function getExportErrors(items: LineItem[]): string[] {
  return items.flatMap((item, index) => {
    const problems: string[] = []
    if (!item.商品名.trim()) problems.push('商品名')
    if (!item.仕入日.trim()) problems.push('仕入日')
    if (item.数量 === null || !Number.isFinite(item.数量)) problems.push('数量')
    if (!Number.isFinite(item.単価)) problems.push('単価')
    if (!Number.isFinite(item.金額)) problems.push('金額')
    return problems.length ? [`${index + 1}行目: ${problems.join('・')}を確認してください`] : []
  })
}

export function getSalesSummary(items: LineItem[]) {
  const purchaseTotal = items.reduce((sum, item) => sum + (Number.isFinite(item.金額) ? item.金額 : 0), 0)
  const rate = purchaseTotal < DEMO_SALES_POLICY.threshold
    ? DEMO_SALES_POLICY.regularMultiplier : DEMO_SALES_POLICY.volumeMultiplier
  const salesTotal = items.reduce((sum, item) => sum + Math.round(item.単価 * rate) * (item.数量 ?? 0), 0)
  return { purchaseTotal, rate, salesTotal }
}

export function escapeCSVField(field: string | number): string {
  return `"${String(field).replace(/"/g, '""')}"`
}

/** The demo's 40-column A–AN contract, not a promise of all accounting-version compatibility. */
export function createCSVRows(items: LineItem[], kind: 'purchase' | 'sales'): (string | number)[][] {
  const errors = getExportErrors(items)
  if (errors.length) throw new Error(errors.join('\n'))
  const { rate } = getSalesSummary(items)
  return items.map(item => {
    const sales = kind === 'sales'
    const price = sales ? Math.round(item.単価 * rate) : item.単価
    const quantity = item.数量 as number
    const row: (string | number)[] = Array(40).fill('')
    for (const index of [0, 1, 6, 7, 8, 9, 13, 14, 19]) row[index] = '1'
    row[3] = item.仕入日
    row[5] = sales ? '24' : '14'
    row[10] = getCustomerCode(item.得意先名)
    row[15] = sales ? getSupplierCode(item.仕入先名) : getShipCode(item.得意先名)
    row[17] = toHalfWidthKatakana(item.商品名)
    row[18] = '13'
    row[23] = quantity
    row[24] = price
    row[25] = sales ? price * quantity : item.金額
    row[36] = sales ? '' : '2'
    row[39] = toHalfWidthKatakana(sales ? item.得意先名 : item.仕入先名)
    return row
  })
}

export function generatePurchaseCSV(items: LineItem[]): string {
  return createCSVRows(items, 'purchase').map(row => row.map(escapeCSVField).join(',')).join('\r\n')
}

export function generateSalesCSV(items: LineItem[]): string {
  return createCSVRows(items, 'sales').map(row => row.map(escapeCSVField).join(',')).join('\r\n')
}

export function encodeShiftJIS(content: string): Uint8Array<ArrayBuffer> {
  const unicode = Array.from(content, character => character.charCodeAt(0))
  return new Uint8Array(Encoding.convert(unicode, { to: 'SJIS', from: 'UNICODE' }) as number[])
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([encodeShiftJIS(content)], { type: 'text/csv;charset=Shift_JIS;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
