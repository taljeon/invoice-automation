# 実行と環境設定

[English](../setup.md) · [日本語 README](../../README.ja.md)

基本的な目的は、合成データを使って構造と UI を確認することである。デモの実行、サーバーコードの検査、クラウド運用の構成は、それぞれ別の段階となる。この文書にクラウドの手順を記載していても、実際のアカウントやデプロイの準備が整っているという意味ではない。

## 1. 標準デモ

Node.js 22.13 以上と npm を用意し、ルートで実行する。

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Vite が表示するローカル URL を開く。`.env` がなくても、`VITE_DEMO_MODE !== 'false'` ならデモを選択する。`.env.example` を `.env.local` にコピーした場合も、既定値はデモである。

1. `サンプル2件を読み込む` ボタンを押す。
2. PDF 2 件と明細 3 行を確認する。
3. 2 つ目の PDF 原本で数量 2 を確認し、null の数量欄に入力する。
4. 商品名・金額などのセルを編集し、原本と照合する。
5. 仕入・売上 CSV をダウンロードする。
6. 履歴を開き、文書ごとの結果と編集内容を確認する。
7. 再読み込みすると、デモのメモリーと編集履歴は消える。

数量が未確定の場合に export がブロックされるのは正常な動作である。デモで任意の PDF を選択すると、実際の OCR は実行しない旨が案内される。サンプルを繰り返し追加するボタンは、文書がすでに存在するときには制限される。

## 2. ローカル検証コマンド

```sh
npm run type-check
npm run build
npm run test:run
```

サーバーの型検査には、別途インストールと build が必要である。

```sh
npm --prefix functions ci
npm --prefix functions run build
```

正確な検証対象と実施結果は、[CHECKS.ja.md](../../CHECKS.ja.md) と[検証記録](verification.md)を基準とする。`functions` の `@napi-rs/canvas` は、OS・アーキテクチャ別の native パッケージを使用する。インストール・型検査だけでレンダリングに成功すると判断せず、同梱の `backend-pdf.node.cjs` で合成 PDF を実際にレンダリングして検査する。

`npm test` は、フロントエンドの unit tests とサーバーの build/Node tests をまとめて実行する。Firestore・Storage ルールの検証は、Firebase CLI と emulator に必要な Java 環境を準備した後、別途実行する。

```sh
firebase emulators:exec --only firestore,storage --project demo-invoice-public 'node tests/backend-rules.emulator.cjs'
```

`firebase.json` のローカルポートは、Firestore が 8088、Storage が 9198 である。tests は合成ユーザーの認証 context を使う。このルールテストは、実際の Firebase Auth ログインから Vision/LLM までの全体統合テストではない。`npm --prefix functions run serve` も Functions emulator だけを起動し、フロントエンドを含む全体の emulator 接続は別途構成する必要がある。

## 3. フロントエンドの環境変数

ルートの `.env.example` を基準とする。Vite 変数はビルド時にバンドルへ含まれるため、公開クライアント設定だけを置く。

| 変数 | 用途 |
|---|---|
| `VITE_DEMO_MODE` | 既定値は true。厳密に false の場合にクラウドモード |
| `VITE_FIREBASE_API_KEY` | 自分の Firebase web app 設定の API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | 自分のプロジェクトの認証ドメイン |
| `VITE_FIREBASE_PROJECT_ID` | 自分のプロジェクト ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | 自分のプロジェクトの bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | web app の設定値 |
| `VITE_FIREBASE_APP_ID` | web app ID |

クラウドを選んだのに必須値が空、または明らかな placeholder の場合は、画面に設定エラーを表示する。設定後は開発サーバーを再起動する。これらの値は Firebase web app を識別するクライアント metadata であり、OpenAI サービスの秘密鍵を入れる欄ではない。

現在の Settings 画面は設定の境界を説明する。API キーをブラウザーの localStorage に保存する入力欄はない。

## 4. サーバーの環境変数と secret

`functions/.env.example` を基準とする。実際のプロジェクト用環境ファイルはバージョン管理に含めない。

| 変数 | 既定値・例 | 意味 |
|---|---|---|
| `CLOUD_PROCESSING_ENABLED` | false | 厳密に true の場合に、サーバーの OCR/HTTP 経路を許可 |
| `FUNCTIONS_REGION` | asia-northeast1 | 関数のリージョン |
| `STORAGE_BUCKET` | 空値 | 明示しなければ Firebase Admin app の既定 bucket |
| `ALLOWED_ORIGINS` | localhost の例 | 許可するブラウザー Origin をカンマで連結 |
| `OPENAI_MODEL` | gpt-5 | JSON mode 呼び出しに使うモデル |
| `OPENAI_API_KEY` | env の例には値なし | Firebase Secret Manager の secret。ソース・VITE 変数には入れない |

`ALLOWED_ORIGINS` は scheme、host、port まで厳密に一致させる必要がある。たとえば、開発ブラウザーを `127.0.0.1` で開く場合、`localhost` だけを登録した例とは Origin が異なる。デプロイ後は自分の Hosting Origin も明示する。

フロントエンドの cloud モードとサーバーの有効化は、それぞれ設定する。片方を変更しただけで end-to-end OCR が可能になるわけではない。サーバーは既定で無効のため、初期状態から外部 AI 呼び出しが発生する構成にはしていない。

## 5. クラウドの構成手順

実際の運用リソースを新たに用意するときに確認する構成要素を示す。この公開用パッケージに接続された既存の運用プロジェクトやサービスアカウントはない。

1. 自分の Firebase プロジェクトに web app、Email/Password Auth、Firestore、Storage を構成する。
2. Google Cloud Vision の使用と、関数サービスアカウントに必要な権限を設定する。OpenAI キーは Secret Manager に保存する。
3. 自分の web app の値をフロントエンド設定に記入する。サーバーの bucket とリージョンを一致させる。
4. `firestore.rules`、`storage.rules` を読み、所有者別の許可・拒否を emulator で検証する。Storage ルールから Firestore への cross-service 参照権限も構成する必要がある。
5. 会社マスターを使う場合は、Admin の手順で `companies` に合成の `{name, variants}` データを投入する。提供するサンプルは実際のマスターの代わりにはならない。
6. `functions` の native PDF レンダリングを対象環境で検証する。
7. 認証した状態で、自分の合成 PDF を使い、ジョブ作成→処理→保存→履歴→CSV を確認する。
8. アカウントごとの分離、重複 finalize、エラー・timeout、金額・コード mapping、保持方針を確認したうえで、本番運用を有効にするか決定する。

Firebase のデプロイ先選択やリモートリポジトリの公開は、この文書によって自動実行されるものではない。実際のデプロイ前には、構成・検証・費用・権限と公開範囲を別途承認する必要がある。

## 6. Hosting と HTTP の接続

`firebase.json` は Vite の `dist` を Hosting 対象とし、SPA fallback と次の rewrite を設定している。

| パス | 関数 |
|---|---|
| `/api/ocr` | `processOCRHttp` |
| `/api/similarity` | `processSimilarityHttp` |
| `/api/signed-url` | `generateSignedUrl` |

rewrite のリージョンは、既定の関数リージョンと一致する必要がある。`FUNCTIONS_REGION` を変更する場合は、Hosting rewrite の region も変更する。開発用 Vite サーバーが Cloud Functions を自動 proxy すると考えない。特に、クラウド履歴の `/api/signed-url` リクエストは、その route が接続された origin で実行する必要がある。

HTTP POST には `Authorization: Bearer <Firebase ID token>` が必要である。origin allowlist は認証の代わりにはならない。signed URL のリクエスト body は `{ "filePath": "uploads/<jobId>/invoice.pdf" }` であり、サーバーは所有者・ファイルの存在を確認してから 15 分の URL を返す。この URL は、明細の永続的な public link として保存しない。

## 7. よくある状態

| 状態 | 確認する点 |
|---|---|
| デモの数量が空で export できない | 2 つ目の合成 PDF で数量を確認し、2 を入力 |
| クラウド設定エラー | VITE_DEMO_MODE、すべての Firebase web 設定、サーバー再起動 |
| permission-denied | ログイン UID、job path、デプロイした Firestore/Storage ルール |
| job が pending のまま | 関数の有効化、bucket の一致、Storage イベント・実行環境設定 |
| 5 分 timeout | サーバー処理が継続している場合がある。完了・失敗状態を確認してから重複送信を判断 |
| 履歴の PDF が開かない | signed-url rewrite、Origin、token、オブジェクトの所有権と存在 |
| サーバー import 時の canvas エラー | @napi-rs/canvas のプラットフォーム用バイナリーを確認し、実際のレンダリング test を実行 |
| コードが 0000/9999 | 合成 master にない名前、または未置換のデモ lookup |

トラブルシューティング中も、未加工の請求書・認証 token・provider 応答全文を公開 issue やログに貼らない。再現には合成入力を使い、公開する変更には検証結果と残る制約を記録する。
