/**
 * 船名 → イニシャル変換マッピング
 */

export const SHIP_CODE_MAP: Record<string, string> = {
    'サンプル一号': 'D1',
    'サンプル二号': 'D2',
    'サンプル三号': 'D3',
}

/**
 * 船名からイニシャルコードを取得
 * @param shipName 船名（得意先名）
 * @returns 船名イニシャル（例: "HK"）、見つからない場合は元の船名
 */
export function getShipCode(shipName: string | undefined): string {
    if (!shipName) return ''

    // 完全一致チェック
    if (SHIP_CODE_MAP[shipName]) {
        return SHIP_CODE_MAP[shipName]
    }

    // 部分一致チェック（船名が含まれている場合）
    for (const [key, code] of Object.entries(SHIP_CODE_MAP)) {
        if (shipName.includes(key)) {
            return code
        }
    }

    // 見つからない場合は元の船名を返す
    return shipName
}
