/**
 * 得意先名 → 得意先コード変換マッピング
 * 売上伝票CSV生成時に使用
 */

export const CUSTOMER_CODE_MAP: Record<string, string> = {
    'サンプル一号': '101',
    'サンプル二号': '102',
    'サンプル三号': '103',
}

/**
 * 得意先名から得意先コードを取得
 * @param customerName 得意先名（船名）
 * @returns 得意先コード（例: "1008"）、見つからない場合は "0000"
 */
export function getCustomerCode(customerName: string | undefined): string {
    if (!customerName) return '0000'

    // 完全一致チェック
    if (CUSTOMER_CODE_MAP[customerName]) {
        return CUSTOMER_CODE_MAP[customerName]
    }

    // 部分一致チェック（得意先名が含まれている場合）
    for (const [key, code] of Object.entries(CUSTOMER_CODE_MAP)) {
        if (customerName.includes(key)) {
            return code
        }
    }

    // 見つからない場合はデフォルトコード "0000"
    return '0000'
}
