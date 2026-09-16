/**
 * 仕入先名 → 会社コード変換マッピング
 */

export const SUPPLIER_CODE_MAP: Record<string, string> = {
    'サンプル部品株式会社': '201',
    'サンプル部品': '201',
    '架空機械株式会社': '202',
    '架空機械': '202',
    '例示商事株式会社': '203',
    '例示商事': '203',
    'その他': '0',
}

/**
 * 仕入先名から会社コードを取得
 * @param supplierName 仕入先名
 * @returns 会社コード（例: "3031"）、見つからない場合は "9999"
 */
export function getSupplierCode(supplierName: string | undefined): string {
    if (!supplierName) return '9999'

    // 完全一致チェック
    if (SUPPLIER_CODE_MAP[supplierName]) {
        return SUPPLIER_CODE_MAP[supplierName]
    }

    // 部分一致チェック（会社名が含まれている場合）
    for (const [key, code] of Object.entries(SUPPLIER_CODE_MAP)) {
        if (supplierName.includes(key) || key.includes(supplierName)) {
            return code
        }
    }

    // 見つからない場合は「その他」
    return '9999'
}
