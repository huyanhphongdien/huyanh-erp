/**
 * Thứ tự 2 lần cân — dùng chung cho màn hình cân và phiếu in (phải khớp nhau).
 *
 * Slot DB LUÔN giữ nguyên nghĩa: `gross` = xe CÓ HÀNG, `tare` = xe RỖNG.
 * Chỉ THỨ TỰ cân là khác nhau tuỳ luồng:
 *   • NHẬP:            lần 1 = xe + hàng  → lần 2 = xe rỗng
 *   • XUẤT / CỔNG:     lần 1 = xe rỗng    → lần 2 = xe + hàng
 *   • ĐI LẤY MỦ (fetch) — ngược nhau ở 2 đầu:
 *       – TL/LAO (nguồn): xe tới RỖNG  → lần 1 = xe rỗng   → lần 2 = xe + mủ
 *       – PĐ (nhận):      xe VỀ ĐÃ ĐẦY → lần 1 = xe + hàng → lần 2 = xe rỗng
 *
 * Quy trình fetch ở PĐ đổi ngày 19/07/2026 (trước đó PĐ cân rỗng trước lúc xe ĐI).
 * Vì vậy KHÔNG suy thứ tự bằng loại phiếu, mà suy từ chính dữ liệu phiếu → phiếu cũ,
 * phiếu đang cân dở và phiếu mới đều hiển thị/định tuyến đúng.
 *
 * @returns true nếu LẦN 1 là lần cân XE CÓ HÀNG (slot gross).
 */
export function isLoadedWeighFirst(t: any, facilityCode?: string): boolean {
  // 1) Cân đủ 2 lần → mốc thời gian là bằng chứng chắc nhất (đúng cho mọi phiếu cũ).
  const gAt = t?.gross_weighed_at, tAt = t?.tare_weighed_at
  if (gAt && tAt) return new Date(gAt).getTime() <= new Date(tAt).getTime()
  // 2) Đang cân dở → slot nào đã có số thì đó chính là lần 1.
  if (t?.gross_weight != null && t?.tare_weight == null) return true
  if (t?.tare_weight != null && t?.gross_weight == null) return false
  // 3) Chưa cân gì → theo trạm: PĐ nhận mủ về nên cân xe đầy trước.
  return facilityCode === 'PD'
}
