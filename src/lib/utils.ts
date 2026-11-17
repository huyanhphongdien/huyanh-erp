import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Hàm gộp class TailwindCSS thông minh
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// formatDate / formatCurrency cũ đã gỡ 17/11/2026 (Đợt 3 audit UI): 0 nơi import, lại là "helper chính thức"
// thứ ba cạnh tranh nhau. Định dạng số / tiền / ngày: dùng MỘT nguồn src/utils/format.ts
// (fmtDate, fmtDateTime, fmtVnd, fmtVndCompact, fmtNum, fmtKg…).