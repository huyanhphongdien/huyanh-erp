import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Hàm gộp class TailwindCSS thông minh
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Hàm format ngày tháng
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('vi-VN')
}

// Hàm format tiền tệ
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(amount)
}