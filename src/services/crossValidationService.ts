/**
 * 교차 검증 시스템 (Cross-Validation)
 * LLM 백업 + Fuzzy Matching 결과 교차 검증으로 실패율 최소화
 */

import type { FuzzyMatchResult } from './fuzzyMatchingService'

interface ValidationResult {
  finalResult: { code: string; name: string; confidence: 'high' | 'medium' | 'low' } | null
  fuzzyResult: FuzzyMatchResult | null
  llmResult: { code: string; name: string; confidence: 'high' | 'medium' | 'low' } | null
  validationScore: number
  validationMethod: 'fuzzy_only' | 'llm_only' | 'cross_validated' | 'consensus' | 'failed'
  reasoning: string
}

interface CrossValidationConfig {
  fuzzyThreshold: number
  llmThreshold: number
  consensusThreshold: number
  enableLLMBackup: boolean
  enableCrossValidation: boolean
}

const DEFAULT_CONFIG: CrossValidationConfig = {
  fuzzyThreshold: 0.6,
  llmThreshold: 0.7,
  consensusThreshold: 0.8,
  enableLLMBackup: true,
  enableCrossValidation: true
}

export class CrossValidationService {
  private config: CrossValidationConfig

  constructor(config: Partial<CrossValidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 회사명 매칭 교차 검증 실행
   */
  async validateCompanyMatching(
    inputName: string,
    companyList: Array<{ code: string; name: string; abbreviation?: string }>,
    fuzzyMatchFunction: (inputName: string, companyList: any[]) => Promise<FuzzyMatchResult | null>,
    llmMatchFunction?: (inputName: string) => Promise<{ code: string; name: string; confidence: 'high' | 'medium' | 'low' } | null>
  ): Promise<ValidationResult> {
    
    console.log(`[Cross Validation] Starting validation for "${inputName}"`)
    
    // 1단계: Fuzzy Matching 실행
    const fuzzyResult = await fuzzyMatchFunction(inputName, companyList)
    
    // 2단계: LLM 매칭 실행 (옵션)
    let llmResult: { code: string; name: string; confidence: 'high' | 'medium' | 'low' } | null = null
    if (this.config.enableLLMBackup && llmMatchFunction) {
      try {
        llmResult = await llmMatchFunction(inputName)
      } catch (error) {
        console.warn('[Cross Validation] LLM matching failed:', error)
      }
    }
    
    // 3단계: 교차 검증 실행
    return this.performCrossValidation(inputName, fuzzyResult, llmResult)
  }

  /**
   * 교차 검증 로직 실행
   */
  private performCrossValidation(
    inputName: string,
    fuzzyResult: FuzzyMatchResult | null,
    llmResult: { code: string; name: string; confidence: 'high' | 'medium' | 'low' } | null
  ): ValidationResult {
    
    // 시나리오 1: Fuzzy만 성공
    if (fuzzyResult && !llmResult) {
      return {
        finalResult: {
          code: fuzzyResult.code,
          name: fuzzyResult.name,
          confidence: fuzzyResult.confidence
        },
        fuzzyResult,
        llmResult: null,
        validationScore: fuzzyResult.similarity,
        validationMethod: 'fuzzy_only',
        reasoning: `Fuzzy matching successful (${fuzzyResult.algorithm}, score: ${fuzzyResult.similarity.toFixed(3)})`
      }
    }
    
    // 시나리오 2: LLM만 성공
    if (!fuzzyResult && llmResult) {
      return {
        finalResult: llmResult,
        fuzzyResult: null,
        llmResult,
        validationScore: this.confidenceToScore(llmResult.confidence),
        validationMethod: 'llm_only',
        reasoning: `LLM matching successful (confidence: ${llmResult.confidence})`
      }
    }
    
    // 시나리오 3: 둘 다 성공 - 교차 검증
    if (fuzzyResult && llmResult) {
      return this.crossValidateBothResults(inputName, fuzzyResult, llmResult)
    }
    
    // 시나리오 4: 둘 다 실패
    return {
      finalResult: null,
      fuzzyResult: null,
      llmResult: null,
      validationScore: 0,
      validationMethod: 'failed',
      reasoning: 'Both fuzzy matching and LLM matching failed to find acceptable matches'
    }
  }

  /**
   * 두 결과의 교차 검증
   */
  private crossValidateBothResults(
    _inputName: string,
    fuzzyResult: FuzzyMatchResult,
    llmResult: { code: string; name: string; confidence: 'high' | 'medium' | 'low' }
  ): ValidationResult {
    
    const fuzzyScore = fuzzyResult.similarity
    const llmScore = this.confidenceToScore(llmResult.confidence)
    
    // 1. 결과가 동일한 회사를 가리키는지 확인
    const isConsensus = this.checkConsensus(fuzzyResult.name, llmResult.name)
    
    if (isConsensus) {
      // 합의된 결과 - 높은 신뢰도
      const consensusScore = Math.max(fuzzyScore, llmScore)
      return {
        finalResult: {
          code: fuzzyResult.code, // Fuzzy 결과의 코드 우선 사용
          name: fuzzyResult.name,
          confidence: consensusScore >= this.config.consensusThreshold ? 'high' : 'medium'
        },
        fuzzyResult,
        llmResult,
        validationScore: consensusScore,
        validationMethod: 'consensus',
        reasoning: `Both methods agreed on "${fuzzyResult.name}" (fuzzy: ${fuzzyScore.toFixed(3)}, llm: ${llmResult.confidence})`
      }
    }
    
    // 2. 결과가 다른 경우 - 더 높은 점수 선택
    if (fuzzyScore >= llmScore) {
      return {
        finalResult: {
          code: fuzzyResult.code,
          name: fuzzyResult.name,
          confidence: this.adjustConfidenceForDisagreement(fuzzyResult.confidence)
        },
        fuzzyResult,
        llmResult,
        validationScore: fuzzyScore,
        validationMethod: 'cross_validated',
        reasoning: `Fuzzy method won (${fuzzyScore.toFixed(3)} vs ${llmScore.toFixed(3)}), but confidence adjusted due to disagreement`
      }
    } else {
      return {
        finalResult: llmResult,
        fuzzyResult,
        llmResult,
        validationScore: llmScore,
        validationMethod: 'cross_validated',
        reasoning: `LLM method won (${llmResult.confidence} vs ${fuzzyResult.confidence}), but confidence adjusted due to disagreement`
      }
    }
  }

  /**
   * 두 결과가 합의하는지 확인
   */
  private checkConsensus(name1: string, name2: string): boolean {
    // 정규화 후 비교
    const normalize = (name: string) => 
      name.toLowerCase()
          .replace(/[.,&\-\s]+/g, '')
          .replace(/株式会社|㈱|\(株\)|（株）/g, '')
          .replace(/co\.?ltd\.?|works|engineering|corporation|company/gi, '')
    
    const normalized1 = normalize(name1)
    const normalized2 = normalize(name2)
    
    // 완전 일치 또는 한쪽이 다른 쪽을 포함
    return normalized1 === normalized2 || 
           normalized1.includes(normalized2) || 
           normalized2.includes(normalized1)
  }

  /**
   * 신뢰도를 숫자 점수로 변환
   */
  private confidenceToScore(confidence: 'high' | 'medium' | 'low'): number {
    switch (confidence) {
      case 'high': return 0.9
      case 'medium': return 0.7
      case 'low': return 0.5
      default: return 0
    }
  }

  /**
   * 불일치 시 신뢰도 조정
   */
  private adjustConfidenceForDisagreement(confidence: 'high' | 'medium' | 'low'): 'high' | 'medium' | 'low' {
    switch (confidence) {
      case 'high': return 'medium'  // high -> medium
      case 'medium': return 'low'   // medium -> low
      case 'low': return 'low'      // low -> low
      default: return 'low'
    }
  }

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig: Partial<CrossValidationConfig>): void {
    this.config = { ...this.config, ...newConfig }
    console.log('[Cross Validation] Config updated:', this.config)
  }

  /**
   * 현재 설정 조회
   */
  getConfig(): CrossValidationConfig {
    return { ...this.config }
  }
}

// 기본 인스턴스 생성
export const crossValidator = new CrossValidationService()
export default crossValidator