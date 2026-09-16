# Directory and Code Map

[日本語](ja/code-map.md) · [README](../README.md)

This document distinguishes code that exists from code called by the current UI. When changing behavior, also consult its [data contract](data-model.md) and [CSV contract](csv-specification.md).

## Directory Layout

```text
.
├── src/
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Documents, editing, history, and auth state
│   ├── components/              # Upload, table, CSV, history, and auth UI
│   ├── config/                  # Runtime mode and Firebase configuration
│   ├── demo/                    # Synthetic PDFs/items and in-memory storage
│   ├── services/                # Active persistence/OCR and legacy references
│   ├── utils/                   # CSV contract, synthetic mappings, conversion
│   ├── types/                   # LineItem/PDFDocument types
│   └── data/                    # Synthetic company list for reference code
├── functions/
│   ├── src/index.ts             # Storage trigger and HTTP function exports
│   ├── src/services/            # Security, rendering, GPT, matching, converter
│   ├── package.json            # Node 22 server dependencies and scripts
│   └── tsconfig.json            # Server TypeScript compiler settings
├── docs/                       # Architecture, data, OCR, CSV, setup, limitations
├── tests/                      # Synthetic-input checks; see actual file list
├── firestore.rules             # User, job, and master access boundaries
├── storage.rules               # PDF-object ownership and creation boundaries
├── firebase.json               # Hosting, Functions, and rules configuration
├── package.json                # Frontend development, build, and test commands
└── .env.example                # Frontend configuration example without secrets
```

`dist/`, `functions/lib/`, and `node_modules/` are build or installation outputs. They are not separate features in the source architecture.

## Current UI and Services

| File / main symbol | Call relationship and responsibility |
|---|---|
| `main.tsx` | Renders `App` into the React root |
| `App.tsx` | Integrates runtime mode, document list, current line items, upload, editing, deletion, and history |
| `PDFUpload` | PDF selection and drag/drop; passes a File array to its parent |
| `EditableLineItemsTable` | Identifies source rows, commits/cancels cell edits, adds/deletes rows, and displays them by PDF |
| `CSVExport` | Export buttons and totals; calls the shared CSV helper |
| `HistoryModal` | Loads saved line items, groups them by document, and provides editing, deletion, CSV, and PDF opening |
| `PDFViewer` | Renders a File to a local PDF.js canvas; handles page navigation and task cleanup |
| `LoginForm` | Firebase Email/Password sign-in |
| `PasswordChangeModal` | Reauthenticates with the current password before setting a new password |
| `SettingsModal` | Explains the current mode and server-configuration boundary; no browser secret-key input |
| `config/firebase.ts` | `IS_DEMO_MODE`, config validation, SDK objects, and `requireCloudUser` |
| `demo/fixtures.ts` | Generates two synthetic text PDFs and three line items |
| `demo/documentState.ts` | Validates row ownership and redistributes rows using stable IDs and sourceDocumentId |
| `demo/session.ts` | Captures the authenticated user for an async operation and stops if that user changes |
| `demo/store.ts` | Lists, saves, updates, and deletes line items in a memory-only Map |
| `ocrServiceAsync.ts` | `processPDFWithOCRAsync` → job creation, subscription, and Storage upload |
| `firestoreService.ts` | Demo storage or user-scoped Firestore CRUD; excludes File fields |
| `utils/csvExport.ts` | Shared validation, purchase/sales rows, markup, summaries, and CSV encoding |
| `utils/*CodeMapping.ts` | Synthetic vessel/customer/supplier name-to-code lookup |
| `utils/katakanaConverter.ts` | Converts defined full-width katakana to half-width strings |

## Server

| File / symbol | Input → output | Role |
|---|---|---|
| `index.ts: processOCROnStorage` | Storage finalize → job status/results | Current main cloud path |
| `security.ts: authenticateBearer` | Authorization header → verified UID | Auxiliary HTTP authentication |
| `security.ts: parseUploadPath/ownsJobPath/canClaimJob` | Path, job, UID → ownership/claim decision | Main path and URL generation |
| `pdfProcessor.ts: pdfPagesToImagesOnServer` | PDF Buffer → JPEG base64 array | Main path |
| `index.ts: extractTextWithVisionAPI` | Base64 image → OCR text | Main path and HTTP OCR |
| `gptService.ts: structureInvoiceData` | OCR text → invoice JSON | Main path and HTTP OCR |
| `matchingService.ts: findBestCompanyMatchOnServer` | Company name → canonical name/similarity evidence | Main path |
| `lineItemConverter.ts: convertToLineItems` | Invoice → flattened line items | Main path |
| `index.ts: processOCRHttp` | Page-image array → structured results | Retained auxiliary HTTP path |
| `index.ts: processSimilarityHttp` | Supplier name or list → matching results | Auxiliary HTTP path |
| `index.ts: generateSignedUrl` | Owned filePath → temporary read URL | Auxiliary file-access path |

Company-name normalization and supplier/customer code lookup in `functions/src/services/matchingService.ts` have different levels of completeness. Company-name matching uses a Firestore master and Levenshtein comparison, while some code lookups and ProductMatcher are limited implementations for synthetic examples.

## Legacy Reference Implementations

| File | Retained functionality | Connection to the current UI |
|---|---|---|
| `services/ocrService.ts` | Browser PDF rendering, HTTP OCR requests, and legacy postprocessing | Not directly imported by App |
| `services/codeListService.ts` | Synthetic CSV master parsing and local exact/fuzzy code-candidate search | Under the legacy OCR path |
| `services/productMatchingService.ts` | Legacy product-code matching | Under the legacy OCR path |
| `services/postProcessingSimilarityService.ts` | Name correction using a static company list | Under the legacy OCR path |
| `services/ocrQualityService.ts` | Utilities for recording OCR stages and quality metrics | Under the legacy OCR path |
| `services/fuzzyMatchingService.ts` | Character variations and combined n-gram/Jaro-Winkler/Levenshtein matching | Dynamically imported by codeList |
| `services/matchingCacheService.ts` | Legacy matching-result cache | Not called by the current codeList |
| `services/consistencyService.ts` | Comparison of repeated legacy OCR results | Not connected to App |
| `services/crossValidationService.ts` | Comparison of fuzzy and LLM results | Not connected to App |
| `services/ocrEnhancementService.ts` | Experimental OCR correction of company names | Not connected to App |
| `services/storageService.ts` | Separate utility for user-scoped invoices uploads | Not used by the current job upload |
| `components/PDFList.tsx` | Separate list component | Not connected to App |
| `components/PDFModal.tsx` | Separate PDF modal | Not connected to App |
| `components/LineItemsTable.tsx` | Older, primarily read-only line-item table | Not connected to App |
| `lib/firebase.ts` | Re-exports Firebase objects from the shared config | Compatibility entry point that avoids duplicate initialization |
| `config/companyVariants.ts`, `data/companies.ts` | Synthetic name variants for reference matching | Under the legacy matching modules |

The legacy `ocrService.ts` client does not attach the Bearer header required by the current server. Its presence does not mean the server endpoint can be reused unchanged: reconnection requires token forwarding and alignment with the changed environment. The legacy path is outside the default demo's supported behavior. Its external calls, master files, and configuration are separate from the current asynchronous path and require separate integration and verification before reuse.

## Finding the Right Change Point

- Adding a visible line-item field: check `types/index.ts` → converter → editable table → persistence → whether CSV should include it, in that order.
- Changing the CSV import format: update the column contract in `utils/csvExport.ts`, then update synthetic tests and `csv-specification.md`.
- Changing demo transaction rules: update the shared CSV policy and tests together. Do not put actual contract terms into public fixtures.
- Making master matching operational: connect backend `matchingService` stubs to a separate master schema, and add user-permission and data review.
- Changing the OCR model: verify the server `OPENAI_MODEL` setting and JSON-response compatibility. Do not add service keys to the client.
- Defining PDF retention: design a separate lifecycle covering Storage, jobs, and user line items together.

`package.json` and the lockfile are the dependency sources of truth. The frontend and server maintain separate package.json files and lockfiles. Both currently use PDF.js 6, and the server dynamically imports its ESM legacy build. Updating one side's dependencies does not imply that the other side has also been updated.
