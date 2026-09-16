# Implementation Scope and Remaining Limitations

[日本語](ja/limitations.md) · [README](../README.md)

This document supports review of the public source and default demo. It distinguishes implemented safeguards, missing functionality, and behavior not checked in a real environment. It does not claim that the entire project is production-ready or supports every invoice format.

## 1. What Can Be Verified

| Area | Verifiable in the source and demo | Requires separate environment verification |
|---|---|---|
| UI | Synthetic PDFs and line items, editing, row addition/deletion, history, downloads | Real-user accessibility and different browsers/screen sizes |
| CSV | Deterministic column layout, validation, synthetic markup, Shift-JIS conversion | Imports into each accounting-software version/configuration |
| Server architecture | Job ownership, claiming, and renderer/OCR/LLM integration code | Native renderer and actual service calls |
| Access control | Server token checks, user-scoped paths, rules source | Whether deployed IAM/rules match the locally verified rules |
| Accuracy | Conversion rules for synthetic inputs | Real-invoice OCR accuracy, review time, and cost |

Passing type checks and unit tests is separate from successful external-service integration. Actual verification results are recorded in [verification.md](verification.md). This document does not provide unmeasured processing times, accuracy rates, or savings figures.

## 2. Synthetic Demo Scope

- Two PDFs and three line items are generated in code. The fixtures are not copies of existing invoices.
- PDFs use mainly English and numeric text readable with basic fonts; the UI line items use Japanese.
- One row deliberately lacks a quantity to demonstrate a person checking the PDF.
- No actual OCR or LLM calls run. There is no offline OCR that extracts content from arbitrary PDFs.
- Only browser memory is used, so data, edits, and history disappear on refresh.
- A new row in the main combined table is attached to the first document; in document-specific history, it is attached to that document. There is no separate document-selection dialog.

## 3. Business-Rule Limitations

1. Supplier/customer and product codes use synthetic lookups. There is no real master synchronization, approved change history, or code-validity management.
2. Accepting a company at a name-similarity score of at least 0.7 does not eliminate incorrect matches. Similarity does not mean accounting suitability or model confidence.
3. The OCR prompt's vessel examples are three synthetic vessels. There is no master-driven prompt generation for general handling of real document groups.
4. The server's quantity × unit-price correction does not interpret discounts, special prices, or returns. It can overwrite an actual discounted amount with the multiplication result.
5. Keyword filtering excludes rows containing subtotal/total/tax/freight/fee terms. Actual billable items or valid product names may also be omitted.
6. Unreadable null unit prices and amounts become 0 during conversion. Because 0 is valid in CSV, filling in the quantity does not complete price review.
7. Quantity, unit price, and purchase amount cells are edited independently. Changing quantity does not automatically recalculate the purchase amount.
8. This is not a general accounting engine with tax amounts by rate, exemptions, multiple currencies, discounts, shipping, returns, or reconciliation of taxable amounts and tax.
9. The prompt requests `document_subtotal`, but it is not compared with line-item totals to decide approval.
10. Voucher-number generation, duplicate-voucher validation, and finalization in accounting software are not implemented.

## 4. CSV Details That Need Particular Attention

- The 100,000 threshold and 10%/5% markups in this package are invented demo rules. They do not represent actual contracts or pricing policies.
- The purchase total determines the rate for the entire export selection. The same PDF can receive a different rate when exported with other documents.
- Direct code-field edits differ from CSV's name-based code lookup. Check final K/P values against the [40-column contract](csv-specification.md).
- Empty dates/names and null/non-finite numbers are blocked, but invalid date formats, unregistered codes, finite negative numbers, and quantity/amount mismatches are not automatically blocked.
- Half-width katakana and Shift-JIS conversion do not preserve every Unicode character.
- CSV quote escaping does not prevent spreadsheet formula interpretation.
- Several values, including tax-related classifications, are fixed. Each intended import environment requires its own checks.

## 5. Job Lifetime and Failure Recovery

The client stops waiting after five minutes, while the function can run for up to nine minutes. A timeout is not cancellation. There is no UI to resubscribe to results completed on the server but missed by the browser, or to recover them into user line items.

When Storage finalize is delivered repeatedly, a pending-only transaction claim prevents duplicate execution. However, there is no lease/retry mechanism for a processing job whose instance stops during execution. Reprocessing after failure creates a new job, and separate jobs are not compared for identical PDF contents.

Saving, updating, or deleting multiple line items uses sequential requests. If an operation fails partway through, some rows may already have been saved. The UI reports the error but provides neither a whole-document rollback nor compensating transactions. Reopen history to check the actual saved state.

Job results are stored as an array in one Firestore document, so documents with many line items or long strings can exceed Firestore's document-size limit. The 1,000-item maximum does not guarantee compliance with the byte-size limit. There is no page-by-page chunk-storage design.

## 6. Retention and Access Control

The package uses user-scoped line-item paths and job-ownership rules, and does not automatically delete older rows when saving. Conversely, deleting line items does not also delete their source PDFs or OCR jobs. There is no integrated management of TTL, retention periods, cascade deletion, audit logs, backups, and recovery.

Firestore rules for line items check only user boundaries. They do not enforce each field's schema or numeric constraints. Using user-authored line items as a trusted settlement ledger requires a separate server-side validation and finalization layer.

Auxiliary HTTP APIs check ID tokens and file ownership where required. Adding authentication does not by itself provide per-user cost quotas, rate limits, App Check, or a malicious-PDF sandbox. Throughput, billing, and access permissions need additional configuration for the real environment.

A 15-minute signed URL allows file reading during its validity period. It is not stored as a permanent public URL and should not be used as an external sharing feature. Expiry and permission boundaries require verification in the operational environment.

## 7. Server and Model Runtime

- Server PDF rendering depends on @napi-rs/canvas native packages. Local synthetic rendering-test coverage and actual deployment compatibility require separate checks.
- PDFs are limited to 20MiB/20 pages and a per-page pixel limit. Full support for scan quality, encryption, corruption, special fonts, or complex pages is not guaranteed.
- Async Vision processing runs pages in parallel without a separate concurrency pool, backoff, or provider-specific retry policy.
- The model defaults to `gpt-5`, but model access, pricing, and response compatibility must be checked for the account being used.
- JSON mode and type validation do not verify the facts in an actual document. Users must review omissions, misread characters, and incorrect matches.
- The default local emulator commands do not provide a complete end-to-end emulator configuration.

## 8. Reference Code and Licensing

Legacy HTTP OCR, fuzzy matching, repeated-result comparison, and quality-recording code remain available for architectural review. They must not be treated as equally verified with the path used by the current App. The older codeList path uses exact/fuzzy matching against local synthetic masters instead of browser AI-key calls. Bearer-token forwarding required by the server is not yet connected in the legacy OCR client, so it cannot replace the active path unchanged.

Publication of project source, third-party dependency licenses, and rights granted to users are separate matters. [LICENSE-NOTICE.md](../LICENSE-NOTICE.md) is the reference; this document does not assign an arbitrary open-source license or ownership rights.
