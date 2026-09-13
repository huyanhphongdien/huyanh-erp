# Fixture lương thời vụ & công nhân Lào – tháng 08/2026
Nguồn: file "ĐNTT CÔNG NHÂN THỜI VỤ THÁNG 8 16-31", "BẢNG LƯƠNG CÔNG NHÂN THỜI VỤ HAQT THÁNG 08.2026", sheet "Công nhân Lào" (HAPĐ).
- groups.csv: định mức theo nhóm (đơn giá, giờ/công, hỗ trợ ngày/đêm, tiền ăn, ngày chia, làm tròn)
- employees.csv: người, nhóm chính, hình thức (Lương ngày / Lương ca / Lương tháng / Khoán tháng), lương tháng, tổ, vai trò
- timesheet_entries.csv: value = giờ hoặc giờ+N (ca đêm), theo (người, nhóm)
- piece_tonnage.csv: sản lượng khoán theo ngày/tổ và bốc xếp đích danh; piece_participation.csv: ai tham gia ngày nào (x = tổ mình, "Tổ n" = đi theo tổ khác)
- adjustments.csv: cộng/tạm ứng/trừ, có LAK
- expected.json: xem "note" – phần nào khớp tuyệt đối, phần nào là quy tắc đề xuất
