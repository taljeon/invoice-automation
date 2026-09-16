import type { LineItem, PDFDocument } from '../types'

// Construct two tiny, text-only PDFs from invented values. No copied invoice asset.
function createSyntheticPDF(fileName: string, lines: string[]): File {
  const escaped = (text: string) => text.replace(/([\\()])/g, '\\$1')
  const content = `BT /F1 16 Tf 48 780 Td ${lines.map((line, index) => `${index ? '0 -30 Td ' : ''}(${escaped(line)}) Tj`).join('\n')} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new File([pdf], fileName, { type: 'application/pdf' })
}

export function createDemoDocuments(): PDFDocument[] {
  const rows: Omit<LineItem, 'id'>[][] = [[
    { 仕入日: '2026-01-15', 伝票番号: 'DEMO-001', 仕入先コード: '201', 仕入先名: 'サンプル部品株式会社', 得意先コード: '101', 得意先名: 'サンプル一号', 商品コード: 'D1', 商品名: 'デモ用フィルター A-100', 数量: 2, 単価: 1200, 金額: 2400, 課税区分: '課税10.0%', 摘要: '架空データ / 型式 DEMO-A' },
    { 仕入日: '2026-01-15', 伝票番号: 'DEMO-001', 仕入先コード: '201', 仕入先名: 'サンプル部品株式会社', 得意先コード: '101', 得意先名: 'サンプル一号', 商品コード: 'D1', 商品名: 'デモ用パッキン B-200', 数量: 1, 単価: 8000, 金額: 8000, 課税区分: '課税10.0%', 摘要: '架空データ' },
  ], [
    { 仕入日: '2026-01-16', 伝票番号: 'DEMO-002', 仕入先コード: '202', 仕入先名: '架空機械株式会社', 得意先コード: '102', 得意先名: 'サンプル二号', 商品コード: 'D2', 商品名: 'デモ用バルブ C-300', 数量: null, 単価: 4750, 金額: 9500, 課税区分: '課税10.0%', 摘要: '数量未確定の編集例。サンプルPDFの数量は2。' },
  ]]
  const pdfLines = [
    ['SYNTHETIC INVOICE - DEMO ONLY', 'DEMO-001 / 2026-01-15', 'Sample Parts Co. (201) / Sample Vessel 1 (101)', 'Filter A-100 : 2 x JPY 1200 = JPY 2400', 'Packing B-200 : 1 x JPY 8000 = JPY 8000', 'Total before tax: JPY 10400', 'All names and values are invented. No OCR was performed.'],
    ['SYNTHETIC INVOICE - DEMO ONLY', 'DEMO-002 / 2026-01-16', 'Fictional Machines Co. (202) / Sample Vessel 2 (102)', 'Valve C-300 : 2 x JPY 4750 = JPY 9500', 'Total before tax: JPY 9500', 'The table intentionally starts with an unknown quantity.', 'Set quantity to 2 to practice manual review.', 'All names and values are invented. No OCR was performed.'],
  ]
  return rows.map((lineItems, index) => {
    const id = `demo-${crypto.randomUUID()}`
    const file = createSyntheticPDF(`demo-invoice-00${index + 1}.pdf`, pdfLines[index])
    return {
      id, file, uploadedAt: new Date(), status: 'completed',
      lineItems: lineItems.map((item, row) => ({
        ...item, id: `${id}-${row}`, sourceDocumentId: id, pdfFileName: file.name, pdfFile: file,
      })),
    }
  })
}
