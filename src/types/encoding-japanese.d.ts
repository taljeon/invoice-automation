declare module 'encoding-japanese' {
  export interface ConvertOptions {
    to?: string
    from?: string
    type?: string
  }

  export function convert(data: number[] | Uint8Array | string, options: ConvertOptions): number[] | Uint8Array | string
  export function detect(data: number[] | Uint8Array | string): string | false
  export function urlEncode(data: number[] | Uint8Array): string
  export function urlDecode(data: string): number[]
  export function base64Encode(data: number[] | Uint8Array): string
  export function base64Decode(data: string): number[]

  const Encoding: {
    convert: typeof convert
    detect: typeof detect
    urlEncode: typeof urlEncode
    urlDecode: typeof urlDecode
    base64Encode: typeof base64Encode
    base64Decode: typeof base64Decode
  }

  export default Encoding
}
