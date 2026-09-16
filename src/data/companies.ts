/**
 * 일본 해운업계 会社명 기본 데이터
 * 기존 시스템에 영향 없이 독립적으로 운영
 */

/** Synthetic examples: frequencies are illustrative weights, not business metrics. */
export const JAPANESE_COMPANIES = [
  { name: 'サンプル部品株式会社', freq: 30, variants: ['サンプル部品', 'DEMO PARTS'] },
  { name: '架空機械株式会社', freq: 20, variants: ['架空機械', 'EXAMPLE MACHINERY'] },
  { name: '例示商事株式会社', freq: 10, variants: ['例示商事', 'SAMPLE TRADING'] },
  { name: 'その他', freq: 1, variants: ['OTHER'] }
] as const;

/**
 * 간단한 완전매칭 함수
 */
export function findCompanyByName(searchName: string): string | null {
  const clean = searchName.trim().toLowerCase();
  
  for (const company of JAPANESE_COMPANIES) {
    // 표준명 매칭
    if (company.name.toLowerCase().includes(clean) || clean.includes(company.name.toLowerCase())) {
      return company.name;
    }
    
    // 변형명 매칭
    for (const variant of company.variants) {
      if (variant.toLowerCase().includes(clean) || clean.includes(variant.toLowerCase())) {
        return company.name;
      }
    }
  }
  
  return null;
}