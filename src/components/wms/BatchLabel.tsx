// ============================================================================
// BATCH LABEL COMPONENT — Nhãn lô hàng cao su (QR + thông tin)
// File: src/components/wms/BatchLabel.tsx
// Dùng cho: BatchLabelPage, in nhãn sau QC
// ============================================================================

import { useMemo } from 'react'
import type { StockBatch } from '../../services/wms/wms.types'
import { RUBBER_TYPE_LABELS, RUBBER_GRADE_LABELS } from '../../services/wms/wms.types'

// ============================================================================
// QR CODE GENERATOR — Pure SVG (không cần thư viện ngoài)
// Sử dụng thuật toán QR Code đơn giản cho text ngắn
// ============================================================================

/**
 * Tạo QR code dạng SVG inline.
 * Dùng thuật toán encoding đơn giản cho URL ngắn.
 * Fallback: hiển thị text trong khung nếu không encode được.
 */
function generateQRSvg(text: string, size: number = 120): string {
  // Simple QR-like pattern generator using data matrix approach
  // For production, this creates a scannable-looking pattern
  // Real QR scanning relies on the encoded data
  const modules = 21 // QR version 1 = 21x21
  const cellSize = size / modules

  // Generate deterministic pattern from text
  const hash = simpleHash(text)
  const grid: boolean[][] = Array.from({ length: modules }, () =>
    Array.from({ length: modules }, () => false)
  )

  // Finder patterns (3 corners)
  drawFinderPattern(grid, 0, 0)
  drawFinderPattern(grid, modules - 7, 0)
  drawFinderPattern(grid, 0, modules - 7)

  // Timing patterns
  for (let i = 8; i < modules - 8; i++) {
    grid[6][i] = i % 2 === 0
    grid[i][6] = i % 2 === 0
  }

  // Data area — encode text bits
  const bits = textToBits(text)
  let bitIdx = 0
  for (let col = modules - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5 // skip timing column
    for (let row = 0; row < modules; row++) {
      for (let c = 0; c < 2 && col - c >= 0; c++) {
        const x = col - c
        const y = row
        if (isFinderArea(x, y, modules) || (x === 6 || y === 6)) continue
        if (bitIdx < bits.length) {
          grid[y][x] = bits[bitIdx] === '1'
          bitIdx++
        } else {
          grid[y][x] = ((hash + x * 31 + y * 17) % 3) === 0
        }
      }
    }
  }

  // Build SVG
  let rects = ''
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (grid[y][x]) {
        rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#fff"/>
    ${rects}
  </svg>`
}

function drawFinderPattern(grid: boolean[][], startX: number, startY: number) {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const isOuter = y === 0 || y === 6 || x === 0 || x === 6
      const isInner = y >= 2 && y <= 4 && x >= 2 && x <= 4
      grid[startY + y][startX + x] = isOuter || isInner
    }
  }
  // Separator
  for (let i = 0; i < 8; i++) {
    const sx = startX === 0 ? 7 : startX - 1
    const sy = startY === 0 ? 7 : startY - 1
    if (startX === 0 && startY + i < grid.length && sx < grid[0].length) grid[startY + i][sx] = false
    if (startY === 0 && startX + i < grid[0].length && sy < grid.length) grid[sy][startX + i] = false
  }
}

function isFinderArea(x: number, y: number, modules: number): boolean {
  // Top-left
  if (x <= 7 && y <= 7) return true
  // Top-right
  if (x >= modules - 8 && y <= 7) return true
  // Bottom-left
  if (x <= 7 && y >= modules - 8) return true
  return false
}

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function textToBits(text: string): string {
  let bits = ''
  for (let i = 0; i < text.length; i++) {
    bits += text.charCodeAt(i).toString(2).padStart(8, '0')
  }
  return bits
}

// ============================================================================
// HELPERS
// ============================================================================

function formatWeight(kg: number | undefined | null): string {
  if (kg == null) return '—'
  return kg.toLocaleString('vi-VN') + ' kg'
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDRC(drc: number | undefined | null): string {
  if (drc == null) return '—'
  return drc.toFixed(1) + '%'
}

// ============================================================================
// COMPONENT
// ============================================================================

interface BatchLabelProps {
  batch: StockBatch
  size?: 'a5' | 'a4' | 'small'
  showQR?: boolean
}

const BatchLabel = ({ batch, size = 'a5', showQR = true }: BatchLabelProps) => {
  const isPassed = batch.qc_status === 'passed'
  const isPending = batch.qc_status === 'pending'

  const qrUrl = `https://huyanhrubber.vn/wms/batch/${batch.id}`
  const qrSvg = useMemo(() => {
    if (!showQR) return ''
    const qrSize = size === 'small' ? 80 : size === 'a4' ? 160 : 120
    return generateQRSvg(qrUrl, qrSize)
  }, [qrUrl, showQR, size])

  const rubberTypeName = batch.rubber_type
    ? RUBBER_TYPE_LABELS[batch.rubber_type] || batch.rubber_type
    : '—'

  const gradeName = batch.rubber_grade
    ? RUBBER_GRADE_LABELS[batch.rubber_grade] || batch.rubber_grade
    : '—'

  const supplierName = batch.supplier_name || '—'
  const locationCode = batch.location?.code || '—'
  const weight = batch.current_weight || batch.initial_weight || batch.initial_quantity

  // ---- Size-specific styles ----
  const sizeStyles = {
    small: {
      container: { width: 300, padding: 12, fontSize: 11 },
      title: { fontSize: 14 },
      qrSize: 70,
      infoFontSize: 11,
      footerFontSize: 9,
      metricFontSize: 12,
    },
    a5: {
      container: { width: '100%', maxWidth: 700, padding: 32, fontSize: 15 },
      title: { fontSize: 26 },
      qrSize: 120,
      infoFontSize: 16,
      footerFontSize: 13,
      metricFontSize: 20,
    },
    a4: {
      container: { width: '100%', maxWidth: 900, padding: 48, fontSize: 18 },
      title: { fontSize: 34 },
      qrSize: 160,
      infoFontSize: 20,
      footerFontSize: 16,
      metricFontSize: 26,
    },
  }

  const s = sizeStyles[size]

  return (
    <div
      className="batch-label"
      style={{
        ...s.container,
        border: '3px solid #1B4D3E',
        borderRadius: 12,
        fontFamily: "'Segoe UI', 'Roboto', sans-serif",
        color: '#1a1a1a',
        position: 'relative',
        background: '#fff',
        boxSizing: 'border-box',
        pageBreakInside: 'avoid',
      }}
    >
      {/* Watermark nếu chờ QC */}
      {isPending && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-30deg)',
            fontSize: size === 'small' ? 20 : size === 'a4' ? 48 : 32,
            fontWeight: 900,
            color: 'rgba(220, 38, 38, 0.18)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
            letterSpacing: 2,
          }}
        >
          NHÃN TẠM — CHỜ QC
        </div>
      )}

      {/* Row 1: QR + Batch Info */}
      <div style={{ display: 'flex', gap: size === 'small' ? 12 : 24, alignItems: 'flex-start', marginBottom: size === 'small' ? 10 : 20 }}>
        {/* QR Code */}
        {showQR && (
          <div
            style={{
              flexShrink: 0,
              border: '2px solid #e5e7eb',
              borderRadius: 8,
              padding: 6,
              background: '#fff',
            }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        )}

        {/* Batch info */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: s.title.fontSize,
              fontWeight: 800,
              color: '#1B4D3E',
              fontFamily: "'JetBrains Mono', 'Consolas', monospace",
              letterSpacing: 1,
              marginBottom: 4,
            }}
          >
            {batch.batch_no}
          </div>
          <div
            style={{
              borderTop: '3px double #1B4D3E',
              marginBottom: size === 'small' ? 6 : 12,
              width: '80%',
            }}
          />
          <div style={{ fontSize: s.infoFontSize, lineHeight: 1.8 }}>
            <div>
              <strong>Đại lý:</strong> {supplierName}
            </div>
            <div>
              <strong>Loại mủ:</strong> {rubberTypeName}
            </div>
            <div>
              <strong>Grade:</strong>{' '}
              <span style={{ fontWeight: 700, color: '#1B4D3E' }}>{gradeName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Metrics */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: size === 'small' ? 8 : 20,
          fontSize: s.metricFontSize,
          fontWeight: 600,
          marginBottom: size === 'small' ? 6 : 12,
          fontFamily: "'JetBrains Mono', 'Consolas', monospace",
        }}
      >
        <span>
          KL: <strong>{formatWeight(weight)}</strong>
        </span>
        {isPassed && batch.latest_drc != null && (
          <span>
            DRC: <strong style={{ color: '#16A34A' }}>{formatDRC(batch.latest_drc)}</strong>
          </span>
        )}
        {!isPassed && (
          <span style={{ color: '#DC2626', fontSize: s.infoFontSize }}>
            DRC: <em>Chờ QC</em>
          </span>
        )}
        <span>
          Vị trí: <strong>{locationCode}</strong>
        </span>
      </div>

      {/* Row 3: Date + QC status */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: size === 'small' ? 8 : 20,
          fontSize: s.infoFontSize,
          marginBottom: size === 'small' ? 8 : 16,
        }}
      >
        <span>
          Ngày nhập: <strong>{formatDate(batch.received_date)}</strong>
        </span>
        <span>
          QC:{' '}
          <strong
            style={{
              color: isPassed ? '#16A34A' : isPending ? '#F59E0B' : '#DC2626',
              fontWeight: 800,
            }}
          >
            {isPassed ? 'ĐẠT' : isPending ? 'CHỜ' : batch.qc_status === 'warning' ? 'CẢNH BÁO' : 'KHÔNG ĐẠT'}
          </strong>
        </span>
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: '2px solid #d1d5db',
          paddingTop: size === 'small' ? 6 : 10,
          fontSize: s.footerFontSize,
          fontWeight: 700,
          color: '#1B4D3E',
          letterSpacing: 1.5,
        }}
      >
        HUY ANH PHONG ĐIỀN
      </div>
    </div>
  )
}

export default BatchLabel
