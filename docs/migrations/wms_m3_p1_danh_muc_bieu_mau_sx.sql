-- ============================================================================
-- M3 · BƯỚC 0 — DANH MỤC HÀNG THEO ĐÚNG BIỂU MẪU CL.BMQT.SX.04.06
-- File: docs/migrations/wms_m3_p1_danh_muc_bieu_mau_sx.sql
--
-- VÌ SAO CÓ FILE NÀY
-- Danh mục hàng THẬT của nhà máy nằm trên tờ "BÁO CÁO SẢN XUẤT NHẬP KHO HÀNG NGÀY"
-- (mã CL.BMQT.SX.04.06, phiên bản 01, hiệu lực 20/5/2019) — 25 dòng in sẵn, ghi tay mỗi ca,
-- ba chữ ký: sản xuất giao → QS giám sát → thủ kho nhận.
-- Trong phần mềm chỉ có 10 mã chung chung + 7 dòng lạ, và `inventory_transactions.material_id`
-- là NOT NULL ⇒ hôm nay KHÔNG CÓ MÃ NÀO để ghi sổ kho thành phẩm. Đây là bước chặn 4 module còn lại.
--
-- HAI ĐIỀU BIỂU MẪU GIẤY LÀM ĐÚNG MÀ PHẦN MỀM LÀM SAI:
--   1. CỠ BÀNH NẰM TRONG TÊN MÃ. `SVR 3L 35KG` và `SVR 3L 33.33KG` là HAI dòng riêng.
--      Đo trên 212 container thật: SVR 3L đóng CẢ HAI cỡ, 12 cont ở 33,33 và 12 cont ở 35,00
--      ⇒ KHÔNG có một con số kg/bành nào đúng cho mã "Cao su SVR 3L".
--      Phần mềm đang gán 33,3334 cho MỌI mã SVR, trong khi SVR 10 thực tế là 35,00 ở 86/86
--      container ⇒ sai 4,8% ở mọi dòng, và sai ĐỀU nên không ai nghi ngờ.
--   2. Phân biệt theo KHÁCH/quy cách: SVR 10 35KG có SWG · ATC · JK · STD.
--
-- ĐỐI CHỨNG SỐ HỌC trên tờ ngày 27/8/2026 (mọi dòng đều 35 kg/bành):
--      118 bành → 4.130 kg · 10 → 350 · 432 → 15.120 · TỔNG 560 → 19.600. Khớp tuyệt đối.
--
-- ⚠ VÌ SAO CÓ CẢ `sku` LẪN `code`: toàn bộ WMS khoá trên `sku`, không phải `code`.
--   `batchService.ts:127` khai `getShortSKU(sku: string)` rồi gọi thẳng `sku.replace(...)`
--   KHÔNG CÓ GUARD NULL, và `generateBatchNo` (:157-167) nạp `sku` từ materials rồi truyền vào.
--   Đường đi thật: `stockInService.addDetail (:272) → batchService.createBatch (:218)`.
--   ⇒ Mã có `sku = NULL` thì LƯU PHIẾU NHẬP KHO LÀ VỠ ngay lần đầu — đúng cái việc file này
--   sinh ra để mở đường. 11/11 mã `finished` hiện có đều CÓ sku (`TP-SVR10`, `TP-RSS3`…).
--   Đặt `sku = code` còn được thêm một thứ: `rubberGradeService.gradeFromSku` tự nhận ra
--   `SVR10CV60-35 → SVR_CV60`, `SVR3L-35 → SVR_3L`, `RSS3-35 → RSS_3`.
--
-- AN TOÀN: 11 bảng khoá ngoại tới `materials`. Dữ liệu trong chúng ÍT và CŨ — không dòng nào
-- tạo sau 23/04/2026: inventory_transactions 20 · stock_levels 6 · stock_batches 59 (đều demo) ·
-- production_output_batches 9 · purchase_order_items 7 · material_qc_standards 5 · còn lại 0.
-- Migration này chỉ THÊM dòng và VÔ HIỆU HOÁ dòng cũ — KHÔNG XOÁ dòng nào.
--
-- Idempotent. KHÔNG có BEGIN/COMMIT (chạy qua RPC agent_sql, lỗi 0A000).
-- ============================================================================

-- ─── 1) Thứ tự dòng + ràng buộc duy nhất cho code ───────────────────────────
-- Người nhập liệu đọc từ tờ giấy xuống màn hình. Lệch thứ tự là gõ nhầm dòng,
-- và gõ nhầm dòng thì sai cả tồn kho lẫn tiền khoán.
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON COLUMN public.materials.sort_order IS
  'Thứ tự hiển thị. Với hàng thành phẩm: đúng thứ tự 24 dòng in trên biểu mẫu CL.BMQT.SX.04.06.';

-- ⚠ `materials.code` CHƯA có ràng buộc duy nhất (chỉ `id` và `sku` có) ⇒ không có chỉ mục này
--   thì `ON CONFLICT (code)` ở mục 4 sẽ lỗi 42P10 và cả migration rollback.
--   Từng phần (WHERE code IS NOT NULL) vì 11/19 dòng hiện có `code` NULL.
--   Đã đo: 8 mã đang tồn tại đều khác nhau, đều là `RST*` / `MU-CSRAW`, không trùng 24 mã mới.
CREATE UNIQUE INDEX IF NOT EXISTS materials_code_uniq
  ON public.materials (code) WHERE code IS NOT NULL;

-- ─── 2) Vô hiệu hoá dòng lạ — CHỈ 2 DÒNG THẬT SỰ MỒ CÔI ─────────────────────
-- ⚠ Bản nháp đầu định tắt 5 dòng. Phản biện đo lại: 3 trong 5 dòng đang nằm trên ĐƠN MUA THẬT —
--   'ádasdasdasdasd' → DH-2026-0006 (confirmed); 'Hi Minh' và 'Hi TT' → DH-2026-0007 (partial),
--   có phiếu duyệt DX-2026-000002 mang tên "Lê Văn Huy - Giám đốc".
--   Tên chúng trông như gõ bậy và cùng bộ dữ liệu có 'Cát vàng vàng' 1.000.100 đơn vị / 11 tỷ ₫,
--   nên gần chắc là buổi tập — NHƯNG đó là quyết định của bộ phận mua, không phải của migration.
--   Chỉ tắt 2 dòng có 0 tham chiếu ở cả 11 bảng.
UPDATE public.materials
   SET is_active = false, status = 'inactive', updated_at = now()
 WHERE is_active IS DISTINCT FROM false
   AND name IN ('dgjasgj', 'sadasd');

-- ─── 3) Vô hiệu hoá các mã cao su CHUNG CHUNG đã bị 24 dòng mới thay thế ────
-- Đây là các mã gán 1 cỡ bành duy nhất cho cả mặt hàng — chính là cái sai nêu ở đầu file.
-- ⚠ CỐ Ý GIỮ 'Latex cô đặc HA' (không có trên biểu mẫu sản xuất) và 'Mủ cao su thô (tự tạo)'
--   (là NGUYÊN LIỆU, type='raw').
-- ⚠ CÒN NỢ: `material_qc_standards` có 5 dòng, 4 trong đó trỏ vào SVR 3L/5/10/20 sắp bị tắt.
--   `QCStandardsConfigPage.tsx:56` chỉ nạp materials `is_active=true` và :63 map `mat?.name || '—'`
--   ⇒ sau migration 4 dòng chuẩn QC sẽ hiện dấu '—'. Phải chuyển sang mã mới hoặc xoá, ở bước sau.
UPDATE public.materials
   SET is_active = false, status = 'inactive', updated_at = now()
 WHERE is_active IS DISTINCT FROM false
   AND type = 'finished'
   AND name IN (
     'Cao su SVR 10', 'Cao su SVR 20', 'Cao su SVR 3L', 'Cao su SVR 5',
     'Cao su SVR CV50', 'Cao su SVR CV60', 'Cao su SVR L',
     'Cao su tờ xông khói RSS 1', 'Cao su tờ xông khói RSS 3'
   );

-- ─── 4) 24 dòng của biểu mẫu ────────────────────────────────────────────────
-- ⚠ Dòng 'SVL3L 35 KG' trên giấy là LỖI ĐÁNH MÁY của 'SVR 3L 35KG' (chủ doanh nghiệp xác nhận
--   28/08/2026) nên KHÔNG đưa vào đây — 25 dòng giấy → 24 mã. Cần sửa tờ giấy ở lần nâng
--   phiên bản 02, nếu không người nhập sẽ tìm một dòng không tồn tại trên màn hình.
--
-- ⚠ 'CHÈN' để weight_per_unit NULL: hàng chèn, biểu mẫu chưa từng ghi số nên không suy được
--   kg/bành. Màn hình phải bắt nhập kg tay cho riêng dòng này. Bịa 35 kg là bịa vào sổ kho.
--
-- 'HÀNG DKL' = hàng DÍNH KIM LOẠI. Cùng với 'SẢN PHẨM LỖI' đây là HAI loại hàng không đạt
-- (27/8: DKL nhập 10 bành, LỖI nhập 432 bành) — đừng gộp chung.
--
-- Cỡ 33,330: giữ đúng con số này, KHÔNG đổi sang 33,3333. Đo trên container thật, nhóm 33,33
-- gồm 12 cont / 7.182 bành / 239.385,88 kg; suy ngược thì 33,330 lệch −9,82 kg còn 33,3333
-- lệch +13,89 kg ⇒ 33,330 sát thực tế hơn.
INSERT INTO public.materials (code, sku, name, type, unit, weight_per_unit, sort_order, is_active, status, notes)
VALUES
  ('SVR10-35-SWG',      'SVR10-35-SWG',      'SVR 10 35KG SWG',         'finished', 'bành', 35.0000,   1, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('SVR10-35-ATC',      'SVR10-35-ATC',      'SVR 10 35KG ATC',         'finished', 'bành', 35.0000,   2, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('SVR10-35-JK',       'SVR10-35-JK',       'SVR10 35 KG JK',          'finished', 'bành', 35.0000,   3, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('SVR10-35-STD',      'SVR10-35-STD',      'SVR10 35 KG STD',         'finished', 'bành', 35.0000,   4, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('TSR20-35',          'TSR20-35',          'TSR20 35 KG',             'finished', 'bành', 35.0000,   5, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('TSR10-35',          'TSR10-35',          'TSR10 35 KG',             'finished', 'bành', 35.0000,   6, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('SVR10MIX-35',       'SVR10MIX-35',       'SVR10 Mix 35 KG',         'finished', 'bành', 35.0000,   7, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('SVR10MIX1502-35',   'SVR10MIX1502-35',   'SVR10 MIX 1502 35KG',     'finished', 'bành', 35.0000,   8, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('SVR10-3333',        'SVR10-3333',        'SVR10 33,33 KG',          'finished', 'bành', 33.3300,   9, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('SVR10MIX-3333',     'SVR10MIX-3333',     'SVR10 Mix 33.33 KG',      'finished', 'bành', 33.3300,  10, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('SVR10MIX1502-3333', 'SVR10MIX1502-3333', 'SVR10 MIX 1502 33,33 KG', 'finished', 'bành', 33.3300,  11, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('RSSMIX-3333',       'RSSMIX-3333',       'RSS MIX 33.33 KG',        'finished', 'bành', 33.3300,  12, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('MASTICATED-35',     'MASTICATED-35',     'MASTICATED 35 KG',        'finished', 'bành', 35.0000,  13, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('SVR10CV60-35',      'SVR10CV60-35',      'SVR10CV60 35 KG',         'finished', 'bành', 35.0000,  14, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('SVR3L-35',          'SVR3L-35',          'SVR 3L 35KG',             'finished', 'bành', 35.0000,  15, true, 'active', 'Gộp cả dòng SVL3L 35 KG trên giấy — lỗi đánh máy, cần sửa ở phiên bản 02'),
  ('SVR3L-3333',        'SVR3L-3333',        'SVR 3L 33.33KG',          'finished', 'bành', 33.3300,  16, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('BANH1502-35',       'BANH1502-35',       'BÀNH 1502 35KG',          'finished', 'bành', 35.0000,  17, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('BANH1502-30',       'BANH1502-30',       'BÀNH 1502 30KG',          'finished', 'bành', 30.0000,  18, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('DKL',               'DKL',               'HÀNG DKL',                'finished', 'bành', 35.0000,  19, true, 'active', 'Hàng không đạt — DÍNH KIM LOẠI. 27/8: nhập 10 bành/350 kg ⇒ 35 kg/bành'),
  ('RSS3-35',           'RSS3-35',           'RSS3 35KG',               'finished', 'bành', 35.0000,  20, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('RSS3-3333',         'RSS3-3333',         'RSS3 33.33KG',            'finished', 'bành', 33.3300,  21, true, 'active', 'Biểu mẫu CL.BMQT.SX.04.06'),
  ('RSS-111',           'RSS-111',           'RSS 111.111KG',           'finished', 'kiện', 111.1111, 22, true, 'active', 'Đóng kiện 1/9 tấn — không phải bành'),
  ('LOI',               'LOI',               'SẢN PHẨM LỖI',            'finished', 'bành', 35.0000,  23, true, 'active', 'Hàng không đạt, chờ tái chế. 27/8: nhập 432 bành/15.120 kg ⇒ 35 kg/bành'),
  ('CHEN',              'CHEN',              'CHÈN',                    'finished', 'bành', NULL,     24, true, 'active', '⚠ CHƯA CÓ kg/bành — biểu mẫu chưa từng ghi số. Màn hình phải bắt nhập kg tay.')
-- Chỉ mục ở mục 1 là TỪNG PHẦN, nên ON CONFLICT phải nhắc lại đúng mệnh đề WHERE của nó,
-- không thì Postgres không suy ra được chỉ mục nào và vẫn lỗi 42P10.
ON CONFLICT (code) WHERE code IS NOT NULL DO UPDATE
   SET name            = EXCLUDED.name,
       type            = EXCLUDED.type,
       unit            = EXCLUDED.unit,
       sort_order      = EXCLUDED.sort_order,
       notes           = EXCLUDED.notes,
       -- ⚠ COALESCE, KHÔNG gán đè. Chạy lần 2 mà gán thẳng thì xoá mất số kg thủ kho vừa
       --   nhập tay cho dòng CHÈN (EXCLUDED của nó là NULL), và ghi đè cả sku nếu ai đó đã sửa.
       sku             = COALESCE(public.materials.sku, EXCLUDED.sku),
       weight_per_unit = COALESCE(public.materials.weight_per_unit, EXCLUDED.weight_per_unit),
       updated_at      = now();
-- ⚠ CỐ Ý KHÔNG ép `is_active=true, status='active'` trong DO UPDATE: nếu sau này ai đó cố ý
--   tắt một mã (VD ngừng làm TSR10), chạy lại migration không được tự bật nó lên.

-- ─── 5) KIỂM CHỨNG (chạy tay sau khi apply) ────────────────────────────────
-- a) Đúng 24 dòng của biểu mẫu — đếm theo sort_order, KHÔNG đếm theo type:
--    SELECT count(*) FROM materials WHERE sort_order IS NOT NULL;              -- 24
--    (Đếm `type='finished' AND is_active` sẽ ra 25 vì Latex cô đặc HA được cố ý giữ.)
--
-- b) Thứ tự khớp giấy, mọi mã có sku, chỉ CHÈN thiếu cỡ bành:
--    SELECT sort_order, code, sku, name, unit, weight_per_unit
--      FROM materials WHERE sort_order IS NOT NULL ORDER BY sort_order;
--    SELECT count(*) FROM materials WHERE sort_order IS NOT NULL AND sku IS NULL;         -- 0
--    SELECT count(*) FROM materials WHERE sort_order IS NOT NULL AND weight_per_unit IS NULL; -- 1
--
-- c) Không mã cũ nào bị XOÁ — 59 lô demo vẫn trỏ được về mã của chúng:
--    SELECT count(*) FROM stock_batches b LEFT JOIN materials m ON m.id=b.material_id
--     WHERE b.material_id IS NOT NULL AND m.id IS NULL;                         -- 0
--
-- d) Tái hiện số học tờ 27/8/2026:  118+10+432 = 560 bành · ×35 = 19.600 kg
--
-- HOÀN TÁC mục 2 và 3 — ⚠ phải loại trừ '[DELETED] test data', dòng đó đã bị tắt TỪ TRƯỚC
-- (status vẫn 'active', sort_order NULL) nên nếu không loại thì rollback sẽ hồi sinh nó:
--    UPDATE materials SET is_active=true, status='active'
--     WHERE is_active=false AND status='inactive' AND sort_order IS NULL;
--
-- ─── CÒN NỢ, KHÔNG THUỘC MIGRATION NÀY ─────────────────────────────────────
-- 1. `sort_order` chưa màn nào đọc: MaterialPicker.tsx:45 `.order('name')`,
--    MaterialListPage.tsx:380 `.order('sku')` ⇒ thứ tự tờ giấy chưa tới mắt người nhập.
-- 2. `rubberGradeService.ts:141` `calculateBaleCount = Math.floor(weightKg / 33.33)` gõ cứng,
--    không đọc `weight_per_unit` ⇒ 19.600 kg vẫn ra 588 bành thay vì 560. Phải sửa ở M3 bước 2.
-- 3. `inventoryService.ts` KHÔNG lọc `is_active` ⇒ tắt mã cũ không làm tồn kho ma biến mất.
--    1.961.645 kg 'Cao su SVR 3L' và 25.888 kg 'Cao su SVR 10' vẫn hiện nguyên.
-- 4. 3 dòng tên lạ đang nằm trên đơn mua thật (DH-2026-0006, DH-2026-0007) — hỏi bộ phận mua.
