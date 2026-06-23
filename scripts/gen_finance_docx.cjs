// Sinh file DOCX hướng dẫn QUY TRÌNH & LUỒNG Module Tài chính.
// Chạy: node scripts/gen_finance_docx.cjs
const HTMLtoDOCX = require('html-to-docx')
const fs = require('fs')

const G = '#1B4D3E', N = '#1E3A5F'
const h1 = (t) => `<h1 style="color:${N};font-size:22pt">${t}</h1>`
const h2 = (t) => `<h2 style="color:${G};font-size:15pt">${t}</h2>`
const h3 = (t) => `<h3 style="color:${N};font-size:12.5pt">${t}</h3>`
const tbl = (head, rows) => `<table style="border-collapse:collapse;width:100%">
<tr>${head.map((c) => `<td style="border:1px solid #888;padding:5px;background:#eef2f1"><b>${c}</b></td>`).join('')}</tr>
${rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #888;padding:5px">${c}</td>`).join('')}</tr>`).join('')}
</table>`

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.5">

${h1('HƯỚNG DẪN QUY TRÌNH &amp; LUỒNG — MODULE TÀI CHÍNH')}
<p style="color:#64748b"><i>Cao Su Huy Anh · Quản lý dòng tiền: vốn vay · tiền gửi · phải thu · tồn quỹ</i></p>

${h2('A. GIỚI THIỆU &amp; MỤC TIÊU')}
<p>Module <b>Tài chính</b> giúp quản lý tập trung toàn bộ <b>dòng tiền</b> của công ty — vốn vay, tiền gửi, công nợ phải thu, tồn quỹ — thay cho cách theo dõi thủ công rời rạc.</p>
<p><b>Mục tiêu cao nhất:</b></p>
<ul>
<li>Ban giám đốc <b>nhìn một màn hình</b> là biết tuần này <b>thừa hay thiếu tiền</b>.</li>
<li><b>Không bao giờ để khoản vay quá hạn</b> dẫn tới “nhảy nhóm” CIC.</li>
</ul>
<p><b>“Nhảy nhóm CIC” là gì?</b> CIC là Trung tâm Thông tin Tín dụng. Khi một khoản vay <b>quá hạn ≥ 10 ngày</b>, ngân hàng phải xếp doanh nghiệp xuống <b>nhóm nợ 2</b> (“nợ cần chú ý”) — hậu quả: khó vay tiếp, lãi suất tăng, mất uy tín tín dụng toàn hệ thống. Module cảnh báo <b>sớm từ 7 ngày trước</b> để xử lý kịp.</p>

${h2('B. QUY TRÌNH &amp; LUỒNG DỮ LIỆU (trọng tâm)')}
<p>Module không phải các màn hình rời rạc — chúng <b>nối với nhau theo dòng tiền</b>. Có 2 luồng chính:</p>

${h3('Sơ đồ tổng (đọc từ trên xuống)')}
<p style="font-family:Consolas,monospace;background:#f4f6f8;border:1px solid #ccc;padding:8px">
[ Tiền gửi (HĐTG) + Tài sản (HĐBĐ) ]<br>
&nbsp;&nbsp;&nbsp;&nbsp;↓ đảm bảo cho<br>
[ HẠN MỨC TÍN DỤNG (HĐTD) — TRỤC · còn ROOM ]<br>
&nbsp;&nbsp;&nbsp;&nbsp;↓ rút thành<br>
[ Khoản vay ]&nbsp;→ sinh →&nbsp;[ Kỳ lãi ] [ Trả nợ ] [ Đèn CIC nhảy nhóm ]<br>
<br>
[ Phải thu (tiền VÀO) ] + [ Gốc + Lãi + Phải nộp (tiền RA) ] + [ Tồn quỹ ]<br>
&nbsp;&nbsp;&nbsp;&nbsp;↓ gộp lại<br>
[ DÒNG TIỀN TỔNG HỢP — net + tồn dự kiến/tuần · cảnh báo thiếu hụt ]
</p>

${h3('Luồng 1 — Trục Hạn mức (vốn vay)')}
<p>Đây là cách thể hiện ĐÚNG bản chất tín dụng ngân hàng:</p>
<ol>
<li><b>Hạn mức tín dụng (HĐTD)</b> là “bể” tín dụng ngân hàng cấp cho công ty. Mỗi hạn mức có: <b>Hạn mức</b> (tổng được cấp), <b>Đang vay</b> (đã rút), và <b>Room</b> = Hạn mức − Đang vay (còn vay được bao nhiêu).</li>
<li>Hạn mức <b>được chống lưng</b> bởi 2 thứ: <b>Tiền gửi (HĐTG)</b> cầm cố + <b>Tài sản đảm bảo (HĐBĐ)</b> (nhà xưởng, máy móc, xe…).</li>
<li><b>Khoản vay</b> được <b>rút ra</b> từ hạn mức → làm giảm room. Một hạn mức có thể có nhiều khoản vay.</li>
<li>Mỗi <b>khoản vay</b> sinh ra <b>Kỳ lãi</b> (lịch trả lãi từng kỳ) và nhận các lần <b>Ghi trả nợ</b> → dư nợ tự giảm.</li>
<li><b>Ngày đến hạn + dư nợ</b> quyết định <b>đèn CIC “nhảy nhóm”</b> — đây là cảnh báo lõi của module.</li>
</ol>
<p><b>Bảng đèn CIC (theo số ngày quá hạn):</b></p>
${tbl(['Đèn', 'Điều kiện', 'Ý nghĩa'], [
  ['🟢 An toàn', 'Còn &gt; 7 ngày tới hạn', 'Bình thường'],
  ['🟡 Sắp đến hạn', 'Trong 7 ngày trước hạn', 'Chuẩn bị tiền trả'],
  ['🟧 Quá hạn', 'Quá hạn 1–6 ngày', 'ĐÃ trễ — trả ngay'],
  ['🟠 Sát nhảy nhóm', 'Quá hạn 7–9 ngày', 'Sát mốc 10 ngày — KHẨN'],
  ['🔴 NGUY CƠ NHẢY NHÓM', 'Quá hạn ≥ 10 ngày', 'Đã/đang vào nhóm 2 CIC'],
  ['⚪ Đã tất toán', 'Trả hết', 'Khép khoản'],
])}

${h3('Luồng 2 — Dòng tiền (tiền vào vs tiền ra)')}
<p>Gộp tất cả thành dự báo theo tuần:</p>
<ul>
<li><b>Tiền VÀO</b> = Phải thu khách hàng đến hạn trong tuần (USD quy đổi VNĐ theo tỷ giá).</li>
<li><b>Tiền RA</b> = Gốc vay đến hạn + Lãi đến kỳ + Khoản phải nộp định kỳ.</li>
<li><b>Tồn quỹ</b> = số dư ngân hàng hiện tại (điểm xuất phát).</li>
<li><b>Net</b> = Vào − Ra. <b>Tồn dự kiến</b> = Tồn quỹ + cộng dồn Net các tuần.</li>
<li>Nếu <b>Tồn dự kiến âm</b> ở tuần nào → hiện <b>cảnh báo thiếu hụt</b> → cần đốc thu công nợ / giãn chi / dùng room hạn mức.</li>
</ul>

${h3('Bảng quan hệ giữa các phần')}
${tbl(['Từ phần', 'Quan hệ', 'Tới phần'], [
  ['Tiền gửi (HĐTG)', 'đảm bảo cho', 'Hạn mức'],
  ['Tài sản (HĐBĐ)', 'đảm bảo cho', 'Hạn mức'],
  ['Khoản vay', 'rút từ (→ tính room)', 'Hạn mức'],
  ['Khoản vay', 'sinh ra', 'Kỳ lãi + Trả nợ'],
  ['Phải thu', 'tiền VÀO', 'Dòng tiền'],
  ['Gốc + Lãi + Phải nộp', 'tiền RA', 'Dòng tiền'],
  ['Tồn quỹ', 'số dư đầu kỳ', 'Dòng tiền'],
  ['Email sáng', 'đọc trạng thái từ', 'Khoản vay · Lãi · HĐTG · Phải nộp · Hạn mức'],
  ['Đính kèm', 'gắn file vào', 'mọi đối tượng'],
])}

${h3('Xuyên suốt toàn module')}
<ul>
<li><b>Email “Tình trạng vốn vay đầu ngày”</b> (~07:00): gom cảnh báo quá hạn/nhảy nhóm · lãi đến kỳ · HĐTG cần tái tục · phải nộp định kỳ · hạn mức thiếu đảm bảo.</li>
<li><b>Đính kèm tài liệu</b>: mọi đối tượng gắn file được (khế ước, sổ tiền gửi, hoá đơn…) — lưu khu vực riêng tư, xem qua đường dẫn tạm thời.</li>
<li><b>Phân quyền</b>: chỉ Ban giám đốc &amp; Phòng kế toán xem được.</li>
</ul>

${h2('C. QUY TRÌNH NHẬP LIỆU ĐỂ TEST')}
<p><b>Quy ước ngày:</b> các ô ngày nhập <b>lệch so với HÔM NAY</b> (chọn trên lịch). “+20” = hôm nay + 20 ngày; “−12” = hôm nay − 12 ngày.</p>
<p><b>THỨ TỰ BẮT BUỘC</b> (vì phụ thuộc nhau): ① Hạn mức → ② Khoản vay → ③ Tiền gửi → ④ Tài sản → ⑤ Phải thu → ⑥ Tồn quỹ → ⑦ Phải nộp → ⑧ Lịch lãi → ⑨ Trả nợ. <i>(Phải tạo Hạn mức trước vì Khoản vay/Tiền gửi/Tài sản phải CHỌN hạn mức.)</i></p>

${h3('① Hạn mức (Vay vốn → tab Hạn mức → “Thêm hạn mức”)')}
${tbl(['Ngân hàng', 'Số HĐTD', 'Hạn mức (VNĐ)', 'Loại', 'Lãi suất'], [
  ['Vietcombank', 'VCB-2026-01', '40.000.000.000', 'Vay vốn', '6.4'],
  ['ACB', 'ACB-2026-02', '20.000.000.000', 'Chiết khấu BCT', '6.9'],
])}

${h3('② Khoản vay (tab Khoản vay → “Thêm khoản vay”) — nhớ chọn “Thuộc hạn mức”')}
${tbl(['Ngân hàng', 'Số khế ước', 'Thuộc hạn mức', 'Số vay (VNĐ)', 'Giải ngân', 'Đến hạn', 'Đèn'], [
  ['Vietcombank', 'KU-001', 'VCB-2026-01', '8.000.000.000', '−60', '+20', '🟢 An toàn'],
  ['ACB', 'KU-002', 'ACB-2026-02', '3.000.000.000', '−80', '−2', '🟧 Quá hạn'],
  ['Vietcombank', 'KU-003', 'VCB-2026-01', '2.000.000.000', '−110', '−12', '🔴 Nhảy nhóm'],
  ['ACB', 'KU-004', 'ACB-2026-02', '5.000.000.000', '−85', '+5', '🟡 Sắp đến hạn'],
])}

${h3('③ Tiền gửi (tab Tiền gửi → “Thêm HĐTG”) — chọn “Đảm bảo cho HẠN MỨC”')}
${tbl(['Ngân hàng', 'Số HĐTG', 'Số tiền (VNĐ)', 'Đảm bảo cho', 'Ngày gửi', 'Đến hạn', 'Trạng thái'], [
  ['Vietcombank', 'TG-01', '15.000.000.000', 'VCB-2026-01', '−180', '+5', 'cần tái tục gấp'],
  ['Vietcombank', 'TG-02', '10.000.000.000', 'VCB-2026-01', '−100', '+150', 'còn xa'],
  ['ACB', 'TG-03', '2.000.000.000', 'ACB-2026-02', '−200', '−3', 'QUÁ HẠN tái tục'],
])}

${h3('④ Tài sản đảm bảo (tab Tài sản ĐB → “Thêm tài sản”)')}
${tbl(['Tên tài sản', 'Loại', 'Đảm bảo cho', 'Định giá', 'Giá trị bảo đảm'], [
  ['Nhà xưởng sản xuất khu A', 'Bất động sản', 'VCB-2026-01', '18.000.000.000', '12.600.000.000'],
])}
<p><i>Cố ý KHÔNG thêm tài sản cho ACB → ACB thiếu đảm bảo (để test cảnh báo).</i></p>

${h3('⑤ Phải thu KH (“Thêm phải thu”) — Tiền tệ USD, Hạn thu để trống')}
${tbl(['Khách hàng', 'Số HĐ', 'Giá trị (USD)', 'ATD', 'Term', 'Ngày tiền về', 'Tuổi nợ'], [
  ['EVERGREEN RUBBER PTE', 'HD-01', '200000', '−88', '90', '(trống)', 'Trong hạn'],
  ['PACIFIC LATEX CO', 'HD-02', '150000', '−100', '90', '(trống)', 'Quá 1–30'],
  ['ORIENT TYRE LTD', 'HD-03', '100000', '−165', '90', '(trống)', 'Quá 61–90'],
  ['SUMMIT TRADING LLC', 'HD-04', '95000', '−120', '90', '−15', 'Đã thu'],
])}

${h3('⑥ Tồn quỹ (“Thêm TK”)')}
${tbl(['Ngân hàng', 'Số dư VNĐ', 'Số dư USD'], [
  ['Vietcombank', '3.000.000.000', '6000'],
  ['MB Bank', '2.500.000.000', '4000'],
  ['ACB', '1.200.000.000', '0'],
])}

${h3('⑦ Phải nộp định kỳ (“Thêm khoản”)')}
${tbl(['Tên', 'Nhóm', 'Ngày nộp', 'Số tiền ước'], [
  ['Tiền điện nhà máy', 'Tiền điện', '12', '85.000.000'],
  ['Bảo hiểm tài sản', 'Bảo hiểm', '20', '45.000.000'],
])}

${h3('⑧ Lịch trả lãi — tab Khoản vay, bấm icon % ở dòng KU-001')}
<p>Trong Drawer → bấm “Sinh lịch”: Kỳ trả lãi <b>Hằng tháng</b> · Ngày trả <b>25</b> · Lãi suất <b>6.4</b> · Từ ngày = ngày giải ngân · Đến ngày = ngày đến hạn · Dư nợ gốc <b>8.000.000.000</b>. Bấm ✓ “đã trả” một kỳ cũ để test.</p>

${h3('⑨ Ghi trả nợ — tab Khoản vay, bấm icon 💲 ở dòng KU-001')}
<p>Ngày trả <b>−7</b> · Số tiền <b>2.000.000.000</b> → dư nợ KU-001 giảm còn 6 tỷ.</p>

${h2('D. CHECKLIST KIỂM TRA SAU KHI NHẬP')}
${tbl(['Màn hình', 'Sẽ thấy'], [
  ['Khoản vay', '4 đèn: 🟢 An toàn · 🟧 Quá hạn · 🔴 Nhảy nhóm · 🟡 Sắp đến hạn'],
  ['Hạn mức → bấm dòng ACB', 'Tiền gửi 2 tỷ &lt; dư nợ 8 tỷ → THIẾU đảm bảo; bấm dòng để nhảy tới khoản vay/tiền gửi'],
  ['Tiền gửi', 'TG-01 cần tái tục gấp · TG-03 quá hạn tái tục (banner đỏ)'],
  ['Phải thu', 'Bảng tuổi nợ đủ nhóm · 1 dòng “Đã thu”'],
  ['Tồn quỹ &amp; phải nộp', 'Lưới số dư + tổng · 2 khoản phải nộp có “kỳ tới”'],
  ['Dòng tiền tổng hợp', 'Tiền vào vs tiền ra theo tuần + tồn dự kiến + cảnh báo'],
  ['Tổng quan vốn vay', 'KPI + bảng “Nguy cơ nhảy nhóm” (KU-003, KU-002)'],
])}
<p>Mỗi đối tượng bấm <b>📎</b> để thử đính kèm 1 file (test upload).</p>

<p style="color:#9aa4a0;font-size:9pt;margin-top:20px">© Cao Su Huy Anh — Hướng dẫn nội bộ Module Tài chính.</p>
</body></html>`

;(async () => {
  const buf = await HTMLtoDOCX(html, null, { table: { row: { cantSplit: true } }, footer: false, pageNumber: false })
  fs.writeFileSync('docs/HUONG_DAN_QUY_TRINH_TAI_CHINH.docx', buf)
  console.log('OK -> docs/HUONG_DAN_QUY_TRINH_TAI_CHINH.docx', buf.length, 'bytes')
})()
