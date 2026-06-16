/* ============================================================================
 * build_guide_can_phongdien.cjs — File Word A4 "Hướng dẫn cân Phong Điền"
 * NHÚNG THẲNG ảnh chụp màn hình (docs/du lieu tho/Anh can) vào file.
 * Ô nào chưa có ảnh → để viền đứt chừa sẵn.  Chạy:
 *   node docs/build_guide_can_phongdien.cjs
 * ========================================================================== */
const fs = require('fs')
const PizZip = require('pizzip')

const BASE = 'public/contract-templates/template_ANNEX.docx'
const IMGDIR = 'docs/du lieu tho/Anh can'
const OUT = 'public/huong-dan-can-phong-dien.docx'

// ── OOXML text helpers ──
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function run(text, { b = false, i = false, sz = 22, color = null } = {}) {
  const rpr = `<w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`
  return `<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}
function para(runs, { center = false, after = 120, left = 0 } = {}) {
  const ppr = `<w:pPr>${center ? '<w:jc w:val="center"/>' : ''}${left ? `<w:ind w:left="${left}"/>` : ''}<w:spacing w:after="${after}" w:line="276" w:lineRule="auto"/></w:pPr>`
  return `<w:p>${ppr}${(Array.isArray(runs) ? runs : [runs]).join('')}</w:p>`
}
const title = (t) => para([run(t, { b: true, sz: 36 })], { center: true, after: 60 })
const subtitle = (t) => para([run(t, { i: true, sz: 22, color: '666666' })], { center: true, after: 240 })
const h2 = (t) => para([run(t, { b: true, sz: 28, color: '1B4D3E' })], { after: 100 })
const tname = (t) => para([run(t, { b: true, sz: 24, color: '1B4D3E' })], { after: 30, left: 120 })
const step = (n, t) => para([run(`Bước ${n}.  `, { b: true, sz: 26, color: '1B4D3E' }), run(t, { b: true, sz: 26 })], { after: 50 })
const note = (t) => para([run('• ', { b: true }), run(t)], { after: 70, left: 240 })

// ── Ô chừa ảnh (table viền đứt) cho ảnh CHƯA có ──
function imageBox(label, height = 2200) {
  const bd = (s) => `<w:${s} w:val="dashed" w:sz="10" w:space="0" w:color="9CA3AF"/>`
  const cellP = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:color w:val="9CA3AF"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${esc(label)}</w:t></w:r></w:p>`
  return `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders>${bd('top')}${bd('left')}${bd('bottom')}${bd('right')}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="9300"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="${height}"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="9300" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${cellP}</w:tc></w:tr></w:tbl><w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>`
}

// ── Nhúng ảnh thật ──
const EMU_PX = 9525, MAX_W = 5850000 // ~16.4cm bề ngang nội dung A4 (lề 2cm)
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })
const fit = (w, h) => { let cx = w * EMU_PX, cy = h * EMU_PX; if (cx > MAX_W) { const s = MAX_W / cx; cx = Math.round(cx * s); cy = Math.round(cy * s) } return { cx, cy } }
let picId = 100, relSeq = 900
const mediaFiles = [], newRels = []
function drawingP(rid, cx, cy, id) {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Picture ${id}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="img${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}
/** Có file → nhúng ảnh + chú thích; không → ô chừa viền đứt. */
function pic(label, fileName, fallbackH) {
  const p = fileName ? `${IMGDIR}/${fileName}` : null
  if (!p || !fs.existsSync(p)) return imageBox('📷 ' + label + ' — (chưa có ảnh, dán vào đây)', fallbackH || 2200)
  const buf = fs.readFileSync(p)
  const { w, h } = pngSize(buf)
  const { cx, cy } = fit(w, h)
  const id = picId++, rid = `rIdImg${relSeq++}`, mname = `g_${id}.png`
  mediaFiles.push({ name: `word/media/${mname}`, buf })
  newRels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mname}"/>`)
  return drawingP(rid, cx, cy, id) + para([run(label, { i: true, sz: 18, color: '9CA3AF' })], { center: true, after: 200 })
}

// Tên file ảnh đã cung cấp
const F = {
  home: 'Screenshot 2026-06-16 083040.png',
  type: 'Screenshot 2026-06-16 083312.png',
  source: 'Screenshot 2026-06-16 084551.png',
  rubber: 'Screenshot 2026-06-16 084528.png',
  vehicle: 'Screenshot 2026-06-16 084620.png',
  note: 'Screenshot 2026-06-16 084654.png',
  createBtn: 'Screenshot 2026-06-16 084722.png',
  done: 'Screenshot 2026-06-16 090209.png',
  out: 'Screenshot 2026-06-16 084842.png',
  weigh1: 'hinh can lan 1.png',
  drc: 'DRC mu nuoc.png',
  gate: 'can noi bo.png',
}

// ── Nội dung ──
const body = [
  title('HƯỚNG DẪN CÂN'),
  subtitle('Trạm cân Huy Anh — Phong Điền  ·  Dành cho nhân viên trạm cân  ·  In khổ A4'),

  h2('Chuẩn bị'),
  note('Mở App Cân trên máy tính trạm cân (đã đăng nhập). Mỗi xe = 1 phiếu cân.'),
  note('Ở màn hình chính: bấm "Tạo phiếu cân mới" để bắt đầu. Phiếu đang cân dở nằm bên dưới (bấm "Tiếp tục" để cân tiếp).'),
  pic('Màn hình chính App Cân — nút "Tạo phiếu cân mới"', F.home),

  h2('3 loại phiếu cân — chọn đúng ngay từ đầu'),
  pic('Thanh chọn loại phiếu: NHẬP · XUẤT · CỔNG', F.type, 1400),
  tname('① NHẬP (vào kho) — nhập MỦ và THÀNH PHẨM vào kho'),
  note('Nhập mủ nguyên liệu (từ NCC/đại lý) HOẶC thành phẩm (RSS3, SVR…) vào kho.'),
  note('Cân 2 lần: Gross (xe + hàng) vào  →  Tare (xe rỗng) ra  →  Net = Gross − Tare.'),
  tname('② XUẤT (ra kho) — xuất MỦ và THÀNH PHẨM ra khỏi kho'),
  note('Xuất hàng đi cảng / khách. Cân 2 lần NGƯỢC: Tare (xe rỗng) vào  →  Gross (xe + hàng) ra  →  Net.'),
  note('Gắn Đơn hàng bán / Container / Lệnh điều động. "Đã cân là được" — số cân gồm pallet/bao bì, không so kế hoạch.'),
  tname('③ CỔNG (hàng nội bộ) — cân hàng đi nội bộ'),
  note('Hàng luân chuyển nội bộ, không nhập/xuất kho chính thức. Cân vào → ra, chênh lệch = hàng. Không gắn đơn/nguồn. (Chỉ Phong Điền.)'),

  h2('A. Cân NHẬP — từng bước'),
  step(1, 'Chọn loại phiếu = NHẬP (vào kho)'),
  pic('Đã chọn NHẬP (vào kho)', F.type, 1400),
  step(2, 'Chọn nguồn mủ / đối tác'),
  note('Gõ tên / SĐT / mã để tìm đại lý B2B hoặc NCC (Lào / Việt) → chọn.'),
  pic('Tìm + chọn nguồn mủ (đối tác / NCC)', F.source),
  step(3, 'Chọn loại mủ'),
  note('💧 Mủ nước · 🪨 Mủ tạp · 🥣 Mủ chén · 📄 Mủ tờ · 🟫 Mủ RSS3. (Mủ nước tính theo DRC.)'),
  pic('Thanh chọn loại mủ', F.rubber, 1400),
  step(4, 'Nhập biển số xe + tài xế'),
  pic('Thông tin vận chuyển — biển số xe, tài xế', F.vehicle, 1700),
  step(5, '(Tùy chọn) Ghi chú mã hàng / lô hàng'),
  note('Nhập mã hàng / lô để in lên phiếu (nếu cần).'),
  pic('Ô ghi chú mã hàng / lô hàng', F.note, 1200),
  step(6, 'Bấm "Tạo phiếu & Bắt đầu cân"'),
  pic('Nút Tạo phiếu & Bắt đầu cân', F.createBtn, 900),
  step(7, 'Cân lần 1 — Gross (xe + hàng) + chụp 3 ảnh'),
  note('Xe chở hàng lên bàn cân → lấy số cân lần 1. Chụp đủ 3 ảnh: Trước xe · Sau xe · Tài xế.'),
  pic('Màn hình cân — Cân lần 1 (Gross) xong, sang Cân lần 2', F.weigh1),
  step(8, 'Cân lần 2 — Tare (xe rỗng) → Net → Hoàn tất → IN PHIẾU'),
  note('Đổ hàng xong, xe rỗng lên cân → lấy số cân lần 2. Hệ thống ra NET = Lần 1 − Lần 2.'),
  note('Kiểm lại → bấm Hoàn tất → bấm IN PHIẾU (giao tài xế 1 bản).'),
  pic('Phiếu hoàn tất — Net + 3 ảnh + nút IN PHIẾU', F.done),
  step(9, '(Chỉ Mủ nước) Nhập DRC'),
  note('Với mủ nước: nhập/tra DRC% để ra khối lượng khô + thành tiền.'),
  pic('Ô đo DRC tại cân (chỉ hiện với Mủ nước)', F.drc),

  h2('B. Cân XUẤT đi cảng'),
  note('Chọn loại phiếu = XUẤT → chọn Lệnh điều động (Mã · Xe · Tài xế) → app TỰ ĐIỀN xe/tài xế + hiện container của lệnh.'),
  note('Cân Tare (xe rỗng) → Gross (xe + hàng) → Hoàn tất ("Đã cân"). Số cân tự đồng bộ về Lệnh điều động + Đơn hàng bán.'),
  pic('Cân XUẤT — chọn Lệnh điều động (auto-fill xe + container)', F.out),

  h2('C. Cân CỔNG nội bộ'),
  note('Chọn loại phiếu = CỔNG → ghi Nội dung hàng (vật tư, phế liệu, thành phẩm nội bộ…) → cân vào → cân ra → chênh lệch = hàng. Không gắn đơn / nguồn mủ.'),
  pic('Màn hình cân CỔNG nội bộ', F.gate),

  h2('Lưu ý chung'),
  note('Chọn đúng loại mủ ngay từ đầu — tạo phiếu rồi KHÔNG sửa loại mủ trên app được (báo IT).'),
  note('Chụp ảnh rõ biển số. Cân xong nhớ IN PHIẾU giao tài xế.'),
  para([run('— Hết —', { i: true, color: '999999' })], { center: true, after: 0 }),
].join('')

// ── Lắp gói .docx ──
const zip = new PizZip(fs.readFileSync(BASE))
const doc = zip.file('word/document.xml').asText()
const head = doc.slice(0, doc.indexOf('<w:body>') + '<w:body>'.length)
const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/>' +
  '<w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr></w:body></w:document>'
zip.file('word/document.xml', head + body + sect)

// media
for (const m of mediaFiles) zip.file(m.name, m.buf)
// rels (chèn trước </Relationships>)
const relsPath = 'word/_rels/document.xml.rels'
let rels = zip.file(relsPath).asText()
rels = rels.replace('</Relationships>', newRels.join('') + '</Relationships>')
zip.file(relsPath, rels)
// content-types: đảm bảo có png
let ct = zip.file('[Content_Types].xml').asText()
if (!/Extension="png"/.test(ct)) ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>')
zip.file('[Content_Types].xml', ct)

fs.writeFileSync(OUT, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log('✓', OUT, fs.statSync(OUT).size, 'bytes ·', mediaFiles.length, 'ảnh nhúng')
