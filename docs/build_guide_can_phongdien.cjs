/* ============================================================================
 * build_guide_can_phongdien.cjs — Dựng file Word A4 "Hướng dẫn cân Phong Điền"
 * Tái dùng gói .docx hợp lệ (styles) từ template_ANNEX, thay thân = nội dung
 * hướng dẫn + ô chừa ảnh (table viền đứt). Khổ A4. Chạy:
 *   node docs/build_guide_can_phongdien.cjs
 * ========================================================================== */
const fs = require('fs')
const PizZip = require('pizzip')

const BASE = 'public/contract-templates/template_ANNEX.docx' // gói .docx hợp lệ để tái dùng
const OUT = 'public/huong-dan-can-phong-dien.docx'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function run(text, { b = false, i = false, sz = 22, color = null } = {}) {
  const rpr = `<w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`
  return `<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}
function para(runs, { center = false, after = 120, shade = null, left = 0 } = {}) {
  const ppr = `<w:pPr>${center ? '<w:jc w:val="center"/>' : ''}${left ? `<w:ind w:left="${left}"/>` : ''}` +
    `${shade ? `<w:shd w:val="clear" w:fill="${shade}"/>` : ''}<w:spacing w:after="${after}" w:line="276" w:lineRule="auto"/></w:pPr>`
  return `<w:p>${ppr}${(Array.isArray(runs) ? runs : [runs]).join('')}</w:p>`
}
const title = (t) => para([run(t, { b: true, sz: 36 })], { center: true, after: 60 })
const subtitle = (t) => para([run(t, { i: true, sz: 22, color: '666666' })], { center: true, after: 240 })
const h2 = (t) => para([run(t, { b: true, sz: 28, color: '1B4D3E' })], { after: 100 })
const step = (n, t) => para([run(`Bước ${n}.  `, { b: true, sz: 26, color: '1B4D3E' }), run(t, { b: true, sz: 26 })], { after: 60 })
const note = (t) => para([run('• ', { b: true }), run(t)], { after: 80, left: 240 })

/** Ô chừa ảnh — table 1 ô, viền đứt, cao ~2.6cm, nhãn xám ở giữa. */
function imageBox(label, height = 2400) {
  const border = (s) => `<w:${s} w:val="dashed" w:sz="10" w:space="0" w:color="9CA3AF"/>`
  const cellP = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>` +
    `<w:r><w:rPr><w:color w:val="9CA3AF"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${esc(label)}</w:t></w:r></w:p>`
  return `<w:tbl>
    <w:tblPr><w:tblW w:w="9300" w:type="dxa"/>
      <w:tblBorders>${border('top')}${border('left')}${border('bottom')}${border('right')}${border('insideH')}${border('insideV')}</w:tblBorders>
      <w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/></w:tblCellMar>
    </w:tblPr>
    <w:tblGrid><w:gridCol w:w="9300"/></w:tblGrid>
    <w:tr><w:trPr><w:trHeight w:val="${height}"/></w:trPr>
      <w:tc><w:tcPr><w:tcW w:w="9300" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${cellP}</w:tc>
    </w:tr></w:tbl><w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>`
}

// ── Nội dung hướng dẫn ──
const body = [
  title('HƯỚNG DẪN CÂN'),
  subtitle('Trạm cân Huy Anh — Phong Điền  ·  Dành cho nhân viên trạm cân  ·  In khổ A4'),

  h2('Chuẩn bị'),
  note('Mở App Cân trên máy tính của trạm cân (đã đăng nhập tài khoản nhân viên trạm).'),
  note('Mỗi xe vào = 1 phiếu cân. Cân 2 lần: lần 1 xe chở hàng, lần 2 xe rỗng.'),
  imageBox('📷 Hình 1 — Màn hình chính App Cân (sau khi đăng nhập)'),

  h2('A. Cân NHẬP mủ (xe chở mủ vào)'),

  step(1, 'Tạo phiếu cân mới'),
  note('Bấm nút tạo phiếu mới → chọn loại: Cân nhập.'),
  imageBox('📷 Hình 2 — Nút tạo phiếu + chọn Cân nhập'),

  step(2, 'Chọn nguồn mủ'),
  note('Chọn 1 trong: theo Deal đã chốt / Đại lý trực tiếp / Nhà cung cấp.'),
  imageBox('📷 Hình 3 — Màn hình chọn nguồn mủ'),

  step(3, 'Chọn loại mủ'),
  note('Bấm 1 chạm: 💧 Mủ nước · 🪨 Mủ tạp · 🥣 Mủ chén · 📄 Mủ tờ · 🟫 Mủ RSS3.'),
  note('Mủ nước tính theo DRC (giá khô); các loại còn lại tính theo cân thực tế.'),
  imageBox('📷 Hình 4 — Thanh chọn loại mủ (các nút)'),

  step(4, 'Nhập thông tin xe'),
  note('Nhập Biển số xe + Tên tài xế. App tự gợi ý biển số đã có.'),
  imageBox('📷 Hình 5 — Ô nhập biển số xe + tài xế'),

  step(5, 'Cân lần 1 — xe chở hàng (Gross) + chụp ảnh'),
  note('Xe lên bàn cân → bấm Lấy số cân lần 1 (ghi khối lượng xe + hàng).'),
  note('Chụp đủ 3 ảnh: Trước xe · Sau xe · Tài xế (theo nút chụp trên màn hình).'),
  imageBox('📷 Hình 6 — Nút cân lần 1 + khu vực chụp 3 ảnh', 2800),

  step(6, 'Cân lần 2 — xe rỗng (Tare)'),
  note('Sau khi đổ hàng, xe rỗng lên cân → bấm Lấy số cân lần 2.'),
  note('Hệ thống tự tính: Khối lượng hàng (Net) = Cân lần 1 − Cân lần 2.'),
  imageBox('📷 Hình 7 — Màn hình cân lần 2 + kết quả Net'),

  step(7, '(Chỉ Mủ nước) Nhập DRC'),
  note('Với mủ nước: nhập/tra DRC% để ra khối lượng khô + thành tiền.'),
  imageBox('📷 Hình 8 — Ô nhập DRC (chỉ hiện với mủ nước)'),

  step(8, 'Xác nhận / Hoàn tất phiếu'),
  note('Kiểm lại loại mủ, biển số, số cân, ảnh → bấm Hoàn tất.'),
  imageBox('📷 Hình 9 — Nút xác nhận/hoàn tất phiếu'),

  step(9, 'In phiếu cân'),
  note('Bấm In → ra phiếu cân (có QR Cổng Đại lý). Giao 1 bản cho tài xế.'),
  imageBox('📷 Hình 10 — Phiếu cân in ra (mẫu)', 3200),

  h2('B. Cân XUẤT hàng (xe chở hàng đi cảng)'),
  note('Chọn Cân xuất → chọn Lệnh điều động (Mã · Xe · Tài xế) → app tự điền xe/tài xế.'),
  note('Cân tổng cả xe 1 lần → xác nhận "Đã cân". Số cân đồng bộ về Lệnh điều động + Đơn hàng.'),
  imageBox('📷 Hình 11 — Màn hình cân xuất + chọn Lệnh điều động'),

  h2('Lưu ý chung'),
  note('Chọn đúng loại mủ ngay từ đầu — sau khi tạo phiếu KHÔNG sửa loại mủ trên app được (phải báo IT).'),
  note('Chụp ảnh rõ biển số. Phiếu đang cân dở nằm ở mục "Phiếu đang cân dở", bấm "Tiếp tục" để cân tiếp.'),
  note('Cân xuất: "Đã cân là được" — số cân gồm cả pallet/bao bì, không so với kế hoạch.'),
  para([run('— Hết —', { i: true, color: '999999' })], { center: true, after: 0 }),
].join('')

// ── Lắp document.xml: giữ phần mở của gói, thay thân + sectPr A4 (bỏ header) ──
const zip = new PizZip(fs.readFileSync(BASE))
const doc = zip.file('word/document.xml').asText()
const head = doc.slice(0, doc.indexOf('<w:body>') + '<w:body>'.length)
// sectPr khổ A4 (11906 x 16838), lề 2cm, KHÔNG tham chiếu header (bỏ logo HĐ)
const sect = '<w:sectPr>' +
  '<w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/>' +
  '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/>' +
  '</w:sectPr></w:body></w:document>'
zip.file('word/document.xml', head + body + sect)
fs.writeFileSync(OUT, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log('✓', OUT, fs.statSync(OUT).size, 'bytes')
