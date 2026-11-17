// ============================================================================
// OpsLoadError — khối "không tải được" cho màn thợ /m/* (hệ ops-*, tự tối theo máy).
// Luật audit 17/11/2026: LỖI xét TRƯỚC TRỐNG — tải hỏng thì nói thẳng + nút Thử lại, cấm hiện
// "Chưa có việc / Nghỉ / Chưa có công / Không có yêu cầu" khi thật ra không đọc được.
// (PageState của desktop dùng antd + màu sáng cố định, không hợp vỏ ops tối.)
// compact = một dòng đỏ trong thẻ (vd thẻ "Ca hôm nay"); mặc định = khối giữa màn như .ops-empty.
// Nút Thử lại tự hiện "Đang thử…" + khoá tới khi onRetry xong (onRetry trả Promise — vd () => q.refetch()):
// trước bấm không thấy phản hồi gì, thợ bấm liên tục tưởng máy đơ.
// OpsOffline: mất mạng — TanStack Query TẠM DỪNG truy vấn (fetchStatus 'paused'): chưa lỗi mà cũng chưa có dữ liệu.
// ============================================================================
import { useState } from 'react'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'

export default function OpsLoadError({ error, onRetry, title, compact = false }: {
  error: unknown
  onRetry?: () => unknown
  title?: string
  compact?: boolean
}) {
  const [dangThu, setDangThu] = useState(false)
  const why = dichLoiHeThong(error, 'Có lỗi khi tải')
  const thuLai = () => {
    if (!onRetry || dangThu) return
    setDangThu(true)
    Promise.resolve().then(() => onRetry()).finally(() => setDangThu(false))
  }
  if (compact) {
    return (
      <div role="alert" className="ops-sm" style={{ marginTop: 8, color: 'var(--red)', fontWeight: 650, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}>{title ? `${title}: ${why}` : why}</span>
        {onRetry && (
          <button type="button" disabled={dangThu} aria-busy={dangThu} onClick={e => { e.stopPropagation(); thuLai() }}
            style={{ flex: '0 0 auto', minHeight: 40, padding: '0 14px', borderRadius: 20, border: '1.5px solid currentColor', background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 750, cursor: dangThu ? 'default' : 'pointer', opacity: dangThu ? .6 : 1 }}>
            {dangThu ? 'Đang thử…' : 'Thử lại'}
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="ops-empty" role="alert">
      <div className="em">⚠️</div>
      <div className="et" style={{ color: 'var(--red)' }}>{title || 'Không tải được dữ liệu'}</div>
      <div className="ed">{why}</div>
      {onRetry && <button type="button" className="ops-btn o" style={{ marginTop: 14, maxWidth: 220 }} disabled={dangThu} aria-busy={dangThu} onClick={thuLai}>{dangThu ? '↻ Đang thử lại…' : '↻ Thử lại'}</button>}
    </div>
  )
}

/** Mất mạng khi CHƯA có dữ liệu (query.isPaused && !query.data) — có mạng lại TanStack Query tự tải tiếp, không cần bấm. */
export function OpsOffline({ title = 'Đang mất mạng', hint = 'Bật WiFi hoặc 4G — có mạng lại màn này tự tải.' }: { title?: string; hint?: string }) {
  return (
    <div className="ops-empty" role="status">
      <div className="em">📡</div>
      <div className="et">{title}</div>
      <div className="ed">{hint}</div>
    </div>
  )
}
