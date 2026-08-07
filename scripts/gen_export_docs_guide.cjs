// Sinh 2 file .docx (Word thật) cho bộ chứng từ xuất khẩu:
//   docs/HUONG_DAN_NHAP_LIEU_BO_CHUNG_TU.docx  (hướng dẫn nhập liệu theo bộ phận)
//   docs/BAO_CAO_TONG_QUAN_BO_CHUNG_TU.docx    (báo cáo tổng quan)
// Chạy: node scripts/gen_export_docs_guide.cjs
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, HeadingLevel,
} = require('docx')
const fs = require('fs')

const FONT = 'Times New Roman'
const GREEN = '1a7a3d', INK = '1e2429', MUTED = '5c6873', BLUE = '1257a8', RED = 'c0392b'
const hp = (pt) => Math.round(pt * 2)
const B = { style: BorderStyle.SINGLE, size: 4, color: '999999' }
const CB = { top: B, bottom: B, left: B, right: B }
const TB = { ...CB, insideHorizontal: B, insideVertical: B }

const R = (t, o = {}) => new TextRun({ text: t, bold: o.b, italics: o.i, color: o.color, size: hp(o.size ?? 11), font: FONT })
const P = (content, o = {}) => new Paragraph({
  children: typeof content === 'string' ? [R(content, o)] : content,
  alignment: o.align, spacing: { after: o.after ?? 80, before: o.before ?? 0 },
  heading: o.heading,
})
const H1 = (t) => new Paragraph({ children: [R(t, { b: true, size: 17, color: GREEN })], spacing: { after: 120, before: 120 } })
const H2 = (t) => new Paragraph({ children: [R(t, { b: true, size: 13.5, color: INK })], spacing: { after: 80, before: 160 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: 'cccccc', space: 2 } } })
const bullet = (t, o = {}) => new Paragraph({ children: [R(t, o)], bullet: { level: 0 }, spacing: { after: 40 } })

function cell(content, o = {}) {
  const kids = typeof content === 'string' ? [P(content, { size: o.size ?? 10, b: o.b, align: o.align, after: 0, color: o.color })] : content
  return new TableCell({
    children: kids, width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    shading: o.shade ? { fill: o.shade } : undefined, borders: CB,
  })
}
function table(headers, rows, widths) {
  const head = new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { b: true, size: 9.5, width: widths?.[i], shade: 'eef2f6' })) })
  const body = rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { size: 9.5, width: widths?.[i] })) }))
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TB, rows: [head, ...body] })
}
function makeDoc(children) {
  return new Document({
    styles: { default: { document: { run: { font: FONT, size: hp(11) } } } },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } }, children }],
  })
}
async function save(doc, path) { fs.writeFileSync(path, await Packer.toBuffer(doc)); console.log('  ✓', path) }

// ════════════════════════════════════════════════════════════════════
// 1) HƯỚNG DẪN NHẬP LIỆU
// ════════════════════════════════════════════════════════════════════
function guideDoc() {
  const k = []
  k.push(
    P('CÔNG TY TNHH CAO SU HUY ANH', { align: AlignmentType.CENTER, size: 10.5, color: MUTED, after: 20 }),
    P('HƯỚNG DẪN NHẬP LIỆU ĐỂ SINH BỘ CHỨNG TỪ XUẤT KHẨU ĐẦY ĐỦ', { align: AlignmentType.CENTER, b: true, size: 15, after: 20 }),
    P('Ai nhập · Nhập gì · Nhập ở đâu · Lên chứng từ nào   —   Phiên bản 07/08/2026', { align: AlignmentType.CENTER, i: true, size: 10, color: MUTED, after: 160 }),
    P([R('1 bộ chứng từ đầy đủ', { b: true }), R(' = 5 chứng từ hệ TỰ SINH (Commercial Invoice · Packing List · Weight List · Hối phiếu · Đơn chiết khấu) + các file ĐÍNH KÈM (COA · B/L · C/O · Bảo hiểm · Phyto · Fumigation · LC copy). Hệ tự điền đúng khi 5 khâu dưới nhập đủ. Nguyên tắc vàng: HỒ SƠ CHỨNG TỪ KHÁCH nhập 1 lần dùng mãi.')]),
    P('LUỒNG: (0) Hồ sơ khách → (1) Sale tạo đơn → (2) SX/Kho đóng gói → (3) Logistics vận chuyển → (4) Kế toán chiết khấu L/C → (5) Đính kèm file ngoài.', { b: true, color: BLUE, after: 160 }),
  )

  k.push(H2('BẢN ĐỒ NHANH — mỗi thứ nhập ở đâu'))
  k.push(table(['Cần nhập', 'Vào đâu'], [
    ['Buyer · Consignee · Notify · Shipping marks · Ngân hàng', 'Khách → tab "Hồ sơ chứng từ" (KHÁC nút "Sửa" — nút Sửa chỉ info chung)'],
    ['PO# · Số HĐ · Grade · Số lượng · Đơn giá', 'Đơn → tab "Hợp đồng" → nút Sửa (tab "Thông tin" chỉ để xem)'],
    ['Vessel · Cảng · ETD · B/L số+ngày · Cước/BH · Số hóa đơn', 'Đơn → tab "Vận chuyển" → nút Sửa'],
    ['Tare · Gross từng container', 'Đơn → Đóng gói (bảng container)'],
    ['Số L/C · NH phát hành · Kỳ hạn · Chiết khấu', 'Đơn → tab "Chứng từ" → Mở trang Sinh chứng từ → Đơn chiết khấu'],
    ['Upload COA · B/L · C/O · Bảo hiểm · Phyto · LC copy', 'Đơn → tab "Chứng từ" → mục Checklist chứng từ'],
  ], [46, 54]))
  k.push(P([R('2 chỗ hay nhầm: ', { b: true }), R('(1) Hồ sơ chứng từ (consignee/mark/bank) ở TAB RIÊNG, không phải nút "Sửa". (2) PO# ở ĐƠN → tab "Hợp đồng", không phải màn Khách.', { i: true })], { before: 40, after: 120 }))

  const secs = [
    { n: '0', dept: 'Admin / Sale', title: 'Hồ sơ chứng từ khách (nhập 1 lần / khách)',
      where: 'Khách hàng → chọn khách → tab "Hồ sơ chứng từ" (KHÁC nút "Sửa" ở góc — nút Sửa chỉ có info chung, không có consignee/mark)',
      rows: [
        ['Buyer legal name + địa chỉ', 'Bắt buộc', 'Invoice, Packing List, Weight List'],
        ['Consignee (người nhận) + địa chỉ', 'Bắt buộc', 'Invoice, PKL, WL'],
        ['Notify party + địa chỉ', 'Nên có', 'Invoice'],
        ['Shipping marks (ký mã hiệu)', 'Bắt buộc', 'Invoice, PKL'],
        ['Ngân hàng thụ hưởng (chọn từ DS)', 'Bắt buộc', 'Invoice, Hối phiếu, Đơn chiết khấu'],
        ['Điều khoản thanh toán mặc định', 'Nên có', 'Invoice'],
        ['Checklist số bản (gốc/copy)', 'Nên có', 'Đơn chiết khấu'],
      ],
      note: 'QUAN TRỌNG NHẤT. Chưa nhập → Invoice/PKL/WL trống Consignee/Bank/Mark. Làm cho ~10–15 khách chủ lực trước.' },
    { n: '1', dept: 'Sale', title: 'Thông tin đơn hàng',
      where: 'Tạo đơn hàng bán (đơn mới) — HOẶC đơn đã tạo: Chi tiết đơn → tab "Hợp đồng" → nút Sửa (tab "Thông tin" chỉ để xem)',
      rows: [
        ['Khách · Grade · Số lượng · Đơn giá · Tiền tệ', 'Bắt buộc', 'Invoice, PKL, WL, Hối phiếu'],
        ['Incoterm (FOB/CIF/CFR…)', 'Bắt buộc', 'Invoice'],
        ['Số hợp đồng (Contract No.)', 'Bắt buộc', 'Invoice, Đơn chiết khấu, mọi doc'],
        ['PO# của khách', 'Nếu có', 'Invoice'],
        ['Điều khoản thanh toán', 'Nên có', 'Invoice'],
      ],
      note: 'Nếu giá là CIF trọn gói thì KHÔNG nhập tách cước/bảo hiểm ở bước 3.' },
    { n: '2', dept: 'Sản xuất / Kho', title: 'Đóng gói container',
      where: 'Chi tiết đơn → Đóng gói (nhập theo từng container)',
      rows: [
        ['Số container · Số seal', 'Bắt buộc', 'PKL, WL'],
        ['Số bành', 'Bắt buộc', 'PKL, WL'],
        ['Net (kg) — cao su thuần', 'Bắt buộc', 'PKL, WL, Invoice'],
        ['Bì/Tare (kg) — bì container  [MỚI]', 'Bắt buộc', 'WL'],
        ['Gross (kg) — tổng cân tại trạm  [MỚI]', 'Bắt buộc', 'PKL, WL'],
        ['Lô (lot) · Hạn giao', 'Nếu chia lô', 'theo dõi nội bộ'],
      ],
      note: 'Trước chỉ nhập Net → WL phải ước lượng bì = Net×1.02. Nay có 2 cột Tare + Gross, nhập số cân thật. COA lấy từ LAB (đính kèm bước 5).' },
    { n: '3', dept: 'Logistics', title: 'Vận chuyển (Booking / B-L / Cảng / Cước)',
      where: 'Chi tiết đơn → tab "Vận chuyển" → Chỉnh sửa',
      rows: [
        ['Hãng tàu · Tàu/Chuyến · Booking Ref', 'Bắt buộc', 'Invoice, PKL, WL'],
        ['B/L Number · B/L Type · Ngày B/L  [MỚI]', 'Bắt buộc', 'Invoice, WL, Hối phiếu'],
        ['Cảng xếp POL · Cảng đến POD · Cảng dỡ  [MỚI]', 'Bắt buộc', 'Invoice, PKL, WL'],
        ['ETD · ETA · Cutoff', 'Bắt buộc', 'Invoice, PKL, WL'],
        ['Cước · Phí bảo hiểm (USD)  [MỚI]', 'Chỉ khi CFR/CIF', 'Invoice'],
        ['Số hóa đơn · Ngày hóa đơn  [MỚI]', 'Trống → tự sinh', 'Invoice, Hối phiếu'],
      ],
      note: 'Cước & Bảo hiểm nhập sẽ CỘNG vào TOTAL Invoice → chỉ nhập khi giá FOB tách riêng. Số hóa đơn trống → INV-<mã đơn>; ngày trống → hôm nay.' },
    { n: '4', dept: 'Kế toán', title: 'Chiết khấu L/C (khi thanh toán bằng L/C)',
      where: 'Chi tiết đơn → tab "Chứng từ" → "Mở trang Sinh chứng từ" → tab "Đơn chiết khấu"',
      rows: [
        ['NH thương lượng · NH phát hành L/C', 'Nếu L/C', 'Hối phiếu, Đơn chiết khấu'],
        ['Số L/C · Ngày L/C', 'Nếu L/C', 'Hối phiếu, Invoice, Đơn chiết khấu'],
        ['Tỷ lệ TL % · Lãi suất · Thời hạn · Ngày nộp', 'Nếu chiết khấu', 'Đơn chiết khấu'],
      ],
      note: 'Kỳ hạn quyết định dòng "AT … DAYS / AT SIGHT" của Hối phiếu. Thanh toán T/T thì bỏ qua bước này.' },
    { n: '5', dept: 'Logistics / LAB', title: 'Đính kèm file bên ngoài',
      where: 'Chi tiết đơn → tab "Chứng từ" → mục "Checklist chứng từ" → nút Upload',
      rows: [
        ['COA (Certificate of Analysis)', 'Phòng LAB (VILAS 1522)', ''],
        ['Bill of Lading (B/L) — scan', 'Hãng tàu', ''],
        ['C/O Form B', 'VCCI / cơ quan cấp', ''],
        ['Insurance Certificate', 'Cty bảo hiểm (nếu CIF)', ''],
        ['Phytosanitary · Fumigation', 'Cơ quan kiểm dịch', ''],
        ['LC Copy', 'Ngân hàng', ''],
      ],
      note: 'Thanh đủ/thiếu (x/y) tự chạy. Xong → Khách → "Lịch sử bộ chứng từ" → "Đánh dấu hoàn thiện" (ghi ai + lúc nào).',
      attach: true },
  ]

  for (const s of secs) {
    k.push(H1(`BƯỚC ${s.n} — ${s.title}   [${s.dept}]`))
    k.push(P([R('Vào ở đâu:  ', { b: true, color: BLUE }), R(s.where)], { after: 80 }))
    if (s.attach) k.push(table(['File cần upload', 'Nguồn cấp'], s.rows.map((r) => [r[0], r[1]]), [50, 50]))
    else k.push(table(['Nhập gì', 'Bắt buộc', 'Lên chứng từ nào'], s.rows, [42, 16, 42]))
    k.push(P([R('Lưu ý: ', { b: true, color: RED }), R(s.note, { i: true })], { before: 60, after: 120 }))
  }

  // Ma trận
  k.push(H2('MA TRẬN: chứng từ nào cần dữ liệu nào'))
  const mHead = ['Dữ liệu (bộ phận nhập)', 'Invoice', 'Packing', 'Weight', 'Hối phiếu', 'Chiết khấu']
  const Y = 'X'
  const mrows = [
    ['Buyer/Consignee/Notify (Hồ sơ khách)', Y, Y, Y, '', ''],
    ['Shipping marks (Hồ sơ khách)', Y, Y, '', '', ''],
    ['Ngân hàng thụ hưởng (Hồ sơ khách)', Y, '', '', Y, Y],
    ['Grade/SL/Đơn giá/Incoterm (Sale)', Y, Y, Y, Y, Y],
    ['Số HĐ / PO# (Sale)', Y, '', '', '', Y],
    ['Container/Seal/Bành/Net (SX/Kho)', Y, Y, Y, '', ''],
    ['Tare / Gross (SX/Kho)', '', Y, Y, '', ''],
    ['Vessel/Cảng/ETD (Logistics)', Y, Y, Y, '', ''],
    ['B/L số + ngày (Logistics)', Y, '', Y, Y, ''],
    ['Cước/Bảo hiểm CIF (Logistics)', Y, '', '', '', ''],
    ['Số/ngày hóa đơn (Logistics)', Y, '', '', Y, ''],
    ['L/C số·ngày·NH·kỳ hạn (Kế toán)', Y, '', '', Y, Y],
  ]
  k.push(table(mHead, mrows, [34, 13, 13, 13, 13, 14]))

  // Checklist
  k.push(H2('CHECKLIST NHANH — trước khi bấm "Sinh chứng từ"'))
  ;[
    'Khách đã có Hồ sơ chứng từ (Consignee + Bank + Shipping mark)?',
    'Đơn có Số HĐ, đúng Grade/Số lượng/Đơn giá/Incoterm?',
    'Đã đóng gói: mỗi container có Số cont/Seal/Bành/Net/Tare/Gross?',
    'Tab Vận chuyển có Vessel · POL · POD · ETD · B/L số + ngày?',
    'Nếu CIF: đã nhập Cước & Bảo hiểm (nếu tách)?',
    'Nếu L/C: đã nhập Số L/C · NH phát hành · kỳ hạn (tab Đơn chiết khấu)?',
    'Đã upload COA · B/L · C/O · Bảo hiểm · Phyto ở Checklist?',
    'Đủ hết → Khách → Lịch sử bộ chứng từ → Đánh dấu hoàn thiện.',
  ].forEach((t) => k.push(bullet('☐ ' + t)))

  // ── PHỤ LỤC: đơn mẫu HA20260080 ──
  k.push(H1('PHỤ LỤC — Phiếu nhập liệu MẪU: đơn HA20260080 (GRI)'))
  k.push(P([R('Đơn thực hành HA20260080 — GLOBAL RUBBER INDUSTRIES (Sri Lanka) · SVR 10 · 105 tấn · $2,290/MT · CIF Colombo · Tổng $240,450. Số liệu dưới là THẬT (trích hồ sơ gốc). [Đã có] = hệ sẵn; [Cần nhập] = nhập theo giá trị in.', { i: true })], { after: 100 }))
  const wsHead = ['Trường', 'Trạng thái', 'Giá trị nhập']
  k.push(P('Bước 0 — Hồ sơ khách (Khách → Hồ sơ chứng từ)', { b: true, color: GREEN, before: 60 }))
  k.push(table(wsHead, [
    ['Buyer', 'Đã có', 'GLOBAL RUBBER INDUSTRIES (PVT) LTD'],
    ['Consignee', 'SỬA LẠI', 'THE ORDER OF HATTON NATIONAL BANK PLC (L/C này do HATTON phát hành)'],
    ['Notify', 'Đã có', 'GLOBAL RUBBER INDUSTRIES (PVT) LTD'],
    ['Shipping marks', 'Đã có', "Global Rubber Industries (Pvt) Ltd / No 28 Joseph's Lane, Colombo 04"],
    ['Ngân hàng thụ hưởng', 'Đã có', '(đã chọn — Vietcombank)'],
  ], [26, 16, 58]))
  k.push(P('Bước 1 — Thông tin đơn (Chi tiết đơn → tab Hợp đồng → Sửa)', { b: true, color: GREEN, before: 100 }))
  k.push(table(wsHead, [
    ['Grade·SL·Giá·Incoterm·Số HĐ', 'Đã có', 'SVR 10 · 105 tấn · $2,290 · CIF · HA20260080'],
    ['PO#', 'Cần nhập', 'R7323'],
    ['Điều khoản TT', 'Tuỳ', 'LC 90 days from B/L date (hồ sơ khách đã có default)'],
  ], [26, 16, 58]))
  k.push(P('Bước 2 — Đóng gói: 5 container (thêm cột Gross; Tare = 0)', { b: true, color: GREEN, before: 100 }))
  k.push(table(['#', 'Container', 'Seal', 'Bành', 'Net', 'Tare', 'Gross'], [
    ['1', 'MAXU1366024', 'J0163428', '600', '21000', '0', '21000'],
    ['2', 'TEMU1273290', 'J0163423', '600', '21000', '0', '21000'],
    ['3', 'CMAU2637820', 'J0163425', '600', '21000', '0', '21000'],
    ['4', 'GCXU2399422', 'J0163430', '600', '21000', '0', '21000'],
    ['5', 'APZU3777740', 'J0163141', '600', '21000', '0', '21000'],
    ['', 'TỔNG', '', '3000', '105000', '—', '105000'],
  ], [6, 24, 20, 10, 14, 12, 14]))
  k.push(P('Bước 3 — Vận chuyển (tab Vận chuyển → Chỉnh sửa)', { b: true, color: GREEN, before: 100 }))
  k.push(table(wsHead, [
    ['Tàu / Chuyến (Vessel)', 'Cần nhập', 'BRIDGE V.377S'],
    ['B/L Number', 'Cần nhập', 'SGN3340104'],
    ['B/L Type · Ngày B/L', 'Cần nhập', 'Original · 03/08/2026'],
    ['POL · POD', 'Đã có', 'Đà Nẵng · COLOMBO, SRI LANKA'],
    ['ETD', 'Cần nhập', '03/08/2026'],
    ['Cước · Phí bảo hiểm', 'ĐỂ TRỐNG', 'Đơn giá 2290 đã là CIF → để trống (nhập vào sẽ cộng dư)'],
    ['Số hóa đơn · Ngày hóa đơn', 'Cần nhập', 'HA20260080/CI · 26/07/2026'],
  ], [26, 16, 58]))
  k.push(P('Bước 4 — Chiết khấu L/C (tab Đơn chiết khấu)', { b: true, color: GREEN, before: 100 }))
  k.push(table(wsHead, [
    ['Số L/C · Ngày L/C', 'Cần nhập', '906OMLCU26010816 · 23/07/2026'],
    ['NH phát hành', 'Cần nhập', 'HATTON NATIONAL BANK PLC (SWIFT HBLILKLX001)'],
    ['Kỳ hạn', 'Cần nhập', '90 ngày (từ ngày B/L)'],
    ['Tỷ lệ TL · Lãi suất · Ngày nộp', 'Nếu có', 'Theo hồ sơ chiết khấu thực tế'],
  ], [26, 16, 58]))
  k.push(P('Kết quả kỳ vọng khi sinh:', { b: true, color: GREEN, before: 100 }))
  ;[
    'Invoice: No HA20260080/CI · 26/07/2026 · CIF Colombo · 105 MT SVR10 @ 2,290 = 240,450 · Vessel BRIDGE V.377S · B/L SGN3340104 · PO R7323 · L/C 906OMLCU26010816.',
    'Packing/Weight List: 5 cont × (Net 21.000 / Gross 21.000) · 3.000 bành · 105.000 KGS.',
    'Hối phiếu: AT 90 DAYS FROM B/L DATE · FOR USD 240,450 · Drawn under HATTON NATIONAL BANK.',
    'Lưu ý: bộ gốc draw Hối phiếu 234,094.20 (240,450 − cước 6,250 − BH 105.80); hệ ta draw theo tổng Invoice 240,450.',
  ].forEach((t) => k.push(bullet(t)))

  return makeDoc(k)
}

// ════════════════════════════════════════════════════════════════════
// 2) BÁO CÁO TỔNG QUAN
// ════════════════════════════════════════════════════════════════════
function reportDoc() {
  const k = []
  k.push(
    P('CÔNG TY TNHH CAO SU HUY ANH', { align: AlignmentType.CENTER, size: 10.5, color: MUTED, after: 20 }),
    P('BÁO CÁO TỔNG QUAN — HỆ BỘ CHỨNG TỪ XUẤT KHẨU', { align: AlignmentType.CENTER, b: true, size: 15, after: 20 }),
    P('Cập nhật 07/08/2026 · Nguồn số liệu prod thực tế (87 đơn đã xác nhận trở lên)', { align: AlignmentType.CENTER, i: true, size: 10, color: MUTED, after: 140 }),
    P([R('Kết luận: ', { b: true }), R('Khung & công cụ đã xong ~95% (tự sinh 5 chứng từ .docx chuẩn + đính kèm 7 loại + lịch sử theo khách + ĐỦ ô nhập). Nút thắt còn lại KHÔNG ở code mà ở NHẬP LIỆU — xem file "Hướng dẫn nhập liệu".')], { after: 140 }),
  )

  k.push(H2('A. Phần TỰ SINH được từ ERP (5 chứng từ)'))
  k.push(table(['Chứng từ', 'Nguồn dữ liệu', 'Ghi chú'], [
    ['Commercial Invoice', 'Đơn + hồ sơ khách + bank', 'Chuẩn khi khách có hồ sơ'],
    ['Packing List', 'Container + hồ sơ', 'Net chuẩn; gross từ số cân'],
    ['Weight List', 'Container', 'Nay dùng Tare/Gross thật'],
    ['Hối phiếu (BOE)', 'Invoice + chiết khấu', 'Tenor/L/C/NH nhập ở bước 4'],
    ['Đơn chiết khấu (L/C)', 'Form + checklist', 'Nhập tay điều kiện'],
  ], [26, 40, 34]))

  k.push(H2('B. Đã cải thiện 07/08/2026 (code + khung)'))
  k.push(P('Đã SỬA 2 bug + THÊM đủ ô nhập:', { b: true, after: 60 }))
  ;[
    'BUG B/L: generator đọc B/L từ bảng invoice (trống) → nay đọc từ đơn (Logistics nhập). B/L đã chảy đúng ra Invoice/WL/Hối phiếu.',
    'BUG cảng: Invoice hardcode Port of Loading/Discharge = "—" → nay lấy cảng thật + thêm dòng Vessel/ETD/B-L.',
    'THÊM ô: Cảng (POL/POD/dỡ) · Ngày B/L · Cước & Bảo hiểm (CIF) · Số & ngày hóa đơn (tab Vận chuyển).',
    'THÊM 2 cột Bì/Tare + Gross ở trang Đóng gói (trước chỉ có Net).',
    'THÊM tab "Lịch sử bộ chứng từ" ở màn Khách (tổng hợp đủ/thiếu + đánh dấu hoàn thiện + ai/lúc nào).',
  ].forEach((t) => k.push(bullet(t)))

  k.push(H2('C. Dữ liệu cần NHẬP (đã có ô, chờ con người điền)'))
  k.push(table(['Dữ liệu', 'Đã nhập', 'Bổ sung ở đâu'], [
    ['Hồ sơ chứng từ khách', '1/56 (2%)', 'Khách → Hồ sơ chứng từ  [ưu tiên 1]'],
    ['Tare / Gross container', '0/169 (0%)', 'Đóng gói (đã có 2 cột)'],
    ['Vessel / Cảng / ETD', '14–39%', 'Vận chuyển'],
    ['Số & ngày B/L', '~0%', 'Vận chuyển'],
    ['Số & ngày L/C', '5%', 'Đơn chiết khấu'],
    ['PO# / Điều khoản TT', '15% / 14%', 'Tạo đơn / hồ sơ khách'],
    ['Cước / Bảo hiểm (CIF)', '0%', 'Vận chuyển (đã có ô)'],
  ], [34, 20, 46]))
  k.push(P('% = tỷ lệ ĐÃ NHẬP thực tế. Ô nhập đã có đủ; việc còn lại là đôn đốc nhập.', { i: true, size: 10, color: MUTED, before: 40 }))

  k.push(H2('D. Phần ĐÍNH KÈM từ bên ngoài'))
  k.push(table(['Loại', 'Nguồn cấp'], [
    ['COA', 'Phòng LAB (VILAS 1522)'],
    ['Bill of Lading (B/L)', 'Hãng tàu'],
    ['C/O Form B', 'VCCI / cơ quan cấp'],
    ['Insurance', 'Cty bảo hiểm (nếu CIF)'],
    ['Phytosanitary / Fumigation', 'Cơ quan kiểm dịch'],
    ['LC Copy', 'Ngân hàng'],
  ], [45, 55]))
  k.push(P('Upload ở Checklist chứng từ (tab "Chứng từ" của đơn). COA = đính kèm, không tự sinh.', { i: true, size: 10, color: MUTED, before: 40 }))

  k.push(H2('E. Độ hoàn thiện & Lộ trình'))
  k.push(table(['Hạng mục', 'Mức'], [
    ['Khung / công cụ (sinh + đính kèm + .docx/PDF + lịch sử)', '~95%'],
    ['Ô nhập dữ liệu (UI đủ mọi field)', '100%'],
    ['Dữ liệu đã nhập thực tế', '~20% (cần đôn đốc)'],
  ], [70, 30]))
  k.push(P('Lộ trình:', { b: true, before: 80, after: 40 }))
  ;[
    'Ưu tiên 1: Đôn đốc nhập liệu theo file Hướng dẫn (hồ sơ khách chủ lực + Vận chuyển/Đóng gói cho đơn đang xuất).',
    'Gộp cả bộ (sinh + đính kèm) thành 1 file PDF để gửi ngân hàng/khách.',
    'Nối trạng thái chiết khấu L/C với module tiền về.',
    '(Nâng cao) Auto-fill hồ sơ khách từ HĐ/đơn cũ · nút "Đánh dấu hoàn thiện" ngay trong trang bộ chứng từ.',
  ].forEach((t) => k.push(bullet(t)))

  return makeDoc(k)
}

;(async () => {
  console.log('Sinh .docx bộ chứng từ:')
  await save(guideDoc(), 'docs/HUONG_DAN_NHAP_LIEU_BO_CHUNG_TU.docx')
  await save(reportDoc(), 'docs/BAO_CAO_TONG_QUAN_BO_CHUNG_TU.docx')
  console.log('Xong.')
})()
