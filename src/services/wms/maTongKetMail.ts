// ============================================================================
// Mail "Báo cáo chèn hàng theo mã sản xuất <Mã>" gửi Ban Giám đốc — từ bản tổng kết fn_nvl_tong_ket_ma / _lenh
//   · taiPhieuAnh(tk) → từng lần chèn (L1, L2…) của mã / lệnh + ảnh lúc lấy / lúc trả (raw_photos, bucket raw-photos công khai)
//   · soanMailTongKet(tk, phieu) → subject + text (mailto / sao chép) + html (mẫu như báo cáo thu mua mủ: bảng, dải xanh, hợp điện thoại)
//   · guiMailTongKet(to[], mail) → gửi từng người qua edge function send-email (sendSimpleEmail, tài khoản mail công ty)
// File: src/services/wms/maTongKetMail.ts
// ============================================================================
import { supabase } from '../../lib/supabase'
import { sendSimpleEmail } from '../emailService'
import { mixService, MIX_ISSUE_STATUS_LABELS, MIX_SOURCE_LABELS, MIX_VI_TRI_LABELS, type MixIssue } from './mixService'
import type { RawPhoto } from './rawPhotoService'
import type { RawLotTongKet } from './rawLotService'

const APP_URL = 'https://huyanhrubber.vn'
const kg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const kg1 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }))
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} %`)
const d = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—')
const dd = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—')
const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const KIND: Record<string, string> = { toan_canh: 'toàn cảnh', man_hinh_can: 'màn hình cân', bo_sung: 'bổ sung' }

export interface MailTongKet { subject: string; text: string; html: string }
/** một lần chèn (phiếu) kèm ảnh lúc lấy / lúc trả */
export interface PhieuAnh { i: MixIssue; lan: number; anhLay: RawPhoto[]; anhTra: RawPhoto[] }

/** Từng lần chèn của mã / lệnh (L1, L2… đếm theo ca) + ảnh, để kèm trong mail */
export async function taiPhieuAnh(tk: RawLotTongKet): Promise<PhieuAnh[]> {
  let list: MixIssue[] = []
  if (tk.lenh_id) list = await mixService.listIssues({ lenhId: tk.lenh_id, limit: 300 })
  else if (tk.raw_lot_id) list = await mixService.listIssues({ rawLotId: tk.raw_lot_id, limit: 300 })
  list = list.filter((i) => i.status !== 'cancelled')
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date) || (a.shift_id ?? '').localeCompare(b.shift_id ?? '') || a.out_at.localeCompare(b.out_at))
  const dem = new Map<string, number>()
  const rows: PhieuAnh[] = list.map((i) => { const k = `${i.shift_date}|${i.shift_id ?? ''}`; const n = (dem.get(k) ?? 0) + 1; dem.set(k, n); return { i, lan: n, anhLay: [], anhTra: [] } })
  if (rows.length) {
    const { data, error } = await supabase.from('raw_photos').select('*').in('ref_id', rows.map((r) => r.i.id)).in('ref_type', ['mix_issue_out', 'mix_issue_return']).order('taken_at')
    if (!error) for (const p of (data ?? []) as RawPhoto[]) { const r = rows.find((x) => x.i.id === p.ref_id); if (r) (p.ref_type === 'mix_issue_out' ? r.anhLay : r.anhTra).push(p) }
  }
  return rows
}

const tenCa = (i: MixIssue) => `${dd(i.shift_date)} ${i.shift_name || ''}${i.team ? ` · Ca ${i.team}` : ''}`.trim()
const canText = (i: MixIssue) => i.vi_tri === 'bang_tai'
  ? `băng tải · ${i.so_banh ?? '—'} bành, không pallet`
  : i.gross_kg !== null
    ? `cân 1 ${kg1(i.gross_kg)}${i.return_gross_kg !== null && !i.dung_het ? ` · cân 2 ${kg1(i.return_gross_kg)}` : i.dung_het ? ' · dùng hết' : ''}${i.return_pallet_kg !== null ? ` · bì ${kg1(i.return_pallet_kg)}` : ' · bì chưa khai'}`
    : 'gõ thẳng kg'

/** Nội dung báo cáo: cùng một bộ số cho text (mailto / sao chép) và html (gửi qua hệ thống, kèm ảnh) */
export function soanMailTongKet(tk: RawLotTongKet, phieu: PhieuAnh[] = []): MailTongKet {
  const p = tk.phieu
  const c = tk.chen
  const laLenh = !!tk.lenh_code
  const nhieuMa = (tk.ma_list?.length ?? 0) > 1
  const tieuHao = p.tieu_hao                       // mọi phiếu chưa hủy (kể cả chờ ký) — số đã nhận ghi kèm
  const choKy = Math.max(p.tieu_hao - p.tieu_hao_da_nhan, 0)
  const dotCuoi = tk.dot_chay.length ? tk.dot_chay[tk.dot_chay.length - 1] : null
  const dotDau = tk.dot_chay.length ? tk.dot_chay[0] : null
  const tyLe = c?.ty_le_pct ?? null
  const soAnh = phieu.reduce((s, r) => s + r.anhLay.length + r.anhTra.length, 0)
  const luuY: string[] = []
  if (p.chua_tra > 0) luuY.push(`${p.chua_tra} phiếu chèn chưa trả (còn ở dây chuyền) → tiêu hao chưa tính phần này`)
  if (p.cho_ky > 0) luuY.push(`${p.cho_ky} phiếu chèn chờ ký (${kg1(choKy)} kg tiêu hao chưa vào sổ ca)`)
  if (tk.dang_chay) luuY.push(laLenh ? 'Lệnh vẫn đang chạy (chưa bấm Kết thúc lệnh)' : 'Mã vẫn đang khai là đang chạy (chưa bấm Kết thúc mã)')
  if ((tk.xuat_sx_kho_kg ?? 0) <= 0) luuY.push('Mã chưa có phiếu xuất NVL vào sản xuất → chưa tính được % chèn và hiệu suất')
  if (tk.dry_kg > 0.5) luuY.push(`Còn ${kg(tk.dry_kg)} kg khô của mã trong kho NVL`)

  const subject = `Báo cáo chèn hàng theo mã sản xuất ${tk.ma}`
  const thoiGian = `${dotDau ? dt(dotDau.started_at) : '—'} → ${dotCuoi?.ended_at ? dt(dotCuoi.ended_at) : 'đang chạy'}`

  const dongLan = phieu.map((r) => `   L${r.lan} · ${tenCa(r.i)} · lô ${r.i.lot_so_lo || r.i.lot_code} · ${r.i.vi_tri ? MIX_VI_TRI_LABELS[r.i.vi_tri] : '—'}: lấy ${kg1(r.i.kg_out)} · trả ${kg1(r.i.kg_return)} · tiêu hao ${kg1(r.i.kg_used)} kg · ${MIX_ISSUE_STATUS_LABELS[r.i.status]} · ${r.anhLay.length + r.anhTra.length} ảnh`)
  const dongCa = tk.theo_ca.map((x) => `   ${d(x.shift_date)} ${x.shift_name}${x.team ? ` · Ca ${x.team}` : ''}: ${x.so_lan} lần · lấy ${kg(x.kg_lay)} · trả ${kg(x.kg_tra)} · tiêu hao ${kg(x.tieu_hao)} kg${x.chua_tra ? ` · ${x.chua_tra} chưa trả` : ''}${x.cho_ky ? ` · ${x.cho_ky} chờ ký` : ''}`)
  const dongLo = (c?.chi_tiet ?? []).map((x) => `   ${x.lot_code}${x.so_lo ? ` (số lô ${x.so_lo})` : ''} · ${MIX_SOURCE_LABELS[x.source_type as keyof typeof MIX_SOURCE_LABELS] ?? x.source_type}${x.vi_tri ? ` · ${MIX_VI_TRI_LABELS[x.vi_tri]}` : ''}: ${kg(x.kg)} kg${x.so_banh ? ` · ${x.so_banh} bành` : ''}`)

  const text = [
    'Kính gửi Ban Giám đốc,',
    '',
    `Nhà máy ${tk.facility_code} báo cáo chèn hàng cho mã sản xuất ${tk.ma}${laLenh ? ` (lệnh ${tk.lenh_code})` : ''}${tk.rubber_type_name ? ` · ${tk.rubber_type_name}` : ''}.`,
    `Thời gian chạy: ${thoiGian}${dotDau?.started_name ? ` · khai: ${dotDau.started_name}` : ''}${dotCuoi?.ended_name ? ` · kết thúc: ${dotCuoi.ended_name}` : ''}.`,
    '',
    '1. HÀNG CHÈN',
    `   - Tiêu hao: ${kg1(tieuHao)} kg${tyLe !== null ? ` = ${pct(tyLe)} hàng vào máy` : ''} (thủ kho đã nhận ${kg1(p.tieu_hao_da_nhan)} kg${choKy > 0 ? ` · chờ ký ${kg1(choKy)} kg` : ''})`,
    `   - Số lần chèn: ${p.tong} lần / ${p.so_ca} ca · ${p.so_banh} bành · đã lấy ${kg1(p.kg_lay)} kg · trả lại ${kg1(p.kg_tra)} kg`,
    `   - Vị trí: bể Slap ${kg1(p.be_slap)} kg · máy Mix ${kg1(p.may_mix)} kg · băng tải ${kg1(p.bang_tai)} kg`,
    c ? `   - Theo nguồn (đã nhận): hàng lỗi ${kg(c.loi_kg)} kg · DKL ${kg(c.dkl_kg)} kg · hàng chuẩn ${kg(c.chuan_kg)} kg · mua ngoài / khác ${kg(c.khac_kg)} kg` : '',
    dongLan.length ? `   - Từng lần chèn (${soAnh} ảnh kèm trong mail gửi qua hệ thống):` : '',
    ...dongLan,
    dongCa.length ? '   - Theo ca:' : '',
    ...dongCa,
    dongLo.length ? '   - Theo lô chèn (đã nhận):' : '',
    ...dongLo,
    '',
    '2. NGUYÊN LIỆU',
    ...(nhieuMa ? (tk.ma_list ?? []).map((m) => `   - ${m.ma}: ${m.so_xe} xe · nhập ${kg(m.nhap_kho_kg ?? m.dry_kg)} kg khô · xuất vào máy ${kg(m.xuat_sx_kho_kg)} kg · còn kho ${kg(m.dry_kg)} kg`) : []),
    `   - ${nhieuMa ? 'Tổng nhập kho' : 'Nhập kho'}: ${tk.so_xe} xe · ${kg(tk.wet_kg)} kg tươi · ${kg(tk.nhap_kho_kg ?? tk.dry_kg)} kg khô${tk.drc_pct !== null ? ` (DRC ${pct(tk.drc_pct)})` : ''}`,
    `   - Xuất vào sản xuất: ${kg(tk.xuat_sx_kho_kg)} kg khô · còn trong kho: ${kg(tk.dry_kg)} kg khô`,
    '',
    '3. THÀNH PHẨM (sổ ca ép bành đã nhận)',
    `   - ${tk.so_ca_ep ?? 0} ca ép · TP đạt ${kg(tk.tp_dat_kg)} kg · lỗi + DKL ${kg(tk.loi_dkl_kg)} kg${tk.ty_le_loi_pct !== null ? ` (${pct(tk.ty_le_loi_pct)})` : ''}`,
    `   - Hiệu suất: ${pct(tk.hieu_suat_pct)} = TP đạt / (NVL vào máy + chèn)`,
    '',
    luuY.length ? '4. LƯU Ý' : '4. Tất cả phiếu chèn đã đủ 3 chữ ký, số liệu chốt.',
    ...luuY.map((x) => `   - ${x}`),
    '',
    `Chi tiết: ${APP_URL}/wms/chen (chọn ${laLenh ? `lệnh ${tk.lenh_code}` : `mã ${tk.ma}`}) · lô NVL: ${APP_URL}/wms/nvl/lo`,
    '',
    `Người lập: ${tk.nguoi_lap?.name ?? ''} · ${dt(tk.luc)}`,
    'Huy Anh ERP · soạn tự động từ màn hình Hàng chèn',
  ].filter((x) => x !== '').join('\n')

  // ── HTML: mẫu báo cáo thu mua mủ (bảng, dải xanh #1B4D3E, hợp điện thoại ≤ 600px), kèm ảnh từng lần chèn ──
  const kpi = (title: string, value: string, sub: string, bg = '#F0F9F4', border = '#cde8d8', color = '#1B4D3E') =>
    `<td width="50%" style="padding:4px;vertical-align:top;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border:1px solid ${border};border-radius:10px;"><tr><td style="padding:10px 12px;">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">${esc(title)}</div>
      <div style="font-size:22px;font-weight:800;color:${color};margin-top:2px;">${value}</div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">${sub}</div></td></tr></table></td>`
  const anhTd = (a: RawPhoto, nhan: string) => `<td width="50%" style="padding:6px 3px 0 3px;vertical-align:top;">
      ${a.public_url ? `<a href="${a.public_url}"><img src="${a.public_url}" alt="${esc(nhan)}" width="270" style="display:block;width:100%;max-width:270px;height:auto;border-radius:8px;border:1px solid #d9e7df;"></a>` : ''}
      <div style="font-size:11px;color:#64748b;margin-top:3px;">${esc(nhan)} · ${hm(a.taken_at)}</div></td>`
  const anhRows = (list: { a: RawPhoto; nhan: string }[]) => {
    const rows: string[] = []
    for (let k = 0; k < list.length; k += 2) rows.push(`<tr>${anhTd(list[k].a, list[k].nhan)}${list[k + 1] ? anhTd(list[k + 1].a, list[k + 1].nhan) : '<td width="50%"></td>'}</tr>`)
    return rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>` : ''
  }
  const theLan = phieu.map((r) => {
    const i = r.i
    const anh = [...r.anhLay.map((a) => ({ a, nhan: `Lấy · ${KIND[a.kind] ?? a.kind}` })), ...r.anhTra.map((a) => ({ a, nhan: `Trả · ${KIND[a.kind] ?? a.kind}` }))]
    return `<tr><td style="padding:5px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7FAF8;border:1px solid #d9e7df;border-radius:10px;"><tr><td style="padding:10px 12px;">
      <div style="font-size:14px;font-weight:800;color:#0D2E25;">L${r.lan} · ${esc(tenCa(i))}</div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">Lô ${esc(i.lot_so_lo || i.lot_code)} · ${esc(MIX_SOURCE_LABELS[i.source_type])} · ${i.vi_tri ? esc(MIX_VI_TRI_LABELS[i.vi_tri]) : '—'} · ${esc(i.code)} · ${esc(MIX_ISSUE_STATUS_LABELS[i.status])}</div>
      <div style="font-size:13px;margin-top:6px;">Lấy <b>${kg1(i.kg_out)}</b> · trả <b>${kg1(i.kg_return)}</b> · <b style="color:#1B4D3E;">tiêu hao ${kg1(i.kg_used)} kg</b>${i.so_banh !== null ? ` · ${i.so_banh} bành` : ''}<br><span style="font-size:12px;color:#64748b;">${esc(canText(i))}${i.ma_goc_all ? ` · vào mã ${esc(i.ma_goc_all)}` : ''}</span></div>
      ${anh.length ? anhRows(anh) : '<div style="font-size:12px;color:#B45309;margin-top:6px;">Chưa có ảnh.</div>'}
    </td></tr></table></td></tr>`
  }).join('')
  const tr = (cells: string[], head = false) => `<tr>${cells.map((x, k) => `<${head ? 'th' : 'td'} style="border-top:1px solid #eef1f0;padding:6px 8px;text-align:${k === 0 ? 'left' : 'right'};font-size:13px;${head ? 'background:#F5F7FA;color:#475569;font-weight:600;' : ''}">${x}</${head ? 'th' : 'td'}>`).join('')}</tr>`
  const bangCa = tk.theo_ca.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${tr(['Ca', 'Lần', 'Lấy', 'Trả', 'Tiêu hao'], true)}${tk.theo_ca.map((x) => tr([esc(`${dd(x.shift_date)} ${x.shift_name}${x.team ? ` · Ca ${x.team}` : ''}`), String(x.so_lan), kg(x.kg_lay), kg(x.kg_tra), `<b>${kg(x.tieu_hao)}</b>`])).join('')}${tr(['<b>Tổng</b>', `<b>${p.tong}</b>`, `<b>${kg(p.kg_lay)}</b>`, `<b>${kg(p.kg_tra)}</b>`, `<b>${kg(p.tieu_hao)}</b>`])}</table>` : ''
  const h3 = (s: string) => `<tr><td style="padding:14px 20px 4px 20px;"><div style="font-size:14px;font-weight:800;color:#0D2E25;border-left:4px solid #1B4D3E;padding-left:8px;">${s}</div></td></tr>`

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#eef1f0;font-family:Arial,'Helvetica Neue',sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;color:#eef1f0;">Mã ${esc(tk.ma)}: tiêu hao chèn ${kg1(tieuHao)} kg · ${p.tong} lần · ${soAnh} ảnh.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f0;padding:12px 6px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);">
      <tr><td style="background:#1B4D3E;padding:18px 20px;">
        <div style="color:#fff;font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">Cao Su Huy Anh · Nhà máy ${esc(tk.facility_code)}</div>
        <div style="color:#fff;font-size:19px;font-weight:800;margin-top:2px;">BÁO CÁO CHÈN HÀNG THEO MÃ SẢN XUẤT</div>
        <div style="color:#FFD54F;font-size:20px;font-weight:800;margin-top:3px;font-family:Consolas,monospace;">${esc(tk.ma)}</div>
        <div style="color:#cfe3d8;font-size:12px;margin-top:3px;">${laLenh ? `Lệnh ${esc(tk.lenh_code ?? '')} · ` : ''}${esc(thoiGian)}${tk.rubber_type_name ? ` · ${esc(tk.rubber_type_name)}` : ''}</div>
      </td></tr>
      <tr><td style="padding:16px 20px 2px 20px;"><div style="font-size:14px;line-height:1.6;"><b>Kính gửi Quý Anh/Chị Ban Giám đốc,</b><br>Hệ thống Hàng chèn xin gửi báo cáo chèn hàng cho mã sản xuất <b>${esc(tk.ma)}</b>${tk.dang_chay ? ' (đang chạy, số tới giờ gửi)' : ' (đã kết thúc)'}:</div></td></tr>
      <tr><td style="padding:8px 16px 0 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>${kpi('Tiêu hao hàng chèn', `${kg1(tieuHao)} kg`, `${tyLe !== null ? `= ${pct(tyLe)} hàng vào máy · ` : ''}đã nhận ${kg1(p.tieu_hao_da_nhan)}${choKy > 0 ? ` · chờ ký ${kg1(choKy)}` : ''}`)}
            ${kpi('Số lần chèn', `${p.tong}`, `${p.so_ca} ca · ${p.so_banh} bành · lấy ${kg(p.kg_lay)} · trả ${kg(p.kg_tra)} kg`, '#FFF8EC', '#f3e1bd', '#B45309')}</tr>
        <tr>${kpi('NVL vào máy', `${kg(tk.xuat_sx_kho_kg)} kg`, `nhập ${kg(tk.nhap_kho_kg ?? tk.dry_kg)} kg khô · ${tk.so_xe} xe · còn kho ${kg(tk.dry_kg)}`, '#F5F7FA', '#e2e8f0', '#1f2937')}
            ${kpi('Thành phẩm đạt', `${kg(tk.tp_dat_kg)} kg`, `${tk.so_ca_ep ?? 0} ca ép · hiệu suất ${pct(tk.hieu_suat_pct)}`, '#F5F7FA', '#e2e8f0', '#1f2937')}</tr>
      </table></td></tr>
      <tr><td style="padding:8px 20px 0 20px;font-size:13px;color:#475569;">Vị trí: bể Slap <b>${kg1(p.be_slap)}</b> · máy Mix <b>${kg1(p.may_mix)}</b> · băng tải <b>${kg1(p.bang_tai)}</b> kg${c ? `<br>Theo nguồn (đã nhận): lỗi ${kg(c.loi_kg)} · DKL ${kg(c.dkl_kg)} · chuẩn ${kg(c.chuan_kg)} · mua ngoài/khác ${kg(c.khac_kg)} kg` : ''}${nhieuMa ? `<br>Theo mã: ${(tk.ma_list ?? []).map((m) => `${esc(m.ma)} nhập ${kg(m.nhap_kho_kg ?? m.dry_kg)} · xuất ${kg(m.xuat_sx_kho_kg)} kg`).join(' · ')}` : ''}</td></tr>
      ${phieu.length ? h3(`Từng lần chèn · ${phieu.length} lần · ${soAnh} ảnh`) + theLan : ''}
      ${bangCa ? h3('Chèn theo ca') + `<tr><td style="padding:4px 20px;">${bangCa}</td></tr>` : ''}
      ${luuY.length ? h3('Lưu ý') + `<tr><td style="padding:4px 20px;"><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#B45309;">${luuY.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></td></tr>` : h3('Tất cả phiếu chèn đã đủ 3 chữ ký, số liệu chốt.')}
      <tr><td style="padding:14px 20px 18px 20px;border-top:1px solid #eef1f0;">
        <div style="font-size:12px;color:#475569;line-height:1.6;">Chi tiết: <a href="${APP_URL}/wms/chen" style="color:#1B4D3E;">${APP_URL}/wms/chen</a> (chọn ${laLenh ? `lệnh ${esc(tk.lenh_code ?? '')}` : `mã ${esc(tk.ma)}`}) · <a href="${APP_URL}/wms/nvl/lo" style="color:#1B4D3E;">lô NVL</a><br>
        Người lập: <b>${esc(tk.nguoi_lap?.name ?? '')}</b> · ${dt(tk.luc)}. Chạm ảnh để xem lớn. Tiêu hao = kg lấy − kg trả (bì pallet triệt tiêu); băng tải tính theo bành.</div>
      </td></tr>
    </table>
    <div style="font-size:11px;color:#9aa4a0;padding:12px;">© Cao Su Huy Anh · Huy Anh ERP · Email nội bộ — không trả lời.</div>
  </td></tr></table>
</body></html>`
  return { subject, text, html }
}

/** Link mở ứng dụng mail (Outlook / Mail) với người nhận, tiêu đề và nội dung điền sẵn (không kèm ảnh) */
export function mailtoTongKet(to: string[], m: MailTongKet): string {
  return `mailto:${to.join(',')}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}`
}

/** Gửi qua hệ thống (edge function send-email, tài khoản gửi của công ty) — từng người một để có kết quả riêng */
export async function guiMailTongKet(to: string[], m: MailTongKet): Promise<{ ok: string[]; loi: { email: string; msg: string }[] }> {
  const ok: string[] = []; const loi: { email: string; msg: string }[] = []
  for (const email of to) {
    const r = await sendSimpleEmail({ to: email, subject: m.subject, html: m.html })
    if (r.success) ok.push(email); else loi.push({ email, msg: r.error?.message || 'không gửi được' })
  }
  return { ok, loi }
}
