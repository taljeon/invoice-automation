/**
 * OCR 원본 우선 + 사후 유사도 매칭 서비스
 * GitHub/Reddit 조사 기반 "Raw First, Match Later" 아키텍처
 */

import { JAPANESE_COMPANIES } from '../data/companies'

/**
 * 레벤시타인 거리 계산 (간단한 유사도 측정)
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix = []
  
  // 초기화
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  
  // 계산
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 치환
          matrix[i][j - 1] + 1,     // 삽입
          matrix[i - 1][j] + 1      // 삭제
        )
      }
    }
  }
  
  return matrix[b.length][a.length]
}

/**
 * 유사도 점수 계산 (0-1, 1이 완전 일치)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length)
  if (maxLength === 0) return 1
  
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase())
  return 1 - (distance / maxLength)
}

/**
 * OCR 원본 기반 사후 유사도 매칭
 */
export function findBestCompanyMatch(ocrRawText: string): {
  originalOCR: string
  matchedCompany: string | null
  similarity: number
  method: 'exact' | 'similarity' | 'none'
  confidence: number
} {
  const functionStart = Date.now()
  console.log('[SIMILARITY] ===== findBestCompanyMatch 호출됨 =====')

  const cleaned = ocrRawText.trim()
  console.log(`[SIMILARITY] 입력: "${cleaned}"`)

  // 1단계: 완전 일치 검사
  const stage1Start = Date.now()
  for (const company of JAPANESE_COMPANIES) {
    // 표준명 완전 일치
    if (company.name.toLowerCase() === cleaned.toLowerCase()) {
      const matchTime = Date.now() - functionStart
      console.log(`[SIMILARITY] ✅ Exact match 발견: "${company.name}" (${matchTime}ms)`)
      return {
        originalOCR: cleaned,
        matchedCompany: company.name,
        similarity: 1.0,
        method: 'exact',
        confidence: 1.0
      }
    }

    // 변형명 완전 일치
    for (const variant of company.variants) {
      if (variant.toLowerCase() === cleaned.toLowerCase()) {
        const matchTime = Date.now() - functionStart
        console.log(`[SIMILARITY] ✅ Variant match 발견: "${variant}" → "${company.name}" (${matchTime}ms)`)
        return {
          originalOCR: cleaned,
          matchedCompany: company.name,
          similarity: 1.0,
          method: 'exact',
          confidence: 0.95
        }
      }
    }
  }
  const stage1Duration = Date.now() - stage1Start
  console.log(`[SIMILARITY] Stage 1 (Exact match) 완료: ${stage1Duration}ms`)
  
  // 2단계: 유사도 매칭 (임계값 0.7 이상)
  const stage2Start = Date.now()
  let bestMatch = {
    company: null as string | null,
    similarity: 0,
    confidence: 0
  }
  let comparisonCount = 0

  for (const company of JAPANESE_COMPANIES) {
    // 표준명과 유사도 비교
    const standardSimilarity = calculateSimilarity(cleaned, company.name)
    comparisonCount++

    if (standardSimilarity > bestMatch.similarity && standardSimilarity >= 0.7) {
      bestMatch = {
        company: company.name,
        similarity: standardSimilarity,
        confidence: standardSimilarity * 0.8 // 유사도 매칭은 신뢰도 약간 감소
      }
    }

    // 변형명과 유사도 비교
    for (const variant of company.variants) {
      const variantSimilarity = calculateSimilarity(cleaned, variant)
      comparisonCount++

      if (variantSimilarity > bestMatch.similarity && variantSimilarity >= 0.7) {
        bestMatch = {
          company: company.name,
          similarity: variantSimilarity,
          confidence: variantSimilarity * 0.75
        }
      }
    }
  }

  const stage2Duration = Date.now() - stage2Start
  console.log(`[SIMILARITY] Stage 2 (Fuzzy match) 완료: ${stage2Duration}ms`)
  console.log(`[SIMILARITY] 총 비교 횟수: ${comparisonCount}회`)
  console.log(`[SIMILARITY] 1회 평균: ${(stage2Duration / comparisonCount).toFixed(4)}ms`)
  
  const totalDuration = Date.now() - functionStart
  console.log(`[SIMILARITY] ===== findBestCompanyMatch 전체 완료: ${totalDuration}ms =====`)

  if (totalDuration > 100) {
    console.error(`[ERROR] ⚠️  유사도 매칭이 ${totalDuration}ms 걸림! (예상: 2~5ms)`)
    console.error('[ERROR] 병목 원인 조사 필요!')
  } else {
    console.log(`[SIMILARITY] ✅ 성능 정상 (${totalDuration}ms < 100ms)`)
  }

  if (bestMatch.company) {
    console.log(`[SIMILARITY] ✅ Similarity match: "${cleaned}" → "${bestMatch.company}" (${bestMatch.similarity.toFixed(3)})`)
    return {
      originalOCR: cleaned,
      matchedCompany: bestMatch.company,
      similarity: bestMatch.similarity,
      method: 'similarity',
      confidence: bestMatch.confidence
    }
  }

  // 3단계: 매칭 실패 - 원본 그대로 유지
  console.log(`[SIMILARITY] ❌ No match found, keeping original: "${cleaned}"`)
  return {
    originalOCR: cleaned,
    matchedCompany: null,
    similarity: 0,
    method: 'none',
    confidence: 0.3 // 원본 그대로는 낮은 신뢰도
  }
}

/**
 * 배치 처리 (여러 회사명 동시 처리)
 */
export function batchProcessCompanyNames(ocrResults: string[]): Array<{
  index: number
  result: ReturnType<typeof findBestCompanyMatch>
}> {
  return ocrResults.map((ocr, index) => ({
    index,
    result: findBestCompanyMatch(ocr)
  }))
}