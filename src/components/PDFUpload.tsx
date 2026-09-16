import React, { useRef } from 'react'

interface PDFUploadProps {
  onUpload: (files: File[]) => void
}

function PDFUpload({ onUpload }: PDFUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[PDFUpload] handleFileChange triggered')
    const files = e.target.files
    console.log('[PDFUpload] files:', files)
    console.log('[PDFUpload] files.length:', files?.length)

    if (!files || files.length === 0) {
      console.log('[PDFUpload] No files selected')
      return
    }

    const pdfFiles = Array.from(files).filter(file => {
      console.log('[PDFUpload] Checking file:', file.name, 'type:', file.type)
      return file.type === 'application/pdf'
    })

    console.log('[PDFUpload] PDF files found:', pdfFiles.length)

    if (pdfFiles.length === 0) {
      alert('PDFファイルを選択してください')
      return
    }

    console.log('[PDFUpload] Calling onUpload with files:', pdfFiles.map(f => f.name))
    onUpload(pdfFiles)
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClick = () => {
    console.log('[PDFUpload] handleClick - Opening file dialog')
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf')
    if (pdfFiles.length === 0) {
      alert('PDFファイルを選択してください')
      return
    }

    onUpload(pdfFiles)
  }

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        style={{
          border: '2px dashed #1976d2',
          borderRadius: '8px',
          padding: '3rem 2rem',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: '#f8f9fa',
          transition: 'all 0.3s',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#e3f2fd'
          e.currentTarget.style.borderColor = '#1565c0'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#f8f9fa'
          e.currentTarget.style.borderColor = '#1976d2'
        }}
      >
        <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', pointerEvents: 'none' }}>
          📄 クリックでPDFを選択
        </p>
        <p style={{ fontSize: '0.75rem', color: '#666', pointerEvents: 'none' }}>
          複数選択可
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}

export default PDFUpload
