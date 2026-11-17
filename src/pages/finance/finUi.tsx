// ============================================================================
// TÀI CHÍNH — mảnh UI dùng chung các màn Vốn vay / Dòng tiền (Đợt 3 audit UI 17/11/2026)
// File: src/pages/finance/finUi.tsx
// Trước đó: helper `pill` chép 6 bản (1 bản style khác), viên đèn CIC chép đôi, câu "còn/quá Xd"
// mỗi màn một kiểu ("quá 0d" đúng ngày đến hạn), effect cuộn ?focus= chép đôi.
// Định dạng số / tiền / ngày: src/utils/format.ts. Màu đèn: map *_COLOR ở service (thang FIN_LIGHT).
// ============================================================================
import { useEffect, type ReactNode } from 'react'
import { CIC_COLOR, CIC_LABEL, type FinLoanComputed } from '../../services/finance/loanService'

/** Viên đèn nền đặc chữ trắng. */
export function FinPill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-block', background: color, color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>{children}</span>
  )
}

/** Dạng hàm cho chỗ render cột: pill(màu, chữ). */
export const pill = (color: string, children: ReactNode) => <FinPill color={color}>{children}</FinPill>

/**
 * Khoảng cách tới hạn — MỘT kiểu chữ cho cả module (bỏ hậu tố 'd').
 * `days` = ngày hạn − hôm nay: > 0 "còn X ngày" · 0 "hôm nay" · < 0 "quá X ngày".
 * (Khoản vay lưu overdue_days = hôm nay − hạn → truyền `-overdue_days`.)
 */
export function hanText(days: number): string {
  if (days > 0) return `còn ${days} ngày`
  if (days === 0) return 'hôm nay'
  return `quá ${-days} ngày`
}

/** Đèn CIC của khoản vay (kèm "quá X ngày" khi đã quá hạn). */
export function CicPill({ loan }: { loan: Pick<FinLoanComputed, 'cic' | 'overdue_days'> }) {
  const showDays = (loan.cic === 'red' || loan.cic === 'orange' || loan.cic === 'overdue') && loan.overdue_days >= 1
  return <FinPill color={CIC_COLOR[loan.cic]}>{showDays ? `${hanText(-loan.overdue_days)} · ` : ''}{CIC_LABEL[loan.cic]}</FinPill>
}

/** Cuộn tới dòng bảng `data-row-key = focusId` (mở từ link ?focus=<id>) khi bảng đã có dữ liệu. */
export function useFocusRow(focusId: string | null, ready: boolean, rows: unknown) {
  useEffect(() => {
    if (!focusId || !ready) return
    const t = setTimeout(() => {
      document.querySelector(`[data-row-key="${focusId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
    return () => clearTimeout(t)
  }, [focusId, ready, rows])
}
