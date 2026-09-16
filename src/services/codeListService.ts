/**
 * コードリスト管理サービス
 * 仕入先リスト・得意先リストをCSVから読み込み、ローカルの完全一致・類似度でマッチング
 */

export interface SupplierCode {
  code: string      // 仕入先コード（例: "3001"）
  name: string      // Synthetic master field
  abbreviation: string  // Synthetic master field
}

export interface CustomerCode {
  code: string      // 得意先コード（例: "1007"）
  name: string      // Synthetic master field
  abbreviation: string  // Synthetic master field
}

export interface ProductCode {
  code: string      // 商品コード（英語略号、例: "hn"）
  name: string      // Synthetic master field
}

// コードリストのキャッシュ
let SUPPLIER_LIST: SupplierCode[] | null = null
let CUSTOMER_LIST: CustomerCode[] | null = null
let PRODUCT_LIST: ProductCode[] | null = null

/**
 * CSVファイルからコードリストを読み込む
 */
async function loadCodeLists(): Promise<void> {
  if (SUPPLIER_LIST && CUSTOMER_LIST && PRODUCT_LIST) {
    return // 既に読み込み済み
  }

  try {
    // 仕入先リスト読み込み
    const supplierResponse = await fetch('/code-lists/仕入先リスト.csv')
    if (!supplierResponse.ok) throw new Error('Synthetic master CSV was not found')
    const supplierText = await supplierResponse.text()
    SUPPLIER_LIST = parseCSV(supplierText)

    // 得意先リスト読み込み
    const customerResponse = await fetch('/code-lists/得意先リスト.csv')
    if (!customerResponse.ok) throw new Error('Synthetic master CSV was not found')
    const customerText = await customerResponse.text()
    CUSTOMER_LIST = parseCSV(customerText)

    // 商品コードリスト読み込み（商品コード一覧.csvから英語略号のみ抽出）
    const productResponse = await fetch('/code-lists/商品コード一覧.csv')
    if (!productResponse.ok) throw new Error('Synthetic master CSV was not found')
    const productText = await productResponse.text()
    PRODUCT_LIST = parseProductCodeCSV(productText)

    console.log(`Loaded ${SUPPLIER_LIST.length} suppliers, ${CUSTOMER_LIST.length} customers, and ${PRODUCT_LIST.length} products`)
  } catch (error) {
    console.error('Failed to load code lists:', error)
    // フォールバック: 空リスト
    SUPPLIER_LIST = []
    CUSTOMER_LIST = []
    PRODUCT_LIST = []
  }
}

/**
 * CSV文字列をパースしてコードリストに変換
 * 弥生販売CSVフォーマット: 1列目=空, 2列目=コード, 3列目=名称, 5列目=略称
 */
function parseCSV(csvText: string): Array<{ code: string; name: string; abbreviation: string }> {
  const lines = csvText.trim().split('\n')
  const result: Array<{ code: string; name: string; abbreviation: string }> = []

  // 最初の2行（ヘッダー）をスキップして3行目から処理
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // CSVパース（簡易版：引用符対応）
    const values = parseCSVLine(line)
    if (values.length >= 5) {
      const code = values[1]?.trim()        // 2列目: コード
      const name = values[2]?.trim()        // 3列目: 名称
      const abbreviation = values[4]?.trim() // 5列目: 略称

      if (code && name) {
        result.push({ code, name, abbreviation: abbreviation || name })
      }
    }
  }

  return result
}

/**
 * CSV1行をパース（簡易版）
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)

  return result
}

/**
 * 商品コード一覧CSVをパースして英語略号のみ抽出
 * フォーマット: 1列目=空, 2列目=コード, 3列目=名称
 * 英語略号（アルファベット）のコードのみを船名マッピング用に抽出
 */
function parseProductCodeCSV(csvText: string): ProductCode[] {
  const lines = csvText.trim().split('\n')
  const result: ProductCode[] = []

  // 6行目から処理（ヘッダーは5行まで）
  for (let i = 5; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCSVLine(line)
    if (values.length >= 3) {
      const code = values[1]?.trim()  // 2列目: コード
      const name = values[2]?.trim()  // 3列目: 名称

      // 英語略号（アルファベット）のみを抽出（数字コードは除外）
      if (code && name && /^[a-zA-Z]+[0-9]*$/.test(code)) {
        result.push({ code, name })
      }
    }
  }

  return result
}

/** Reference matching path: browser-held AI keys are intentionally unsupported. */
export async function matchSupplierCode(supplierName: string): Promise<{ code: string; name: string; confidence: 'high' | 'medium' | 'low' } | null> {
  await loadCodeLists()
  const { getBestMatch } = await import('./fuzzyMatchingService')
  const result = await getBestMatch(supplierName, SUPPLIER_LIST || [], 0.6)
  return result ? { code: result.code, name: result.name, confidence: result.confidence } : null
}

export async function matchCustomerCode(shipName: string): Promise<{ code: string; name: string; confidence: 'high' | 'medium' | 'low' } | null> {
  await loadCodeLists()
  const match = CUSTOMER_LIST?.find(customer => customer.name === shipName || customer.abbreviation === shipName)
  return match ? { code: match.code, name: match.name, confidence: 'high' } : null
}

export async function matchProductCode(shipName: string): Promise<string | null> {
  await loadCodeLists()
  return PRODUCT_LIST?.find(product => product.name === shipName || product.code === shipName)?.code || null
}

export async function getSupplierList(): Promise<SupplierCode[]> {
  await loadCodeLists()
  return SUPPLIER_LIST || []
}

export async function getCustomerList(): Promise<CustomerCode[]> {
  await loadCodeLists()
  return CUSTOMER_LIST || []
}
