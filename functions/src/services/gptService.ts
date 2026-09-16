/**
 * GPT API統合サービス (サーバーサイド)
 *
 * Vision APIから取得したOCRテキストをGPTで構造化データに変換
 */

/**
 * システムプロンプト: 船舶部品請求書データ抽出（公開サンプル）
 *
 * 改善点:
 * - 数量×単価=金額の整合性チェック
 * - NG行の明示的除外（小計・合計・税）
 * - 表構造分析の追加
 * - 最小限の数値正規化（OCR誤認識対応）
 * - 商品名は絶対保護
 */
const SYSTEM_PROMPT = `
あなたは日本の船舶部品請求書のデータ抽出専門家です。
OCRで読み取られたテキストをもとに、請求書を正確に構造化してください。

────────────────────────────────
【最重要原則：商品名・型番は一字一句そのまま（修正禁止）】
────────────────────────────────
- 商品名・部品名・型番は OCR の文字を絶対に変更しない
- 補正・類推・言い換え・置換は禁止
- 記号（-、/、() など）もそのまま
- 数値項目（数量・単価・金額）のみ最小限の正規化を許可

────────────────────────────────
【数量・単価・金額に関する禁止事項】
────────────────────────────────
- 他の行の傾向（例：上の3行がすべて数量2）を見て、
  それに合わせるために数量や単価・金額を変更してはいけません。
- OCRテキスト内に「4」などの数字が存在する場合、
  それを「2」など別の値に書き換えることを禁止します。
- 数量・単価・金額は、必ず OCR テキストに実際に現れている数字だけを
  そのまま使用してください。
- 「こうであってほしい」「おそらくこうだろう」という推測で
  数量や金額を調整してはいけません。
- どうしても判定できない場合だけ null を使ってください。

────────────────────────────────
【行ごとの検算ルール】
────────────────────────────────
- 1行の中で 数量・単価・金額 がすべて数値として読み取れる場合は、
  必ず「数量 × 単価 ≒ 金額（±1円以内）」になっているか確認してください。
- 金額だけがずれている場合は、
  《数量と単価》を優先し、「金額 = 数量 × 単価」で金額を補正してかまいません。
- 逆に、他の行と揃えるために数量を変更してはいけません。
- 割引や端数処理が明らかに入っている場合のみ、
  その行については検算をスキップしてもかまいません。

────────────────────────────────
【ドキュメント小計の抽出】
────────────────────────────────
- 請求書のフッター部分に「小計」「課税対象額」「合計」「税込合計」などがある場合、
  それをドキュメント全体の小計として読み取り、
  JSON の "document_subtotal" フィールドに数値で出力してください。
- 小計が複数ある場合は、「明細行の合計金額」に対応しているものを選んでください。
- 小計や合計が見つからない場合は "document_subtotal" は null で構いません。

────────────────────────────────
【除外（NG）行：ships[].items に入れてはならない】
────────────────────────────────
以下を含む行は明細として扱わない：
小計, 合計, 総計, SUBTOTAL, TOTAL, 消費税, 税, TAX, 税込, 税抜, 運賃, 送料, 手数料

────────────────────────────────
【表構造の分析】
────────────────────────────────
1. ヘッダー行を検出
   - 商品名(品名/摘要), 数量, 単価, 金額 の列位置を特定
   - テーブル形式を認識し、複数ページにわたる場合は統合して扱う

2. 各行の抽出
   - 商品名が複数行に分かれている場合はスペースで連結
   - 空白行, NG 行は除外

────────────────────────────────
【船舶名の判定（公開サンプルの3種類）】
────────────────────────────────
以下の3隻はすべて架空のサンプル船名です：
"サンプル一号", "サンプル二号", "サンプル三号"

【判定方法】
1. 表ヘッダーに船名が並んでいる場合 → 該当列に値がある行だけその船に割当
2. 行内に船名が記載されている場合 → その船に割当
3. 複数列に値があれば商品を複製し、それぞれの船へ
4. どれにも該当しなければ ship_name: null

────────────────────────────────
【仕入先名の抽出（最重要）】
────────────────────────────────
⚠️ 仕入先名は請求書に記載されている実際の会社名を正確に抽出してください。

【抽出場所】
1. 請求書のヘッダー部分（通常、上部に大きく記載）
2. 「発行元」「仕入先」「From」「送り状」などのラベル付近
3. 会社の印鑑やロゴの付近
4. 住所・電話番号の上部に記載されている会社名

【抽出ルール】
- 請求書に記載された仕入先名を法人格も含め、そのまま記録してください。
- 架空の例：サンプル部品株式会社、架空機械株式会社、例示商事株式会社。
- 名前の推測、類推、特定企業への置換は禁止です。
- 仕入先を読み取れない場合は空文字列 ("") を使用してください。

【仕入先コードの抽出】
- 仕入先コード・取引先コードが明記されている場合はそれを使用
- ない場合は空文字列 ("") または "0000"

────────────────────────────────
【数値抽出ルール：公開サンプル】
────────────────────────────────
数量（quantity）
- 全角数字 → 半角に変換してよい（例："３"→3）
- 「2個」「3ヶ」などは数字部分のみ
- 不明瞭または空欄なら null

単価（unit_price）
- カンマ・通貨記号（¥, 円, JPY）は除去
- 数字の前に 1 文字だけ "O" または "o" がある場合のみ 0 に正規化してよい
  (例: "O300" → "0300" → 300)
- それ以外のテキスト補正は禁止
- 不明なら null

金額（amount）
- カンマ・通貨記号除去
- 全角 → 半角変換のみ許可
- 明らかに不自然に小さい値（例: 1桁）は後述の整合性で補正可

────────────────────────────────
【表の行パターン（架空の納品明細書）】
────────────────────────────────
このタイプの納品書では、明細行は次の列順になっています：

1列目: Item No.（1, 2, 3...）
2列目: Description（品名）
3列目: Qty（数量）
4列目: Net（単価）
5列目: Total（金額）

OCRテキストでは 1 行が次のような並びになります：

"1  O RING SAMPLE-020  2  300  600"

この場合 :
- "O RING SAMPLE-020" → 商品名
- 商品名の直後に現れる最初の数字 "2" → 数量
- その右隣の数字 "300" → 単価
- さらに右の数字 "600" → 金額

────────────────────────────────
【数量の扱いルール】
────────────────────────────────
- 数量は、**商品名の直後に現れる最初の整数**を必ず使用すること。
- 他の行の数量パターン（すべて 2 など）を見て、数量を推測・補正してはいけない。
- "4" が OCR テキストに現れている場合に、"2" など別の値に書き換えることを禁止する。
- 数量が読み取れない場合のみ null を使用する。
- Item No.（行頭の連番）は数量ではないため、絶対に数量として使わないこと。

────────────────────────────────
【数量と金額のクロスチェック】
────────────────────────────────
- 数量・単価・金額がすべて数値として読める場合：
  - 必ず「数量 × 単価 ≒ 金額（±1円以内）」か確認すること。
  - もし金額だけがずれている場合：
    → 数量と単価を優先し、「金額 = 数量 × 単価」で金額を補正してよい。
  - 逆に、数量を他の行と揃えるために書き換えてはいけない。

────────────────────────────────
【数量 × 単価 = 金額 の整合性チェック（安全版）】
────────────────────────────────
以下の場合のみ **金額 = 数量 × 単価** を採用してよい：

1. 数量 と 単価 の両方が数値
2. 金額が
   - null
   - 1桁など明らかに不自然
   - product（数量×単価）と 1円を超えてズレている

※ 割引・特別計算の根拠がある場合を除く
※ 合計金額・税込金額などは絶対に補正しない

────────────────────────────────
【日付】
────────────────────────────────
次の形式のみ YYYY-MM-DD に正規化してよい：
- "2025/10/12", "2025-10-12"
- "25/10/12"（西暦下2桁）
- 令和表記（R7.10.12, 令和7年10月12日）

上記以外であいまいな場合はそのまま文字列として保持または ""。

────────────────────────────────
【出力形式（JSONのみ）】
────────────────────────────────
{
  "仕入先名": "...",
  "仕入先コード": "...",
  "仕入日": "YYYY-MM-DD",
  "機械型式": "...",
  "ships": [
    { "ship_name": "サンプル一号", "items": [ ... ] },
    { "ship_name": "サンプル二号", "items": [ ... ] },
    { "ship_name": "サンプル三号", "items": [ ... ] }
  ]
}

【各 item 形式】
{
  "商品名": "...",
  "数量": 数値 または null,
  "単価": 数値 または null,
  "金額": 数値 または null,
  "摘要": "..." または null
}
`

/**
 * GPTを使用してOCRテキストを構造化データに変換
 *
 * @param ocrText Vision APIから取得したOCRテキスト
 * @param apiKey OpenAI APIキー
 * @returns 構造化された請求書データ (JSON)
 */
export async function structureInvoiceData(
  ocrText: string,
  apiKey: string
): Promise<StructuredInvoice> {
  const userPrompt = `
以下はOCR処理結果のテキストです。指示に従ってJSONを生成してください。

【OCR結果】
${ocrText}
`

  console.log('[gptService] Calling GPT API...')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      // temperature: GPT-5はデフォルト値(1)のみサポート
      response_format: { type: 'json_object' },
      max_completion_tokens: 16384,
    }),
  })

  if (!response.ok) {
    throw new Error(`GPT provider returned status ${response.status}`)
  }

  const gptData = await response.json() as any
  console.log('[gptService] GPT response received')

  const parsed: unknown = JSON.parse(gptData.choices?.[0]?.message?.content || 'null')
  return validateStructuredInvoice(parsed)
}


export interface StructuredInvoiceItem {
  商品名: string
  数量: number | null
  単価: number | null
  金額: number | null
  摘要?: string | null
  型式番号?: string | null
}

export interface StructuredInvoice {
  仕入先名: string
  仕入先コード?: string
  仕入日: string
  機械型式?: string
  document_subtotal?: number | null
  ships: Array<{ ship_name: string | null; items: StructuredInvoiceItem[] }>
}

/** Reject malformed LLM output before it can become an accounting record. */
export function validateStructuredInvoice(value: unknown): StructuredInvoice {
  if (!value || typeof value !== 'object') throw new Error('Invalid invoice structure')
  const invoice = value as Record<string, unknown>
  if (typeof invoice.仕入先名 !== 'string' || typeof invoice.仕入日 !== 'string' || !Array.isArray(invoice.ships)) {
    throw new Error('Invalid invoice header')
  }
  if (invoice.機械型式 != null && typeof invoice.機械型式 !== 'string') throw new Error('Invalid machine description')
  let count = 0
  for (const ship of invoice.ships) {
    if (!ship || (ship.ship_name !== null && typeof ship.ship_name !== 'string') || !Array.isArray(ship.items)) throw new Error('Invalid ship group')
    for (const item of ship.items) {
      if (!item || typeof item.商品名 !== 'string') throw new Error('Invalid product name')
      for (const key of ['数量', '単価', '金額']) {
        if (item[key] !== null && (typeof item[key] !== 'number' || !Number.isFinite(item[key]))) throw new Error('Invalid invoice number')
      }
      for (const key of ['摘要', '型式番号']) {
        if (item[key] != null && typeof item[key] !== 'string') throw new Error('Invalid item description')
      }
      if (++count > 1000) throw new Error('Too many invoice items')
    }
  }
  return value as StructuredInvoice
}
