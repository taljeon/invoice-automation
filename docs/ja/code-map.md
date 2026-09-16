# フォルダー構成とコードマップ

[English](../code-map.md) · [日本語 README](../../README.ja.md)

この文書では、ファイルが存在することと、現在の UI から呼び出されることを区別する。実装を変更するときは、対応する動作の[データ契約](data-model.md)と [CSV 契約](csv-specification.md)もあわせて確認する。

## ディレクトリ

```text
.
├── src/
│   ├── main.tsx                 # React エントリーポイント
│   ├── App.tsx                  # 文書・編集・履歴・認証状態の統合
│   ├── components/              # アップロード・表・CSV・履歴・認証 UI
│   ├── config/                  # 実行モードと Firebase 設定
│   ├── demo/                    # 合成 PDF・明細、メモリーストレージ
│   ├── services/                # 現行の永続化・OCR と旧参照実装
│   ├── utils/                   # CSV 契約、合成コードマッピング、文字変換
│   ├── types/                   # LineItem/PDFDocument 型
│   └── data/                    # 参照用の合成会社一覧
├── functions/
│   ├── src/index.ts             # Storage trigger と HTTP 関数の export
│   ├── src/services/            # security, render, GPT, matching, converter
│   ├── package.json            # Node 22 サーバーの依存関係・スクリプト
│   └── tsconfig.json            # サーバーの TypeScript コンパイル設定
├── docs/                       # 構成・データ・OCR・CSV・セットアップ・制約の英語文書
│   └── ja/                     # 各技術文書の日本語版
├── tests/                      # 合成入力の検証: 実際のファイル一覧を参照
├── firestore.rules             # ユーザー・ジョブ・マスターのアクセス境界
├── storage.rules               # PDF オブジェクトの所有者・作成の境界
├── firebase.json               # Hosting, Functions, rules の設定
├── package.json                # フロントエンドの開発・ビルド・テストコマンド
├── README.md                   # 英語の概要とクイックスタート
├── README.ja.md                # 日本語の概要とクイックスタート
└── .env.example                # 秘密値を含まないフロントエンド設定例
```

`dist/`、`functions/lib/`、`node_modules/` はビルド・インストールの生成物である。ソース構成の説明では、これらのディレクトリを独立した機能として扱わない。

## 現在の UI とサービス

| ファイル・主要シンボル | 呼び出し関係と役割 |
|---|---|
| `main.tsx` | `App` を React root にレンダリング |
| `App.tsx` | 実行モード、文書一覧、現在の明細、アップロード・編集・削除・履歴を統合 |
| `PDFUpload` | PDF ファイルの選択と drag/drop、親に File 配列を渡す |
| `EditableLineItemsTable` | 元の行の識別、セルの commit/cancel、追加・削除、PDF 別表示 |
| `CSVExport` | エクスポートボタンと合計の表示、共通 CSV ヘルパーの呼び出し |
| `HistoryModal` | 保存明細の読み込み、文書別グループ化、編集・削除・CSV・PDF 表示 |
| `PDFViewer` | File→ローカル PDF.js canvas レンダリング、ページ切り替え、処理のクリーンアップ |
| `LoginForm` | Firebase Email/Password ログイン |
| `PasswordChangeModal` | 現在のパスワードで再認証後、新しいパスワードを設定 |
| `SettingsModal` | 現在のモードとサーバー設定の境界を説明。ブラウザーでの秘密鍵入力はない |
| `config/firebase.ts` | `IS_DEMO_MODE`、config 検証、SDK オブジェクト、`requireCloudUser` |
| `demo/fixtures.ts` | 合成テキスト PDF 2 件と明細 3 行を生成 |
| `demo/documentState.ts` | 安定した ID と sourceDocumentId による行の所属確認・再振り分け |
| `demo/session.ts` | 非同期処理の認証ユーザーを固定し、変更時に中止 |
| `demo/store.ts` | メモリー内だけにある明細 Map の list/save/update/delete |
| `ocrServiceAsync.ts` | `processPDFWithOCRAsync` → job の作成・購読・Storage upload |
| `firestoreService.ts` | デモストレージまたはユーザー別 Firestore CRUD。File フィールドを除外 |
| `utils/csvExport.ts` | 検証・仕入/売上行・割増・集計・CSV エンコーディングの共通実装 |
| `utils/*CodeMapping.ts` | 合成船舶・得意先・仕入先の名前→コード検索 |
| `utils/katakanaConverter.ts` | 定義された全角カタカナを半角文字列に変換 |

## サーバー

| ファイル・シンボル | 入力 → 出力 | 位置づけ |
|---|---|---|
| `index.ts: processOCROnStorage` | Storage finalize → job 状態・結果 | 現在のクラウド主経路 |
| `security.ts: authenticateBearer` | Authorization header → 検証済み UID | 補助 HTTP 認証 |
| `security.ts: parseUploadPath/ownsJobPath/canClaimJob` | パス・job・uid → 所有者/claim 判定 | 主経路と URL 発行 |
| `pdfProcessor.ts: pdfPagesToImagesOnServer` | PDF Buffer → JPEG base64 配列 | 主経路 |
| `index.ts: extractTextWithVisionAPI` | base64 画像 → OCR テキスト | 主経路と HTTP OCR |
| `gptService.ts: structureInvoiceData` | OCR テキスト → JSON invoice | 主経路と HTTP OCR |
| `matchingService.ts: findBestCompanyMatchOnServer` | 会社名 → 標準名・類似度の根拠 | 主経路 |
| `lineItemConverter.ts: convertToLineItems` | invoice → 平坦化した明細 | 主経路 |
| `index.ts: processOCRHttp` | ページ画像配列 → 構造化結果 | 保持した補助 HTTP 経路 |
| `index.ts: processSimilarityHttp` | 仕入先名または一覧 → マッチング結果 | 補助 HTTP 経路 |
| `index.ts: generateSignedUrl` | 所有する filePath → 一時的な読み取り URL | 補助ファイルアクセス経路 |

`functions/src/services/matchingService.ts` の会社名正規化と仕入先・得意先コード検索は、同じ完成度ではない。会社名には Firestore マスターと Levenshtein 比較を使うが、一部のコード検索と ProductMatcher は合成サンプル向けの限定的な実装である。

## 参照用の旧実装

| ファイル | 保持している内容 | 現在の UI との接続 |
|---|---|---|
| `services/ocrService.ts` | ブラウザーでの PDF レンダリング、HTTP OCR 要求、旧後処理 | App から直接 import しない |
| `services/codeListService.ts` | 合成 CSV マスターの解析、ローカルの exact/fuzzy コード候補検索 | 旧 OCR 経路の配下 |
| `services/productMatchingService.ts` | 旧商品コードマッチング | 旧 OCR 経路の配下 |
| `services/postProcessingSimilarityService.ts` | 静的な会社一覧による名称補正 | 旧 OCR 経路の配下 |
| `services/ocrQualityService.ts` | OCR 処理段階・品質指標の記録ユーティリティ | 旧 OCR 経路の配下 |
| `services/fuzzyMatchingService.ts` | 文字の変形、n-gram/Jaro-Winkler/Levenshtein の組み合わせ | codeList の dynamic import |
| `services/matchingCacheService.ts` | 旧 matching 結果のキャッシュ | 現在の codeList からは呼ばれない |
| `services/consistencyService.ts` | 旧 OCR の反復実行結果の比較 | App に未接続 |
| `services/crossValidationService.ts` | fuzzy 結果と LLM 結果の比較 | App に未接続 |
| `services/ocrEnhancementService.ts` | 会社名の OCR 補正実験 | App に未接続 |
| `services/storageService.ts` | 別系統のユーザー別 invoices アップロードユーティリティ | 現在の job アップロードでは使わない |
| `components/PDFList.tsx` | 別の一覧コンポーネント | App に未接続 |
| `components/PDFModal.tsx` | 別の PDF modal | App に未接続 |
| `components/LineItemsTable.tsx` | 旧読み取り中心の明細表 | App に未接続 |
| `lib/firebase.ts` | 共通 config の Firebase オブジェクトを再 export | 重複初期化を避ける互換エントリーポイント |
| `config/companyVariants.ts`, `data/companies.ts` | 参照 matching 向けの合成表記一覧 | 旧 matching モジュールの配下 |

旧 `ocrService.ts` クライアントは、現在のサーバーが要求する Bearer header を付けない。サーバー endpoint をそのまま再利用できるという意味ではなく、再接続するには token の受け渡しと変更後の環境に対応する必要がある。旧経路は標準デモの動作保証範囲に含まれない。参照用コードの外部呼び出し、マスターファイル、設定は現在の非同期経路とは別である。再利用には、別途接続・検証が必要となる。

## 変更箇所の探し方

- 画面に明細フィールドを追加する: `types/index.ts` → converter → 編集表 → 永続化 → CSV に含めるか、の順に確認する。
- CSV インポート形式を変える: `utils/csvExport.ts` の列契約を変更し、合成データのテストと `csv-specification.md` を更新する。
- デモの取引ルールを変える: 共通 CSV policy とテストを一緒に変更する。実際の契約条件を public fixture に入れない。
- マスターマッチングを実用化する: backend `matchingService` の stub を別の master schema に接続し、ユーザー権限・データの確認を追加する。
- OCR モデルを変更する: サーバーの `OPENAI_MODEL` と JSON 応答の互換性を検証する。クライアントにサービスキーを追加しない。
- PDF の保持方針を定める: Storage、job、ユーザー明細を一緒に扱う別のライフサイクル設計が必要である。

依存パッケージの基準は `package.json` と lockfile である。フロントエンドとサーバーは、それぞれ package.json/lockfile を保持する。現在、両方の PDF.js は 6 系であり、サーバーは ESM legacy build を動的に import する。片方の依存関係を更新しただけで、もう片方も更新されたと考えない。
