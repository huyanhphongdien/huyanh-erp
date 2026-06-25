// Sinh DOCX: KỊCH BẢN TEST — nhập 1 bộ dữ liệu đi hết quy trình Tài chính.
// Chạy: npm i --no-save html-to-docx && node scripts/gen_finance_test_docx.cjs
const HTMLtoDOCX = require('html-to-docx')
const fs = require('fs')
const G = '#1B4D3E', N = '#1E3A5F'
const h1 = (t) => `<h1 style="color:${N};font-size:21pt">${t}</h1>`
const h2 = (t) => `<h2 style="color:${G};font-size:14pt">${t}</h2>`
const path = (t) => `<p style="background:#eef2ff;border-left:4px solid ${N};padding:5px 9px"><b>📍 Vào:</b> ${t}</p>`
const chk = (t) => `<p style="background:#f0fdf4;border-left:4px solid #16a34a;padding:5px 9px"><b>✅ Kiểm tra:</b> ${t}</p>`
const tbl = (rows) => `<table style="border-collapse:collapse;width:100%">
<tr><td style="border:1px solid #888;padding:5px;background:#eef2f1"><b>Trường nhập</b></td><td style="border:1px solid #888;padding:5px;background:#eef2f1"><b>Giá trị</b></td></tr>
${rows.map((r) => `<tr><td style="border:1px solid #888;padding:5px">${r[0]}</td><td style="border:1px solid #888;padding:5px"><b>${r[1]}</b></td></tr>`).join('')}
</table>`

// ── NGÀY: quy đổi offset → NGÀY CỤ THỂ, lấy mốc = ngày tạo tài liệu ──
const TODAY = new Date()
const _pad = (x) => String(x).padStart(2, '0')
const fmtD = (d) => `${_pad(d.getDate())}/${_pad(d.getMonth() + 1)}/${d.getFullYear()}`
const dOff = (n) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + n)
// "26/04/2026 (hôm nay − 60 ngày)" — value cell đã bold sẵn nên phần ghi chú để normal weight
const Dt = (n) => `${fmtD(dOff(n))} <span style="color:#94a3b8;font-weight:normal">(${n === 0 ? 'hôm nay' : `hôm nay ${n > 0 ? '+' : '−'}${Math.abs(n)} ngày`})</span>`

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.5">

${h1('KỊCH BẢN TEST GIAO DIỆN — NHẬP 1 BỘ DỮ LIỆU ĐẦY ĐỦ')}
<p style="color:#64748b"><i>Module Tài chính · Cao Su Huy Anh — đi hết quy trình từ Hạn mức → Khoản vay → Lãi/Trả nợ → Tiền gửi/Tài sản → Phải thu → Tồn quỹ → Dòng tiền.</i></p>

<p style="background:#fff7ed;border-left:4px solid #ea580c;padding:6px 10px">
<b>Trước khi nhập:</b> đăng nhập <b>minhld</b>. Mọi ô <b>ngày</b> bên dưới đã ghi sẵn <b>ngày cụ thể</b> (mốc = ngày tạo tài liệu <b>${fmtD(TODAY)}</b>); phần in nhạt trong ngoặc cho biết ngày đó cách hôm nay bao xa — nếu test vào ngày khác, chọn lại theo công thức trong ngoặc. Muốn bắt đầu từ trống thì xoá dữ liệu cũ trước.</p>

${h2('BƯỚC 1 — Tạo HẠN MỨC (trục)')}
${path('Menu <b>Vay vốn</b> → tab <b>Hạn mức</b> → nút <b>“Thêm hạn mức”</b>')}
${tbl([['Ngân hàng', 'Vietcombank'], ['Số HĐTD', 'VCB-2026-01'], ['Hạn mức (VNĐ)', '40.000.000.000'], ['Loại hạn mức', 'Vay vốn'], ['Lãi suất (%/năm)', '6.4'], ['Trạng thái', 'Hiệu lực']])}
${chk('Danh sách hiện hạn mức Vietcombank, <b>Room còn lại = 40 tỷ</b> (chưa vay).')}

${h2('BƯỚC 2 — Tạo 2 KHOẢN VAY (rút từ hạn mức)')}
${path('tab <b>Khoản vay</b> → <b>“Thêm khoản vay”</b> — nhớ chọn <b>“Thuộc hạn mức (HĐTD)”</b> = VCB-2026-01')}
<p><b>Khoản A</b> (để test đèn 🟢 An toàn):</p>
${tbl([['Ngân hàng', 'Vietcombank'], ['Số khế ước', 'KU-001'], ['Thuộc hạn mức', 'VCB-2026-01'], ['Số vay (VNĐ)', '8.000.000.000'], ['Lãi suất', '6.4'], ['Ngày giải ngân', Dt(-60)], ['Ngày đến hạn', Dt(20)]])}
<p><b>Khoản B</b> (để test đèn 🔴 Nhảy nhóm):</p>
${tbl([['Ngân hàng', 'Vietcombank'], ['Số khế ước', 'KU-002'], ['Thuộc hạn mức', 'VCB-2026-01'], ['Số vay (VNĐ)', '2.000.000.000'], ['Lãi suất', '6.4'], ['Ngày giải ngân', Dt(-110)], ['Ngày đến hạn', Dt(-12)]])}
${chk('KU-001 đèn <b>🟢 An toàn</b>; KU-002 đèn <b>🔴 NGUY CƠ NHẢY NHÓM</b>. Vào lại tab Hạn mức: <b>Đang vay = 10 tỷ · Room = 30 tỷ</b>.')}

${h2('BƯỚC 3 — Sinh LỊCH TRẢ LÃI cho KU-001')}
${path('tab <b>Khoản vay</b> → bấm icon <b>%</b> ở dòng KU-001 → trong Drawer điền rồi bấm <b>“Sinh lịch”</b>')}
${tbl([['Kỳ trả lãi', 'Hằng tháng'], ['Ngày trả (1–28)', '25'], ['Lãi suất %/năm', '6.4'], ['Từ ngày', `ngày giải ngân = ${Dt(-60)}`], ['Đến ngày', `ngày đến hạn = ${Dt(20)}`], ['Dư nợ gốc', '8.000.000.000']])}
<p>Sau khi sinh: bấm <b>✓ “đã trả”</b> ở 1 kỳ cũ nhất để test ghi nhận trả lãi.</p>
${chk('Drawer hiện các kỳ lãi; menu <b>Lịch trả lãi</b> gom các kỳ; 1 kỳ trạng thái “Đã trả”.')}

${h2('BƯỚC 4 — GHI TRẢ NỢ cho KU-001')}
${path('tab <b>Khoản vay</b> → bấm icon <b>💲</b> ở dòng KU-001')}
${tbl([['Ngày trả', Dt(-7)], ['Số tiền', '2.000.000.000'], ['Nguồn', 'Tiền hàng KH']])}
${chk('Dư nợ KU-001 giảm còn <b>6 tỷ</b> (8 − 2).')}

${h2('BƯỚC 5 — TIỀN GỬI đảm bảo hạn mức')}
${path('tab <b>Tiền gửi</b> → <b>“Thêm HĐTG”</b> — chọn <b>“Đảm bảo cho HẠN MỨC”</b> = VCB-2026-01')}
${tbl([['Ngân hàng', 'Vietcombank'], ['Số HĐTG', 'TG-01'], ['Số tiền (VNĐ)', '15.000.000.000'], ['Lãi suất', '4.7'], ['Kỳ hạn', '6 tháng'], ['Ngày gửi', Dt(-180)], ['Ngày đến hạn', Dt(5)], ['Đảm bảo cho hạn mức', 'VCB-2026-01']])}
${chk('Có cảnh báo <b>“cần tái tục gấp”</b> (đáo hạn ≤7 ngày). Hạn mức VCB nhận đảm bảo 15 tỷ.')}

${h2('BƯỚC 6 — TÀI SẢN ĐẢM BẢO')}
${path('tab <b>Tài sản ĐB</b> → <b>“Thêm tài sản”</b> — chọn hạn mức VCB-2026-01')}
${tbl([['Tên tài sản', 'Nhà xưởng sản xuất khu A'], ['Loại tài sản', 'Bất động sản'], ['Đảm bảo cho hạn mức', 'VCB-2026-01'], ['Giá trị định giá (đ)', '18.000.000.000'], ['Giá trị bảo đảm (đ)', '12.600.000.000']])}
${chk('Vào tab <b>Hạn mức</b> → bấm dòng Vietcombank → Drawer hiện đủ: 🔒 Tiền gửi 15 tỷ + 🏛 Tài sản 12,6 tỷ + 🏦 Khoản vay đang rút. Bấm 1 dòng trong Drawer → nhảy tới đúng khoản đó.')}

${h2('BƯỚC 7 — PHẢI THU khách hàng (USD)')}
${path('Menu <b>Phải thu KH</b> → <b>“Thêm phải thu”</b> — Tiền tệ <b>USD</b>, ô “Hạn thu” để TRỐNG')}
${tbl([['Khách hàng (Buyer)', 'EVERGREEN RUBBER PTE'], ['Số hợp đồng', 'HD-01'], ['Mặt hàng', 'SVR 10'], ['Tiền tệ', 'USD'], ['Giá trị', '200000'], ['ATD (tàu chạy thực)', Dt(-88)], ['Term (ngày)', '90']])}
${chk('Hạn thu tự tính = ATD + 90 → còn ~2 ngày (Trong hạn). Bảng tuổi nợ có số.')}

${h2('BƯỚC 8 — TỒN QUỸ ngân hàng')}
${path('Menu <b>Tồn quỹ &amp; phải nộp</b> → khối Tồn quỹ → <b>“Thêm TK”</b>')}
${tbl([['Ngân hàng', 'Vietcombank'], ['Số dư VNĐ', '3.000.000.000'], ['Số dư USD', '6000'], ['Cập nhật ngày', Dt(0)]])}
${chk('Lưới tồn quỹ + dòng TỔNG có số.')}

${h2('BƯỚC 9 — KHOẢN PHẢI NỘP định kỳ')}
${path('cùng màn hình → khối Phải nộp → <b>“Thêm khoản”</b>')}
${tbl([['Tên', 'Tiền điện nhà máy'], ['Nhóm', 'Tiền điện'], ['Ngày nộp (1–28)', '12'], ['Số tiền ước', '85.000.000']])}
${chk('Khoản phải nộp hiện “kỳ tới” + đèn sắp nộp.')}

${h2('BƯỚC 10 — XEM DÒNG TIỀN TỔNG HỢP')}
${path('Menu <b>Dòng tiền tổng hợp</b>')}
${chk('Thẻ sức khỏe: Tồn quỹ · Phải thu · Dư nợ vay · Room · Tiền gửi · Tài sản. Bảng 6 tuần: <b>Tiền vào</b> (HD-01 ~5 tỷ) vs <b>Tiền ra</b> (KU-002 quá hạn 2 tỷ + lãi + 85tr phải nộp) + Tồn dự kiến từng tuần.')}

${h2('CHECKLIST TỔNG (mở lần lượt)')}
${tbl([
  ['Khoản vay', 'KU-001 🟢 · KU-002 🔴'],
  ['Hạn mức → bấm Vietcombank', 'Tiền gửi 15 + Tài sản 12,6 chống lưng · đang vay 8 · room 32'],
  ['Tiền gửi', 'TG-01 “cần tái tục gấp”'],
  ['Lịch trả lãi', 'Các kỳ KU-001 · 1 kỳ đã trả'],
  ['Phải thu', 'EVERGREEN trong bảng tuổi nợ'],
  ['Tồn quỹ &amp; phải nộp', 'Số dư + khoản phải nộp “kỳ tới”'],
  ['Dòng tiền tổng hợp', 'Vào/ra theo tuần + tồn dự kiến'],
  ['Tổng quan vốn vay', 'KPI + “Nguy cơ nhảy nhóm” (KU-002)'],
])}
<p><b>Đính kèm:</b> ở mỗi đối tượng bấm <b>📎</b> để thử tải 1 file bất kỳ (test upload).</p>

<p style="color:#9aa4a0;font-size:9pt;margin-top:18px">© Cao Su Huy Anh — Kịch bản test nội bộ Module Tài chính.</p>
</body></html>`

;(async () => {
  const buf = await HTMLtoDOCX(html, null, { table: { row: { cantSplit: true } }, footer: false })
  fs.writeFileSync('docs/KICH_BAN_TEST_TAI_CHINH.docx', buf)
  console.log('OK -> docs/KICH_BAN_TEST_TAI_CHINH.docx', buf.length, 'bytes')
})()
