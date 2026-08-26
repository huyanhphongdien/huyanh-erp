import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong file .env')
}

// ============================================================================
// TỰ THỬ LẠI KHI GẶP PGRST303 "JWT issued at future"
// ============================================================================
// SỰ CỐ (26/08/2026): người dùng mở /sales/kanban thấy "Lỗi tải đơn: JWT issued at future"
// và danh sách rỗng, dù đăng nhập bình thường.
//
// KHÔNG phải lỗi của code này, cũng không phải sai giờ máy người dùng. Đây là bug hạ tầng
// của Supabase: PostgREST kiểm claim `iat` bằng một bộ đệm thời gian tự cập nhật, và có
// luồng xác thực bỏ lỡ nhịp cập nhật nên "giờ hiện tại" của nó bị chậm. Token GoTrue vừa
// phát (iat = giờ thật) bị luồng chậm giờ đó coi là "phát hành ở tương lai" → 401 PGRST303.
//
// Đã đo để loại trừ mọi nguyên nhân phía mình (26/08/2026):
//   • đồng hồ máy dev lệch −1 giây so với Supabase/Google
//   • đồng hồ Postgres lệch −1 giây so với giờ thật
//   • 0/335 phiên trong auth.sessions có mốc thời gian tương lai
//   • project Healthy, gói Pro, chưa từng bị pause
// Độ lệch nằm TRONG cache của PostgREST, không phải đồng hồ máy chủ — nên không sửa được
// từ phía ứng dụng, chỉ né được.
//
// ĐẶC TÍNH: chập chờn. Token bị từ chối trong 100–200ms đầu sau khi phát, nhưng thử lại sau
// 1-2 giây thì qua. Vì vậy request đầu tiên NGAY SAU khi đăng nhập/tải lại trang là dễ dính
// nhất — đúng kịch bản trang Kanban gọi query lúc vừa mở.
//
// VÌ SAO THỬ LẠI LÀ AN TOÀN VỚI MỌI PHƯƠNG THỨC (kể cả POST/PATCH/DELETE):
// 401 nghĩa là request bị chặn ở tầng xác thực, CHƯA hề chạm tới database. Không có tác dụng
// phụ nào đã xảy ra để mà nhân đôi. Ta cũng chỉ thử lại khi đọc được đúng mã PGRST303 —
// mọi lỗi 401 khác (hết hạn token, sai quyền) vẫn trả về ngay như cũ.
//
// Bỏ lớp này đi khi nào? Khi Supabase deploy PostgREST ≥ v14.17 / v16.1 cho project.
// Kiểm bằng: curl -sI https://<ref>.supabase.co/rest/v1/ | grep -i server
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
