/**
 * 회사명 변형 설정 파일
 * 새로운 회사 추가 시 이 파일만 수정하면 자동으로 매칭 지원
 */

export interface CompanyVariantConfig {
  keywords: string[]           // 인식 키워드
  variants: string[]          // 생성할 변형들
  abbreviations: string[]     // 약어들
  localNames: string[]        // 현지어 표기
  description: string         // 설명
}

/**
 * 회사별 변형 설정 (가상 회사 예시)
 * 새 회사 추가 시 여기에 추가하면 자동으로 매칭 지원
 */
export const COMPANY_VARIANT_CONFIGS: Record<string, CompanyVariantConfig> = {
  DEMO_PARTS: {
    keywords: ['サンプル部品', 'DEMO PARTS'],
    variants: ['サンプル部品株式会社', 'DEMO PARTS CO LTD'],
    abbreviations: ['DEMO PARTS'], localNames: ['サンプル部品'],
    description: 'Synthetic supplier example'
  },
  EXAMPLE_MACHINERY: {
    keywords: ['架空機械', 'EXAMPLE MACHINERY'],
    variants: ['架空機械株式会社', 'EXAMPLE MACHINERY CO LTD'],
    abbreviations: ['EXAMPLE MACHINERY'], localNames: ['架空機械'],
    description: 'Synthetic supplier example'
  }
}

/**
 * 자동 변형 생성 함수
 */
export function generateVariantsFromConfig(companyName: string): string[] {
  const allVariants: string[] = []
  
  // 설정된 모든 회사에 대해 키워드 매칭 확인
  for (const [configKey, config] of Object.entries(COMPANY_VARIANT_CONFIGS)) {
    // 키워드 중 하나라도 포함되어 있으면 해당 회사의 변형들 추가
    const hasKeyword = config.keywords.some(keyword => 
      companyName.toLowerCase().includes(keyword.toLowerCase())
    )
    
    if (hasKeyword) {
      allVariants.push(
        ...config.variants,
        ...config.abbreviations,
        ...config.localNames,
        configKey // 설정 키 자체도 변형으로 추가
      )
      
      console.log(`[Auto Variants] Generated ${config.variants.length + config.abbreviations.length + config.localNames.length} variants for ${configKey}`)
      break // 첫 번째 매칭된 설정만 사용
    }
  }
  
  return allVariants
}