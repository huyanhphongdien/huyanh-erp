// ============================================================================
// RETAIL CUSTOMER SERVICE — tra khách lẻ
// File: apps/retail-scale/src/services/retailCustomerService.ts
//
// CHÍNH SÁCH ĐÃ CHỐT: khách lẻ KHÔNG bắt buộc CCCD, và app cân KHÔNG tạo master data.
//   • Khách vãng lai  → chỉ ghi TÊN + SĐT thẳng lên phiếu (weighbridge_tickets.supplier_name
//                       / driver_phone). Đề nghị thanh toán lấy đúng tên đó làm người nhận
//                       tiền (đã có tiền lệ: 2 phiếu "Hàng Lào"/"Công ty 72" ở Phong Điền).
//   • Khách quen      → chọn từ danh bạ đối tác (b2b_partners) để gắn partner_id ⇒ có sổ
//                       công nợ + số tài khoản ngân hàng tự điền trên chứng từ chi.
//
// VÌ SAO KHÔNG TẠO ĐỐI TÁC MỚI TỪ APP NÀY (2 lý do độc lập, mỗi lý do đủ để loại):
//   1. Kỹ thuật: role `anon` KHÔNG có GRANT INSERT trên b2b.partners (kiểm tra live
//      2026-08-21) → mọi nút "tạo khách mới" ở đây sẽ lỗi 42501 permission denied.
//      partnerQuickCreateService cũng không dùng được (nó bắt buộc CCCD 12 số).
//   2. Nghiệp vụ: mở cho bàn cân tạo đối tác = danh bạ ngập rác trùng tên trong một tuần.
//      Ai cần theo dõi công nợ thì kế toán tạo trên ERP — 1 đầu mối, đúng như app cân xe.
//
// Tra cứu "khách quay lại" KHÔNG cần master data: loadRecentCustomers() đọc thẳng lịch sử
// phiếu mủ lẻ của nhà máy, filterRecentCustomers() lọc tại chỗ theo tên/SĐT đang gõ.
// ============================================================================

import { supabase } from '@erp/lib/supabase'

export interface PartnerOption {
  id: string
  code: string
  name: string
  phone: string | null
}

export interface RecentCustomer {
  name: string
  phone: string | null
  partner_id: string | null
  last_at: string
  times: number
}

// Dải dấu tổ hợp Unicode U+0300–U+036F. Xây bằng RegExp(chuỗi escape) chứ KHÔNG viết
// ký tự thô trong regex literal: ký tự tổ hợp trần rất dễ hỏng khi file bị lưu sai
// encoding, và lúc đó hàm âm thầm ngừng bỏ dấu — tìm kiếm trượt hết mà không báo lỗi.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

/** Bỏ dấu tiếng Việt để tìm gần đúng. NFD không tách được móc của đ/ơ/ư nên map tay. */
function noAccent(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')   // đ
    .replace(/ơ/g, 'o')   // ơ
    .replace(/ư/g, 'u')   // ư
    .trim()
}

/**
 * Tìm đối tác đã có trong danh bạ (chỉ ĐỌC — anon có quyền SELECT trên view b2b_partners).
 * Ưu tiên hộ nông dân, nhưng không loại đại lý: đôi khi đại lý nhỏ cũng chở mủ tới bán lẻ.
 */
export async function searchPartners(keyword: string, limit = 20): Promise<PartnerOption[]> {
  const kw = keyword.trim()
  if (kw.length < 2) return []

  const { data, error } = await supabase
    .from('b2b_partners')
    .select('id, code, name, phone, partner_type')
    .or(`name.ilike.%${kw}%,phone.ilike.%${kw}%,code.ilike.%${kw}%`)
    .limit(limit * 2)

  if (error) {
    console.warn('[retailCustomer] Không tra được danh bạ đối tác:', error.message)
    return []
  }

  const rows = (data || []) as Array<PartnerOption & { partner_type: string | null }>
  // Hộ nông dân lên trước — đó là nhóm hay bán lẻ nhất.
  rows.sort((a, b) => {
    const ra = a.partner_type === 'household' ? 0 : 1
    const rb = b.partner_type === 'household' ? 0 : 1
    return ra - rb
  })
  return rows.slice(0, limit).map(({ id, code, name, phone }) => ({ id, code, name, phone }))
}

/**
 * Nạp DANH SÁCH khách lẻ đã từng bán tại nhà máy này (đọc từ chính phiếu mủ lẻ, không cần
 * master data). Query KHÔNG phụ thuộc chữ đang gõ → gọi MỘT LẦN khi mở màn cân.
 *
 * Cố ý tách khỏi việc lọc: nếu gọi theo từng ký tự thì mỗi phím là một request kéo 400 dòng
 * về rồi mới lọc ở client — ô nhập giật và response về trễ có thể ghi đè kết quả mới hơn.
 * Lọc là hàm thuần `filterRecentCustomers()` bên dưới.
 */
export async function loadRecentCustomers(facilityId: string | null): Promise<RecentCustomer[]> {
  let q = supabase
    .from('weighbridge_tickets')
    .select('supplier_name, driver_phone, partner_id, created_at')
    .eq('ticket_type', 'retail')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(400)
  if (facilityId) q = q.eq('facility_id', facilityId)

  const { data, error } = await q
  if (error) {
    console.warn('[retailCustomer] Không đọc được lịch sử khách lẻ:', error.message)
    return []
  }

  const byKey = new Map<string, RecentCustomer>()
  for (const r of (data || []) as Array<{
    supplier_name: string | null
    driver_phone: string | null
    partner_id: string | null
    created_at: string
  }>) {
    const name = (r.supplier_name || '').trim()
    if (!name) continue
    // Gộp theo SĐT nếu có (chính xác hơn tên), không thì theo tên đã bỏ dấu.
    const key = r.driver_phone?.trim() || noAccent(name)
    const hit = byKey.get(key)
    if (hit) {
      hit.times += 1
      continue
    }
    byKey.set(key, {
      name,
      phone: r.driver_phone?.trim() || null,
      partner_id: r.partner_id,
      last_at: r.created_at,
      times: 1,
    })
  }

  return [...byKey.values()]
}

/** Lọc danh sách khách quen theo chữ đang gõ. Hàm THUẦN — không có request nào để về trễ. */
export function filterRecentCustomers(
  list: RecentCustomer[],
  keyword = '',
  limit = 8,
): RecentCustomer[] {
  const kw = noAccent(keyword)
  const out = kw
    ? list.filter(c => noAccent(c.name).includes(kw) || (c.phone || '').includes(keyword.trim()))
    : list
  return out.slice(0, limit)
}

export default { searchPartners, loadRecentCustomers, filterRecentCustomers }
