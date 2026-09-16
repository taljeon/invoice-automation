/**
 * 배치 처리 캐싱 시스템
 * GitHub/Reddit 커뮤니티 검증 - 복수 PDF 처리 성능 최적화
 */

import type { FuzzyMatchResult } from './fuzzyMatchingService'

interface CacheEntry {
  result: FuzzyMatchResult | null
  timestamp: number
  hitCount: number
}

interface BatchCacheStats {
  totalQueries: number
  cacheHits: number
  cacheMisses: number
  hitRate: number
  avgResponseTime: number
}

class MatchingCacheService {
  private cache = new Map<string, CacheEntry>()
  private readonly maxCacheSize = 10000 // 최대 10K 엔트리
  private readonly ttlMs = 1000 * 60 * 60 * 24 // 24시간
  private stats: BatchCacheStats = {
    totalQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hitRate: 0,
    avgResponseTime: 0
  }

  /**
   * 캐시 키 생성 (정규화된 문자열 기반)
   */
  private generateCacheKey(inputName: string, companyName: string): string {
    // 대소문자 정규화 + 공백 제거 + 특수문자 정리
    const normalize = (text: string) => 
      text.toLowerCase()
          .replace(/[.,&\-\s]+/g, '')
          .replace(/co\.?ltd\.?/gi, '')
          .replace(/works|engineering|corporation|company/gi, '')
    
    const key1 = normalize(inputName)
    const key2 = normalize(companyName)
    
    return `${key1}:${key2}`
  }

  /**
   * 캐시에서 매칭 결과 조회
   */
  get(inputName: string, companyName: string): FuzzyMatchResult | null {
    const startTime = performance.now()
    this.stats.totalQueries++
    
    const key = this.generateCacheKey(inputName, companyName)
    const entry = this.cache.get(key)
    
    if (entry) {
      // TTL 확인
      if (Date.now() - entry.timestamp > this.ttlMs) {
        this.cache.delete(key)
        this.stats.cacheMisses++
        this.updateStats(startTime)
        return null
      }
      
      // 히트 카운트 증가
      entry.hitCount++
      this.stats.cacheHits++
      this.updateStats(startTime)
      
      console.log(`[Cache HIT] ${key} (hits: ${entry.hitCount})`)
      return entry.result
    }
    
    this.stats.cacheMisses++
    this.updateStats(startTime)
    console.log(`[Cache MISS] ${key}`)
    return null
  }

  /**
   * 캐시에 매칭 결과 저장
   */
  set(inputName: string, companyName: string, result: FuzzyMatchResult | null): void {
    const key = this.generateCacheKey(inputName, companyName)
    
    // 캐시 크기 관리 (LRU 방식)
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastUsed()
    }
    
    const entry: CacheEntry = {
      result,
      timestamp: Date.now(),
      hitCount: 0
    }
    
    this.cache.set(key, entry)
    console.log(`[Cache SET] ${key} -> ${result ? result.name : 'null'}`)
  }

  /**
   * 배치 매칭 (캐시 우선 사용)
   */
  async batchMatch(
    inputs: Array<{ inputName: string; companyList: Array<{ code: string; name: string; abbreviation?: string }> }>,
    fuzzyMatchFunction: (inputName: string, companyList: any[]) => Promise<FuzzyMatchResult | null>
  ): Promise<Array<FuzzyMatchResult | null>> {
    const results: Array<FuzzyMatchResult | null> = []
    const uncachedInputs: Array<{ index: number; input: typeof inputs[0] }> = []
    
    console.log(`[Batch Match] Processing ${inputs.length} items with cache optimization`)
    
    // 1단계: 캐시에서 가능한 모든 결과 조회
    for (let i = 0; i < inputs.length; i++) {
      const { inputName, companyList } = inputs[i]
      let cachedResult: FuzzyMatchResult | null = null
      
      // 각 회사와의 매칭 결과를 캐시에서 확인
      for (const company of companyList) {
        const cached = this.get(inputName, company.name)
        if (cached && (!cachedResult || cached.similarity > cachedResult.similarity)) {
          cachedResult = cached
        }
      }
      
      if (cachedResult) {
        results[i] = cachedResult
      } else {
        results[i] = null
        uncachedInputs.push({ index: i, input: inputs[i] })
      }
    }
    
    console.log(`[Batch Cache] ${inputs.length - uncachedInputs.length}/${inputs.length} cache hits`)
    
    // 2단계: 캐시 미스 항목들을 실제 매칭 처리
    for (const { index, input } of uncachedInputs) {
      const result = await fuzzyMatchFunction(input.inputName, input.companyList)
      results[index] = result
      
      // 캐시에 저장 (null 결과도 저장하여 중복 처리 방지)
      if (result) {
        this.set(input.inputName, result.name, result)
      } else {
        // 가장 가능성 높은 회사명으로 null 결과 캐싱
        const topCompany = input.companyList[0]
        if (topCompany) {
          this.set(input.inputName, topCompany.name, null)
        }
      }
    }
    
    return results
  }

  /**
   * LRU 방식 캐시 정리
   */
  private evictLeastUsed(): void {
    let leastUsedKey = ''
    let leastHitCount = Infinity
    let oldestTimestamp = Infinity
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.hitCount < leastHitCount || 
          (entry.hitCount === leastHitCount && entry.timestamp < oldestTimestamp)) {
        leastUsedKey = key
        leastHitCount = entry.hitCount
        oldestTimestamp = entry.timestamp
      }
    }
    
    if (leastUsedKey) {
      this.cache.delete(leastUsedKey)
      console.log(`[Cache Evict] Removed least used: ${leastUsedKey}`)
    }
  }

  /**
   * 통계 업데이트
   */
  private updateStats(startTime: number): void {
    const responseTime = performance.now() - startTime
    this.stats.hitRate = this.stats.cacheHits / this.stats.totalQueries
    this.stats.avgResponseTime = 
      (this.stats.avgResponseTime * (this.stats.totalQueries - 1) + responseTime) / this.stats.totalQueries
  }

  /**
   * 캐시 통계 조회
   */
  getStats(): BatchCacheStats {
    return { ...this.stats }
  }

  /**
   * 캐시 초기화
   */
  clear(): void {
    this.cache.clear()
    this.stats = {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRate: 0,
      avgResponseTime: 0
    }
    console.log('[Cache] Cleared all entries and stats')
  }

  /**
   * 캐시 상태 정보
   */
  getInfo(): { size: number; maxSize: number; hitRate: string } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: (this.stats.hitRate * 100).toFixed(2) + '%'
    }
  }
}

// 싱글톤 인스턴스
export const matchingCache = new MatchingCacheService()
export default matchingCache