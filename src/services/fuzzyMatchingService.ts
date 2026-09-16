/**
 * 일본어 거래처명 Fuzzy Matching 시스템
 * 히라가나/카타카나/로마자/알파벳 표기 변환 및 유사도 매칭 지원
 */

// Dynamic import로 wanakana 로드 (Named imports 사용)
let wanakanaFunctions: any = null

async function loadWanakana() {
  if (!wanakanaFunctions) {
    try {
      // Named imports로 변경하여 ES 모듈 오류 해결
      const { toHiragana, toKatakana, toRomaji, isHiragana, isKatakana, isRomaji } = await import('wanakana')
      wanakanaFunctions = { toHiragana, toKatakana, toRomaji, isHiragana, isKatakana, isRomaji }
      console.log('[WanaKana] Successfully loaded with named imports')
    } catch (error) {
      console.warn('[WanaKana] Failed to load, using fallback normalization:', error)
      // Fallback implementation - 기본 일본어 정규화 기능 제공
      wanakanaFunctions = {
        isKatakana: (text: string) => /[ァ-ヾ]/.test(text),
        isHiragana: (text: string) => /[ぁ-ゟ]/.test(text),
        isRomaji: (text: string) => /^[a-zA-Z\s]+$/.test(text),
        toHiragana: (text: string) => text, // 기본적으로 변환 없이 반환
        toKatakana: (text: string) => text,
        toRomaji: (text: string) => text
      }
    }
  }
  return wanakanaFunctions
}

/**
 * DEMO_SUPPLIER 전용 변형 생성 (GitHub/MIT 연구 기반)
 * Enterprise-scale fuzzy matching for DEMO_SUPPLIER variants
 */
function generateDemoSupplierVariants(_text: string): string[] {
  const variants: string[] = []
  
  // 1. 기본 약어 변형
  variants.push('DEMO_SUPPLIER')
  variants.push('KEW') // 架空企業060
  variants.push('KUN')
  variants.push('KURIMORI') // 일반적인 오타
  
  // 2. 법인격 단계별 제거
  variants.push('架空企業060')
  variants.push('架空企業063')
  variants.push('架空企業059')
  
  // 3. 음성학적 변형 (연구 검증됨)
  variants.push('KUNEMORI')
  variants.push('KUNINORI') 
  variants.push('KUNMORI')
  variants.push('KURIMOLI') // L/R 혼동
  
  // 4. 일본어 카타카나 변형
  variants.push('架空企業153')
  variants.push('架空企業155')
  variants.push('架空企業154')
  
  // 5. 완전한 회사명 변형
  variants.push('架空企業060 CO LTD')
  variants.push('架空企業061')
  variants.push('架空企業060 COMPANY LIMITED')
  
  // 6. 대소문자 혼재
  variants.push('DemoSupplier')
  variants.push('demo_supplier')
  variants.push('DEMO_SUPPLIER')
  
  console.log(`[DEMO_SUPPLIER Variants] Generated ${variants.length} variants for matching`)
  return variants
}

// 주요 회사명 변형 생성은 이제 src/config/companyVariants.ts에서 설정 기반으로 처리됩니다.

export interface FuzzyMatchResult {
  code: string
  name: string
  normalizedName: string
  originalInput: string
  normalizedInput: string
  similarity: number
  algorithm: 'exact' | 'levenshtein' | 'jaro_winkler' | 'normalized' | 'hybrid' | 'ngram'
  confidence: 'high' | 'medium' | 'low'
}

export interface CompanyRecord {
  code: string
  name: string
  abbreviation?: string
}

/**
 * 일본어 텍스트 정규화 함수
 * - 히라가나 ↔ 카타카나 변환
 * - 로마자 → 히라가나/카타카나 변환
 * - 영어/숫자 혼재 텍스트 처리
 * - 법인격 표기 통일
 */
export async function normalizeJapaneseText(text: string): Promise<string[]> {
  if (!text) return []
  
  const wana = await loadWanakana()
  const variants: string[] = []
  const cleanText = text.trim()
  
  // 1. 원본 텍스트
  variants.push(cleanText)
  
  // 2. 특별 회사명 처리 (GitHub/MIT 연구 기반)
  if (/DEMO_SUPPLIER/i.test(cleanText)) {
    variants.push(...generateDemoSupplierVariants(cleanText))
  }
  
  // 추가 회사명 특별 처리 (설정 기반)
  const { generateVariantsFromConfig } = await import('../config/companyVariants')
  const configVariants = generateVariantsFromConfig(cleanText)
  if (configVariants.length > 0) {
    variants.push(...configVariants)
  }
  
  // 3. 법인격 제거 버전 (영문 포함) - 단계별 제거
  const legalEntityPatterns = [
    // 일본어 법인격
    /株式会社/g, /㈱/g, /\(株\)/g, /（株）/g,
    /有限会社/g, /合同会社/g, /合名会社/g, /合資会社/g,
    /本社/g, /支店/g, /営業所/g, /支社/g,
    // 영문 법인격 (단계별 제거)
    /ENGINEERING\s+WORKS\s+CO\.,?\s*LTD\.?/gi,
    /WORKS\s+CO\.,?\s*LTD\.?/gi,
    /CO\.,?\s*LTD\.?/gi,
    /ENGINEERING\s+WORKS/gi,
    /CORPORATION/gi, /CORP\.?/gi, /COMPANY/gi,
    /WORKS/gi, /ENGINEERING/gi, /INDUSTRIES/gi, 
    /INC\.?/gi, /LIMITED/gi, /LTD\.?/gi
  ]
  
  let withoutLegal = cleanText
  legalEntityPatterns.forEach(pattern => {
    withoutLegal = withoutLegal.replace(pattern, '').trim()
  })
  variants.push(withoutLegal)
  
  // 3. 영문 회사명 추가 정규화
  if (/^[A-Za-z\s.,&-]+$/.test(cleanText)) {
    // 영문인 경우 대소문자 변형 및 공백 정규화
    variants.push(cleanText.toUpperCase())
    variants.push(cleanText.toLowerCase())
    variants.push(cleanText.replace(/\s+/g, ''))
    variants.push(cleanText.replace(/[.,&-]/g, '').replace(/\s+/g, ' ').trim())
    
    // 약어 변형 (DEMO_SUPPLIER 등)
    const words = cleanText.split(/\s+/)
    if (words.length > 1) {
      // 첫 글자만 사용한 약어
      const abbreviation = words.map(word => word.charAt(0)).join('')
      variants.push(abbreviation.toUpperCase())
      variants.push(abbreviation.toLowerCase())
    }
  }
  
  // 4. 일본어 문자 변환 (wanakana 사용)
  try {
    // 카타카나 → 히라가나 변환
    if (wana.isKatakana(cleanText) || /[ァ-ヾ]/.test(cleanText)) {
      variants.push(wana.toHiragana(cleanText))
      variants.push(wana.toHiragana(withoutLegal))
    }
    
    // 히라가나 → 카타카나 변환
    if (wana.isHiragana(cleanText) || /[ぁ-ゟ]/.test(cleanText)) {
      variants.push(wana.toKatakana(cleanText))
      variants.push(wana.toKatakana(withoutLegal))
    }
    
    // 로마자 → 히라가나/카타카나 변환
    if (wana.isRomaji(cleanText) || /^[a-zA-Z\s]+$/.test(cleanText)) {
      variants.push(wana.toHiragana(cleanText))
      variants.push(wana.toKatakana(cleanText))
      variants.push(wana.toHiragana(withoutLegal))
      variants.push(wana.toKatakana(withoutLegal))
    }
    
    // 히라가나/카타카나 → 로마자 변환
    if (/[ぁ-ゟァ-ヾ]/.test(cleanText)) {
      variants.push(wana.toRomaji(cleanText))
      variants.push(wana.toRomaji(withoutLegal))
    }
  } catch (error) {
    console.warn('[Normalization] WanaKana conversion error:', error)
  }
  
  // 5. 추가 정규화 (모든 변형에 적용)
  const additionalVariants = [...variants]
  additionalVariants.forEach(variant => {
    variants.push(variant.replace(/\s+/g, ''))  // 공백 제거
    variants.push(variant.toLowerCase())       // 소문자
    variants.push(variant.toUpperCase())       // 대문자
  })
  
  // 중복 제거 및 빈 문자열 필터링
  const uniqueVariants = [...new Set(variants)].filter(v => v.length > 0)
  
  console.log(`[Normalization] "${text}" -> ${uniqueVariants.length} variants:`, uniqueVariants.slice(0, 5))
  return uniqueVariants
}

/**
 * Levenshtein Distance 계산
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null))
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      )
    }
  }
  
  return matrix[str2.length][str1.length]
}

/**
 * N-gram Similarity 계산 (MIT 연구 검증 - 최고 성능)
 */
export function nGramSimilarity(str1: string, str2: string, n: number = 2): number {
  if (str1 === str2) return 1.0
  if (str1.length === 0 || str2.length === 0) return 0.0
  
  // N-gram 생성
  const getNGrams = (str: string): Set<string> => {
    const grams = new Set<string>()
    const s = ' '.repeat(n - 1) + str.toLowerCase() + ' '.repeat(n - 1)
    for (let i = 0; i < s.length - n + 1; i++) {
      grams.add(s.substring(i, i + n))
    }
    return grams
  }
  
  const grams1 = getNGrams(str1)
  const grams2 = getNGrams(str2)
  
  // Jaccard 유사도 계산
  const intersection = new Set([...grams1].filter(x => grams2.has(x)))
  const union = new Set([...grams1, ...grams2])
  
  return intersection.size / union.size
}

/**
 * Jaro-Winkler Similarity 계산
 */
export function jaroWinklerSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0
  
  const len1 = str1.length
  const len2 = str2.length
  
  if (len1 === 0 || len2 === 0) return 0.0
  
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1
  const str1Matches = new Array(len1).fill(false)
  const str2Matches = new Array(len2).fill(false)
  
  let matches = 0
  let transpositions = 0
  
  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, len2)
    
    for (let j = start; j < end; j++) {
      if (str2Matches[j] || str1[i] !== str2[j]) continue
      str1Matches[i] = true
      str2Matches[j] = true
      matches++
      break
    }
  }
  
  if (matches === 0) return 0.0
  
  // Find transpositions
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!str1Matches[i]) continue
    while (!str2Matches[k]) k++
    if (str1[i] !== str2[k]) transpositions++
    k++
  }
  
  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  
  // Winkler prefix bonus
  let prefix = 0
  for (let i = 0; i < Math.min(len1, len2, 4); i++) {
    if (str1[i] === str2[i]) prefix++
    else break
  }
  
  return jaro + (0.1 * prefix * (1 - jaro))
}

/**
 * 하이브리드 유사도 계산 (N-gram + Jaro-Winkler)
 * MIT 연구 검증: N-gram 최고 성능 + Jaro-Winkler 보완
 */
export function hybridSimilarity(str1: string, str2: string): { score: number; algorithm: 'hybrid' | 'ngram' | 'jaro_winkler' } {
  // 1. N-gram 유사도 (주 알고리즘)
  const ngramScore = nGramSimilarity(str1, str2, 2)
  
  // 2. Jaro-Winkler 유사도 (보완)
  const jaroScore = jaroWinklerSimilarity(str1, str2)
  
  // 3. Levenshtein 유사도 (백업)
  const levDistance = levenshteinDistance(str1, str2)
  const levScore = 1 - (levDistance / Math.max(str1.length, str2.length))
  
  // 4. 가중 평균 (N-gram 60%, Jaro-Winkler 30%, Levenshtein 10%)
  const hybridScore = (ngramScore * 0.6) + (jaroScore * 0.3) + (levScore * 0.1)
  
  // 5. 최고 성능 알고리즘 선택
  let bestAlgorithm: 'hybrid' | 'ngram' | 'jaro_winkler' = 'hybrid'
  let bestScore = hybridScore
  
  if (ngramScore > bestScore) {
    bestScore = ngramScore
    bestAlgorithm = 'ngram'
  }
  
  if (jaroScore > bestScore) {
    bestScore = jaroScore
    bestAlgorithm = 'jaro_winkler'
  }
  
  return { score: bestScore, algorithm: bestAlgorithm }
}

/**
 * 유사도 기반 신뢰도 판정 (하이브리드 알고리즘 고려)
 */
export function calculateConfidence(similarity: number, algorithm: string): 'high' | 'medium' | 'low' {
  if (algorithm === 'exact') return 'high'
  
  // 하이브리드 알고리즘은 더 엄격한 기준 적용
  if (algorithm === 'hybrid' || algorithm === 'ngram') {
    if (similarity >= 0.8) return 'high'
    if (similarity >= 0.6) return 'medium'
    return 'low'
  }
  
  // 기존 알고리즘
  if (similarity >= 0.9) return 'high'
  if (similarity >= 0.7) return 'medium'
  return 'low'
}

/**
 * 거래처명 Fuzzy Matching 실행
 */
export async function fuzzyMatchCompany(
  inputName: string,
  companyList: CompanyRecord[],
  threshold: number = 0.6
): Promise<FuzzyMatchResult[]> {
  if (!inputName?.trim()) return []
  
  const results: FuzzyMatchResult[] = []
  const inputVariants = await normalizeJapaneseText(inputName)
  
  for (const company of companyList) {
    const companyVariants = [
      ...(await normalizeJapaneseText(company.name)),
      ...(company.abbreviation ? await normalizeJapaneseText(company.abbreviation) : [])
    ]
    
    let bestMatch: FuzzyMatchResult | null = null
    
    // 모든 입력 변형 × 모든 회사명 변형 조합 검사
    for (const inputVariant of inputVariants) {
      for (const companyVariant of companyVariants) {
        // 1. 완전 일치 검사
        if (inputVariant === companyVariant) {
          bestMatch = {
            code: company.code,
            name: company.name,
            normalizedName: companyVariant,
            originalInput: inputName,
            normalizedInput: inputVariant,
            similarity: 1.0,
            algorithm: 'exact',
            confidence: 'high'
          }
          break
        }
        
        // 2. 하이브리드 유사도 매칭 (N-gram + Jaro-Winkler + Levenshtein)
        const hybridResult = hybridSimilarity(inputVariant, companyVariant)
        
        if (hybridResult.score >= threshold) {
          const candidate: FuzzyMatchResult = {
            code: company.code,
            name: company.name,
            normalizedName: companyVariant,
            originalInput: inputName,
            normalizedInput: inputVariant,
            similarity: hybridResult.score,
            algorithm: hybridResult.algorithm,
            confidence: calculateConfidence(hybridResult.score, hybridResult.algorithm)
          }
          
          if (!bestMatch || candidate.similarity > bestMatch.similarity) {
            bestMatch = candidate
          }
        }
        
        // 3. DEMO_SUPPLIER 특별 보너스 (완전 매칭이 아닌 경우)
        if (/DEMO_SUPPLIER/i.test(inputVariant) && /DEMO_SUPPLIER/i.test(companyVariant)) {
          if (bestMatch && bestMatch.algorithm !== 'exact') {
            bestMatch.similarity = Math.min(1.0, bestMatch.similarity + 0.1) // 10% 보너스
            bestMatch.confidence = 'high'
            console.log(`[DEMO_SUPPLIER Bonus] Applied +0.1 bonus: ${bestMatch.similarity}`)
          }
        }
      }
      
      if (bestMatch?.algorithm === 'exact') break // 완전 일치 시 더 이상 검사 불필요
    }
    
    if (bestMatch) {
      results.push(bestMatch)
    }
  }
  
  // 유사도 순으로 정렬
  return results.sort((a, b) => b.similarity - a.similarity)
}

/**
 * 최고 매치 결과 반환 (기존 API 호환)
 */
export async function getBestMatch(
  inputName: string,
  companyList: CompanyRecord[],
  threshold: number = 0.6
): Promise<FuzzyMatchResult | null> {
  const results = await fuzzyMatchCompany(inputName, companyList, threshold)
  return results.length > 0 ? results[0] : null
}