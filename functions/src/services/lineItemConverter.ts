/** Structured OCR → editable invoice rows. All code mappings are synthetic examples. */
import { matchSupplierCode, matchCustomerCode } from './matchingService'
import type { StructuredInvoice } from './gptService'

/** Demonstration only. This is not a product-master integration. */
class ProductMatcher {
  matchProduct(productName: string): { code: string; name: string } | null {
    const name = productName.replace(/[\s　]/g, '').toUpperCase()
    if (name.includes('フィルター') || name.includes('FILTER')) return { code: 'P-FILTER-001', name: 'サンプルフィルター' }
    if (name.includes('オイル') || name.includes('OIL')) return { code: 'P-OIL-001', name: 'サンプル潤滑油' }
    if (name.includes('ベルト') || name.includes('BELT')) return { code: 'P-BELT-001', name: 'サンプルベルト' }
    if (name.includes('パッキン') || name.includes('GASKET')) return { code: 'P-GASKET-001', name: 'サンプルガスケット' }
    return null
  }
}
const productMatcher = new ProductMatcher()

export interface ServerLineItem {
  id: string
  伝票番号: string
  仕入日: string
  仕入先コード: string
  仕入先名: string
  得意先コード: string
  得意先名: string
  商品コード: string
  商品名: string
  数量: number | null
  単価: number
  金額: number
  課税区分: string
  摘要: string
  備考: string
  pdfFileName: string
  pdfStoragePath: string
}

export async function convertToLineItems(
  invoiceData: StructuredInvoice,
  finalSupplierName: string,
  pdfStoragePath: string,
  jobId: string
): Promise<ServerLineItem[]> {
  const supplier = await matchSupplierCode(finalSupplierName)
  const allLineItems: ServerLineItem[] = []
  const excluded = ['小計', '合計', '総計', 'TOTAL', 'SUBTOTAL', '消費税', '税', 'TAX', '税込', '税抜', '運賃', '送料', '手数料']
  for (const ship of invoiceData.ships) {
    const customer = ship.ship_name ? await matchCustomerCode(ship.ship_name) : null
    for (const item of ship.items) {
      if (!item.商品名 || excluded.some(word => item.商品名.toUpperCase().includes(word))) continue
      const quantity = item.数量
      const unitPrice = item.単価
      let amount = item.金額
      // Existing correction policy: quantity and unit price win when amount differs by > ¥1.
      // Discounts can invalidate this assumption; the UI must be reviewed before CSV export.
      if (quantity !== null && unitPrice !== null) {
        const product = quantity * unitPrice
        if (amount === null || amount <= 0 || Math.abs(product - amount) > 1) amount = product
      }
      allLineItems.push({
        id: `${jobId}-${allLineItems.length}`,
        伝票番号: '', // An accounting voucher cannot be inferred from a row index.
        仕入日: invoiceData.仕入日,
        仕入先コード: supplier.code,
        仕入先名: finalSupplierName,
        得意先コード: customer?.code || '0000',
        得意先名: customer?.name || ship.ship_name || '不明',
        商品コード: productMatcher.matchProduct(item.商品名)?.code || '0000',
        商品名: item.商品名,
        数量: quantity,
        単価: unitPrice ?? 0,
        金額: amount ?? 0,
        課税区分: '課税仕入',
        摘要: invoiceData.機械型式 || '',
        備考: item.摘要 || item.型式番号 || '',
        pdfFileName: pdfStoragePath.split('/').pop() || '',
        pdfStoragePath
      })
    }
  }
  return allLineItems
}
