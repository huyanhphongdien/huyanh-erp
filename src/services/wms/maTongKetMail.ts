// ============================================================================
// Soạn mail "Kết thúc mã nguyên liệu" gửi Ban Giám đốc từ bản tổng kết fn_nvl_tong_ket_ma
//   · soanMailTongKet(tk) → subject + text (mailto / sao chép) + html (gửi qua send-email)
//   · guiMailTongKet(tk, to[]) → gửi từng người qua edge function send-email (sendSimpleEmail)
// File: src/services/wms/maTongKetMail.ts
// ============================================================================
import { sendSimpleEmail } from '../emailService'
import { MIX_SOURCE_LABELS, MIX_VI_TRI_LABELS } from './mixService'
import type { RawLotTongKet } from './rawLotService'

const APP_URL = 'https://huyanhrubber.vn'
const kg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} %`)
const d = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—')
const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface MailTongKet { subject: string; text: string; html: string }

/** Nội dung báo cáo: cùng một bộ số cho text (mailto / sao chép) và html (gửi qua hệ thống) */
export function soanMailTongKet(tk: RawLotTongKet): MailTongKet {
  const p = tk.phieu
  const c = tk.chen
  const tieuHao = c?.chen_kg ?? p.tieu_hao_da_nhan
  const dotCuoi = tk.dot_chay.length ? tk.dot_chay[tk.dot_chay.length - 1] : null
  const dotDau = tk.dot_chay.length ? tk.dot_chay[0] : null
  const tyLe = c?.ty_le_pct ?? null
  const conKho = tk.dry_kg
  const luuY: string[] = []
  if (p.chua_tra > 0) luuY.push(`${p.chua_tra} phiếu chèn chưa trả (còn ở dây chuyền) → tiêu hao chưa tính phần này`)
  if (p.cho_ky > 0) luuY.push(`${p.cho_ky} phiếu chèn chờ ký (${kg(p.tieu_hao - p.tieu_hao_da_nhan, 1)} kg tiêu hao chưa vào sổ ca)`)
  if (tk.dang_chay) luuY.push('Mã vẫn đang khai là đang chạy (chưa bấm Kết thúc mã)')
  if ((tk.xuat_sx_kho_kg ?? 0) <= 0) luuY.push('Mã chưa có phiếu xuất NVL vào sản xuất → chưa tính được % chèn và hiệu suất')
  if (conKho > 0.5) luuY.push(`Còn ${kg(conKho)} kg khô của mã trong kho NVL`)

  const subject = `[Huy Anh ERP] Kết thúc mã ${tk.ma}${tieuHao > 0 ? ` · chèn ${kg(tieuHao)} kg${tyLe !== null ? ` (${pct(tyLe)})` : ''}` : ''} · ${tk.facility_code}`

  const dongCa = tk.theo_ca.map((x) => `   ${d(x.shift_date)} ${x.shift_name}${x.team ? ` · Ca ${x.team}` : ''}: ${x.so_lan} lần · lấy ${kg(x.kg_lay)} · trả ${kg(x.kg_tra)} · tiêu hao ${kg(x.tieu_hao)} kg${x.chua_tra ? ` · ${x.chua_tra} chưa trả` : ''}${x.cho_ky ? ` · ${x.cho_ky} chờ ký` : ''}`)
  const dongLo = (c?.chi_tiet ?? []).map((x) => `   ${x.lot_code}${x.so_lo ? ` (số lô ${x.so_lo})` : ''} · ${MIX_SOURCE_LABELS[x.source_type as keyof typeof MIX_SOURCE_LABELS] ?? x.source_type}${x.vi_tri ? ` · ${MIX_VI_TRI_LABELS[x.vi_tri]}` : ''}: ${kg(x.kg)} kg${x.so_banh ? ` · ${x.so_banh} bành` : ''}${x.co_chung ? ' (chèn chung mã khác, chia đều)' : ''}`)

  const text = [
    'Kính gửi Ban Giám đốc,',
    '',
    `Nhà máy ${tk.facility_code} ${tk.dang_chay ? 'báo cáo mã nguyên liệu đang chạy' : 'đã kết thúc chạy mã nguyên liệu'} ${tk.ma}${tk.rubber_type_name ? ` (${tk.rubber_type_name})` : ''}.`,
    `Thời gian chạy: ${dotDau ? dt(dotDau.started_at) : '—'} → ${dotCuoi?.ended_at ? dt(dotCuoi.ended_at) : 'đang chạy'}${dotDau?.started_name ? ` · khai: ${dotDau.started_name}` : ''}${dotCuoi?.ended_name ? ` · kết thúc: ${dotCuoi.ended_name}` : ''}${tk.dot_chay.length > 1 ? ` (${tk.dot_chay.length} đợt)` : ''}.`,
    '',
    '1. NGUYÊN LIỆU',
    `   - Nhập kho: ${tk.so_xe} xe · ${kg(tk.wet_kg)} kg tươi · ${kg(tk.nhap_kho_kg ?? tk.dry_kg)} kg khô${tk.drc_pct !== null ? ` (DRC ${pct(tk.drc_pct)})` : ''} · về ${d(tk.ngay_dau)}${tk.ngay_cuoi && tk.ngay_cuoi !== tk.ngay_dau ? ` → ${d(tk.ngay_cuoi)}` : ''}`,
    `   - Xuất vào sản xuất: ${kg(tk.xuat_sx_kho_kg)} kg khô`,
    `   - Còn trong kho: ${kg(conKho)} kg khô`,
    '',
    '2. HÀNG CHÈN VÀO MÃ NÀY',
    `   - Tiêu hao: ${kg(tieuHao)} kg${tyLe !== null ? ` = ${pct(tyLe)} hàng vào máy` : ''} (thủ kho đã nhận ${kg(p.tieu_hao_da_nhan)} kg${p.cho_ky > 0 ? ` · chờ ký ${kg(p.tieu_hao - p.tieu_hao_da_nhan)} kg` : ''})`,
    `   - Số lần chèn: ${p.tong} lần / ${p.so_ca} ca · ${p.so_banh} bành · đã lấy ${kg(p.kg_lay)} kg · trả lại ${kg(p.kg_tra)} kg`,
    `   - Vị trí: bể Slap ${kg(c?.be_kg ?? p.be_slap)} kg · máy Mix ${kg(c?.mix_kg ?? p.may_mix)} kg`,
    c ? `   - Theo nguồn: hàng lỗi ${kg(c.loi_kg)} kg · DKL ${kg(c.dkl_kg)} kg · hàng chuẩn ${kg(c.chuan_kg)} kg · mua ngoài/khác ${kg(c.khac_kg)} kg` : '',
    dongLo.length ? '   - Theo lô chèn:' : '',
    ...dongLo,
    dongCa.length ? '   - Theo ca:' : '',
    ...dongCa,
    '',
    '3. THÀNH PHẨM (sổ ca ép bành đã nhận)',
    `   - ${tk.so_ca_ep ?? 0} ca ép · TP đạt ${kg(tk.tp_dat_kg)} kg · lỗi + DKL ${kg(tk.loi_dkl_kg)} kg${tk.ty_le_loi_pct !== null ? ` (${pct(tk.ty_le_loi_pct)})` : ''}`,
    `   - Hiệu suất: ${pct(tk.hieu_suat_pct)} = TP đạt / (NVL vào máy + chèn)`,
    '',
    luuY.length ? '4. LƯU Ý' : '4. Tất cả phiếu chèn của mã đã đủ 3 chữ ký, số liệu chốt.',
    ...luuY.map((x) => `   - ${x}`),
    '',
    `Chi tiết: ${APP_URL}/wms/chen (chọn mã ${tk.ma}) · lô NVL: ${APP_URL}/wms/nvl/lo`,
    '',
    `Người lập: ${tk.nguoi_lap?.name ?? ''} · ${dt(tk.luc)}`,
    'Huy Anh ERP · soạn tự động từ màn hình Hàng chèn',
  ].filter((x) => x !== '').join('\n')

  // html: cùng nội dung, bảng cho theo ca / theo lô
  const tr = (cells: string[], head = false) => `<tr>${cells.map((x, i) => `<${head ? 'th' : 'td'} style="border:1px solid #ddd;padding:4px 8px;text-align:${i === 0 ? 'left' : 'right'};${head ? 'background:#f3f4f6' : ''}">${x}</${head ? 'th' : 'td'}>`).join('')}</tr>`
  const bangCa = tk.theo_ca.length ? `<table style="border-collapse:collapse;font-size:13px;margin:6px 0">${tr(['Ca', 'Lần', 'Lấy (kg)', 'Trả (kg)', 'Tiêu hao (kg)', 'Ghi chú'], true)}${tk.theo_ca.map((x) => tr([esc(`${d(x.shift_date)} ${x.shift_name}${x.team ? ` · Ca ${x.team}` : ''}`), String(x.so_lan), kg(x.kg_lay), kg(x.kg_tra), kg(x.tieu_hao), esc([x.chua_tra ? `${x.chua_tra} chưa trả` : '', x.cho_ky ? `${x.cho_ky} chờ ký` : ''].filter(Boolean).join(' · '))])).join('')}${tr(['<b>Tổng</b>', `<b>${p.tong}</b>`, `<b>${kg(p.kg_lay)}</b>`, `<b>${kg(p.kg_tra)}</b>`, `<b>${kg(p.tieu_hao)}</b>`, ''])}</table>` : ''
  const bangLo = c?.chi_tiet?.length ? `<table style="border-collapse:collapse;font-size:13px;margin:6px 0">${tr(['Lô chèn', 'Nguồn', 'Vị trí', 'Kg', 'Bành'], true)}${c.chi_tiet.map((x) => tr([esc(`${x.lot_code}${x.so_lo ? ` (${x.so_lo})` : ''}${x.co_chung ? ' · chung mã' : ''}`), esc(MIX_SOURCE_LABELS[x.source_type as keyof typeof MIX_SOURCE_LABELS] ?? x.source_type), esc(x.vi_tri ? MIX_VI_TRI_LABELS[x.vi_tri] : '—'), kg(x.kg), x.so_banh ? String(x.so_banh) : '—'])).join('')}</table>` : ''
  const html = `<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#111;font-size:14px;line-height:1.5">
<h2 style="color:#1B4D3E;margin:0 0 4px">${tk.dang_chay ? 'Báo cáo mã nguyên liệu đang chạy' : 'Kết thúc mã nguyên liệu'} ${esc(tk.ma)}</h2>
<p style="margin:0 0 12px;color:#555">${esc(tk.rubber_type_name || '')} · nhà máy ${esc(tk.facility_code)} · ${dotDau ? dt(dotDau.started_at) : '—'} → ${dotCuoi?.ended_at ? dt(dotCuoi.ended_at) : 'đang chạy'}</p>
<p>Kính gửi Ban Giám đốc,</p>
<table style="border-collapse:collapse;font-size:14px;margin:8px 0">
${tr(['Tiêu hao hàng chèn', `<b style="font-size:18px;color:#1B4D3E">${kg(tieuHao)} kg</b>${tyLe !== null ? ` &nbsp;= ${pct(tyLe)} hàng vào máy` : ''}`])}
${tr(['Số lần chèn', `${p.tong} lần / ${p.so_ca} ca · ${p.so_banh} bành · lấy ${kg(p.kg_lay)} · trả ${kg(p.kg_tra)} kg`])}
${tr(['Vị trí', `bể Slap ${kg(c?.be_kg ?? p.be_slap)} kg · máy Mix ${kg(c?.mix_kg ?? p.may_mix)} kg`])}
${c ? tr(['Theo nguồn', `lỗi ${kg(c.loi_kg)} · DKL ${kg(c.dkl_kg)} · chuẩn ${kg(c.chuan_kg)} · khác ${kg(c.khac_kg)} kg`]) : ''}
${tr(['NVL nhập kho', `${tk.so_xe} xe · ${kg(tk.wet_kg)} kg tươi · ${kg(tk.nhap_kho_kg ?? tk.dry_kg)} kg khô${tk.drc_pct !== null ? ` (DRC ${pct(tk.drc_pct)})` : ''}`])}
${tr(['NVL xuất vào sản xuất', `${kg(tk.xuat_sx_kho_kg)} kg khô · còn kho ${kg(conKho)} kg`])}
${tr(['Thành phẩm', `${tk.so_ca_ep ?? 0} ca ép · TP đạt ${kg(tk.tp_dat_kg)} kg · lỗi + DKL ${kg(tk.loi_dkl_kg)} kg${tk.ty_le_loi_pct !== null ? ` (${pct(tk.ty_le_loi_pct)})` : ''}`])}
${tr(['Hiệu suất', `<b>${pct(tk.hieu_suat_pct)}</b> = TP đạt / (NVL vào máy + chèn)`])}
</table>
${bangCa ? `<h3 style="font-size:14px;margin:12px 0 2px">Chèn theo ca</h3>${bangCa}` : ''}
${bangLo ? `<h3 style="font-size:14px;margin:12px 0 2px">Theo lô chèn</h3>${bangLo}` : ''}
${luuY.length ? `<h3 style="font-size:14px;margin:12px 0 2px;color:#B45309">Lưu ý</h3><ul style="margin:0 0 8px 18px">${luuY.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p style="color:#15803D">Tất cả phiếu chèn của mã đã đủ 3 chữ ký, số liệu chốt.</p>'}
<p style="margin:12px 0 0">Chi tiết: <a href="${APP_URL}/wms/chen">${APP_URL}/wms/chen</a> (chọn mã ${esc(tk.ma)}) · <a href="${APP_URL}/wms/nvl/lo">lô NVL</a></p>
<p style="color:#555;font-size:12px;margin:12px 0 0">Người lập: ${esc(tk.nguoi_lap?.name ?? '')} · ${dt(tk.luc)}<br/>Huy Anh ERP · soạn tự động từ màn hình Hàng chèn</p>
</div>`
  return { subject, text, html }
}

/** Link mở ứng dụng mail (Outlook / Mail) với người nhận, tiêu đề và nội dung điền sẵn */
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
