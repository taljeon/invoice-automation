// functions/src/services/matchingService.ts
// ⭐️ SymSpellへの依存を完全に削除

import { getFirestore } from 'firebase-admin/firestore'

// ⭐️ Firestoreキャッシングのためのシンプルなインメモリキャッシュ
let companyCache: CompanyData[] = []
let lastCacheTime: number = 0
const CACHE_TTL_MS = 3600 * 1000 // 1時間キャッシュ

interface CompanyData {
  id: string; // Firestore Document ID
  name: string;
  variants: string[];
}

/**
 * Firestoreから会社リストを読み込みます (キャッシュ使用)
 */
async function getCompanyList(): Promise<CompanyData[]> {
  const now = Date.now()
  if (companyCache.length > 0 && (now - lastCacheTime < CACHE_TTL_MS)) {
    console.log('Using cached company list.')
    return companyCache
  }

  console.log('Fetching company list from Firestore...')
  const db = getFirestore()
  const snapshot = await db.collection('companies').get()

  if (snapshot.empty) {
    console.warn('WARNING: companies collection is empty.')
    companyCache = []
    return []
  }

  // ⭐️ [FIX] doc.data() の型をより安全に処理
  companyCache = snapshot.docs.map(doc => {
    const data = doc.data()
    return {
      id: doc.id,
      name: typeof data.name === 'string' ? data.name : '',
      variants: Array.isArray(data.variants) ? data.variants.filter((value: unknown) => typeof value === 'string') : []
    }
  })

  lastCacheTime = now
  console.log(`Company list cache initialized with ${companyCache.length} entries.`);
  return companyCache
}

// ----------------------------------------------------
// ⭐️ [NEW] Levenshtein Distance (純粋なTypeScript実装)
// ----------------------------------------------------
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  for (let i = 0; i <= len2; i++) { matrix[i] = [i] }
  for (let j = 0; j <= len1; j++) { matrix[0][j] = j }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      const cost = (str2.charAt(i - 1) === str1.charAt(j - 1)) ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // 削除
        matrix[i][j - 1] + 1,     // 挿入
        matrix[i - 1][j - 1] + cost // 置換
      )
    }
  }
  return matrix[len2][len1]
}

function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length)
  if (maxLength === 0) return 1
  const distance = levenshteinDistance(str1, str2)
  return 1 - (distance / maxLength)
}

// ----------------------------------------------------
// ⭐️ [REPLACED] Levenshteinベースのマッチング関数
// ----------------------------------------------------
interface SimilarityResult {
  method: 'exact' | 'variant_exact' | 'similarity' | 'none';
  score: number;
  term: string | null;
  original: string;
}

export async function findBestCompanyMatchOnServer(ocrText: string): Promise<{
  finalSupplierName: string;
  similarityResult: SimilarityResult;
}> {
  const companies = await getCompanyList()
  const cleanedOcr = ocrText.trim().toLowerCase()

  if (!cleanedOcr) {
    return {
      finalSupplierName: ocrText,
      similarityResult: { method: 'none', score: 0, term: null, original: ocrText }
    }
  }

  let bestMatch = {
    name: null as string | null,
    similarity: 0,
    method: 'none' as SimilarityResult['method']
  }

  const SIMILARITY_THRESHOLD = 0.7 // 70% 類似度の閾値

  for (const company of companies) {
    // 1. 標準名 完全一致
    if (company.name.toLowerCase() === cleanedOcr) {
      bestMatch = { name: company.name, similarity: 1.0, method: 'exact' }
      break // 発見したので終了
    }

    // 2. 表記揺れ 完全一致
    if (company.variants) {
      for (const variant of company.variants) {
        if (variant.toLowerCase() === cleanedOcr) {
          bestMatch = { name: company.name, similarity: 1.0, method: 'variant_exact' }
          break
        }
      }
      if (bestMatch.method === 'variant_exact') break
    }

    // 3. 類似度チェック (標準名)
    const standardSim = calculateSimilarity(cleanedOcr, company.name.toLowerCase())
    if (standardSim > bestMatch.similarity && standardSim >= SIMILARITY_THRESHOLD) {
      bestMatch = { name: company.name, similarity: standardSim, method: 'similarity' }
    }

    // 4. 類似度チェック (表記揺れ)
    if (company.variants) {
      for (const variant of company.variants) {
        const variantSim = calculateSimilarity(cleanedOcr, variant.toLowerCase())
        if (variantSim > bestMatch.similarity && variantSim >= SIMILARITY_THRESHOLD) {
          bestMatch = { name: company.name, similarity: variantSim, method: 'similarity' }
        }
      }
    }
  }

  if (bestMatch.name) {
    return {
      finalSupplierName: bestMatch.name,
      similarityResult: { method: bestMatch.method, score: bestMatch.similarity, term: bestMatch.name, original: ocrText }
    }
  }

  // マッチ失敗
  return {
    finalSupplierName: ocrText,
    similarityResult: { method: 'none', score: 0, term: null, original: ocrText }
  }
}

/** Fixed synthetic vessel catalog; replace with an approved master before cloud use. */
const SAMPLE_SHIP_NAMES = ['サンプル一号', 'サンプル二号', 'サンプル三号'] as const
const INVALID_SHIP_PATTERNS = ['999999', 'Z/', '税', '合計', '小計', '課税', 'TAX', 'TOTAL', 'SUBTOTAL', 'ERROR', 'undefined']

export function matchShipName(extractedShipName: string | undefined): string | null {
  const name = extractedShipName?.trim()
  if (!name || INVALID_SHIP_PATTERNS.some(pattern => name.includes(pattern))) return null
  const exact = SAMPLE_SHIP_NAMES.find(ship => ship === name)
  if (exact) return exact
  return SAMPLE_SHIP_NAMES.find(ship => name.includes(ship) || ship.includes(name)) || null
}

/** Sample lookup only: these functions do not query a production code master. */
const SAMPLE_SUPPLIERS: Record<string, string> = {
  'サンプル部品株式会社': '201', '架空機械株式会社': '202', '例示商事株式会社': '203'
}
const SAMPLE_CUSTOMERS: Record<string, string> = {
  'サンプル一号': '101', 'サンプル二号': '102', 'サンプル三号': '103'
}

export async function matchSupplierCode(name: string): Promise<{ code: string; name: string; confidence: number }> {
  const code = SAMPLE_SUPPLIERS[name]
  return { code: code || '0000', name, confidence: code ? 1 : 0 }
}

export async function matchCustomerCode(shipName: string): Promise<{ code: string; name: string } | null> {
  const code = SAMPLE_CUSTOMERS[shipName]
  return code ? { code, name: shipName } : null
}
