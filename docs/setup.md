# Running and Configuring the Application

[日本語](ja/setup.md) · [README](../README.md)

The default purpose is to review the architecture and UI with synthetic data. Running the demo, checking server code, and configuring cloud operation are separate stages. Documenting cloud procedures does not mean that a real account or deployment is ready.

## 1. Default Demo

Install Node.js 22.13 or later and npm, then run these commands from the package root:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite. Even without an `.env` file, `VITE_DEMO_MODE !== 'false'` selects the demo. Copying `.env.example` to `.env.local` also leaves the default in demo mode.

1. Click `サンプル2件を読み込む`.
2. Confirm that two PDFs and three line items appear.
3. Check the source of the second PDF for quantity 2, then fill in the null quantity.
4. Edit cells such as product names and amounts, checking them against the source.
5. Download the purchase and sales CSVs.
6. Open history to inspect document-specific results and edits.
7. Refreshing clears demo memory and edit history.

Export is expected to be blocked while a quantity remains unresolved. Selecting an arbitrary PDF in demo mode shows a notice that actual OCR is not run. The sample-loading button is restricted when documents already exist, preventing repeated additions.

## 2. Local Verification Commands

```sh
npm run type-check
npm run build
npm run test:run
```

Server type checking requires a separate installation and build:

```sh
npm --prefix functions ci
npm --prefix functions run build
```

See [CHECKS.md](../CHECKS.md) and [verification.md](verification.md) for the exact verification scope and recorded results. The `functions` dependency `@napi-rs/canvas` uses OS/architecture-specific native packages. Installation and type checking alone do not establish rendering success; the included `backend-pdf.node.cjs` checks actual synthetic PDF rendering.

`npm test` combines frontend unit tests with the server build and Node tests. Firestore/Storage rule checks run separately after preparing the Firebase CLI and the Java environment required by the emulators.

```sh
firebase emulators:exec --only firestore,storage --project demo-invoice-public 'node tests/backend-rules.emulator.cjs'
```

The local ports in `firebase.json` are 8088 for Firestore and 9198 for Storage. Tests use synthetic user-authentication contexts. These rule tests are not an end-to-end integration test from actual Firebase Auth login through Vision/LLM processing. `npm --prefix functions run serve` also starts only the Functions emulator; full frontend-to-emulator wiring must be configured separately.

## 3. Frontend Environment Variables

The root `.env.example` is the reference. Vite variables are included in the bundle at build time, so they must contain only public client configuration.

| Variable | Purpose |
|---|---|
| `VITE_DEMO_MODE` | Defaults to true; exactly false selects cloud mode |
| `VITE_FIREBASE_API_KEY` | API key from your own Firebase web-app configuration |
| `VITE_FIREBASE_AUTH_DOMAIN` | Your project's authentication domain |
| `VITE_FIREBASE_PROJECT_ID` | Your project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Your project's bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Value from the web-app configuration |
| `VITE_FIREBASE_APP_ID` | Web-app ID |

If cloud mode is selected but required values are empty or obvious placeholders, the UI displays a configuration error. Restart the development server after configuring them. These values are client metadata identifying a Firebase web app, not fields for OpenAI service secrets.

The current Settings screen explains configuration boundaries. It has no input that stores API keys in browser localStorage.

## 4. Server Environment Variables and Secrets

`functions/.env.example` is the reference. Do not commit environment files containing actual project settings.

| Variable | Default / example | Meaning |
|---|---|---|
| `CLOUD_PROCESSING_ENABLED` | false | Server OCR/HTTP paths are enabled only when exactly true |
| `FUNCTIONS_REGION` | asia-northeast1 | Function region |
| `STORAGE_BUCKET` | empty | Uses the Firebase Admin app's default bucket if unspecified |
| `ALLOWED_ORIGINS` | localhost example | Comma-separated allowed browser Origins |
| `OPENAI_MODEL` | gpt-5 | Model used for JSON-mode calls |
| `OPENAI_API_KEY` | No value in the environment example | Firebase Secret Manager secret; never put it in source or VITE variables |

`ALLOWED_ORIGINS` must match the scheme, host, and port exactly. For example, opening the development browser at `127.0.0.1` produces a different Origin from an example that registers only `localhost`. After deployment, explicitly include your Hosting Origin as well.

Frontend cloud mode and server enablement are configured separately. Changing only one does not enable end-to-end OCR. The server is disabled by default so the initial setup does not immediately make external AI calls.

## 5. Cloud Configuration Sequence

These are the components to check when preparing your own operational resources. No existing operational project or service account is connected to the public-review package.

1. Configure a web app, Email/Password Auth, Firestore, and Storage in your own Firebase project.
2. Enable Google Cloud Vision and configure the required permissions for the function service account. Store the OpenAI key in Secret Manager.
3. Fill in the frontend configuration with your web-app values. Align the server bucket and region.
4. Read `firestore.rules` and `storage.rules`, then verify owner-specific allow/deny behavior in the emulators. Configure permissions for the Storage rules' cross-service Firestore lookups as well.
5. To use a company master, insert synthetic `{name, variants}` data into `companies` through an administrative procedure. The provided example is not a substitute for an actual master.
6. Verify native PDF rendering in `functions` for the target environment.
7. With your own authenticated synthetic PDF, verify job creation → processing → saving → history → CSV.
8. Review account isolation, duplicate finalize events, errors/timeouts, amount/code mappings, and retention policies before deciding whether to enable operation.

This document does not automatically select a Firebase deployment target or publish a remote repository. Actual deployment requires separate approval of configuration, verification, costs, permissions, and publication scope.

## 6. Hosting and HTTP Connections

`firebase.json` serves Vite's `dist` through Hosting and defines an SPA fallback plus these rewrites:

| Path | Function |
|---|---|
| `/api/ocr` | `processOCRHttp` |
| `/api/similarity` | `processSimilarityHttp` |
| `/api/signed-url` | `generateSignedUrl` |

Rewrite regions must match the default function region. If `FUNCTIONS_REGION` changes, update the Hosting rewrite regions as well. Do not assume that the development Vite server automatically proxies Cloud Functions. In particular, the cloud history view's `/api/signed-url` request must run from an origin where that route is connected.

HTTP POST requests require `Authorization: Bearer <Firebase ID token>`. The origin allowlist does not replace authentication. A signed-URL request body is `{ "filePath": "uploads/<jobId>/invoice.pdf" }`; after checking ownership and file existence, the server returns a URL valid for 15 minutes. It is not stored as a permanent public link on the line item.

## 7. Common States

| State | What to check |
|---|---|
| Demo export blocked by an empty quantity | Check the second synthetic PDF and enter 2 |
| Cloud configuration error | VITE_DEMO_MODE, all Firebase web settings, and development-server restart |
| permission-denied | Signed-in UID, job path, and deployed Firestore/Storage rules |
| Job remains pending | Function enablement, matching bucket, and Storage-event/runtime configuration |
| Five-minute timeout | The server may still be running; check completion/failure status before deciding to resubmit |
| History PDF does not open | signed-url rewrite, Origin, token, object ownership, and existence |
| Canvas error on server import | Check the @napi-rs/canvas platform binary and run the actual rendering test |
| Codes are 0000/9999 | Names outside the synthetic master, or demo lookups that have not been replaced |

During troubleshooting, do not paste raw invoices, authentication tokens, or complete provider responses into public issues or logs. Build reproductions with synthetic inputs and record verification results and remaining limitations for published changes.
