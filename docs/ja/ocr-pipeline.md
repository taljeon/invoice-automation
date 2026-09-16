# OCR 処理の段階と制約

[English](../ocr-pipeline.md) · [日本語 README](../../README.ja.md)

現在の UI のエントリーポイントは `processPDFWithOCRAsync` である。以下ではデモ生成経路ではなく、利用者が別途構成する必要があるクラウド経路の実装を説明する。

## 1. ジョブ作成とアップロード

フロントエンドはログインユーザーを確認し、空ファイル、20MiB 超過、PDF 拡張子の条件を検査する。job ID は UUID とし、個人情報がオブジェクトパスに入らないよう、Storage のファイル名は `invoice.pdf` に固定する。元のファイル名は明細の表示用 metadata に保持する。先に `ocr_jobs` に所有者とパスを保存してから `onSnapshot` を接続し、PDF をアップロードする。

読み取り権限は既存 job の所有者情報に依存するため、作成後に購読する順序が重要である。アップロードには `application/pdf` metadata を指定する。Storage にファイルをアップロードしただけでは、明細の保存は完了していない。

## 2. Storage trigger による処理権の取得

`processOCROnStorage` は次の条件を確認する。

- サーバーの `CLOUD_PROCESSING_ENABLED` が `true` であること。
- 対象 bucket とアップロードパスの形式が正しいこと。
- metadata が PDF を示し、サイズが 0 より大きく 20MiB 以下であること。
- job が存在し、owner UID、filename、storagePath が一致すること。
- job の状態が `pending` であること。

最後の状態変更は Firestore transaction で行う。transaction で `processing` とオブジェクトの generation を記録できた処理だけが、外部 OCR 呼び出しに進む。同じ finalize イベントの再配信によって有料の呼び出しが重複して始まることを減らすための構成である。すでに処理中のジョブを、自動再試行で復旧する設計ではない。

## 3. PDF → 画像

`pdfPagesToImagesOnServer` の実際のパラメーター:

| 項目 | 実装値 |
|---|---|
| 入力 | PDF Buffer |
| ファイルサイズ | 1 byte 以上、最大 20MiB |
| ページ数 | 1〜20。超過時は文書全体を拒否 |
| レンダラー | サーバー PDF.js legacy build + @napi-rs/canvas |
| scale | 2。PDF の通常の 72pt 基準で約 144dpi |
| ページの pixel 上限 | width × height ≤ 20,000,000 |
| 出力 | JPEG 品質 0.85 の base64 配列 |
| ページのレンダリング | 順次処理 |
| クリーンアップ | page cleanup、finally で PDF destroy |

ページを任意に切り捨てて成功として返すことはない。サーバーは PDF.js の ESM legacy build を動的に import し、@napi-rs/canvas を使用する。合成 PDF のレンダリングテストとデプロイ環境の互換性は区別する。実際の検証範囲は[検証記録](verification.md)を参照。

## 4. Vision OCR

各 JPEG を `documentTextDetection` に送り、言語ヒントに `ja`、`en` を指定する。入力 base64 を整形・検査し、Vision が明示するエラーがあれば失敗とする。主となる async 経路では、各ページを `Promise.all` で並列リクエストする。

結果は `fullTextAnnotation.text` である。ページ順に区切り文字列を入れ、1 文書のテキストとして結合する。LLM には原画像を再送せず、このテキストを渡す。OCR の位置座標を利用する独立した表復元エンジンはない。

## 5. LLM による構造化

`structureInvoiceData` は OpenAI Chat Completions API に system prompt と OCR テキストを送る。

| 設定 | 値 |
|---|---|
| モデル | サーバーの `OPENAI_MODEL`。既定値は `gpt-5` |
| 応答モード | `response_format: { type: 'json_object' }` |
| 完了トークン上限 | `max_completion_tokens: 16384` |
| キー | Secret Manager から注入される `OPENAI_API_KEY` |
| 成功後の処理 | JSON.parse → `validateStructuredInvoice` |

プロンプトの主な指示は次のとおり。

1. 商品名・部品番号・モデル名・記号は OCR に見えるとおりに保持する。
2. 他の行の数量パターンから値を推測しない。読めない場合は null を使う。
3. 全角数字や、数値の通貨記号・カンマなどに限った正規化を認める。
4. 表の header と行を解析し、複数行に分かれた商品名を結合する。
5. 船舶別の column または行内の船舶名を基準に item をグループ化する。
6. 合計・小計・税金・運賃・手数料の行は品目から除外する。
7. 認識可能な日付を YYYY-MM-DD に正規化する。
8. 仕入先には文書から読み取った名前を使い、特定企業だと推測して置き換えない。

プロンプトにある船舶一覧は 3 隻の合成船舶である。実際の環境の船舶マスターとして扱ってはならない。プロンプトの指示は、精度保証や OCR 補正の数学的な証明ではない。

検証関数は構造と基本的な値の型を確認するが、日付の意味、税金、合計、文書の真正性までは検証しない。output token 上限や context サイズを超える文書を分割・結合する追加処理もない。

## 6. 仕入先名のマッチング

`findBestCompanyMatchOnServer` は `companies` コレクションを読み込む。空なら OCR の名称をそのまま使う。マスターがあれば入力を trim/lowercase 処理し、次の順で比較する。

1. 正規名との完全一致: `exact`。
2. 登録済み表記揺れとの完全一致: `variant_exact`。
3. 正規名と表記揺れの中で Levenshtein スコアが最高の候補: `similarity`。
4. しきい値 0.7 以上の候補がない場合: `none`、原文を保持。

スコアは `1 - distance / maxLength` である。双方が空文字列の場合、比較関数は 1 を返すが、外側の関数は空の入力を先に `none` として処理する。最高スコアが同じ候補の業務上の優先順位を別途決めるロジックはない。モデルの確率的な信頼度と、名称文字列の類似度スコアは別の概念である。

このマッチングが行うのは名称の正規化だけである。コードの lookup は別の合成 supplier/customer table を使用し、商品コードは数種類のキーワードによるデモ用 lookup である。

## 7. 明細の平坦化と補正

`convertToLineItems` は船舶ごとの items を 1 つの配列にする。各行に `jobId-index` の ID を付け、伝票番号は空値にする。仕入先・得意先コード、元のファイル名、内部 Storage パスを付与する。公開読み取り URL を生成して結果に入れることはない。

商品名が空か、次のキーワードを含む行は除外する。

```text
小計 合計 総計 TOTAL SUBTOTAL 消費税 税 TAX 税込 税抜 運賃 送料 手数料
```

英語は大文字にして比較する。単純な部分文字列による除外なので、その文字が含まれる正常な商品名まで消える可能性があり、実際の請求対象である運賃・手数料も除外されるという制約がある。

数値補正の正確な動作:

```text
quantity と unitPrice がどちらも null でなければ
    product = quantity × unitPrice
    amount が null、または 0 以下、または abs(product - amount) > 1 なら
        amount = product
```

差がちょうど 1 の場合は元の値を保持し、別途小数の丸めは行わない。割引の理由をコードで確認しないため、割引後の金額が上書きされることがある。最終的な quantity は null を保持するが、unitPrice/amount が null なら 0 に変換する。CSV は 0 を許可するため、ユーザーは原本で価格も確認する必要がある。

ヘッダーの `機械型式` は `摘要` に、item の `摘要` または `型式番号` は `備考` に保持する。`document_subtotal` で行合計を検証する段階はない。

## 8. 完了・エラー・timeout

完了時には job に results を保存して `completed` に変更する。ブラウザーは結果に文書 ID と表示用の元のファイル名を関連付け、ユーザーの明細コレクションに保存する。その後のセル編集では、OCR を再実行せず明細だけを更新する。

サーバーの処理例外は、詳細を一般化したエラーメッセージで伝える。未加工の provider 応答・OCR テキスト・ファイルパスをエラー応答に付けない。失敗した PDF を正常な伝票に見せる架空の行も生成しない。

クライアントは 5 分後に待機を終了するが、サーバーは最大 540 秒まで実行できる。その場合、完了結果がサーバーに残っても画面が受信できず、明細保存まで進まないことがある。再購読 UI、cancel、lease、自動 retry、orphan cleanup は未完成の領域である。

## 9. 補助 HTTP 経路

| 関数 | リクエスト | 応答・違い |
|---|---|---|
| `processOCRHttp` | `pageImages`, `pdfFileName` | success/data/processingTime。画像 OCR は順次処理。合成船舶とのマッチング後、null のグループを除外 |
| `processSimilarityHttp` | `supplierName` または `batchMode:true, supplierList` | 単体・一括マッチング。一括は最大 50 件、名称は最大 200 文字 |
| `generateSignedUrl` | `filePath` | 所有権確認後に `{ signedUrl }`。有効期限 15 分 |

HTTP の画像リクエストは、画像 1〜20 件、各文字列最大 8MiB、全文字列の合計最大 28MiB の条件を検査する。すべての POST は、サーバーの有効化と Firebase ID token が必要であり、ブラウザー Origin がある場合は allowlist に含まれていなければならない。Storage 主経路と HTTP 経路では、入力方式と船舶のフィルター動作が完全には一致しない。参照用の旧 `ocrService.ts` は新しい認証 header を自動で渡さないため、この HTTP endpoint への再接続には別途修正が必要である。
