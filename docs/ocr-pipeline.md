# OCR Processing Stages and Limits

[日本語](ja/ocr-pipeline.md) · [README](../README.md)

The current UI entry point is `processPDFWithOCRAsync`. The following describes the implemented cloud path, which users must configure separately, rather than the demo-generation path.

## 1. Job Creation and Upload

The frontend checks the signed-in user and rejects empty files, files larger than 20MiB, and files that do not meet the PDF-extension requirement. It creates a UUID job ID and uses the fixed Storage filename `invoice.pdf` to keep personal information out of object paths. The original filename remains in line-item display metadata. It first saves the owner and path in `ocr_jobs`, then attaches `onSnapshot`, and finally uploads the PDF.

The create-before-subscribe order matters because read permission depends on ownership information in an existing job. The upload specifies `application/pdf` metadata. Uploading a file to Storage does not itself mean that line items have been saved.

## 2. Claiming Processing in the Storage Trigger

`processOCROnStorage` checks the following:

- Server `CLOUD_PROCESSING_ENABLED` is `true`.
- The target bucket and upload-path format match expectations.
- Metadata identifies a PDF, and its size is greater than 0 and at most 20MiB.
- The job exists, and its owner UID, filename, and storagePath match.
- The job status is `pending`.

The final status change uses a Firestore transaction. Only the operation that records `processing` and the object generation in that transaction proceeds to external OCR calls. This reduces duplicate paid calls caused by redelivery of the same finalize event. It is not a design for automatically recovering retries of jobs already in progress.

## 3. PDF → Images

Actual parameters of `pdfPagesToImagesOnServer`:

| Item | Implementation value |
|---|---|
| Input | PDF Buffer |
| File size | At least 1 byte, at most 20MiB |
| Page count | 1–20; exceeding the limit rejects the whole document |
| Renderer | Server PDF.js legacy build + @napi-rs/canvas |
| Scale | 2; approximately 144dpi at the usual PDF basis of 72pt |
| Page pixel limit | width × height ≤ 20,000,000 |
| Output | Base64 array of JPEGs at quality 0.85 |
| Page rendering | Sequential |
| Cleanup | Page cleanup; PDF destroy in finally |

The renderer does not silently truncate pages and return success. The server dynamically imports the PDF.js ESM legacy build and uses @napi-rs/canvas. Synthetic PDF-rendering tests and deployment-environment compatibility are separate matters; see [verification.md](verification.md) for the actual verification scope.

## 4. Vision OCR

Each JPEG is sent to `documentTextDetection` with language hints `ja` and `en`. Input base64 is cleaned and checked, and an explicit Vision error causes failure. The main async path sends page requests in parallel through `Promise.all`.

The result is `fullTextAnnotation.text`. Text is combined into one document in page order, with separator strings. The LLM receives this text rather than the original images again. There is no separate table-reconstruction engine based on OCR position coordinates.

## 5. LLM Structuring

`structureInvoiceData` sends a system prompt and OCR text to the OpenAI Chat Completions API.

| Setting | Value |
|---|---|
| Model | Server `OPENAI_MODEL`, default `gpt-5` |
| Response mode | `response_format: { type: 'json_object' }` |
| Completion-token limit | `max_completion_tokens: 16384` |
| Key | `OPENAI_API_KEY` injected from Secret Manager |
| Processing after success | JSON.parse → `validateStructuredInvoice` |

The prompt's main instructions are:

1. Preserve product names, part numbers, model names, and symbols as they appear in the OCR text.
2. Do not infer quantities from patterns in other rows. Use null when unreadable.
3. Allow limited normalization, such as full-width digits and currency symbols/commas in numbers.
4. Analyze table headers and rows, and join multiline product names.
5. Group items by vessel columns or the vessel names in rows.
6. Exclude total, subtotal, tax, freight, and fee rows from items.
7. Normalize recognizable dates to YYYY-MM-DD.
8. Use the supplier name read from the document; do not replace it with an assumed company.

The prompt's vessel list contains three synthetic vessels. It must not be treated as a real vessel master. Prompt instructions are neither an accuracy guarantee nor a mathematical proof of OCR correction.

The validator checks structure and basic value types, not date semantics, tax, totals, or document authenticity. There is also no additional splitting-and-merging process for documents that exceed output-token or context limits.

## 6. Supplier-Name Matching

`findBestCompanyMatchOnServer` reads the `companies` collection. If it is empty, the OCR name is retained. When a master exists, the input is trimmed and lowercased, then compared in this order:

1. Exact canonical-name match: `exact`.
2. Exact registered-variant match: `variant_exact`.
3. Highest Levenshtein score among canonical names and variants: `similarity`.
4. If no candidate reaches the 0.7 threshold: `none`, retaining the original text.

The score is `1 - distance / maxLength`. The comparison function returns 1 when both strings are empty, but the outer function first classifies empty input as `none`. No separate business-priority rule resolves candidates tied for the highest score. A model's probabilistic confidence and a name-string similarity score are different concepts.

This matching only normalizes names. Code lookup uses separate synthetic supplier/customer tables, while product codes come from a demo lookup with a few keywords.

## 7. Flattening and Correcting Line Items

`convertToLineItems` flattens vessel-specific items into one array. Each row receives a `jobId-index` ID and an empty voucher number. Supplier/customer codes, the original filename, and the internal Storage path are attached. No public read URL is generated and included in the result.

Rows are excluded if their product name is empty or contains any of these keywords:

```text
小計 合計 総計 TOTAL SUBTOTAL 消費税 税 TAX 税込 税抜 運賃 送料 手数料
```

English text is compared in uppercase. Because filtering uses simple substrings, legitimate product names containing these characters may be removed, and freight or fees that are actual billable items may also be omitted.

The exact numeric-correction behavior is:

```text
if quantity and unitPrice are both non-null
    product = quantity × unitPrice
    if amount is null or <= 0 or abs(product - amount) > 1
        amount = product
```

A difference of exactly 1 is retained, and no separate decimal rounding is applied. The code does not check why a discount exists, so a discounted amount may be overwritten. Final quantity preserves null, but null unitPrice/amount values become 0. Since CSV allows 0, users must also check prices against the source.

The header's `機械型式` is stored in `摘要`, and the item's `摘要` or `型式番号` in `備考`. There is no stage that checks line-item totals against `document_subtotal`.

## 8. Completion, Errors, and Timeouts

On completion, the server saves results to the job and changes its status to `completed`. The browser associates the results with the document ID and original display filename, then saves them to the user's line-item collection. Subsequent cell edits update only the line items, without rerunning OCR.

Server processing exceptions are delivered as generalized error messages. Raw provider responses, OCR text, and file paths are not appended to error responses. Failed PDFs do not produce fabricated rows that look like normal accounting entries.

The client stops waiting after five minutes, while the server can run for up to 540 seconds. Consequently, a completed result can remain on the server without reaching the UI or being saved as user line items. Resubscription UI, cancellation, leases, automatic retries, and orphan cleanup remain incomplete areas.

## 9. Auxiliary HTTP Paths

| Function | Request | Response / differences |
|---|---|---|
| `processOCRHttp` | `pageImages`, `pdfFileName` | success/data/processingTime. Image OCR is sequential; null groups are excluded after synthetic vessel matching |
| `processSimilarityHttp` | `supplierName` or `batchMode:true, supplierList` | Single/batch matching; at most 50 names per batch and 200 characters per name |
| `generateSignedUrl` | `filePath` | `{ signedUrl }` after ownership verification; expires after 15 minutes |

HTTP image requests must contain 1–20 images, with each string at most 8MiB and all strings together at most 28MiB. Every POST requires server enablement and a Firebase ID token; if a browser Origin is present, it must be on the allowlist. The main Storage path and HTTP paths differ in their input mechanisms and vessel-filtering behavior. The legacy reference `ocrService.ts` does not automatically forward the new authentication header, so reconnecting it to these HTTP endpoints requires separate changes.
