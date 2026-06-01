-- ============================================================================
-- AUDIT QUY TRÌNH "CHẠY ĐẦU RA" (purchase_type = 'drc_after_production')
-- File: docs/migrations/audit_chay_dau_ra_2026_05.sql
-- Tác giả: review tự động — chạy READ-ONLY trong Supabase SQL Editor.
-- KHÔNG INSERT/UPDATE/DELETE. An toàn chạy trên DB DEMO/prod.
--
-- CÁCH DÙNG:
--   Supabase SQL Editor mặc định chỉ hiện kết quả của câu lệnh CUỐI khi chạy cả
--   file. Vì vậy mỗi PHẦN được viết thành 1 câu SELECT độc lập — BÔI ĐEN khối
--   muốn xem rồi Ctrl/Cmd+Enter để chạy riêng. PHẦN B (findings) là phần chính.
--
-- PHẠM VI BẢNG:
--   b2b.deals                          -- deal (cột purchase_type, finished_product_kg…)
--   b2b.partners                       -- đại lý
--   b2b.deal_supervisors               -- người giám sát đại lý cử
--   b2b.production_completion_certs     -- phiếu chốt thành phẩm (ký 2 bên)
--   public.b2b_notifications           -- thông báo (type='completion_cert_pending')
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN A — KIỂM TRA DDL (bảng / cột / constraint / index / RLS / grant / trigger)
-- ════════════════════════════════════════════════════════════════════════════

-- A1. Bảng có tồn tại không (NULL = CHƯA chạy migration)
SELECT
  to_regclass('b2b.deal_supervisors')              AS deal_supervisors,
  to_regclass('b2b.production_completion_certs')   AS completion_certs,
  to_regclass('b2b.deals')                         AS deals,
  to_regclass('b2b.partners')                      AS partners,
  to_regclass('public.b2b_notifications')          AS notifications;

-- A2. Cột của 2 bảng mới (đối chiếu với interface ở code)
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'b2b'
  AND table_name IN ('production_completion_certs', 'deal_supervisors')
ORDER BY table_name, ordinal_position;

-- A2b. b2b.deals có đủ cột flow chạy đầu ra không?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'deals'
  AND column_name IN ('purchase_type','deal_type','finished_product_kg',
                      'sample_drc','actual_drc','unit_price','final_value',
                      'quantity_kg','production_started_at','status')
ORDER BY column_name;

-- A3. Constraint (PK / UNIQUE / FK) — kỳ vọng:
--   production_completion_certs: PK(id), UNIQUE(cert_number), UNIQUE(deal_id),
--                                FK deal_id->b2b.deals, FK partner_id->b2b.partners
--   deal_supervisors: PK(id), FK deal_id->b2b.deals, FK partner_id->b2b.partners
SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
       string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
WHERE tc.table_schema = 'b2b'
  AND tc.table_name IN ('production_completion_certs', 'deal_supervisors')
GROUP BY tc.table_name, tc.constraint_type, tc.constraint_name
ORDER BY tc.table_name, tc.constraint_type;

-- A4. Index
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'b2b'
  AND tablename IN ('production_completion_certs', 'deal_supervisors')
ORDER BY tablename, indexname;

-- A5. RLS bật chưa + policy
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       p.polname AS policy, p.polcmd AS cmd
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'b2b'
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname IN ('production_completion_certs', 'deal_supervisors')
ORDER BY c.relname, p.polname;

-- A6. Grant cho anon/authenticated (Portal + ERP đọc/ghi được không)
SELECT table_name, grantee, string_agg(privilege_type, ', ') AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'b2b'
  AND table_name IN ('production_completion_certs', 'deal_supervisors')
  AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- A7. Trigger updated_at trên cert
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'b2b'
  AND event_object_table = 'production_completion_certs';


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN B — AUDIT TOÀN VẸN DỮ LIỆU + STATE MACHINE  ★ PHẦN CHÍNH ★
-- Trả về 1 bảng findings. 0 dòng = sạch. Bôi đen TỪ "WITH" tới hết rồi chạy.
-- severity: 🔴 lỗi nghiêm trọng · 🟡 cần xem · ℹ️ thông tin
-- ════════════════════════════════════════════════════════════════════════════
WITH c AS (
  SELECT cert.*, d.deal_number, d.purchase_type, d.partner_id AS deal_partner_id,
         d.finished_product_kg AS deal_finished_kg, d.final_value AS deal_final_value,
         d.status AS deal_status, p.name AS partner_name
  FROM b2b.production_completion_certs cert
  JOIN b2b.deals d    ON d.id = cert.deal_id
  LEFT JOIN b2b.partners p ON p.id = cert.partner_id
),
findings AS (
  -- ── 🔴 STATE MACHINE / CHỮ KÝ ──────────────────────────────────────────────
  SELECT 1 sort, '🔴' sev, 'B1 pending_partner thiếu chữ ký nhà máy' chk,
         deal_number, partner_name, cert_number AS detail
  FROM c WHERE status='pending_partner' AND factory_signature_url IS NULL
  UNION ALL
  SELECT 1, '🔴', 'B2 pending_partner thiếu FILE phiếu nhà máy',
         deal_number, partner_name, cert_number
  FROM c WHERE status='pending_partner' AND factory_file_url IS NULL
  UNION ALL
  SELECT 1, '🔴', 'B3 fully_signed nhưng thiếu chữ ký/đại lý',
         deal_number, partner_name, cert_number
  FROM c WHERE status='fully_signed' AND (partner_signature_url IS NULL OR partner_signed_at IS NULL)
  UNION ALL
  SELECT 1, '🔴', 'B4 fully_signed nhưng thiếu chữ ký nhà máy',
         deal_number, partner_name, cert_number
  FROM c WHERE status='fully_signed' AND factory_signed_at IS NULL
  UNION ALL
  -- ── 🔴 LIÊN KẾT SAI ────────────────────────────────────────────────────────
  SELECT 1, '🔴', 'B5 partner_id cert ≠ partner_id deal',
         deal_number, partner_name, cert_number
  FROM c WHERE partner_id IS DISTINCT FROM deal_partner_id
  UNION ALL
  SELECT 1, '🔴', 'B6 có cert nhưng deal KHÔNG phải drc_after_production',
         deal_number, partner_name, 'purchase_type=' || COALESCE(purchase_type,'NULL')
  FROM c WHERE purchase_type IS DISTINCT FROM 'drc_after_production'
  UNION ALL
  -- ── 🟡 THỨ TỰ / SOFT-REF ───────────────────────────────────────────────────
  SELECT 2, '🟡', 'B7 draft nhưng đã có chữ ký đại lý (sai thứ tự)',
         deal_number, partner_name, cert_number
  FROM c WHERE status='draft' AND partner_signature_url IS NOT NULL
  UNION ALL
  SELECT 2, '🟡', 'B8 đại lý ký TRƯỚC nhà máy (sai thứ tự)',
         deal_number, partner_name, cert_number
  FROM c WHERE partner_signed_at IS NOT NULL AND factory_signed_at IS NOT NULL
    AND partner_signed_at < factory_signed_at
  UNION ALL
  SELECT 2, '🟡', 'B9 supervisor_id soft-ref GÃY (không có trong deal_supervisors)',
         deal_number, partner_name, supervisor_id::text
  FROM c WHERE supervisor_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM b2b.deal_supervisors s WHERE s.id = c.supervisor_id)
  UNION ALL
  SELECT 2, '🟡', 'B10 cert thiếu KL thành phẩm (≤0/NULL)',
         deal_number, partner_name, cert_number
  FROM c WHERE finished_product_kg IS NULL OR finished_product_kg <= 0
  UNION ALL
  -- ── ℹ️ SNAPSHOT / STUCK / THIẾU BƯỚC ───────────────────────────────────────
  SELECT 3, 'ℹ️', 'B11 snapshot final_value LỆCH deal hiện tại (có thể do deal đổi sau)',
         deal_number, partner_name,
         'cert=' || COALESCE(final_value::text,'NULL') || ' vs deal=' || COALESCE(deal_final_value::text,'NULL')
  FROM c WHERE final_value IS DISTINCT FROM deal_final_value
  UNION ALL
  SELECT 3, 'ℹ️', 'B12 cert KẸT chờ đại lý ký > 3 ngày',
         deal_number, partner_name,
         'nhà máy ký: ' || to_char(factory_signed_at, 'YYYY-MM-DD')
  FROM c WHERE status='pending_partner' AND factory_signed_at < now() - interval '3 days'

  -- ── 🟡 deal_supervisors lệch partner ───────────────────────────────────────
  UNION ALL
  SELECT 2, '🟡', 'B13 deal_supervisors.partner_id ≠ partner_id của deal',
         d.deal_number, p.name, s.supervisor_name
  FROM b2b.deal_supervisors s
  JOIN b2b.deals d ON d.id = s.deal_id
  LEFT JOIN b2b.partners p ON p.id = d.partner_id
  WHERE s.partner_id IS NOT NULL AND s.partner_id IS DISTINCT FROM d.partner_id

  -- ── ℹ️ DEAL chạy đầu ra CHƯA lập cert dù đã ra thành phẩm ───────────────────
  UNION ALL
  SELECT 3, 'ℹ️', 'B14 đã có thành phẩm nhưng CHƯA lập phiếu chốt',
         d.deal_number, p.name, 'finished_kg=' || d.finished_product_kg::text
  FROM b2b.deals d
  LEFT JOIN b2b.partners p ON p.id = d.partner_id
  WHERE d.purchase_type = 'drc_after_production'
    AND COALESCE(d.finished_product_kg,0) > 0
    AND NOT EXISTS (SELECT 1 FROM b2b.production_completion_certs c2 WHERE c2.deal_id = d.id)

  -- ── ℹ️ DEAL chạy đầu ra CHƯA cử giám sát ────────────────────────────────────
  UNION ALL
  SELECT 3, 'ℹ️', 'B15 deal chạy đầu ra CHƯA cử người giám sát',
         d.deal_number, p.name, 'status=' || d.status
  FROM b2b.deals d
  LEFT JOIN b2b.partners p ON p.id = d.partner_id
  WHERE d.purchase_type = 'drc_after_production'
    AND d.status NOT IN ('cancelled','draft')
    AND NOT EXISTS (SELECT 1 FROM b2b.deal_supervisors s WHERE s.deal_id = d.id)
)
SELECT sev AS "⚠", chk AS "Kiểm tra", deal_number AS "Deal", partner_name AS "Đại lý", detail AS "Chi tiết"
FROM findings
ORDER BY sort, chk, deal_number;


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN C — TRACE 1 DEAL END-TO-END (đặt deal_number cần soi vào :target)
-- Đổi giá trị ở dòng `WITH t AS` rồi bôi đen từ "WITH t" tới hết để chạy.
-- ════════════════════════════════════════════════════════════════════════════
WITH t AS (
  -- ▼▼ ĐỔI deal_number Ở ĐÂY (hoặc để NULL để tự lấy deal chạy đầu ra mới nhất) ▼▼
  SELECT COALESCE(
    (SELECT id FROM b2b.deals WHERE deal_number = 'PCTP-XXXX'),  -- <— sửa
    (SELECT id FROM b2b.deals
       WHERE purchase_type='drc_after_production'
       ORDER BY created_at DESC LIMIT 1)
  ) AS deal_id
)
SELECT 'DEAL'   AS phan, d.deal_number AS ma, d.status AS trang_thai,
       d.purchase_type AS loai,
       'finished='||COALESCE(d.finished_product_kg::text,'-')||
       ' final='||COALESCE(d.final_value::text,'-') AS so_lieu,
       d.created_at AS thoi_diem
FROM b2b.deals d, t WHERE d.id = t.deal_id
UNION ALL
SELECT 'GIÁM SÁT', s.supervisor_name,
       s.status, COALESCE(s.supervisor_phone,'-'),
       'checkin='||COALESCE(to_char(s.checked_in_at,'YYYY-MM-DD HH24:MI'),'chưa'),
       s.assigned_at
FROM b2b.deal_supervisors s, t WHERE s.deal_id = t.deal_id
UNION ALL
SELECT 'CERT', c.cert_number, c.status,
       'NM:'||COALESCE(c.factory_signer_name,'chưa')||' / ĐL:'||COALESCE(c.partner_signer_name,'chưa'),
       'file='||CASE WHEN c.factory_file_url IS NOT NULL THEN 'có' ELSE 'KHÔNG' END||
       ' sigNM='||CASE WHEN c.factory_signature_url IS NOT NULL THEN 'có' ELSE '-' END||
       ' sigĐL='||CASE WHEN c.partner_signature_url IS NOT NULL THEN 'có' ELSE '-' END,
       c.created_at
FROM b2b.production_completion_certs c, t WHERE c.deal_id = t.deal_id
UNION ALL
SELECT 'NHẬP KHO', so.code, so.status,
       COALESCE(so.total_weight::text,'-')||' kg', '', so.created_at
FROM public.stock_in_orders so, t WHERE so.deal_id = t.deal_id
UNION ALL
SELECT 'QUYẾT TOÁN', st.code, st.status,
       'tổng='||COALESCE(st.gross_amount::text,'-'), '', st.created_at
FROM public.b2b_settlements st, t WHERE st.deal_id = t.deal_id
UNION ALL
SELECT 'THÔNG BÁO', n.type, CASE WHEN n.is_read THEN 'đã đọc' ELSE 'chưa đọc' END,
       n.title, COALESCE(n.link_url,'-'), n.created_at
FROM public.b2b_notifications n, t WHERE n.deal_id = t.deal_id
ORDER BY thoi_diem NULLS FIRST;


-- ════════════════════════════════════════════════════════════════════════════
-- PHẦN D — TỔNG HỢP NHANH (đếm theo trạng thái)
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM b2b.deals WHERE purchase_type='drc_after_production')         AS deals_chay_dau_ra,
  (SELECT count(*) FROM b2b.production_completion_certs)                              AS tong_cert,
  (SELECT count(*) FROM b2b.production_completion_certs WHERE status='draft')          AS cert_draft,
  (SELECT count(*) FROM b2b.production_completion_certs WHERE status='pending_partner')AS cert_cho_dai_ly,
  (SELECT count(*) FROM b2b.production_completion_certs WHERE status='fully_signed')   AS cert_da_ky_du,
  (SELECT count(*) FROM b2b.deal_supervisors)                                          AS tong_giam_sat,
  (SELECT count(*) FROM b2b.deal_supervisors WHERE checked_in_at IS NOT NULL)          AS giam_sat_co_mat;
