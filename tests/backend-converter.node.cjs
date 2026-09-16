const test = require('node:test')
const assert = require('node:assert/strict')
const { convertToLineItems } = require('../functions/lib/services/lineItemConverter.js')
const { validateStructuredInvoice } = require('../functions/lib/services/gptService.js')
const { matchShipName } = require('../functions/lib/services/matchingService.js')

function invoice() {
  return {
    仕入先名: 'サンプル部品株式会社', 仕入日: '2026-01-01', 機械型式: 'DEMO-100',
    ships: [{ ship_name: 'サンプル一号', items: [
      { 商品名: 'FILTER F-100', 数量: 2, 単価: 300, 金額: 123, 摘要: 'PART-100' },
      { 商品名: '小計', 数量: null, 単価: null, 金額: 600 },
      { 商品名: '不明部品', 数量: null, 単価: null, 金額: 50 }
    ] }, { ship_name: 'サンプル二号', items: [
      { 商品名: 'OIL 10', 数量: 1, 単価: 100, 金額: 99 }
    ] }]
  }
}

test('conversion retains products and null quantity, filters subtotal, corrects amounts and assigns stable IDs', async () => {
  const result = await convertToLineItems(validateStructuredInvoice(invoice()), 'サンプル部品株式会社', 'uploads/job-123/invoice.pdf', 'job-123')
  assert.equal(result.length, 3)
  assert.deepEqual(result.map(row => row.id), ['job-123-0', 'job-123-1', 'job-123-2'])
  assert.equal(result[0].商品名, 'FILTER F-100')
  assert.equal(result[0].金額, 600)
  assert.equal(result[0].仕入先コード, '201')
  assert.equal(result[0].得意先コード, '101')
  assert.equal(result[0].備考, 'PART-100')
  assert.equal(result[0].伝票番号, '')
  assert.equal(result[1].数量, null)
  assert.equal(result[1].単価, 0)
  assert.equal(result[2].金額, 99) // ¥1 difference is intentionally retained.
  assert.equal(result[2].得意先コード, '102')
  assert.equal(result[0].pdfStoragePath, 'uploads/job-123/invoice.pdf')
  assert.equal(result[0].pdfUrl, undefined)
})

test('malformed provider output is rejected rather than silently coerced', () => {
  for (const value of [null, {}, { 仕入先名: '例', 仕入日: '2026-01-01', ships: null }]) {
    assert.throws(() => validateStructuredInvoice(value))
  }
  const wrongNumber = invoice(); wrongNumber.ships[0].items[0].数量 = '2'
  assert.throws(() => validateStructuredInvoice(wrongNumber), /Invalid invoice number/)
  const infinity = invoice(); infinity.ships[0].items[0].金額 = Infinity
  assert.throws(() => validateStructuredInvoice(infinity), /Invalid invoice number/)
})

test('synthetic ship matcher never treats a subtotal as a vessel', () => {
  assert.equal(matchShipName('サンプル一号'), 'サンプル一号')
  assert.equal(matchShipName('サンプル一号 合計'), null)
  assert.equal(matchShipName('unlisted vessel'), null)
})
