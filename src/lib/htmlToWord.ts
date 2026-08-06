// ============================================================================
// HTML → WORD (.doc) — xuất 1 vùng DOM đã render ra file Word mở được, sửa được.
// File: src/lib/htmlToWord.ts
//
// Dùng cho chứng từ xuất khẩu (Invoice, Packing List...): giữ nội dung + bảng,
// mở bằng Microsoft Word / Google Docs. Không cần template.
// ============================================================================

import { saveAs } from 'file-saver'

const WORD_CSS = `
  body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0; }
  td, th { border: 1px solid #000; padding: 3px 6px; font-size: 11pt; vertical-align: top; }
  h1,h2,h3,h4,h5 { margin: 6px 0; }
  .no-print { display: none !important; }
`

/** Xuất innerHTML của 1 phần tử (theo id) ra file .doc. */
export function downloadElementAsWord(elementId: string, filename: string): boolean {
  const el = document.getElementById(elementId)
  if (!el) return false
  const html =
    `<html xmlns:o='urn:schemas-microsoft-com:office:office' ` +
    `xmlns:w='urn:schemas-microsoft-com:office:word' ` +
    `xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'>` +
    `<style>${WORD_CSS}</style></head><body>${el.innerHTML}</body></html>`
  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  saveAs(blob, filename.toLowerCase().endsWith('.doc') ? filename : `${filename}.doc`)
  return true
}
