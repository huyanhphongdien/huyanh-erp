import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong file .env')
}

// ============================================================================
// TỰ THỬ LẠI KHI GẶP PGRST303 "JWT issued at future"
// ============================================================================
// SỰ CỐ (26/08/2026): toàn bộ ERP không lấy được dữ liệu. Trang /sales/kanban báo
// "Lỗi tải đơn: JWT issued at future" và danh sách rỗng, dù đăng nhập bình thường.
// Sự cố tự hết sau khi restart project trên Supabase.
//
// ĐÃ ĐO ĐƯỢC — loại trừ mọi nguyên nhân phía mình:
//   • đồng hồ máy dev lệch −1 giây so với Supabase/Google
//   • đồng hồ Postgres lệch −1 giây so với giờ thật
//   • 0/335 phiên trong auth.sessions có mốc thời gian tương lai
//   • project Healthy, gói Pro, chưa từng bị pause
//   • PostgREST đang chạy 14.17
//
// CHƯA XÁC ĐỊNH ĐƯỢC nguyên nhân thật. PGRST303 nghĩa là bên nhận thấy claim `iat` của
// token nằm ở tương lai so với đồng hồ CỦA NÓ — mà đồng hồ đó ta không đo được từ ngoài.
// Không kết luận được là do bộ đệm thời gian của PostgREST, do GoTrue phát token lệch giờ,
// hay do một tầng nào khác. Đừng chép lại phỏng đoán này như dữ kiện.
//
// VÌ SAO VẪN THỬ LẠI: dù nguyên nhân là gì thì đặc tính vẫn là CHẬP CHỜN — cùng một token
// bị từ chối rồi vài giây sau lại qua. Thử lại là cách né rẻ nhất và không che giấu lỗi nào
// khác: chỉ đúng mã PGRST303 mới thử lại, mọi 401 khác trả về ngay như cũ.
//
// VÌ SAO THỬ LẠI AN TOÀN VỚI MỌI PHƯƠNG THỨC (kể cả POST/PATCH/DELETE):
// 401 nghĩa là request bị chặn ở tầng xác thực, CHƯA hề chạm tới database. Không có tác dụng
// phụ nào đã xảy ra để mà nhân đôi.
//
// KHI NÀO BỎ LỚP NÀY: khi sự cố không tái diễn trong một thời gian đủ dài, hoặc khi xác định
// được nguyên nhân thật và nó đã được sửa. KHÔNG có mốc phiên bản nào để căn — project đã
// chạy 14.17 ngay lúc sự cố xảy ra.
// ============================================================================

/** Số lần thử LẠI (không tính lần đầu). 3 lần ≈ tối đa ~2,8s trước khi chịu thua. */
const JWT_RETRY_MAX = 3

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Đọc mã lỗi PostgREST từ body mà KHÔNG làm hỏng response gốc (dùng clone). */
async function readPostgrestCode(res: Response): Promise<string | null> {
  try {
    const body = await res.clone().json()
    return typeof body?.code === 'string' ? body.code : null
  } catch {
    return null
  }
}

async function fetchWithJwtSkewRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(input, init)

    // Chỉ quan tâm 401. Mọi mã khác (kể cả 4xx/5xx) trả thẳng, không đụng vào.
    if (res.status !== 401 || attempt >= JWT_RETRY_MAX) return res

    const code = await readPostgrestCode(res)
    if (code !== 'PGRST303') return res

    // Backoff có jitter. Jitter là cần thiết: đã có báo cáo delay cố định vẫn trượt vì
    // request lặp lại rơi trúng cùng luồng PostgREST đang chậm giờ.
    const delay = 300 * 2 ** attempt + Math.random() * 250
    console.warn(
      `[supabase] PGRST303 "JWT issued at future" (bug hạ tầng Supabase) — thử lại lần ${attempt + 1}/${JWT_RETRY_MAX} sau ${Math.round(delay)}ms`,
    )
    await sleep(delay)
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithJwtSkewRetry },
})
