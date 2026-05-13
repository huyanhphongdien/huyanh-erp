-- ============================================================================
-- Tạo 24 task tháng T05/2026 cho Trần Duy Hoàng — Xây dựng / QLSX
-- Date: 2026-05-09
-- Source: Bao_cao_T04_Ke_hoach_T05_2026_HoanChinhh.xlsx (Section III + II tồn đọng)
-- ============================================================================
--
-- CƠ CHẾ:
--   Mỗi đầu mục công việc = 1 task độc lập + 1 checklist item duy nhất.
--   - Tick checklist (qua UI) → bắt buộc upload evidence (nếu requires_evidence=TRUE)
--   - Checklist 100% → task auto-finish + score 85 (self-task, auto-approved)
--   Tất cả task có suffix " - Kế hoạch CV T05/2026" để filter theo tháng.
--
-- TITLE CHECKLIST theo nhóm:
--   - Thi công (17 + #16): "Hoàn thành & nộp ảnh nghiệm thu" (requires_evidence=TRUE)
--   - Mua vật tư (#18):    "Hoàn thành & nộp hoá đơn"      (requires_evidence=TRUE)
--   - Hỗ trợ routine (#19-21): "Hoàn thành công việc"      (requires_evidence=FALSE)
--   - Tồn đọng (#22-24):   "Hoàn thành & nộp văn bản chốt" (requires_evidence=TRUE)
--
-- TÁI SỬ DỤNG cho tháng sau:
--   Copy file SQL → đổi tên "T06_2026" → cập nhật 24 dòng INSERT + ngày start/due → run.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_tdh_id        UUID;
  v_dept_qlsx_id  UUID;
  v_count         INT;
BEGIN
  -- ── Lookup employee Trần Duy Hoàng + department QLSX ─────────────────────
  SELECT id INTO v_tdh_id
  FROM employees
  WHERE full_name ILIKE '%Trần Duy Hoàng%' AND status = 'active'
  LIMIT 1;

  IF v_tdh_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy employee Trần Duy Hoàng (active). Kiểm tra bảng employees.';
  END IF;

  SELECT id INTO v_dept_qlsx_id
  FROM departments
  WHERE (code = 'QLSX' OR name ILIKE '%Quản lý sản xuất%')
  LIMIT 1;

  IF v_dept_qlsx_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy department QLSX (Quản lý sản xuất).';
  END IF;

  RAISE NOTICE 'Trần Duy Hoàng id=%, QLSX dept id=%', v_tdh_id, v_dept_qlsx_id;

  -- ── Bulk insert 24 tasks ─────────────────────────────────────────────────
  INSERT INTO tasks (
    name, description, notes,
    department_id, assignee_id, assigner_id,
    status, priority, progress, progress_mode,
    start_date, due_date,
    task_source, is_self_assigned
  ) VALUES
    -- ════ Section III.A: Thi công xây dựng & hạ tầng (17 tasks) ════
    (
      '[Đội Sơn] Thi công (phần thô) 2 phòng nghỉ CBCC cấp cao - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 4 người. Khu phơi đồ, WC riêng.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-18', '2026-05-15',
      'self', TRUE
    ),
    (
      '[Đội khoán] Vạch kẻ khu để xe ô tô, xe 16 chỗ - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, bàn giao mặt bằng cho đội cơ khí. Nhân lực: 2 người. ★ Ưu tiên bàn giao.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'high', 0, 'manual',
      '2026-04-15', '2026-04-19',
      'self', TRUE
    ),
    (
      '[Đội Sơn] Cải tạo mặt bằng nền & đổ bê tông khu xuất hàng mới - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 6-7 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-30', '2026-05-20',
      'self', TRUE
    ),
    (
      '[Đội Quốc] Đổ bê tông nền mở rộng tại trạm cân mới - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 3 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-01', '2026-05-25',
      'self', TRUE
    ),
    (
      '[Đội Sơn] Mương nước thải mới cạnh mương hiện tại (dốc cao) - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 4 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-01', '2026-05-30',
      'self', TRUE
    ),
    (
      '[Đội Chúc] Bê tông đường dốc cao lên bãi nguyên liệu - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện sớm. Nhân lực: 5 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'draft', 'medium', 0, 'manual',
      '2026-05-25', '2026-06-15',
      'self', TRUE
    ),
    (
      '[Đội Sơn] Sửa chữa, cải tạo lam dốc khu vực xuất hàng - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện và bàn giao mặt bằng. Nhân lực: 4 người.',
      '[KHÓ KHĂN] Sản xuất liên tục, không thể tạm dừng để thi công. [HƯỚNG GIẢI QUYẾT] Chờ kế hoạch tạm dừng SX ≥5 ngày để tiến hành thi công.',
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'high', 0, 'manual',
      '2026-05-05', '2026-05-15',
      'self', TRUE
    ),
    (
      '[Đội Quốc] Đắp đất, cải tạo MB, đổ bê tông nền dãy nhà phía sau cạnh gara - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện sớm nhất để bàn giao mặt bằng. Nhân lực: 2-3 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-01', '2026-04-25',
      'self', TRUE
    ),
    (
      '[Xuân Anh] Bổ sung & hoàn thiện bản vẽ hoàn công khu vực văn phòng - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện trước mùa mưa. Nhân lực: 1 người. ★ Ưu tiên hoàn thiện trước mùa mưa.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'high', 0, 'manual',
      '2026-04-01', '2026-05-31',
      'self', TRUE
    ),
    (
      '[Đội khoán] Hoàn thiện nhà bảo vệ mới - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 3 người.',
      '[KHÓ KHĂN] Vật tư phần mái chưa đủ (đặt hàng tại Sài Gòn, chờ vận chuyển). [HƯỚNG GIẢI QUYẾT] Lập kế hoạch dự chi, đặt hàng và nhận hàng theo tiến độ.',
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'high', 0, 'manual',
      '2026-05-01', '2026-05-31',
      'self', TRUE
    ),
    (
      '[Đội Quốc] Cải tạo, mở rộng đường kết nối hồ XLNT – VP (bó vỉa 2 bên) - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 3 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-25', '2026-05-15',
      'self', TRUE
    ),
    (
      '[Đội khoán] Tường bao, WC, bồn rửa tay, bệ tiểu nam, khu phơi đồ mới - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 3 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-01', '2026-05-20',
      'self', TRUE
    ),
    (
      '[Đội Chúc] Đập phá phòng Mr. Praphat & hoàn thiện kết nối hành lang VP - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 2-3 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-23', '2026-05-05',
      'self', TRUE
    ),
    (
      '[Đội Chúc] Xử lý tường bao bị sự cố tại hồ XLNT - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 4 người. Xử lý sự cố khẩn cấp.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-24', '2026-04-27',
      'self', TRUE
    ),
    (
      '[Đội Chúc] Sơn trụ, xà gồ, vẽ khu vực gara nhà để xe nhân viên - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 3 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-24', '2026-04-30',
      'self', TRUE
    ),
    (
      '[Hoàng] Chuẩn bị khoán đúc gạch bờ lô tại NM HAPĐ - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện sớm nhất. Nhân lực: 2 người.',
      '[KHÓ KHĂN] Khu vực cần đúc bờ lô chưa có điện 3 pha; máy trộn hỏng motor. [HƯỚNG GIẢI QUYẾT] Đội điện kéo dây điện 3 pha; sửa chữa/thay thế motor máy trộn.',
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'high', 0, 'manual',
      '2026-04-20', '2026-05-10',
      'self', TRUE
    ),
    (
      '[Đội Chúc + cơ khí] Sửa chữa, cải tạo mương nước thải tại sân chứa bãi NL - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thiện, trả mặt bằng sớm nhất. Nhân lực: 4 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-04-18', '2026-04-23',
      'self', TRUE
    ),

    -- ════ Section III.B: Mua sắm vật tư & hỗ trợ vận hành (4 tasks) ════
    (
      '[Hoàng] Hỗ trợ mua vật tư xây dựng phục vụ các công tác hiện tại - Kế hoạch CV T05/2026',
      'Yêu cầu: Cung cấp đúng, đủ, kịp thời theo quy trình mua hàng. Nhân lực: 1 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-05-01', '2026-05-31',
      'self', TRUE
    ),
    (
      '[Hoàng] Hỗ trợ làm hồ sơ tạm ứng cho tài xế, cán bộ đi công tác - Kế hoạch CV T05/2026',
      'Yêu cầu: Hoàn thành đúng hạn, đúng quy trình. Nhân lực: 1 người. Tuyến: Lào, Bình Dương, HCM, Gia Lai, Cảng.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-05-01', '2026-05-31',
      'self', TRUE
    ),
    (
      '[Hoàng] Hỗ trợ công ty lái xe ô tô đưa đón CBNV - Kế hoạch CV T05/2026',
      'Yêu cầu: Đảm bảo an toàn, đúng giờ. Nhân lực: 3 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-05-01', '2026-05-31',
      'self', TRUE
    ),
    (
      '[Hoàng] Hỗ trợ công ty lái xe ô tô đưa hồ sơ kế toán - Kế hoạch CV T05/2026',
      'Yêu cầu: Đảm bảo an toàn, đúng giờ. Nhân lực: 3 người.',
      NULL,
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'medium', 0, 'manual',
      '2026-05-01', '2026-05-31',
      'self', TRUE
    ),

    -- ════ Section II: Tồn đọng CHƯA có trong KH (3 tasks) ════
    (
      '[Hoàng] Tìm nhà thầu phòng họp mới & phòng cô/sếp - Kế hoạch CV T05/2026',
      'Yêu cầu: Chốt nhà thầu + bản vẽ nội thất; xin phê duyệt bổ sung danh mục ưu tiên đầu tư.',
      '[KHÓ KHĂN] Chưa chốt được nhà thầu và bản vẽ nội thất; chưa nằm trong danh mục ưu tiên đầu tư. [HƯỚNG GIẢI QUYẾT] Tìm kiếm nhà thầu phù hợp; xin phê duyệt bổ sung danh mục ưu tiên.',
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'high', 0, 'manual',
      '2026-05-01', '2026-06-30',
      'self', TRUE
    ),
    (
      '[Hoàng] Đề xuất bổ sung kinh phí mua cát/đá/xi cho công tác cải tạo - Kế hoạch CV T05/2026',
      'Yêu cầu: Tranh thủ thời tiết tốt; đề xuất cấp kinh phí bổ sung kịp thời cho các công tác cải tạo đường, BTCT.',
      '[KHÓ KHĂN] Nguồn kinh phí đầu năm còn hạn chế, chưa cấp đủ vật tư cát/đá/xi măng. [HƯỚNG GIẢI QUYẾT] Tranh thủ thời tiết tốt; đề xuất cấp kinh phí bổ sung kịp thời.',
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'high', 0, 'manual',
      '2026-05-01', '2026-05-31',
      'self', TRUE
    ),
    (
      '[Hoàng] Dự toán KL còn lại cổng Tân Mỹ để đàm phán/đền bù với TDP - Kế hoạch CV T05/2026',
      'Yêu cầu: Dự toán khối lượng còn lại, quy ra tiền để đàm phán/đền bù chính thức với TDP.',
      '[KHÓ KHĂN] Tạm dừng thi công; TDP yêu cầu bồi thường phần khối lượng còn lại. [HƯỚNG GIẢI QUYẾT] Dự toán khối lượng còn lại, quy ra tiền để đàm phán/đền bù chính thức.',
      v_dept_qlsx_id, v_tdh_id, v_tdh_id,
      'in_progress', 'high', 0, 'manual',
      '2026-05-01', '2026-05-31',
      'self', TRUE
    );

  -- ── Insert 1 checklist item per task ─────────────────────────────────────
  -- Title + requires_evidence quyết định theo pattern matching trên tên task.
  -- Trật tự CASE quan trọng: pattern cụ thể đi trước, default cuối.
  INSERT INTO task_checklist_items (task_id, title, sort_order, requires_evidence)
  SELECT
    t.id,
    CASE
      -- Hỗ trợ routine (lái xe + hồ sơ tạm ứng) — không cần evidence
      WHEN t.name LIKE '%[Hoàng] Hỗ trợ làm hồ sơ tạm ứng%'
        OR t.name LIKE '%[Hoàng] Hỗ trợ công ty lái xe%'
        THEN 'Hoàn thành công việc'
      -- Mua vật tư XD — nộp hoá đơn
      WHEN t.name LIKE '%[Hoàng] Hỗ trợ mua vật tư%'
        THEN 'Hoàn thành & nộp hoá đơn'
      -- Tồn đọng (Section II) — nộp văn bản chốt
      WHEN t.name LIKE '%[Hoàng] Tìm nhà thầu phòng họp%'
        OR t.name LIKE '%[Hoàng] Đề xuất bổ sung kinh phí%'
        OR t.name LIKE '%[Hoàng] Dự toán KL còn lại cổng Tân Mỹ%'
        THEN 'Hoàn thành & nộp văn bản chốt'
      -- Default: thi công xây dựng — ảnh nghiệm thu
      ELSE 'Hoàn thành & nộp ảnh nghiệm thu'
    END AS title,
    0 AS sort_order,
    CASE
      -- Routine không cần evidence
      WHEN t.name LIKE '%[Hoàng] Hỗ trợ làm hồ sơ tạm ứng%'
        OR t.name LIKE '%[Hoàng] Hỗ trợ công ty lái xe%'
        THEN FALSE
      ELSE TRUE
    END AS requires_evidence
  FROM tasks t
  WHERE t.name LIKE '%- Kế hoạch CV T05/2026'
    AND t.assignee_id = v_tdh_id;

  -- ── Verify ──────────────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_count
  FROM tasks
  WHERE name LIKE '%- Kế hoạch CV T05/2026'
    AND assignee_id = v_tdh_id;

  RAISE NOTICE 'Đã tạo % task có suffix "- Kế hoạch CV T05/2026" cho TDH', v_count;

  IF v_count <> 24 THEN
    RAISE WARNING 'Số task tạo được (%) khác kỳ vọng (24). Kiểm tra lại.', v_count;
  END IF;
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY 1: Xem 24 task vừa tạo
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  t.code,
  LEFT(t.name, 70) AS name,
  t.status,
  t.priority,
  t.start_date,
  t.due_date,
  CASE WHEN t.notes IS NOT NULL THEN '⚠️' ELSE '' END AS has_obstacle
FROM tasks t
WHERE t.name LIKE '%- Kế hoạch CV T05/2026'
ORDER BY t.created_at;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY 2: Xem 24 checklist items + phân loại evidence
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  LEFT(t.name, 50) AS task_name,
  ci.title,
  ci.requires_evidence,
  ci.is_completed
FROM task_checklist_items ci
JOIN tasks t ON t.id = ci.task_id
WHERE t.name LIKE '%- Kế hoạch CV T05/2026'
ORDER BY t.created_at;

-- Tổng hợp phân nhóm checklist (mong đợi: 18 thi công + 1 hoá đơn + 3 routine + 3 văn bản chốt)
SELECT
  ci.title,
  ci.requires_evidence,
  COUNT(*) AS num_tasks
FROM task_checklist_items ci
JOIN tasks t ON t.id = ci.task_id
WHERE t.name LIKE '%- Kế hoạch CV T05/2026'
GROUP BY ci.title, ci.requires_evidence
ORDER BY ci.title;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (nếu muốn xóa lại 24 task + checklist):
-- ════════════════════════════════════════════════════════════════════════════
-- DELETE FROM tasks WHERE name LIKE '%- Kế hoạch CV T05/2026';
-- (Cascade FK sẽ tự xóa task_checklist_items)
