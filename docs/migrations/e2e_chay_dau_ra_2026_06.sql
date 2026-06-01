-- ============================================================================
-- E2E TEST — LUỒNG MUA MỦ "CHẠY ĐẦU RA" (purchase_type = 'drc_after_production')
-- File: docs/migrations/e2e_chay_dau_ra_2026_06.sql
-- READ-ONLY — KHÔNG INSERT/UPDATE/DELETE. An toàn chạy trên DEMO/prod.
--
-- MỤC ĐÍCH: đi hết vòng đời 1 deal chạy đầu ra theo ĐÚNG 10 chặng mà app vẽ ra
-- (src/services/b2b/productionProgressService.ts → buildDrcAfterTimeline), đối
-- chiếu dữ liệu thật ở từng bảng, và bắt chỗ "đứt mạch" / sai thứ tự.
--
-- CÁCH DÙNG: Supabase SQL Editor chỉ hiện kết quả câu lệnh CUỐI. Vì vậy mỗi PHẦN
-- là 1 câu SELECT độc lập — BÔI ĐEN khối muốn xem rồi Ctrl/Cmd+Enter chạy riêng.
--   PHẦN 1 (checklist 10 chặng) là phần chính.
--
-- SCHEMA (đã verify theo service code đang chạy prod):
--   public.b2b_deals             -- deal (purchase_type, sample_drc, actual_drc,
--                                   finished_product_kg, stock_in_count, status…)
--   public.b2b_partners          -- đại lý
--   public.weighbridge_tickets   -- phiếu cân (completed_at, status, deal_id)
--   public.stock_in_orders       -- nhập kho (code, confirmed_at, status, deal_id)
--   public.b2b_advances          -- tạm ứng (status, deal_id)
--   public.b2b_settlements       -- quyết toán (code, gross_amount, approved_at,
--                                   paid_at, status, deal_id) — KHÔNG có confirmed_at
--   public.b2b_partner_ledger    -- sổ công nợ (entry_type, debit, credit,
--                                   running_balance, reference_code, settlement_id,
--                                   advance_id, payment_id) — KHÔNG có deal_id,
--                                   nối deal qua settlement_id/advance_id
--   public.b2b_notifications     -- thông báo (type, deal_id, is_read…)
--   b2b.production_completion_certs  -- phiếu chốt thành phẩm (ký 2 bên)
--   b2b.deal_supervisors             -- người giám sát đại lý cử
--
-- 10 CHẶNG (drc_after_production):
--   1 Đã cân · 2 Đã nhập kho · 3 QC sample DRC · 4 BGĐ duyệt · 5 Tạm ứng
--   6 Bắt đầu SX · 7 Ra thành phẩm · 8 QC final (actual DRC) · 9 Quyết toán · 10 Thanh toán
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN 0 — KIỂM TRA TỒN TẠI BẢNG + ĐÚNG SCHEMA
-- NULL = bảng KHÔNG tồn tại ở schema đó. Nếu cột "public_*" và "b2b_*" lệch với
-- chú thích trên thì sửa tiền tố schema trong các PHẦN sau cho khớp DB của bạn.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  to_regclass('public.b2b_deals')                  AS deals,
  to_regclass('public.b2b_partners')               AS partners,
  to_regclass('public.weighbridge_tickets')        AS weighbridge,
  to_regclass('public.stock_in_orders')            AS stock_in,
  to_regclass('public.b2b_advances')               AS advances,
  to_regclass('public.b2b_settlements')            AS settlements,
  to_regclass('public.b2b_partner_ledger')         AS ledger,
  to_regclass('public.b2b_notifications')          AS notifications,
  to_regclass('b2b.production_completion_certs')   AS completion_certs,
  to_regclass('b2b.deal_supervisors')              AS deal_supervisors;


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN 1 — ★ CHECKLIST 10 CHẶNG CHO 1 DEAL ★
-- Đặt deal_number cần soi vào dòng `WHERE deal_number = 'DEAL-XXXX'`. Để nguyên
-- (hoặc deal không tồn tại) → tự lấy deal chạy đầu ra MỚI NHẤT.
-- BÔI ĐEN TỪ "WITH t" tới hết PHẦN 1 rồi chạy.
-- Cột "Done": ✅ = đã qua · ⬜ = chưa. Điều kiện y hệt productionProgressService.
-- ════════════════════════════════════════════════════════════════════════════
WITH t AS (
  SELECT COALESCE(
    (SELECT id FROM public.b2b_deals WHERE deal_number = 'DEAL-XXXX'),  -- <— SỬA Ở ĐÂY
    (SELECT id FROM public.b2b_deals
       WHERE purchase_type = 'drc_after_production'
       ORDER BY created_at DESC LIMIT 1)
  ) AS deal_id
),
f AS (
  SELECT
    d.id, d.deal_number, d.status AS deal_status, d.purchase_type,
    d.sample_drc, d.actual_drc, d.finished_product_kg, d.stock_in_count,
    d.production_started_at, d.quantity_kg, d.unit_price, d.final_value,
    (SELECT w.completed_at FROM public.weighbridge_tickets w
       WHERE w.deal_id = d.id ORDER BY w.completed_at DESC NULLS LAST LIMIT 1) AS wb_completed_at,
    (SELECT s.confirmed_at FROM public.stock_in_orders s
       WHERE s.deal_id = d.id ORDER BY s.created_at DESC LIMIT 1)             AS si_confirmed_at,
    (SELECT count(*) FROM public.b2b_advances a
       WHERE a.deal_id = d.id AND a.status IN ('acknowledged','paid'))        AS adv_paid_cnt,
    (SELECT count(*) FROM public.b2b_advances a WHERE a.deal_id = d.id)       AS adv_total_cnt,
    (SELECT s.approved_at FROM public.b2b_settlements s
       WHERE s.deal_id = d.id ORDER BY s.created_at DESC LIMIT 1)             AS se_approved_at,
    (SELECT s.paid_at FROM public.b2b_settlements s
       WHERE s.deal_id = d.id ORDER BY s.created_at DESC LIMIT 1)             AS se_paid_at,
    (SELECT s.status FROM public.b2b_settlements s
       WHERE s.deal_id = d.id ORDER BY s.created_at DESC LIMIT 1)             AS se_status
  FROM public.b2b_deals d JOIN t ON d.id = t.deal_id
),
stg AS (
  SELECT 1 AS stt, 'Đã cân' AS chang,
         CASE WHEN wb_completed_at IS NOT NULL THEN '✅' ELSE '⬜' END AS done,
         to_char(wb_completed_at,'YYYY-MM-DD HH24:MI') AS moc,
         'weighbridge_tickets.completed_at' AS nguon FROM f
  UNION ALL
  SELECT 2, 'Đã nhập kho',
         CASE WHEN si_confirmed_at IS NOT NULL OR stock_in_count > 0 THEN '✅' ELSE '⬜' END,
         to_char(si_confirmed_at,'YYYY-MM-DD HH24:MI'),
         'stock_in_orders.confirmed_at | deals.stock_in_count=' || COALESCE(stock_in_count::text,'0') FROM f
  UNION ALL
  SELECT 3, 'QC sample DRC',
         CASE WHEN sample_drc > 0 THEN '✅' ELSE '⬜' END,
         NULL, 'deals.sample_drc = ' || COALESCE(sample_drc::text,'NULL') || '%' FROM f
  UNION ALL
  SELECT 4, 'BGĐ duyệt',
         CASE WHEN deal_status IN ('accepted','settled') THEN '✅' ELSE '⬜' END,
         NULL, 'deals.status = ' || COALESCE(deal_status,'NULL') FROM f
  UNION ALL
  SELECT 5, 'Tạm ứng',
         CASE WHEN adv_paid_cnt > 0 THEN '✅' ELSE '⬜' END,
         NULL, 'b2b_advances đã ứng ' || adv_paid_cnt || '/' || adv_total_cnt || ' (status acknowledged|paid)' FROM f
  UNION ALL
  SELECT 6, 'Bắt đầu sản xuất',
         CASE WHEN production_started_at IS NOT NULL THEN '✅' ELSE '⬜' END,
         to_char(production_started_at,'YYYY-MM-DD HH24:MI'),
         'deals.production_started_at' FROM f
  UNION ALL
  SELECT 7, 'Ra thành phẩm',
         CASE WHEN finished_product_kg > 0 THEN '✅' ELSE '⬜' END,
         NULL, 'deals.finished_product_kg = ' || COALESCE(finished_product_kg::text,'NULL') || ' kg' FROM f
  UNION ALL
  SELECT 8, 'QC final (actual DRC)',
         CASE WHEN actual_drc > 0 THEN '✅' ELSE '⬜' END,
         NULL, 'deals.actual_drc = ' || COALESCE(actual_drc::text,'NULL') || '%' FROM f
  UNION ALL
  SELECT 9, 'Quyết toán',
         CASE WHEN se_approved_at IS NOT NULL THEN '✅' ELSE '⬜' END,
         to_char(se_approved_at,'YYYY-MM-DD HH24:MI'),
         'b2b_settlements.approved_at (status=' || COALESCE(se_status,'—') || ')' FROM f
  UNION ALL
  SELECT 10, 'Thanh toán',
         CASE WHEN se_status = 'paid' OR deal_status = 'settled' THEN '✅' ELSE '⬜' END,
         to_char(se_paid_at,'YYYY-MM-DD HH24:MI'),
         'b2b_settlements.status=paid | deals.status=settled' FROM f
)
SELECT
  (SELECT 'DEAL ' || deal_number || ' · giá trị cuối=' || COALESCE(final_value::text,'—')
          || ' · KL TP=' || COALESCE(finished_product_kg::text,'—') || 'kg' FROM f) AS "▶ Deal",
  stt AS "#", chang AS "Chặng", done AS "Done", moc AS "Thời điểm", nguon AS "Nguồn dữ liệu"
FROM stg ORDER BY stt;


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN 2 — PHIẾU CHỐT THÀNH PHẨM + GIÁM SÁT (cho deal ở PHẦN 1)
-- Đối chiếu snapshot cert vs deal hiện tại. BÔI ĐEN từ "WITH t" tới hết.
-- ════════════════════════════════════════════════════════════════════════════
WITH t AS (
  SELECT COALESCE(
    (SELECT id FROM public.b2b_deals WHERE deal_number = 'DEAL-XXXX'),  -- <— SỬA (khớp PHẦN 1)
    (SELECT id FROM public.b2b_deals WHERE purchase_type='drc_after_production'
       ORDER BY created_at DESC LIMIT 1)
  ) AS deal_id
)
SELECT 'CERT' AS loai, c.cert_number AS ma, c.status AS trang_thai,
       'NM:' || COALESCE(c.factory_signer_name,'chưa') ||
       ' / ĐL:' || COALESCE(c.partner_signer_name,'chưa') AS ky,
       'file=' || CASE WHEN c.factory_file_url IS NOT NULL THEN 'có' ELSE 'KHÔNG' END ||
       ' · sigNM=' || CASE WHEN c.factory_signature_url IS NOT NULL THEN 'có' ELSE '-' END ||
       ' · sigĐL=' || CASE WHEN c.partner_signature_url IS NOT NULL THEN 'có' ELSE '-' END AS chu_ky,
       'cert.final_value=' || COALESCE(c.final_value::text,'NULL') ||
       ' vs deal.final_value=' || COALESCE(d.final_value::text,'NULL') ||
       CASE WHEN c.final_value IS DISTINCT FROM d.final_value THEN '  ⚠ LỆCH' ELSE '  ✓' END AS doi_chieu,
       c.created_at AS thoi_diem
FROM b2b.production_completion_certs c
JOIN t ON c.deal_id = t.deal_id
JOIN public.b2b_deals d ON d.id = c.deal_id
UNION ALL
SELECT 'GIÁM SÁT', s.supervisor_name, s.status,
       COALESCE(s.supervisor_phone,'-'),
       'checkin=' || COALESCE(to_char(s.checked_in_at,'YYYY-MM-DD HH24:MI'),'chưa'),
       'assigned=' || COALESCE(to_char(s.assigned_at,'YYYY-MM-DD HH24:MI'),'-'),
       s.assigned_at
FROM b2b.deal_supervisors s
JOIN t ON s.deal_id = t.deal_id
ORDER BY thoi_diem NULLS FIRST;


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN 3 — DÒNG TIỀN: TẠM ỨNG + QUYẾT TOÁN + SỔ CÔNG NỢ (cho deal ở PHẦN 1)
-- Ledger nối deal qua settlement_id / advance_id (KHÔNG có deal_id trực tiếp).
-- BÔI ĐEN từ "WITH t" tới hết.
-- ════════════════════════════════════════════════════════════════════════════
WITH t AS (
  SELECT COALESCE(
    (SELECT id FROM public.b2b_deals WHERE deal_number = 'DEAL-XXXX'),  -- <— SỬA (khớp PHẦN 1)
    (SELECT id FROM public.b2b_deals WHERE purchase_type='drc_after_production'
       ORDER BY created_at DESC LIMIT 1)
  ) AS deal_id
),
se AS ( SELECT id, code FROM public.b2b_settlements s, t WHERE s.deal_id = t.deal_id ),
ad AS ( SELECT id FROM public.b2b_advances a, t WHERE a.deal_id = t.deal_id )
SELECT 'TẠM ỨNG' AS loai, a.status AS trang_thai,
       NULL::numeric AS debit, NULL::numeric AS credit, NULL::numeric AS so_du,
       NULL AS reference_code, a.created_at AS thoi_diem
FROM public.b2b_advances a, t WHERE a.deal_id = t.deal_id
UNION ALL
SELECT 'QUYẾT TOÁN', s.status,
       s.gross_amount, NULL, NULL, s.code, s.created_at
FROM public.b2b_settlements s, t WHERE s.deal_id = t.deal_id
UNION ALL
SELECT 'LEDGER · ' || l.entry_type, NULL,
       l.debit, l.credit, l.running_balance, l.reference_code, l.created_at
FROM public.b2b_partner_ledger l
WHERE l.settlement_id IN (SELECT id FROM se)
   OR l.advance_id    IN (SELECT id FROM ad)
ORDER BY thoi_diem NULLS FIRST;


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN 4 — TỔNG QUAN MỌI DEAL CHẠY ĐẦU RA (mỗi deal 1 dòng + chặng đang ở)
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  d.deal_number AS "Deal",
  p.name        AS "Đại lý",
  d.status      AS "TT deal",
  CASE WHEN EXISTS (SELECT 1 FROM public.weighbridge_tickets w WHERE w.deal_id=d.id AND w.completed_at IS NOT NULL) THEN '✅' ELSE '⬜' END AS "1.Cân",
  CASE WHEN EXISTS (SELECT 1 FROM public.stock_in_orders s WHERE s.deal_id=d.id AND s.confirmed_at IS NOT NULL) OR COALESCE(d.stock_in_count,0)>0 THEN '✅' ELSE '⬜' END AS "2.Kho",
  CASE WHEN COALESCE(d.sample_drc,0)>0 THEN '✅' ELSE '⬜' END AS "3.QCs",
  CASE WHEN d.status IN ('accepted','settled') THEN '✅' ELSE '⬜' END AS "4.BGĐ",
  CASE WHEN EXISTS (SELECT 1 FROM public.b2b_advances a WHERE a.deal_id=d.id AND a.status IN ('acknowledged','paid')) THEN '✅' ELSE '⬜' END AS "5.Ứng",
  CASE WHEN d.production_started_at IS NOT NULL THEN '✅' ELSE '⬜' END AS "6.SX",
  CASE WHEN COALESCE(d.finished_product_kg,0)>0 THEN '✅' ELSE '⬜' END AS "7.TP",
  CASE WHEN COALESCE(d.actual_drc,0)>0 THEN '✅' ELSE '⬜' END AS "8.QCf",
  CASE WHEN EXISTS (SELECT 1 FROM public.b2b_settlements s WHERE s.deal_id=d.id AND s.approved_at IS NOT NULL) THEN '✅' ELSE '⬜' END AS "9.QT",
  CASE WHEN d.status='settled' OR EXISTS (SELECT 1 FROM public.b2b_settlements s WHERE s.deal_id=d.id AND s.status='paid') THEN '✅' ELSE '⬜' END AS "10.Chi",
  CASE WHEN EXISTS (SELECT 1 FROM b2b.production_completion_certs c WHERE c.deal_id=d.id) THEN '📄' ELSE '—' END AS "Cert",
  CASE WHEN EXISTS (SELECT 1 FROM b2b.deal_supervisors v WHERE v.deal_id=d.id) THEN '👤' ELSE '—' END AS "GS"
FROM public.b2b_deals d
LEFT JOIN public.b2b_partners p ON p.id = d.partner_id
WHERE d.purchase_type = 'drc_after_production'
ORDER BY d.created_at DESC;


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN 5 — FINDINGS TỰ ĐỘNG (đứt mạch / sai thứ tự / thiếu bước)
-- 0 dòng = luồng sạch. severity 🔴 nghiêm trọng · 🟡 cần xem · ℹ️ thông tin.
-- BÔI ĐEN từ "WITH x" tới hết.
-- ════════════════════════════════════════════════════════════════════════════
WITH x AS (
  SELECT d.*,
    EXISTS (SELECT 1 FROM b2b.production_completion_certs c WHERE c.deal_id=d.id) AS has_cert,
    (SELECT c.status FROM b2b.production_completion_certs c WHERE c.deal_id=d.id LIMIT 1) AS cert_status,
    EXISTS (SELECT 1 FROM b2b.deal_supervisors v WHERE v.deal_id=d.id) AS has_sup,
    EXISTS (SELECT 1 FROM public.b2b_settlements s WHERE s.deal_id=d.id) AS has_sett
  FROM public.b2b_deals d
  WHERE d.purchase_type = 'drc_after_production'
),
fnd AS (
  -- 🔴 Có actual_drc / thành phẩm nhưng deal vẫn chưa được duyệt (sai thứ tự nặng)
  SELECT 1 sort, '🔴' sev, 'F1 đã ra thành phẩm nhưng deal chưa accepted/settled' chk,
         deal_number, 'status=' || status || ' finished=' || COALESCE(finished_product_kg::text,'-') detail
  FROM x WHERE COALESCE(finished_product_kg,0) > 0 AND status NOT IN ('accepted','settled','cancelled')
  UNION ALL
  -- 🔴 actual_drc đã đo mà chưa ra thành phẩm (QC final trước khi có TP)
  SELECT 1, '🔴', 'F2 có actual_drc nhưng finished_product_kg ≤ 0 (QC final trước SX)',
         deal_number, 'actual_drc=' || actual_drc::text || ' finished=' || COALESCE(finished_product_kg::text,'-')
  FROM x WHERE COALESCE(actual_drc,0) > 0 AND COALESCE(finished_product_kg,0) <= 0
  UNION ALL
  -- 🔴 final_value > 0 nhưng thiếu 1 trong 3 thành phần công thức (finished×actual×unit)
  SELECT 1, '🔴', 'F3 có final_value nhưng thiếu finished/actual/unit_price (công thức gãy)',
         deal_number, 'final=' || final_value::text || ' finished=' || COALESCE(finished_product_kg::text,'-') ||
         ' actual=' || COALESCE(actual_drc::text,'-') || ' unit=' || COALESCE(unit_price::text,'-')
  FROM x WHERE COALESCE(final_value,0) > 0
    AND (COALESCE(finished_product_kg,0) <= 0 OR COALESCE(actual_drc,0) <= 0 OR COALESCE(unit_price,0) <= 0)
  UNION ALL
  -- 🟡 Đã có thành phẩm nhưng CHƯA lập phiếu chốt
  SELECT 2, '🟡', 'F4 đã ra thành phẩm nhưng CHƯA lập phiếu chốt thành phẩm',
         deal_number, 'finished=' || finished_product_kg::text || 'kg'
  FROM x WHERE COALESCE(finished_product_kg,0) > 0 AND NOT has_cert
  UNION ALL
  -- 🟡 Cert đã ký đủ 2 bên nhưng deal chưa settled / chưa có quyết toán
  SELECT 2, '🟡', 'F5 cert fully_signed nhưng deal chưa settled / chưa có quyết toán',
         deal_number, 'cert=' || cert_status || ' deal_status=' || status || ' has_sett=' || has_sett::text
  FROM x WHERE cert_status = 'fully_signed' AND (status <> 'settled' OR NOT has_sett)
  UNION ALL
  -- 🟡 Đã bắt đầu SX (hoặc accepted) nhưng CHƯA cử người giám sát
  SELECT 2, '🟡', 'F6 deal đang chạy nhưng CHƯA cử người giám sát',
         deal_number, 'status=' || status
  FROM x WHERE status NOT IN ('pending','cancelled') AND NOT has_sup
  UNION ALL
  -- ℹ️ Deal settled nhưng KHÔNG có dòng công nợ nào (ledger trống)
  SELECT 3, 'ℹ️', 'F7 deal settled nhưng ledger không có dòng nào liên quan',
         deal_number, 'status=settled'
  FROM x WHERE status = 'settled'
    AND NOT EXISTS (
      SELECT 1 FROM public.b2b_partner_ledger l
      WHERE l.settlement_id IN (SELECT id FROM public.b2b_settlements s WHERE s.deal_id = x.id)
         OR l.advance_id    IN (SELECT id FROM public.b2b_advances    a WHERE a.deal_id = x.id))
)
SELECT sev AS "⚠", chk AS "Kiểm tra", deal_number AS "Deal", detail AS "Chi tiết"
FROM fnd ORDER BY sort, chk, deal_number;
