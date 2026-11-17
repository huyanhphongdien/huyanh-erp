// ============================================================================
// EmployeePicker — ô chọn nhân viên GÕ TÌM được (antd Select showSearch).
// Thay <select> native đổ ~1000 dòng "MÃ - Họ tên": type-ahead của trình duyệt chỉ so từ
// ĐẦU chuỗi (là mã số) nên gõ tên không nhảy tới được. Tìm không dấu: "nguyen van a"
// khớp "Nguyễn Văn A", gõ mã cũng được. (Đợt 3 audit UI 17/11/2026)
// File: src/features/employees/EmployeePicker.tsx
// ============================================================================
import { Select } from 'antd'

export interface EmployeePickerItem {
  id: string
  code?: string | null
  full_name: string
}

const boDau = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

interface Props {
  employees: EmployeePickerItem[]
  value?: string | null
  onChange: (employeeId: string) => void
  onBlur?: () => void
  disabled?: boolean
  loading?: boolean
  placeholder?: string
  /** viền đỏ khi form báo lỗi */
  invalid?: boolean
  size?: 'small' | 'middle' | 'large'
}

export function EmployeePicker({
  employees, value, onChange, onBlur, disabled, loading,
  placeholder = '-- Chọn nhân viên --', invalid, size,
}: Props) {
  return (
    <Select
      showSearch={{ filterOption: (input, option) => boDau(String(option?.label ?? '')).includes(boDau(input)) }}
      value={value || undefined}
      onChange={(v) => onChange((v as string) ?? '')}
      onBlur={onBlur}
      disabled={disabled}
      loading={loading}
      placeholder={placeholder}
      status={invalid ? 'error' : undefined}
      size={size}
      options={employees.map((e) => ({ value: e.id, label: e.code ? `${e.code} - ${e.full_name}` : e.full_name }))}
      notFoundContent="Không tìm thấy nhân viên"
      style={{ width: '100%' }}
    />
  )
}

export default EmployeePicker
