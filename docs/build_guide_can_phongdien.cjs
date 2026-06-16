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
const tname = (t) => para([run(t, { b: true, sz: 24, color: '1B4D3E' })], { after: 30, left: 120 })
const body = [
  title('HƯỚNG DẪN CÂN'),
  subtitle('Trạm cân Huy Anh — Phong Điền  ·  Dành cho nhân viên trạm cân  ·  In khổ A4'),

  h2('Chuẩn bị'),
  note('Mở App Cân trên máy tính của trạm cân (đã đăng nhập tài khoản nhân viên trạm).'),
  note('Mỗi xe = 1 phiếu cân. Chọn ĐÚNG loại phiếu ngay từ đầu (xem 3 loại dưới).'),
  imageBox('📷 Hình 1 — Màn hình chính App Cân (sau khi đăng nhập)'),

  h2('3 loại phiếu cân — chọn đúng ngay từ đầu'),
  imageBox('📷 Hình 2 — Thanh chọn loại phiếu: NHẬP · XUẤT · CỔNG', 1500),

  tname('① NHẬP (vào kho) — cân mủ từ nhà cung cấp / đại lý vào kho'),
  note('Cân 2 lần: Gross (xe + hàng) vào  →  Tare (xe rỗng) ra  →  Net = Gross − Tare = khối lượng mủ.'),
  note('Có gắn nguồn mủ + loại mủ; riêng Mủ nước nhập thêm DRC để ra khối lượng khô.'),

  tname('② XUẤT (ra kho) — cân hàng xuất đi cảng / khách'),
  note('Cân 2 lần NGƯỢC với nhập: Tare (xe rỗng) vào  →  Gross (xe + hàng) ra  →  Net = Gross − Tare.'),
  note('Gắn Đơn hàng bán / Container / Lệnh điều động. Xe chở nhiều loại mủ → chọn nhiều loại.'),
  note('"Đã cân là được" — số cân gồm cả pallet / bao bì, KHÔNG so với kế hoạch.'),

  tname('③ CỔNG (hàng nội bộ) — cân cổng cho hàng đi nội bộ'),
  note('Cân vào  →  ra, chênh lệch = hàng. KHÔNG gắn nguồn mủ / deal / đơn hàng. (Chỉ dùng ở Phong Điền.)'),

  h2('A. Các bước cân NHẬP (chi tiết)'),
  step(1, 'Chọn loại phiếu = NHẬP (vào kho)'),
  imageBox('📷 Hình 3 — đã chọn NHẬP', 1500),

  step(2, 'Chọn nguồn mủ'),
  note('1 trong: Deal đã chốt / Đại lý trực tiếp / Nhà cung cấp.'),
  imageBox('📷 Hình 4 — Màn hình chọn nguồn mủ'),

  step(3, 'Chọn loại mủ'),
  note('💧 Mủ nước · 🪨 Mủ tạp · 🥣 Mủ chén · 📄 Mủ tờ · 🟫 Mủ RSS3.'),
  imageBox('📷 Hình 5 — Thanh chọn loại mủ'),

  step(4, 'Nhập biển số xe + tài xế'),
  imageBox('📷 Hình 6 — Ô nhập biển số xe + tài xế'),

  step(5, 'Cân lần 1 — Gross (xe + hàng) + chụp 3 ảnh'),
  note('Xe chở hàng lên cân → bấm Lấy số cân lần 1. Chụp đủ: Trước · Sau · Tài xế.'),
  imageBox('📷 Hình 7 — Cân lần 1 + khu vực chụp 3 ảnh', 2800),

  step(6, 'Cân lần 2 — Tare (xe rỗng)'),
  note('Đổ hàng xong, xe rỗng lên cân → bấm Lấy số cân lần 2. Net = Lần 1 − Lần 2.'),
  imageBox('📷 Hình 8 — Cân lần 2 + kết quả Net'),

  step(7, '(Chỉ Mủ nước) Nhập DRC'),
  imageBox('📷 Hình 9 — Ô nhập DRC'),

  step(8, 'Hoàn tất + In phiếu'),
  note('Kiểm lại loại mủ / biển số / số cân / ảnh → Hoàn tất → In (giao tài xế 1 bản).'),
  imageBox('📷 Hình 10 — Phiếu cân in ra (mẫu)', 3000),

  h2('B. Cân XUẤT đi cảng (tóm tắt)'),
  note('Chọn XUẤT → chọn Lệnh điều động (Mã · Xe · Tài xế) → app tự điền xe/tài xế.'),
  note('Cân Tare (xe rỗng) → Gross (xe + hàng) → xác nhận "Đã cân". Số cân đồng bộ về Lệnh + Đơn hàng.'),
  imageBox('📷 Hình 11 — Cân xuất + chọn Lệnh điều động'),

  h2('C. Cân CỔNG nội bộ (tóm tắt)'),
  note('Chọn CỔNG → cân vào → cân ra → chênh lệch = hàng. Không gắn đơn / nguồn mủ.'),
  imageBox('📷 Hình 12 — Cân cổng nội bộ'),

  h2('Lưu ý chung'),
  note('Chọn đúng loại mủ ngay từ đầu — tạo phiếu rồi KHÔNG sửa loại mủ trên app được (báo IT).'),
  note('Phiếu cân dở nằm ở mục "Phiếu đang cân dở" → bấm "Tiếp tục" để cân lần 2.'),
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
