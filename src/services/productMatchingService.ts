/**
 * 상품 매칭 전용 서비스 
 * 기존 codeListService.ts의 매칭 함수들을 활용하여 깔끔하게 분리
 */

// 기존 코어 서비스에서 필요한 함수들 import
import { matchProductCode } from './codeListService'

export interface ProductMatchResult {
  shipName: string
  productName: string
  productCode: string | null
  confidence: 'high' | 'medium' | 'low'
  matchType: 'ship_based' | 'product_based' | 'special_mapping'
}

/**
 * 선박별 특수 매핑 테이블
 * "架空企業135" 같은 특수 케이스 처리
 */
const SHIP_SPECIAL_MAPPINGS: Record<string, string> = {
  '架空企業135': 'hk',
  '架空企業137': 'hn', 
  '架空企業133': 'sn'
  // 필요시 확장 가능
}

/**
 * 새로운 Product Matcher 클래스
 * 기존 로직과 혼동되지 않도록 별도 네임스페이스
 */
export class ProductMatcher {
  
  /**
   * 선박명 기반 특수 매핑 확인
   * 기존 동작 유지를 위한 로직
   */
  private static getShipBasedMapping(shipName: string): ProductMatchResult | null {
    const productCode = SHIP_SPECIAL_MAPPINGS[shipName]
    if (productCode) {
      return {
        shipName,
        productName: `${shipName} 전용 상품`,
        productCode,
        confidence: 'high',
        matchType: 'special_mapping'
      }
    }
    return null
  }

  /**
   * 실제 상품명 기반 매칭
   * 기존 matchProductCode 함수 활용
   */
  private static async getProductBasedMapping(
    shipName: string, 
    productName: string
  ): Promise<ProductMatchResult | null> {
    try {
      // 기존 codeListService의 matchProductCode 함수 활용
      const productCode = await matchProductCode(productName)
      
      if (productCode) {
        return {
          shipName,
          productName,
          productCode,
          confidence: 'high',
          matchType: 'product_based'
        }
      }
    } catch (error) {
      console.warn(`[ProductMatcher] Error matching product "${productName}":`, error)
    }
    
    return null
  }

  /**
   * 통합 상품 매칭 메인 함수
   * 우선순위: 1) 특수매핑 2) 상품명 기반 3) 기존 로직(호환성)
   */
  public static async matchProduct(
    shipName: string, 
    productName?: string
  ): Promise<ProductMatchResult> {
    
    console.log(`[ProductMatcher] Matching ship: "${shipName}", product: "${productName || 'N/A'}"`)
    
    // 1순위: 특수 매핑 확인 (기존 동작 보장)
    const specialMapping = this.getShipBasedMapping(shipName)
    if (specialMapping) {
      console.log(`[ProductMatcher] Special mapping found: ${shipName} -> ${specialMapping.productCode}`)
      return specialMapping
    }
    
    // 2순위: 실제 상품명이 있으면 상품명 기반 매칭
    if (productName && productName.trim()) {
      const productMapping = await this.getProductBasedMapping(shipName, productName)
      if (productMapping) {
        console.log(`[ProductMatcher] Product-based match: "${productName}" -> ${productMapping.productCode}`)
        return productMapping
      }
    }
    
    // 3순위: 기존 로직 호환성 (선박명으로 시도)
    try {
      const legacyCode = await matchProductCode(shipName)
      if (legacyCode) {
        console.log(`[ProductMatcher] Legacy ship-based match: ${shipName} -> ${legacyCode}`)
        return {
          shipName,
          productName: productName || shipName,
          productCode: legacyCode,
          confidence: 'medium',
          matchType: 'ship_based'
        }
      }
    } catch (error) {
      console.warn(`[ProductMatcher] Legacy matching failed for "${shipName}":`, error)
    }
    
    // 매칭 실패
    console.log(`[ProductMatcher] No match found for ship: "${shipName}", product: "${productName || 'N/A'}"`)
    return {
      shipName,
      productName: productName || shipName,
      productCode: null,
      confidence: 'low',
      matchType: 'product_based'
    }
  }

  /**
   * 배치 매칭 (성능 최적화)
   */
  public static async matchMultipleProducts(
    requests: Array<{ shipName: string; productName?: string }>
  ): Promise<ProductMatchResult[]> {
    console.log(`[ProductMatcher] Batch matching ${requests.length} products`)
    
    const results = await Promise.all(
      requests.map(req => this.matchProduct(req.shipName, req.productName))
    )
    
    const successCount = results.filter(r => r.productCode !== null).length
    console.log(`[ProductMatcher] Batch complete: ${successCount}/${requests.length} successful matches`)
    
    return results
  }
}