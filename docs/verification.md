# Verification Record

[日本語](ja/verification.md) · [README](../README.md)

Verification date: **2026-09-17**. The target was the source of this public-review copy; the existing operational repository, remote configuration, and actual customer data were not changed. **Source publication was authorized on 2026-09-17 after preparation and language review.** The runtime evidence below was recorded before publication; service deployment and any new license grant remain outside this release.

## Automated Verification

Execution environment: macOS, Node.js 24.10.0, npm 11.10.1, Python 3. The package's minimum Node version is 22.13.0, and the configured function deployment runtime is Node 22. This record does not claim a separate local execution under the Node 22 runtime itself.

| Check | Result | What it verified |
|---|---|---|
| `npm run type-check` | Passed | All retained active and reference TypeScript |
| `npm run test:unit` | 15 passed | CSV columns/calculation/encoding/quantity validation, demo CRUD/IDs/document association, and write/read isolation during account changes |
| `npm run test:backend` | 11 passed | Server build; authentication, paths, ownership, job claiming; JSON-to-line-item conversion; actual PDF rasterization and size/page limits |
| `npm run build` | Passed | Vite production bundle and local PDF worker generation |
| `python3 scripts/check-public-package.py` | No findings | Secret patterns, personal emails, local paths, and disallowed exportable files; checkout metadata is excluded |
| Firestore/Storage emulator integration | Passed | Blocking unauthenticated/cross-user access and forged/modified jobs; PDF path/MIME/ownership checks; rejection of existing-object overwrites in a demo project |

A total of **26 unit and integration function tests** passed. The local security-rules emulator check was a separate scenario run and was not arbitrarily added to that count.

The server PDF tests checked more than file structure. They rendered a synthetic PDF to JPEG with PDF.js 6 and native `@napi-rs/canvas`, then checked dimensions and the fixture's colored pixels. They also confirmed that input exceeding 20 pages is rejected rather than partially processed.

## Browser Flow Verified

The following was checked on the local development server at a desktop viewport of 1440×900:

- The demo starts without an account or API key and displays two synthetic PDFs and three line items.
- CSV export is blocked while an unknown quantity is shown as `?`.
- Changing that quantity to 2 displays a purchase total of 19,900, a sales total of 21,890 under the synthetic policy, and enabled export buttons.
- The local PDF.js canvas actually renders the synthetic invoice's title, items, amounts, and fictional-data notice.
- History separates the two PDFs into groups. Adding a blank row to the first document gives 4 rows/2 documents; deleting that fictional row restores 3 rows/2 documents. Counts on the main screen synchronize as well.
- No errors appeared in the browser error/warn logs during the check.

CSV generation, 40 columns, CRLF, escaping, and the Shift-JIS byte round-trip were verified by automated tests. Clicking the browser download button produced no error, but waiting for the download event in the Codex embedded browser timed out. **Verification by rereading a downloaded file outside the browser was not completed.** Passing file-generation tests is distinct from confirming that the browser finished saving a file.

Demo-mode blocking of cloud access was checked through code branches and mocked cloud-function calls. No separate packet-capture network audit was performed. Broad mobile, accessibility, and cross-browser QA were outside this verification scope.

## Pre-publication Information-Removal Checks

- A selective copy excluded personal information, customer masters, operational connection information, source records, and Git history from the outset.
- A separate local comparison between the copy and a list of customer identifiers extracted from the original source found no remaining occurrences. The identifier list itself is not included in the package.
- The default leak-check scanner flagged the `.env.example` filename as a high-risk path. The actual copy contains only empty Firebase settings and the default demo flag, with no keys or tokens. This was classified as a filename-based false positive.
- The separate package checker passed its check that example environment files contain no secret values.
- Only one npm-provider deprecation notice containing contact information was removed from the lockfiles. Dependency versions, download URLs, and integrity hashes were unchanged.
- ZIP generation excludes build output, dependencies, Git, and actual environment files, and records SHA-256 hashes for each file and the ZIP. The checker skips a normal checkout's `.git`; the release separately verifies a fresh repository with no imported commits.

Passing pattern scans does not mathematically guarantee the absence of every kind of sensitive information. The final file list and descriptions must also be reviewed when approving publication.

## Dependency Audit

npm registry audit results on the same date:

| Target | Critical | High | Moderate | Total |
|---|---:|---:|---:|---:|
| Frontend and development tools | 0 | 0 | 0 | 0 |
| Functions backend and development tools | 0 | 0 | 2 | 2 |

The two backend warnings are not two separate vulnerabilities: **one uuid advisory is reflected in both the uuid and gaxios packages** through the `@google-cloud/storage → google-auth-library/gaxios → uuid` dependency path. [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns bounds checking in uuid v3/v5/v6 calls that supply a buffer. It remains within the installed upstream packages' compatible version ranges and is recorded here; an unverified major-version override was not forced. Exploitability in this actual application was neither separately demonstrated nor ruled out.

Accordingly, this package must not be described as having “zero dependency vulnerabilities” or as having “passed an operational security audit.” Review this residual risk before publication and apply an upstream fix or a separately verified mitigation before actual cloud execution. The current default demo does not run that server.

## Not Executed During the Runtime Verification

- Actual Cloud Vision/OpenAI calls, or measurements of real-invoice accuracy, processing time, or cost.
- Inspection of actual Firebase/GCP account resources, IAM, or deployed rules, or actual cloud end-to-end OCR.
- CSV import and accounting-entry finalization in actual accounting software.
- Integrated verification of operational rate quotas and retention/deletion/backup/recovery policies.
- Deletion or rewriting of original repository history, or revocation/rotation of past keys.
- GitHub publication was not part of the runtime checks recorded here; the user subsequently authorized publishing the sanitized source. No service deployment was authorized or performed.

Verification of limited code paths and new synthetic data must not be presented as real customer outcomes or operational guarantees. See [limitations](limitations.md) for detailed design limits and [publication-scope](publication-scope.md) for the included and excluded publication content.
