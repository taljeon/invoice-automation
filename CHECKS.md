# Verification

[English](CHECKS.md) · [日本語](CHECKS.ja.md) · [README](README.md)

Use Node.js 22.13+ (or a supported newer LTS) and Python 3. Dependencies are locked independently for the frontend and backend.

```sh
npm ci --ignore-scripts
npm --prefix functions ci --ignore-scripts
npm run check
```

`npm run check` runs frontend TypeScript, Vitest synthetic unit/integration tests, backend TypeScript and Node test suites, the production frontend build, and the public-package privacy check. These checks do not call OCR, AI, Firebase, or accounting services.

Additional release checks:

```sh
npm audit
npm --prefix functions audit
python3 scripts/export-public-package.py
```

The export command creates a source-only ZIP and SHA-256 file manifest next to the package, excluding dependencies, compiled output, local configuration, and all Git metadata. No commit, push, remote creation, or publication is performed.

Manual browser checks: start `npm run dev`, load synthetic examples, view the synthetic PDF, edit a row, add/delete rows, switch history, verify the other invoice remains unchanged, and download purchase/sales CSV. Default demo network traffic must stay on the local development origin.

The dated verification report distinguishes executed checks (including local native PDF rendering and isolated rules emulators) from cloud deployment, live OCR accuracy, provider billing/access and accounting software import, which were not tested. Passing compile/tests is not proof of live integration.

Rules integration can be checked with Java 21+ and Firebase CLI installed:

```sh
firebase emulators:exec --only firestore,storage --project demo-invoice-public 'node tests/backend-rules.emulator.cjs'
```

Use the explicit demo project. This tests local rules only; it does not deploy them.
