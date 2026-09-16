/**
 * OCR 출력 일관성 보장을 위한 다중 처리 검증 시스템
 * 연구 기반: 같은 문서를 여러 번 처리하여 가장 신뢰할 수 있는 결과 선택
 */

import type { LineItem } from '../types'
import { extractInvoiceWithGPT5 } from './ocrService'
// import { generateOverallQualityReport } from './ocrQualityService' // 향후 대시보드에서 사용 예정

/**
 * 다중 처리 결과 비교를 위한 인터페이스
 */
export interface ProcessingRun {
  runId: string
  timestamp: string
  processingTime: number
  success: boolean
  lineItems: LineItem[]
  error?: string
  
  // 핵심 추출 데이터
  supplierName: string
  supplierCode: string
  shipCount: number
  totalItems: number
  shipNames: string[]
}

/**
 * 일관성 분석 결과
 */
export interface ConsistencyAnalysis {
  documentId: string
  runs: ProcessingRun[]
  
  // 일관성 메트릭
  consistency: {
    supplierConsistent: boolean
    shipCountConsistent: boolean
    itemCountConsistent: boolean
    overallScore: number // 0-100
  }
  
  // 최적 결과 선택
  recommendedRun: ProcessingRun
  consensusData: {
    supplierName: string
    supplierCode: string
    shipNames: string[]
    confidence: 'high' | 'medium' | 'low'
  }
  
  // 품질 지표
  qualityMetrics: {
    averageProcessingTime: number
    successRate: number
    variationDetails: string[]
  }
}

/**
 * 다중 처리 검증 서비스
 */
export class ConsistencyService {
  private readonly DEFAULT_RUNS = 3
  private readonly MAX_RUNS = 5
  private readonly CONSISTENCY_THRESHOLD = 0.8
  
  /**
   * 문서를 여러 번 처리하여 일관성 있는 결과 도출
   */
  async processWithConsistencyValidation(
    pdfFile: File,
    pdfFileName: string,
    runs: number = this.DEFAULT_RUNS
  ): Promise<ConsistencyAnalysis> {
    const actualRuns = Math.min(runs, this.MAX_RUNS)
    const documentId = `${pdfFileName}_${Date.now()}`
    
    console.log(`[Consistency] Starting ${actualRuns} processing runs for ${pdfFileName}`)
    
    const processingRuns: ProcessingRun[] = []
    
    // 다중 처리 실행
    for (let i = 0; i < actualRuns; i++) {
      const runId = `${documentId}_run_${i + 1}`
      const startTime = Date.now()
      
      console.log(`[Consistency] Run ${i + 1}/${actualRuns} starting...`)
      
      try {
        const lineItems = await extractInvoiceWithGPT5(pdfFile, `${pdfFileName}_run${i + 1}`)
        const processingTime = Date.now() - startTime
        
        const run: ProcessingRun = {
          runId,
          timestamp: new Date().toISOString(),
          processingTime,
          success: true,
          lineItems,
          
          // 핵심 데이터 추출
          supplierName: lineItems[0]?.仕入先名 || '',
          supplierCode: lineItems[0]?.仕入先コード || '',
          shipCount: new Set(lineItems.map(item => item.得意先名)).size,
          totalItems: lineItems.length,
          shipNames: Array.from(new Set(lineItems.map(item => item.得意先名).filter((name): name is string => Boolean(name))))
        }
        
        processingRuns.push(run)
        console.log(`[Consistency] Run ${i + 1} completed: ${run.supplierName}, ${run.shipCount} ships, ${run.totalItems} items`)
        
      } catch (error) {
        const processingTime = Date.now() - startTime
        const failedRun: ProcessingRun = {
          runId,
          timestamp: new Date().toISOString(),
          processingTime,
          success: false,
          lineItems: [],
          error: error instanceof Error ? error.message : String(error),
          supplierName: '',
          supplierCode: '',
          shipCount: 0,
          totalItems: 0,
          shipNames: []
        }
        
        processingRuns.push(failedRun)
        console.error(`[Consistency] Run ${i + 1} failed:`, error)
      }
      
      // 실행 간 간격 (API 부하 분산)
      if (i < actualRuns - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    // 일관성 분석 수행
    const analysis = this.analyzeConsistency(documentId, processingRuns)
    
    console.log(`[Consistency] Analysis complete: ${analysis.consistency.overallScore}% consistency`)
    
    return analysis
  }
  
  /**
   * 다중 처리 결과의 일관성 분석
   */
  private analyzeConsistency(documentId: string, runs: ProcessingRun[]): ConsistencyAnalysis {
    const successfulRuns = runs.filter(run => run.success)
    
    if (successfulRuns.length === 0) {
      throw new Error('모든 처리가 실패했습니다.')
    }
    
    // 공급업체명 일관성 체크
    const supplierNames = successfulRuns.map(run => run.supplierName)
    const supplierConsistent = new Set(supplierNames).size <= 1
    
    // 선박 수 일관성 체크
    const shipCounts = successfulRuns.map(run => run.shipCount)
    const shipCountConsistent = new Set(shipCounts).size <= 1
    
    // 항목 수 일관성 체크 (±1 허용)
    const itemCounts = successfulRuns.map(run => run.totalItems)
    const maxItems = Math.max(...itemCounts)
    const minItems = Math.min(...itemCounts)
    const itemCountConsistent = (maxItems - minItems) <= 1
    
    // 전체 일관성 점수 계산
    const consistencyFactors = [
      supplierConsistent ? 1 : 0,
      shipCountConsistent ? 1 : 0,
      itemCountConsistent ? 1 : 0
    ]
    const overallScore = (consistencyFactors.reduce((sum, val) => sum + val, 0) / consistencyFactors.length) * 100
    
    // 최적 결과 선택 (가장 많은 항목을 가진 성공적인 실행)
    const recommendedRun = successfulRuns.reduce((best, current) => 
      current.totalItems > best.totalItems ? current : best
    )
    
    // 합의 데이터 생성
    const consensusData = this.generateConsensusData(successfulRuns, overallScore)
    
    // 품질 지표 계산
    const qualityMetrics = this.calculateQualityMetrics(runs)
    
    // 변이 세부사항 분석
    const variationDetails = this.analyzeVariations(successfulRuns)
    
    return {
      documentId,
      runs,
      consistency: {
        supplierConsistent,
        shipCountConsistent,
        itemCountConsistent,
        overallScore: Math.round(overallScore)
      },
      recommendedRun,
      consensusData,
      qualityMetrics: {
        ...qualityMetrics,
        variationDetails
      }
    }
  }
  
  /**
   * 여러 실행 결과에서 합의 데이터 생성
   */
  private generateConsensusData(runs: ProcessingRun[], overallScore: number): ConsistencyAnalysis['consensusData'] {
    // 가장 빈번한 공급업체명 선택
    const supplierNameCounts = this.countFrequency(runs.map(r => r.supplierName))
    const supplierName = this.getMostFrequent(supplierNameCounts)
    
    // 가장 빈번한 공급업체코드 선택
    const supplierCodeCounts = this.countFrequency(runs.map(r => r.supplierCode))
    const supplierCode = this.getMostFrequent(supplierCodeCounts)
    
    // 모든 실행에서 공통으로 나타나는 선박명
    const allShipNames = runs.flatMap(r => r.shipNames)
    const shipNameCounts = this.countFrequency(allShipNames)
    const shipNames = Object.entries(shipNameCounts)
      .filter(([_, count]) => count >= Math.ceil(runs.length / 2)) // 과반수 이상
      .map(([name, _]) => name)
      .sort()
    
    // 신뢰도 결정
    let confidence: 'high' | 'medium' | 'low'
    if (overallScore >= 90) confidence = 'high'
    else if (overallScore >= 70) confidence = 'medium'
    else confidence = 'low'
    
    return {
      supplierName,
      supplierCode,
      shipNames,
      confidence
    }
  }
  
  /**
   * 품질 지표 계산
   */
  private calculateQualityMetrics(runs: ProcessingRun[]) {
    const processingTimes = runs.map(r => r.processingTime)
    const averageProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
    
    const successCount = runs.filter(r => r.success).length
    const successRate = (successCount / runs.length) * 100
    
    return {
      averageProcessingTime: Math.round(averageProcessingTime),
      successRate: Math.round(successRate)
    }
  }
  
  /**
   * 변이 세부사항 분석
   */
  private analyzeVariations(runs: ProcessingRun[]): string[] {
    const variations: string[] = []
    
    // 공급업체명 변이
    const supplierNames = [...new Set(runs.map(r => r.supplierName))]
    if (supplierNames.length > 1) {
      variations.push(`공급업체명 변이: ${supplierNames.join(' / ')}`)
    }
    
    // 선박 수 변이
    const shipCounts = [...new Set(runs.map(r => r.shipCount))]
    if (shipCounts.length > 1) {
      variations.push(`선박 수 변이: ${shipCounts.join(' / ')}`)
    }
    
    // 항목 수 변이
    const itemCounts = [...new Set(runs.map(r => r.totalItems))]
    if (itemCounts.length > 1) {
      variations.push(`항목 수 변이: ${itemCounts.join(' / ')}`)
    }
    
    // 처리 시간 변이
    const processingTimes = runs.map(r => r.processingTime)
    const maxTime = Math.max(...processingTimes)
    const minTime = Math.min(...processingTimes)
    if ((maxTime - minTime) > 10000) { // 10초 이상 차이
      variations.push(`처리 시간 변이: ${minTime}ms ~ ${maxTime}ms`)
    }
    
    return variations
  }
  
  /**
   * 빈도 계산 유틸리티
   */
  private countFrequency<T>(items: T[]): Record<string, number> {
    return items.reduce((counts, item) => {
      const key = String(item)
      counts[key] = (counts[key] || 0) + 1
      return counts
    }, {} as Record<string, number>)
  }
  
  /**
   * 가장 빈번한 항목 선택
   */
  private getMostFrequent(counts: Record<string, number>): string {
    return Object.entries(counts)
      .reduce((max, [key, count]) => count > max.count ? { key, count } : max, { key: '', count: 0 })
      .key
  }
  
  /**
   * 일관성 임계값 검증
   */
  isConsistent(analysis: ConsistencyAnalysis): boolean {
    return analysis.consistency.overallScore >= (this.CONSISTENCY_THRESHOLD * 100)
  }
  
  /**
   * 자동 일관성 검증 (임계값 미달 시 추가 실행)
   */
  async processWithAutoConsistency(
    pdfFile: File,
    pdfFileName: string,
    initialRuns: number = 3
  ): Promise<ConsistencyAnalysis> {
    let analysis = await this.processWithConsistencyValidation(pdfFile, pdfFileName, initialRuns)
    
    // 일관성이 부족한 경우 추가 실행
    if (!this.isConsistent(analysis) && analysis.runs.length < this.MAX_RUNS) {
      console.log(`[Auto-Consistency] Low consistency (${analysis.consistency.overallScore}%), running additional tests`)
      
      const additionalRuns = Math.min(2, this.MAX_RUNS - analysis.runs.length)
      const additionalAnalysis = await this.processWithConsistencyValidation(
        pdfFile, 
        `${pdfFileName}_additional`, 
        additionalRuns
      )
      
      // 결과 병합
      const combinedRuns = [...analysis.runs, ...additionalAnalysis.runs]
      analysis = this.analyzeConsistency(analysis.documentId, combinedRuns)
      
      console.log(`[Auto-Consistency] Final consistency: ${analysis.consistency.overallScore}%`)
    }
    
    return analysis
  }
}

// 싱글톤 인스턴스
export const consistencyService = new ConsistencyService()

/**
 * 편의 함수
 */
export async function processWithConsistencyCheck(
  pdfFile: File,
  pdfFileName: string,
  runs: number = 3
): Promise<{
  analysis: ConsistencyAnalysis
  recommendedResult: LineItem[]
  qualityReport: string
}> {
  const analysis = await consistencyService.processWithConsistencyValidation(pdfFile, pdfFileName, runs)
  
  const qualityReport = `
일관성 분석 결과:
- 전체 일관성: ${analysis.consistency.overallScore}%
- 공급업체 일관성: ${analysis.consistency.supplierConsistent ? '✅' : '❌'}
- 선박 수 일관성: ${analysis.consistency.shipCountConsistent ? '✅' : '❌'}
- 항목 수 일관성: ${analysis.consistency.itemCountConsistent ? '✅' : '❌'}
- 성공률: ${analysis.qualityMetrics.successRate}%
- 평균 처리시간: ${analysis.qualityMetrics.averageProcessingTime}ms
- 권장 신뢰도: ${analysis.consensusData.confidence}

합의 결과:
- 공급업체: ${analysis.consensusData.supplierName}
- 선박: ${analysis.consensusData.shipNames.join(', ')}
${analysis.qualityMetrics.variationDetails.length > 0 ? '\n변이사항:\n' + analysis.qualityMetrics.variationDetails.map(v => `- ${v}`).join('\n') : ''}
  `.trim()
  
  return {
    analysis,
    recommendedResult: analysis.recommendedRun.lineItems,
    qualityReport
  }
}