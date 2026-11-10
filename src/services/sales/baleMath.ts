// ============================================================================
// baleMath — số bành và số container suy từ tấn + KL bành. DÙNG CHUNG cho form tạo đơn,
// service tạo/sửa đơn, tab Hợp đồng (sửa dòng hàng), dashboard tiến độ, sinh hợp đồng .docx.
// File: src/services/sales/baleMath.ts
//
// Vì sao có file này (10/11/2026): 210 tấn SVR3L bành 33,33 kg từng ra 6.301 bành / 11 container
// (8 đơn trong DB, HA20260100 → HA20260309). 33,33 chỉ là cách GHI TRÒN của 100/3 kg, tức
// 30 bành/tấn; chia thẳng 210.000 / 33,33 = 6.300,63 → round = 6.301, thừa đúng 1 bành, và
// ceil(6.301 / 630) nhảy lên 11 cont trong khi thực tế xếp 10 cont × 630 bành.
// Luật: nếu 1000 / KL bành sát một số nguyên (lệch < 0,02 bành/tấn) thì coi KL bành là
// 1000 / n (33,33 → 30/tấn; 33,333 → 30/tấn; 16,67 → 60/tấn), ngưỡng lệch < 0,02. KL khác (35 kg → 28,571/tấn)
// giữ nguyên và chia thật: 210 t × 35 kg = 6.000 bành như cũ.
// ============================================================================

/** Số bành trên 1 tấn từ KL bành (kg). 0 nếu KL bành không hợp lệ. */
export function balesPerTonne(baleWeightKg: number | null | undefined): number {
  if (!baleWeightKg || baleWeightKg <= 0) return 0
  const n = 1000 / baleWeightKg
  const r = Math.round(n)
  return Math.abs(n - r) < 0.02 ? r : n   // 33,33 → 30,003 ✓ · 16,67 → 59,988 ✓ · 35 → 28,571 ✗ (giữ nguyên)
}

/** Số bành của `tons` tấn. 210 t × 33,33 kg → 6.300 (không phải 6.301). */
export function balesFromTons(tons: number | null | undefined, baleWeightKg: number | null | undefined): number {
  if (!tons || tons <= 0) return 0
  return Math.round(tons * balesPerTonne(baleWeightKg))
}

/** Số container = bành ÷ bành/container, làm tròn LÊN (bành lẻ vẫn cần thêm một cont). */
export function containersFromBales(bales: number | null | undefined, balesPerContainer: number | null | undefined): number {
  if (!bales || bales <= 0 || !balesPerContainer || balesPerContainer <= 0) return 0
  return Math.ceil(bales / balesPerContainer)
}

/** Bành/container mặc định khi đơn chưa khai: 20ft chứa 21 t = 630 bành 33,33 kg hoặc 600 bành 35 kg; 40ft gấp đôi. */
export function defaultBalesPerContainer(baleWeightKg: number | null | undefined, containerType: string | null | undefined): number {
  const per20ft = (baleWeightKg || 33.33) >= 35 ? 600 : 630
  return containerType === '40ft' ? per20ft * 2 : per20ft
}
