// useDebounce — trả lại giá trị sau khi người dùng NGỪNG gõ `ms` mili-giây.
// Trị bệnh "mỗi phím gõ bắn 1 query Supabase" (audit 17/11/2026: 5+ màn tìm kiếm).
// Dùng: const qDebounced = useDebounce(q, 400) → đưa qDebounced vào queryKey/filter.
import { useEffect, useState } from 'react'

export function useDebounce<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default useDebounce
