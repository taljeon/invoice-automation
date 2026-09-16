# Contents and Exclusions of the Public-Review Copy

[日本語](ja/publication-scope.md) · [README](../README.md)

This package was prepared as a **new file tree**, selecting the necessary files from the source of the operational implementation. It is not a clone of the original Git repository or a distribution containing its history. The user authorized publication of this sanitized copy on 2026-09-17. The original repositories remain private; service deployment is outside this release.

## Included Content

- React UI: PDF selection and local preview, line-item review/editing, row addition/deletion, history, CSV export, and cloud-authentication UI.
- Server processing: PDF rendering → Vision text extraction → LLM JSON structuring → company-name normalization → row conversion → job-result storage.
- State and boundaries: client job subscriptions, owner-scoped Firestore paths, Storage job paths, authenticated auxiliary HTTP APIs, and security rules.
- Conversion rules: 40-column CSV contract, quote escaping, CRLF, Shift-JIS, half-width katakana, and an explicit synthetic markup policy.
- Fictional inputs: two code-generated PDFs and three line items, plus example masters for three suppliers and three vessels. These are not copies of actual documents or partially anonymized source records.
- Algorithm reference code: string similarity, caching, cross-validation, repeated-result comparison, and legacy HTTP processing. The code map distinguishes these from the active flow.
- English and Japanese READMEs, overviews, and detailed architecture, setup, and limitation documents, with reproducible verification commands and synthetic tests.

## Excluded or Replaced Content

| Target | Treatment |
|---|---|
| `.git` and previous commit/branch/tag/remote/author metadata | Not imported |
| Actual invoices, CSV/Excel exports, databases/backups, raw logs | Not imported |
| Customer, supplier, and vessel names/codes/frequency tables | Replaced with synthetic masters |
| Existing operational projects, buckets, folders, addresses, and environment files | Excluded; replaced with empty configuration examples for the user's own environment |
| Keys, tokens, and runtime-credential configuration | Excluded; AI secrets are documented within the server Secret Manager boundary |
| Meeting notes, internal research, existing screenshots, private documents | Excluded; public explanations were newly written from code behavior |
| Customer-specific pricing terms | Calculation structure retained; thresholds and multipliers replaced with demo values |
| Previous generated `functions/lib`, build output, dependencies | Excluded from the ZIP; regenerated from lockfiles in each environment |
| Assumptions about ownership/publication permission and unsupported performance figures | No new claims made |

The package does not include a substitution dictionary mapping values back to the original operational environment, original locations, private-repository links, or past commit IDs. General algorithm explanations do not reintroduce clues identifying original customers.

## Behavior Changed During Public-Review Preparation

The following areas were adjusted where removing strings alone would not have produced a reviewable copy:

- A default offline demo accessible without an account. Arbitrary PDFs are not presented as though actual OCR has been performed.
- Stable row and source-document IDs, preventing edits to one PDF from being duplicated into another.
- A captured user session for persistence operations, rejecting late responses and subsequent writes after an account change.
- Removal of automatic deletion of older data when line-item counts exceeded 100.
- Shared CSV logic for the current screen and history, displayed totals matching per-row rounding, and export blocked for unresolved quantities.
- Removal of browser AI-key input and localStorage persistence. Reference master matching uses local synthetic data.
- Added HTTP authentication, job/PDF ownership checks, default server disablement, duplicate-job claiming, and refusal to overwrite Storage objects.
- Rejection of PDFs exceeding the server page limit instead of silent truncation; verification of local PDF rendering and updated compatible dependencies.

## Package for GitHub Review

`python3 scripts/export-public-package.py` creates two files beside the package:

- `invoice-automation-public.zip`: an archive containing only source, documentation, and synthetic examples intended for review.
- `invoice-automation-public.manifest.json`: file sizes and SHA-256 hashes, the ZIP SHA-256, and whether Git history is excluded.

The archive includes `LICENSE-NOTICE.md`. The user approved publication of the reviewed copy on 2026-09-17. No MIT or other open-source license has been selected or granted for this source. Public visibility and a license grant are separate; third-party dependency licenses remain applicable.

## Publication and Service Operation Are Separate

Approval to publish code does not authorize service deployment, user-data upload, or paid OCR execution. Technical verification results and remaining dependency/operational limitations are recorded in the [verification record](verification.md); design constraints are documented in [limitations](limitations.md).
