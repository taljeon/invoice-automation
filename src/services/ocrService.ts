import type { LineItem } from '../types'
import * as pdfjsLib from 'pdfjs-dist'
import { matchSupplierCode, matchCustomerCode } from './codeListService'
import { ProductMatcher } from './productMatchingService'
import { findBestCompanyMatch } from './postProcessingSimilarityService'
import { startOCRProcessing, logVisionAPI, logGPTProcessing, logEnhancement, logFinalResults } from './ocrQualityService'
// Firebase Functions를 HTTP 요청으로 호출 (Firebase Hosting을 통해)

// PDF.jsのワーカーを設定
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

// Cloud Function URLs (Firebase Hosting rewrite 사용)
const FUNCTION_URL = '/api/ocr'

// 고정 선박명은 이제 Cloud Function에서 처리됨

/**
 * PDFの各ページを画像（Base64）に変換
 * Vision API推奨の300 DPI相当にするため、scale: 4.17を使用
 * (72 DPI * 4.17 ≈ 300 DPI)
 */
async function pdfPagesToImages(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const images: string[] = []

  console.log(`PDF has ${pdf.numPages} pages, processing all pages...`)
  
  for (let i = 1; i <= pdf.numPages; i++) {
    console.log(`Processing page ${i}/${pdf.numPages}...`)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 4.17 }) // 300 DPI相当
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!

    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas
    }).promise

    // CanvasをBase64に変換 (품질 최적화)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9) // JPEG, 90% 품질
    const base64 = dataUrl.split(',')[1]
    
    // Base64 데이터 검증
    if (!base64 || base64.length === 0) {
      throw new Error(`Failed to convert page ${i} to base64`)
    }
    
    // Base64 형식 검증
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new Error(`Invalid base64 format for page ${i}`)
    }
    
    images.push(base64)
    console.log(`Page ${i} converted to image (${Math.round(base64.length / 1024)}KB, ${base64.length} chars)`)
  }

  return images
}


interface InvoiceData {
  仕入先名: string
  仕入先コード?: string
  仕入日: string
  機械型式?: string  // 摘要欄に入れる型式情報
  ships: Array<{
    ship_name: string | null  // 6개 고정 선박명 중 하나 또는 null
    items: Array<{
      商品名: string  // 부품번호를 포함한 완전한 상품명
      数量: number
      単価: number
      金額: number
      摘要?: string  // 기계형식등
    }>
  }>
}

/**
 * Firebase Cloud Function을 사용한 OCR 처리
 */
export async function extractInvoiceWithGPT5(pdfFile: File, pdfFileName: string): Promise<LineItem[]> {
  console.log(`Extracting invoice data from ${pdfFileName} using Firebase Cloud Function...`)

  // OCR 품질 모니터링 시작
  const processingId = startOCRProcessing(pdfFileName)
  const startTime = Date.now()

  try {
    // 스텝 1: PDF를 이미지로 변환
    const pageImages = await pdfPagesToImages(pdfFile)
    console.log(`Converted ${pageImages.length} PDF pages to images`)

    // 스텝 2: Firebase Cloud Function HTTP 호출 (베스트 프랙티스 적용)
    console.log('Step 2: Calling Firebase Cloud Function for OCR + Structuring...')
    const cloudFunctionStartTime = Date.now()
    
    // 원래 작동했던 기본 설정으로 복구
    const retryOptions = {
      maxRetries: 3,        // 3번 재시도
      baseDelay: 1000,      // 1초 기본 지연
      maxDelay: 10000,      // 최대 10초
      timeout: 120000,      // 2분 타임아웃 (개별 요청)
      jitter: true          // 지터 활성화
    }
    
    let lastError: Error | null = null
    let invoiceData: InvoiceData | null = null
    
    for (let attempt = 0; attempt < retryOptions.maxRetries; attempt++) {
      const controller = new AbortController()
      let timeoutId: NodeJS.Timeout | null = null

      try {
        console.log(`Cloud Function call attempt ${attempt + 1}/${retryOptions.maxRetries}...`)
        
        // 타임아웃 설정
        timeoutId = setTimeout(() => controller.abort(), retryOptions.timeout)
        
        const response = await fetch(FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pageImages,
            pdfFileName
          }),
          signal: controller.signal
        })

        // 타임아웃 정리
        if (timeoutId) clearTimeout(timeoutId)

        if (response.ok) {
          console.log(`Cloud Function call successful on attempt ${attempt + 1}`)
          const result = await response.json() as { success: boolean; data: InvoiceData; processingTime?: number }
          
          if (!result.success || !result.data) {
            throw new Error('Cloud Function returned unsuccessful result')
          }
          
          invoiceData = result.data
          const cloudFunctionTime = Date.now() - cloudFunctionStartTime
          console.log(`Cloud Function processed ${(invoiceData as any).ships.length} ships successfully`)
          console.log(`Total Cloud Function time: ${cloudFunctionTime}ms`)
          if (result.processingTime) {
            console.log(`Server-side processing time: ${result.processingTime}ms`)
          }
          
          // Vision API 결과 로깅 (추정값)
          const totalTextLength = JSON.stringify(invoiceData).length
          logVisionAPI(processingId, pageImages.length, totalTextLength, cloudFunctionTime, JSON.stringify(invoiceData).substring(0, 200))
          
          // GPT 처리 결과 로깅
          logGPTProcessing(processingId, 'gpt-5', totalTextLength / 4, cloudFunctionTime, (invoiceData as any).仕入先名, (invoiceData as any).ships.length)
          
          // 성공한 경우 다음 단계로 진행
          break
        } else {
          // HTTP 에러 처리
          const errorText = await response.text()
          
          // 클라이언트 에러 (4xx)는 재시도하지 않음
          if (response.status >= 400 && response.status < 500) {
            throw new Error(`Client error ${response.status}: ${errorText}`)
          }
          
          // 서버 에러 (5xx)는 재시도
          lastError = new Error(`Server error ${response.status}: ${errorText}`)
          console.warn(`Attempt ${attempt + 1} failed:`, lastError.message)
        }

      } catch (error) {
        // 타임아웃 정리
        if (timeoutId) clearTimeout(timeoutId)

        lastError = error as Error
        
        // 마지막 시도면 에러 throw
        if (attempt === retryOptions.maxRetries - 1) {
          throw new Error(`Cloud Function failed after ${retryOptions.maxRetries} attempts. Last error: ${lastError.message}`)
        }

        // 원래 간단한 재시도 로직으로 복구
        const isRetryableError = 
          lastError.message.includes('Server error') || // 5xx 에러
          lastError.message.includes('Failed to fetch') || // 네트워크 에러
          lastError.message.includes('NetworkError') // 네트워크 에러

        if (!isRetryableError) {
          console.warn(`Non-retryable error, failing immediately:`, lastError.message)
          throw lastError
        }

        console.warn(`Attempt ${attempt + 1} error (retryable):`, lastError.message)

        // 원래 단순한 백오프 로직으로 복구
        const exponentialDelay = Math.min(
          retryOptions.maxDelay,
          Math.pow(2, attempt) * retryOptions.baseDelay
        )
        
        const finalDelay = retryOptions.jitter 
          ? exponentialDelay * (0.5 + Math.random() * 0.5)
          : exponentialDelay

        console.log(`Waiting ${Math.round(finalDelay)}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, finalDelay))
      }
    }
    
    // 성공적으로 데이터를 받았는지 확인
    if (!invoiceData) {
      throw new Error(`Cloud Function failed after ${retryOptions.maxRetries} attempts. Last error: ${lastError?.message}`)
    }

    // 스텝 3: 新 아키텍처 - OCR 원본 우선 + 사후 유사도 매칭
    console.log('[TIMING] ===== Step 3: Similarity Matching 시작 =====')
    console.log('[TIMING] 입력 텍스트:', (invoiceData as any).仕入先名)
    const enhancementStartTime = Date.now()
    const similarityResult = findBestCompanyMatch((invoiceData as any).仕入先名)
    const enhancementTime = Date.now() - enhancementStartTime
    console.log(`[TIMING] ===== Step 3 완료: ${enhancementTime}ms =====`)

    if (enhancementTime > 100) {
      console.warn(`[WARNING] ⚠️  유사도 매칭이 ${enhancementTime}ms 걸림! (예상: 2~5ms)`)
      console.warn('[WARNING] 병목 구간 확인 필요!')
    }
    
    let finalSupplierName: string
    if (similarityResult.matchedCompany) {
      finalSupplierName = similarityResult.matchedCompany
      console.log(`Similarity matching: "${similarityResult.originalOCR}" -> "${finalSupplierName}" (${similarityResult.method}, similarity: ${similarityResult.similarity.toFixed(3)}, confidence: ${similarityResult.confidence.toFixed(3)})`)
    } else {
      finalSupplierName = similarityResult.originalOCR
      console.log(`No match found, keeping original OCR: "${finalSupplierName}" (confidence: ${similarityResult.confidence.toFixed(3)})`)
    }
    
    // Enhancement 결과 로깅 (새 아키텍처용으로 적응)
    logEnhancement(processingId, (invoiceData as any).仕入先名, finalSupplierName, similarityResult.confidence.toString(), similarityResult.method, enhancementTime)
    
    // 스텝 4: 입입처 코드 매칭 (보정된 이름으로)
    console.log('Step 4: Matching supplier code with final enhanced name...')
    const supplierMatch = await matchSupplierCode(finalSupplierName)
    const 仕入先コード = supplierMatch?.code || (invoiceData as any).仕入先コード || '0000'
    console.log(`Supplier matched: ${finalSupplierName} -> ${仕入先コード} (confidence: ${supplierMatch?.confidence || 'unknown'})`)

    // 스텝 5: 다중 선박 처리 & LineItem 형식으로 변환
    console.log(`Processing ${(invoiceData as any).ships.length} ships...`)
    const 摘要 = (invoiceData as any).機械型式 || ''
    const allLineItems: LineItem[] = []

    for (const [shipIndex, ship] of (invoiceData as any).ships.entries()) {
      console.log(`Ship ${shipIndex + 1}: "${ship.ship_name}"`)

      // 해당 선박의 모든 항목 처리
      const shipLineItems: LineItem[] = await Promise.all(
        ship.items.map(async (item: any, itemIndex: number) => {
          let 得意先コード: string | undefined
          let 得意先名: string | undefined
          let 商品コード: string | undefined

          if (ship.ship_name) {
            const customerMatch = await matchCustomerCode(ship.ship_name)
            得意先コード = customerMatch?.code
            得意先名 = customerMatch?.name || ship.ship_name
            console.log(`  Ship ${shipIndex + 1}, Item ${itemIndex + 1}: Ship "${ship.ship_name}" -> Customer: ${得意先コード || 'undefined'} (confidence: ${customerMatch?.confidence || 'unknown'})`)

            // 새로운 Product Matcher 사용 (기존 로직 호환성 유지)
            const productMatchResult = await ProductMatcher.matchProduct(
              ship.ship_name, 
              item.商品名  // 실제 상품명이 있으면 사용, 없으면 undefined
            )
            商品コード = productMatchResult.productCode || undefined
            console.log(`  Ship ${shipIndex + 1}, Item ${itemIndex + 1}: Ship "${ship.ship_name}" + Product "${item.商品名 || 'N/A'}" -> Code: ${商品コード || 'undefined'} (${productMatchResult.matchType}, ${productMatchResult.confidence})`)
          }

          return {
            id: `${Date.now()}-${shipIndex}-${itemIndex}`,
            仕入日: (invoiceData as any).仕入日 || new Date().toISOString().split('T')[0],
            伝票番号: '',  // 전표번호는 공백
            仕入先コード,
            仕入先名: finalSupplierName || '불명',
            得意先コード,
            得意先名: 得意先名 || ship.ship_name || '不明',
            商品コード: 商品コード || '',
            商品名: item.商品名,
            数量: item.数量,
            単価: item.単価,
            金額: item.金額,
            課税区分: '課税10.0%',
            摘要: item.摘要 || 摘要,
            pdfFileName,
            pdfFile
          }
        })
      )
      
      allLineItems.push(...shipLineItems)
    }

    console.log(`Extracted ${allLineItems.length} line items from ${(invoiceData as any).ships.length} ships with code matching`)
    
    // 최종 결과 로깅
    const shipNames = (invoiceData as any).ships.map((ship: any) => ship.ship_name).filter(Boolean) as string[]
    logFinalResults(processingId, 仕入先コード, allLineItems.length, shipNames, true)
    
    console.log(`[OCR Processing Complete] Total time: ${Date.now() - startTime}ms`)
    return allLineItems

  } catch (error) {
    console.error('Cloud Function OCR Error:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    
    // 실패 결과 로깅
    logFinalResults(processingId, '', 0, [], false)
    
    throw error
  }
}

/**
 * PDFファイルに対してOCR処理を実行し、明細データを取得
 */
export async function processPDFWithOCR(file: File): Promise<LineItem[]> {
  try {
    // Firebase Cloud Function을 사용해 PDF에서 직접 데이터를 추출
    console.log('Using Firebase Cloud Function for OCR processing...')
    const lineItems = await extractInvoiceWithGPT5(file, file.name)
    return lineItems
  } catch (error) {
    console.error('PDF processing error:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    throw error
  }
}