/**
 * OCR 처리 품질 모니터링 및 로깅 서비스
 * 일관성 문제 해결을 위한 상세 추적 시스템
 */

export interface OCRProcessingLog {
  timestamp: string
  pdfFileName: string
  processingId: string
  
  // OCR 처리 단계별 로그
  visionApiResults: {
    pageCount: number
    totalTextLength: number
    processingTime: number
    textPreview: string
  }
  
  gptProcessingResults: {
    model: string
    tokensUsed: number
    processingTime: number
    rawSupplierName: string
    structuredShipCount: number
  }
  
  enhancementResults: {
    originalSupplierName: string
    correctedSupplierName: string
    confidence: string
    errorPattern?: string
    validationTime: number
  }
  
  finalResults: {
    supplierCode: string
    totalLineItems: number
    shipNames: string[]
    processingSuccess: boolean
  }
}

export interface OCRConsistencyCheck {
  pdfFileName: string
  runs: OCRProcessingLog[]
  consistency: {
    supplierNameConsistent: boolean
    shipCountConsistent: boolean
    itemCountConsistent: boolean
    supplierCodeConsistent: boolean
  }
  variations: {
    supplierNames: string[]
    shipCounts: number[]
    itemCounts: number[]
    supplierCodes: string[]
  }
}

/**
 * 전역 OCR 로그 저장소
 */
class OCRQualityLogger {
  private logs: Map<string, OCRProcessingLog[]> = new Map()
  
  /**
   * 새로운 처리 로그 시작
   */
  startProcessing(pdfFileName: string): string {
    const processingId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    if (!this.logs.has(pdfFileName)) {
      this.logs.set(pdfFileName, [])
    }
    
    const log: OCRProcessingLog = {
      timestamp: new Date().toISOString(),
      pdfFileName,
      processingId,
      visionApiResults: {
        pageCount: 0,
        totalTextLength: 0,
        processingTime: 0,
        textPreview: ''
      },
      gptProcessingResults: {
        model: '',
        tokensUsed: 0,
        processingTime: 0,
        rawSupplierName: '',
        structuredShipCount: 0
      },
      enhancementResults: {
        originalSupplierName: '',
        correctedSupplierName: '',
        confidence: '',
        validationTime: 0
      },
      finalResults: {
        supplierCode: '',
        totalLineItems: 0,
        shipNames: [],
        processingSuccess: false
      }
    }
    
    this.logs.get(pdfFileName)!.push(log)
    
    console.log(`[OCR Quality Logger] Started processing: ${processingId} for ${pdfFileName}`)
    return processingId
  }
  
  /**
   * Vision API 결과 로깅
   */
  logVisionApiResults(
    processingId: string,
    pageCount: number,
    totalTextLength: number,
    processingTime: number,
    textPreview: string
  ) {
    const log = this.findLog(processingId)
    if (log) {
      log.visionApiResults = {
        pageCount,
        totalTextLength,
        processingTime,
        textPreview: textPreview.substring(0, 200) + '...'
      }
      console.log(`[OCR Quality] Vision API: ${pageCount} pages, ${totalTextLength} chars, ${processingTime}ms`)
    }
  }
  
  /**
   * GPT 처리 결과 로깅
   */
  logGPTProcessingResults(
    processingId: string,
    model: string,
    tokensUsed: number,
    processingTime: number,
    rawSupplierName: string,
    structuredShipCount: number
  ) {
    const log = this.findLog(processingId)
    if (log) {
      log.gptProcessingResults = {
        model,
        tokensUsed,
        processingTime,
        rawSupplierName,
        structuredShipCount
      }
      console.log(`[OCR Quality] GPT-5: ${model}, ${tokensUsed} tokens, ${processingTime}ms, "${rawSupplierName}", ${structuredShipCount} ships`)
    }
  }
  
  /**
   * Enhancement 결과 로깅
   */
  logEnhancementResults(
    processingId: string,
    originalSupplierName: string,
    correctedSupplierName: string,
    confidence: string,
    errorPattern: string | undefined,
    validationTime: number
  ) {
    const log = this.findLog(processingId)
    if (log) {
      log.enhancementResults = {
        originalSupplierName,
        correctedSupplierName,
        confidence,
        errorPattern,
        validationTime
      }
      console.log(`[OCR Quality] Enhancement: "${originalSupplierName}" -> "${correctedSupplierName}" (${confidence}, ${validationTime}ms)`)
      if (errorPattern) {
        console.log(`[OCR Quality] Error pattern detected: ${errorPattern}`)
      }
    }
  }
  
  /**
   * 최종 결과 로깅
   */
  logFinalResults(
    processingId: string,
    supplierCode: string,
    totalLineItems: number,
    shipNames: string[],
    processingSuccess: boolean
  ) {
    const log = this.findLog(processingId)
    if (log) {
      log.finalResults = {
        supplierCode,
        totalLineItems,
        shipNames: [...shipNames],
        processingSuccess
      }
      console.log(`[OCR Quality] Final: ${supplierCode}, ${totalLineItems} items, [${shipNames.join(', ')}], success: ${processingSuccess}`)
      
      // 일관성 체크 실행
      this.checkConsistency(log.pdfFileName)
    }
  }
  
  /**
   * 처리 로그 찾기
   */
  private findLog(processingId: string): OCRProcessingLog | undefined {
    for (const logs of this.logs.values()) {
      const log = logs.find(l => l.processingId === processingId)
      if (log) return log
    }
    return undefined
  }
  
  /**
   * 일관성 체크
   */
  checkConsistency(pdfFileName: string): OCRConsistencyCheck | null {
    const logs = this.logs.get(pdfFileName)
    if (!logs || logs.length < 2) {
      return null
    }
    
    // 최근 5개 로그만 체크
    const recentLogs = logs.slice(-5)
    
    const supplierNames = recentLogs.map(l => l.enhancementResults.correctedSupplierName)
    const shipCounts = recentLogs.map(l => l.gptProcessingResults.structuredShipCount)
    const itemCounts = recentLogs.map(l => l.finalResults.totalLineItems)
    const supplierCodes = recentLogs.map(l => l.finalResults.supplierCode)
    
    const consistency = {
      supplierNameConsistent: new Set(supplierNames).size === 1,
      shipCountConsistent: new Set(shipCounts).size === 1,
      itemCountConsistent: new Set(itemCounts).size === 1,
      supplierCodeConsistent: new Set(supplierCodes).size === 1
    }
    
    const consistencyCheck: OCRConsistencyCheck = {
      pdfFileName,
      runs: [...recentLogs],
      consistency,
      variations: {
        supplierNames: Array.from(new Set(supplierNames)),
        shipCounts: Array.from(new Set(shipCounts)),
        itemCounts: Array.from(new Set(itemCounts)),
        supplierCodes: Array.from(new Set(supplierCodes))
      }
    }
    
    // 일관성 문제 발견 시 경고
    const hasInconsistency = !Object.values(consistency).every(Boolean)
    if (hasInconsistency) {
      console.warn(`[OCR Consistency Warning] Inconsistent results detected for ${pdfFileName}:`)
      if (!consistency.supplierNameConsistent) {
        console.warn(`  Supplier name variations: [${consistencyCheck.variations.supplierNames.join(', ')}]`)
      }
      if (!consistency.shipCountConsistent) {
        console.warn(`  Ship count variations: [${consistencyCheck.variations.shipCounts.join(', ')}]`)
      }
      if (!consistency.itemCountConsistent) {
        console.warn(`  Item count variations: [${consistencyCheck.variations.itemCounts.join(', ')}]`)
      }
      if (!consistency.supplierCodeConsistent) {
        console.warn(`  Supplier code variations: [${consistencyCheck.variations.supplierCodes.join(', ')}]`)
      }
    } else {
      console.log(`[OCR Consistency] All results consistent for ${pdfFileName}`)
    }
    
    return consistencyCheck
  }
  
  /**
   * 특정 파일의 처리 이력 조회
   */
  getProcessingHistory(pdfFileName: string): OCRProcessingLog[] {
    return this.logs.get(pdfFileName) || []
  }
  
  /**
   * 모든 로그 정리 (메모리 관리)
   */
  clearOldLogs(olderThanMinutes: number = 60) {
    const cutoffTime = Date.now() - (olderThanMinutes * 60 * 1000)
    
    for (const [filename, logs] of this.logs.entries()) {
      const filteredLogs = logs.filter(log => 
        new Date(log.timestamp).getTime() > cutoffTime
      )
      
      if (filteredLogs.length === 0) {
        this.logs.delete(filename)
      } else {
        this.logs.set(filename, filteredLogs)
      }
    }
    
    console.log(`[OCR Quality] Cleared logs older than ${olderThanMinutes} minutes`)
  }
  
  /**
   * 전체 품질 리포트 생성
   */
  generateQualityReport(): {
    totalProcessedFiles: number
    totalProcessingRuns: number
    averageConsistency: number
    mostProblematicFiles: string[]
    commonErrorPatterns: string[]
  } {
    const allLogs: OCRProcessingLog[] = []
    const inconsistentFiles: string[] = []
    
    for (const [filename, logs] of this.logs.entries()) {
      allLogs.push(...logs)
      
      const consistencyCheck = this.checkConsistency(filename)
      if (consistencyCheck && !Object.values(consistencyCheck.consistency).every(Boolean)) {
        inconsistentFiles.push(filename)
      }
    }
    
    const errorPatterns = allLogs
      .map(log => log.enhancementResults.errorPattern)
      .filter(Boolean)
      .reduce((acc, pattern) => {
        acc[pattern!] = (acc[pattern!] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    
    const commonErrorPatterns = Object.entries(errorPatterns)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([pattern]) => pattern)
    
    const report = {
      totalProcessedFiles: this.logs.size,
      totalProcessingRuns: allLogs.length,
      averageConsistency: Math.round(((this.logs.size - inconsistentFiles.length) / this.logs.size) * 100),
      mostProblematicFiles: inconsistentFiles.slice(0, 5),
      commonErrorPatterns
    }
    
    console.log(`[OCR Quality Report]`, report)
    return report
  }
}

// 싱글톤 인스턴스 내보내기
export const ocrQualityLogger = new OCRQualityLogger()

/**
 * 편의 함수들
 */
export function startOCRProcessing(pdfFileName: string): string {
  return ocrQualityLogger.startProcessing(pdfFileName)
}

export function logVisionAPI(processingId: string, pageCount: number, totalTextLength: number, processingTime: number, textPreview: string) {
  ocrQualityLogger.logVisionApiResults(processingId, pageCount, totalTextLength, processingTime, textPreview)
}

export function logGPTProcessing(processingId: string, model: string, tokensUsed: number, processingTime: number, rawSupplierName: string, structuredShipCount: number) {
  ocrQualityLogger.logGPTProcessingResults(processingId, model, tokensUsed, processingTime, rawSupplierName, structuredShipCount)
}

export function logEnhancement(processingId: string, originalSupplierName: string, correctedSupplierName: string, confidence: string, errorPattern: string | undefined, validationTime: number) {
  ocrQualityLogger.logEnhancementResults(processingId, originalSupplierName, correctedSupplierName, confidence, errorPattern, validationTime)
}

export function logFinalResults(processingId: string, supplierCode: string, totalLineItems: number, shipNames: string[], processingSuccess: boolean) {
  ocrQualityLogger.logFinalResults(processingId, supplierCode, totalLineItems, shipNames, processingSuccess)
}

export function getConsistencyReport(pdfFileName: string): OCRConsistencyCheck | null {
  return ocrQualityLogger.checkConsistency(pdfFileName)
}

export function generateOverallQualityReport() {
  return ocrQualityLogger.generateQualityReport()
}