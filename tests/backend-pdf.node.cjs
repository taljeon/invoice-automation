const test = require('node:test')
const assert = require('node:assert/strict')
const { pdfPagesToImagesOnServer } = require('../functions/lib/services/pdfProcessor.js')
const { createCanvas, loadImage } = require('../functions/node_modules/@napi-rs/canvas')

// Entirely synthetic PDF: a red square. No copied invoice, font, image or network resource.
function createPdf(pageCount = 1, width = 300, height = 400) {
  const contentId = pageCount + 3
  const stream = '1 0 0 rg 50 50 100 100 re f'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    ...Array.from({ length: pageCount }, () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << >> /Contents ${contentId} 0 R >>`),
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ]
  let output = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = output.length
    output += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = output.length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(output)
}

test('server PDF.js and native canvas render a synthetic PDF into a correctly scaled JPEG', async () => {
  const images = await pdfPagesToImagesOnServer(createPdf())
  assert.equal(images.length, 1)
  const buffer = Buffer.from(images[0], 'base64')
  assert.equal(buffer.subarray(0, 2).toString('hex'), 'ffd8')
  const image = await loadImage(buffer)
  assert.equal(image.width, 600)
  assert.equal(image.height, 800)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const pixel = context.getImageData(150, 550, 1, 1).data
  assert.ok(pixel[0] > 240 && pixel[1] < 15 && pixel[2] < 15, 'the PDF red square must be visible')
})

test('over-limit pages fail rather than silently truncating the invoice', async () => {
  await assert.rejects(pdfPagesToImagesOnServer(createPdf(21)), /1–20 pages/)
})

test('invalid PDF sizes and unsafe rendering dimensions are rejected', async () => {
  await assert.rejects(pdfPagesToImagesOnServer(Buffer.alloc(0)), /Invalid PDF size/)
  await assert.rejects(pdfPagesToImagesOnServer(createPdf(1, 10000, 10000)), /dimensions/)
})
