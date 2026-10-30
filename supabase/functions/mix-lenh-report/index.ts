// =============================================================================
// EDGE FUNCTION: mix-lenh-report — "Báo cáo chèn hàng theo mã sản xuất <Mã>" gửi Ban Giám đốc
//   Gọi khi QS bấm Kết thúc lệnh (hoặc kết thúc mã): app invoke { lenh_id } | { raw_lot_id } (+ nguoi_lap, to[], dry).
//   Server tự tổng kết (fn_nvl_tong_ket_lenh / _ma), tải từng lần chèn + ảnh (raw_photos public url), dựng HTML theo mẫu
//   báo cáo thu mua mủ (logo cid, bảng, hợp điện thoại) và gửi qua Microsoft Graph như daily-rubber-report.
//   Người nhận = chức vụ level ≤ 3 có email (employees + positions) ∪ MAIL_THEM (minhld@) ∪ body.to.
// Deploy: npx supabase functions deploy mix-lenh-report --no-verify-jwt
// Test:   curl -X POST "https://dygveetaatqllhjusyzz.supabase.co/functions/v1/mix-lenh-report" -H "Content-Type: application/json" -d '{"lenh_id":"<uuid>","dry":true}'
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { LOGO_B64 } from '../daily-rubber-report/logo.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') || '029187c4-44dd-4da0-b3e1-9ebda8f90b1a'
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') || 'ee1377e6-b52c-4326-88f2-c18c3b59fded'
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') || Deno.env.get('MICROSOFT_CLIENT_SECRET') || ''
const SENDER_EMAIL = Deno.env.get('EMAIL_FROM') || 'huyanhphongdien@huyanhrubber.com'
const APP_URL = 'https://huyanhrubber.vn'

// ★ Luôn nhận thêm ngoài BGĐ trong Nhân sự (chủ DN 31/10: "thêm minhld@huyanhrubber.com vào danh sách gửi mail tự động")
const MAIL_THEM: Array<{ name: string; email: string }> = [{ name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' }]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Microsoft Graph (như daily-rubber-report) ────────────────────────────────
async function getAccessToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  })
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`)
  return (await res.json()).access_token
}
async function sendEmail(token: string, recipients: Array<{ name: string; email: string }>, subject: string, html: string) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: recipients.map((r) => ({ emailAddress: { address: r.email, name: r.name } })),
        attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: 'logo.png', contentType: 'image/png', contentId: 'huyanh-logo', isInline: true, contentBytes: LOGO_B64 }],
      },
      saveToSentItems: true,
    }),
  })
  if (!res.ok) throw new Error(`Send email error: ${await res.text()}`)
}

// ── Nhãn (đồng bộ src/services/wms/mixService.ts) ───────────────────────────
const SRC: Record<string, string> = { loi: 'Hàng lỗi (LOI)', dkl: 'Dính kim loại (DKL)', std: 'Hàng chuẩn (kho TP)', mua_ngoai: 'Mua ngoài', khac: 'Khác' }
const VT: Record<string, string> = { be_slap: 'Bể Slap', may_mix: 'Máy Mix', bang_tai: 'Băng tải' }
const ST: Record<string, string> = { issued: 'Đã lấy · đang ở dây chuyền', returned: 'Đã trả · chờ ký', submitted: 'QS đã ký khai báo', qc_confirmed: 'QC đã duyệt', received: 'Thủ kho đã nhận', cancelled: 'Đã hủy' }
const KIND: Record<string, string> = { toan_canh: 'toàn cảnh', man_hinh_can: 'màn hình cân', bo_sung: 'bổ sung' }

// ── Định dạng (giờ VN, không làm tròn kg) ───────────────────────────────────
const VN = 7 * 3600 * 1000
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
const kg = (n: unknown) => { const x = num(n); return x === null || !Number.isFinite(x) ? '—' : x.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 0 }) }
const pct = (n: unknown) => { const x = num(n); return x === null ? '—' : `${x.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} %` }
const vn = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + VN) : null)
const p2 = (n: number) => String(n).padStart(2, '0')
const dd = (iso: string | null | undefined) => { const d = vn(iso); return d ? `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}` : '—' }
const ddate = (iso: string | null | undefined) => { const d = vn(iso); return d ? `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : '—' }
const dt = (iso: string | null | undefined) => { const d = vn(iso); return d ? `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} ${ddate(iso)}` : '—' }
const hm = (iso: string | null | undefined) => { const d = vn(iso); return d ? `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : '' }
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── Dựng HTML ────────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
function renderHtml(tk: any, phieu: Array<{ i: any; lan: number; anh: any[] }>, nguoiLap: string): { subject: string; html: string; preheader: string } {
  const p = tk.phieu ?? {}; const c = tk.chen
  const laLenh = !!tk.lenh_code
  const maList: any[] = Array.isArray(tk.ma_list) ? tk.ma_list : []
  const nhieuMa = maList.length > 1
  const tieuHao = num(p.tieu_hao) ?? 0; const daNhan = num(p.tieu_hao_da_nhan) ?? 0; const choKy = Math.max(tieuHao - daNhan, 0)
  const dot: any[] = Array.isArray(tk.dot_chay) ? tk.dot_chay : []
  const dotDau = dot[0]; const dotCuoi = dot[dot.length - 1]
  const soAnh = phieu.reduce((s, r) => s + r.anh.length, 0)
  const tyLe = c?.ty_le_pct ?? null
  const luuY: string[] = []
  if ((num(p.chua_tra) ?? 0) > 0) luuY.push(`${p.chua_tra} phiếu chèn chưa trả (còn ở dây chuyền) → tiêu hao chưa tính phần này`)
  if ((num(p.cho_ky) ?? 0) > 0) luuY.push(`${p.cho_ky} phiếu chèn chờ ký (${kg(choKy)} kg tiêu hao chưa vào sổ ca)`)
  if (tk.dang_chay) luuY.push(laLenh ? 'Lệnh vẫn đang chạy (chưa bấm Kết thúc lệnh)' : 'Mã vẫn đang khai là đang chạy')
  if ((num(tk.xuat_sx_kho_kg) ?? 0) <= 0) luuY.push('Mã chưa có phiếu xuất NVL vào sản xuất → chưa tính được % chèn và hiệu suất')
  if ((num(tk.dry_kg) ?? 0) > 0.5) luuY.push(`Còn ${kg(tk.dry_kg)} kg khô của mã trong kho NVL`)
  const thoiGian = `${dotDau ? dt(dotDau.started_at) : '—'} → ${dotCuoi?.ended_at ? dt(dotCuoi.ended_at) : 'đang chạy'}`
  const subject = `Báo cáo chèn hàng theo mã sản xuất ${tk.ma}`

  const kpi = (title: string, value: string, sub: string, bg = '#F0F9F4', border = '#cde8d8', color = '#1B4D3E') =>
    `<td width="50%" style="padding:4px;vertical-align:top;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border:1px solid ${border};border-radius:10px;"><tr><td style="padding:10px 12px;">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">${esc(title)}</div>
      <div style="font-size:22px;font-weight:800;color:${color};margin-top:2px;">${value}</div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">${sub}</div></td></tr></table></td>`
  const anhTd = (a: any, nhan: string) => `<td width="50%" style="padding:6px 3px 0 3px;vertical-align:top;">
      ${a.public_url ? `<a href="${a.public_url}"><img src="${a.public_url}" alt="${esc(nhan)}" width="270" style="display:block;width:100%;max-width:270px;height:auto;border-radius:8px;border:1px solid #d9e7df;"></a>` : ''}
      <div style="font-size:11px;color:#64748b;margin-top:3px;">${esc(nhan)} · ${hm(a.taken_at)}</div></td>`
  const anhRows = (list: Array<{ a: any; nhan: string }>) => {
    const rows: string[] = []
    for (let k = 0; k < list.length; k += 2) rows.push(`<tr>${anhTd(list[k].a, list[k].nhan)}${list[k + 1] ? anhTd(list[k + 1].a, list[k + 1].nhan) : '<td width="50%"></td>'}</tr>`)
    return rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join('')}</table>` : ''
  }
  const canText = (i: any) => i.vi_tri === 'bang_tai' ? `băng tải · ${i.so_banh ?? '—'} bành, không pallet`
    : num(i.gross_kg) !== null ? `cân 1 ${kg(i.gross_kg)}${num(i.return_gross_kg) !== null && !i.dung_het ? ` · cân 2 ${kg(i.return_gross_kg)}` : i.dung_het ? ' · dùng hết' : ''}${num(i.return_pallet_kg) !== null ? ` · bì ${kg(i.return_pallet_kg)}` : ' · bì chưa khai'}` : 'gõ thẳng kg'
  const theLan = phieu.map((r) => {
    const i = r.i
    const anh = r.anh.map((a: any) => ({ a, nhan: `${a.ref_type === 'mix_issue_out' ? 'Lấy' : 'Trả'} · ${KIND[a.kind] ?? a.kind}` }))
    return `<tr><td style="padding:5px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7FAF8;border:1px solid #d9e7df;border-radius:10px;"><tr><td style="padding:10px 12px;">
      <div style="font-size:14px;font-weight:800;color:#0D2E25;">L${r.lan} · ${esc(dd(i.shift_date))} ${esc(i.shift_name || '')}${i.team ? ` · Ca ${esc(i.team)}` : ''}</div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">Lô ${esc(i.lot_so_lo || i.lot_code)} · ${esc(SRC[i.source_type] ?? i.source_type)} · ${i.vi_tri ? esc(VT[i.vi_tri] ?? i.vi_tri) : '—'} · ${esc(i.code)} · ${esc(ST[i.status] ?? i.status)}</div>
      <div style="font-size:13px;margin-top:6px;">Lấy <b>${kg(i.kg_out)}</b> · trả <b>${kg(i.kg_return)}</b> · <b style="color:#1B4D3E;">tiêu hao ${kg(i.kg_used)} kg</b>${i.so_banh !== null && i.so_banh !== undefined ? ` · ${i.so_banh} bành` : ''}<br><span style="font-size:12px;color:#64748b;">${esc(canText(i))}${i.ma_goc_all ? ` · vào mã ${esc(i.ma_goc_all)}` : ''}</span></div>
      ${anh.length ? anhRows(anh) : '<div style="font-size:12px;color:#B45309;margin-top:6px;">Chưa có ảnh.</div>'}
    </td></tr></table></td></tr>`
  }).join('')
  const tr = (cells: string[], head = false) => `<tr>${cells.map((x, k) => `<${head ? 'th' : 'td'} style="border-top:1px solid #eef1f0;padding:6px 8px;text-align:${k === 0 ? 'left' : 'right'};font-size:13px;${head ? 'background:#F5F7FA;color:#475569;font-weight:600;' : ''}">${x}</${head ? 'th' : 'td'}>`).join('')}</tr>`
  const theoCa: any[] = Array.isArray(tk.theo_ca) ? tk.theo_ca : []
  const bangCa = theoCa.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${tr(['Ca', 'Lần', 'Lấy', 'Trả', 'Tiêu hao'], true)}${theoCa.map((x) => tr([esc(`${dd(x.shift_date)} ${x.shift_name}${x.team ? ` · Ca ${x.team}` : ''}`), String(x.so_lan), kg(x.kg_lay), kg(x.kg_tra), `<b>${kg(x.tieu_hao)}</b>`])).join('')}${tr(['<b>Tổng</b>', `<b>${p.tong}</b>`, `<b>${kg(p.kg_lay)}</b>`, `<b>${kg(p.kg_tra)}</b>`, `<b>${kg(p.tieu_hao)}</b>`])}</table>` : ''
  const h3 = (s: string) => `<tr><td style="padding:14px 20px 4px 20px;"><div style="font-size:14px;font-weight:800;color:#0D2E25;border-left:4px solid #1B4D3E;padding-left:8px;">${s}</div></td></tr>`
  const preheader = `Mã ${tk.ma}: tiêu hao chèn ${kg(tieuHao)} kg · ${p.tong} lần · ${soAnh} ảnh.`

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#eef1f0;font-family:Arial,'Helvetica Neue',sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;color:#eef1f0;">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f0;padding:12px 6px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);">
      <tr><td style="background:#1B4D3E;padding:18px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <div style="color:#fff;font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">Cao Su Huy Anh · Nhà máy ${esc(tk.facility_code)}</div>
            <div style="color:#fff;font-size:18px;font-weight:800;margin-top:2px;">BÁO CÁO CHÈN HÀNG THEO MÃ SẢN XUẤT</div>
            <div style="color:#FFD54F;font-size:20px;font-weight:800;margin-top:3px;font-family:Consolas,monospace;">${esc(tk.ma)}</div>
            <div style="color:#cfe3d8;font-size:12px;margin-top:3px;">${laLenh ? `Lệnh ${esc(tk.lenh_code)} · ` : ''}${esc(thoiGian)}${tk.rubber_type_name ? ` · ${esc(tk.rubber_type_name)}` : ''}</div>
          </td>
          <td style="vertical-align:middle;text-align:right;width:116px;">
            <img src="cid:huyanh-logo" alt="Cao Su Huy Anh" width="100" style="display:inline-block;background:#fff;border-radius:10px;padding:6px 9px;width:100px;height:auto;">
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:16px 20px 2px 20px;"><div style="font-size:14px;line-height:1.6;"><b>Kính gửi Quý Anh/Chị Ban Giám đốc,</b><br>Hệ thống Hàng chèn xin gửi báo cáo chèn hàng cho mã sản xuất <b>${esc(tk.ma)}</b>${tk.dang_chay ? ' (đang chạy, số tới giờ gửi)' : ' (đã kết thúc)'}:</div></td></tr>
      <tr><td style="padding:8px 16px 0 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>${kpi('Tiêu hao hàng chèn', `${kg(tieuHao)} kg`, `${tyLe !== null ? `= ${pct(tyLe)} hàng vào máy · ` : ''}đã nhận ${kg(daNhan)}${choKy > 0 ? ` · chờ ký ${kg(choKy)}` : ''}`)}
            ${kpi('Số lần chèn', `${p.tong ?? 0}`, `${p.so_ca ?? 0} ca · ${p.so_banh ?? 0} bành · lấy ${kg(p.kg_lay)} · trả ${kg(p.kg_tra)} kg`, '#FFF8EC', '#f3e1bd', '#B45309')}</tr>
        <tr>${kpi('NVL vào máy', `${kg(tk.xuat_sx_kho_kg)} kg`, `nhập ${kg(tk.nhap_kho_kg ?? tk.dry_kg)} kg khô · ${tk.so_xe ?? 0} xe · còn kho ${kg(tk.dry_kg)}`, '#F5F7FA', '#e2e8f0', '#1f2937')}
            ${kpi('Thành phẩm đạt', `${kg(tk.tp_dat_kg)} kg`, `${tk.so_ca_ep ?? 0} ca ép · hiệu suất ${pct(tk.hieu_suat_pct)}`, '#F5F7FA', '#e2e8f0', '#1f2937')}</tr>
      </table></td></tr>
      <tr><td style="padding:8px 20px 0 20px;font-size:13px;color:#475569;">Vị trí: bể Slap <b>${kg(p.be_slap)}</b> · máy Mix <b>${kg(p.may_mix)}</b> · băng tải <b>${kg(p.bang_tai)}</b> kg${c ? `<br>Theo nguồn (đã nhận): lỗi ${kg(c.loi_kg)} · DKL ${kg(c.dkl_kg)} · chuẩn ${kg(c.chuan_kg)} · mua ngoài/khác ${kg(c.khac_kg)} kg` : ''}${nhieuMa ? `<br>Theo mã: ${maList.map((m) => `${esc(m.ma)} nhập ${kg(m.nhap_kho_kg ?? m.dry_kg)} · xuất ${kg(m.xuat_sx_kho_kg)} kg`).join(' · ')}` : ''}</td></tr>
      ${phieu.length ? h3(`Từng lần chèn · ${phieu.length} lần · ${soAnh} ảnh`) + theLan : ''}
      ${bangCa ? h3('Chèn theo ca') + `<tr><td style="padding:4px 20px;">${bangCa}</td></tr>` : ''}
      ${luuY.length ? h3('Lưu ý') + `<tr><td style="padding:4px 20px;"><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:#B45309;">${luuY.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></td></tr>` : h3('Tất cả phiếu chèn đã đủ 3 chữ ký, số liệu chốt.')}
      <tr><td style="padding:14px 20px 18px 20px;border-top:1px solid #eef1f0;">
        <div style="font-size:12px;color:#475569;line-height:1.6;">Chi tiết: <a href="${APP_URL}/wms/chen" style="color:#1B4D3E;">${APP_URL}/wms/chen</a> (chọn ${laLenh ? `lệnh ${esc(tk.lenh_code)}` : `mã ${esc(tk.ma)}`}) · <a href="${APP_URL}/wms/nvl/lo" style="color:#1B4D3E;">lô NVL</a><br>
        Người kết thúc: <b>${esc(nguoiLap || tk.nguoi_lap?.name || '')}</b> · ${dt(new Date().toISOString())}. Chạm ảnh để xem lớn. Tiêu hao = kg lấy − kg trả (bì pallet triệt tiêu); băng tải tính theo bành.</div>
      </td></tr>
    </table>
    <div style="font-size:11px;color:#9aa4a0;padding:12px;">© Cao Su Huy Anh · Huy Anh ERP · Mail tự động khi kết thúc lệnh — không trả lời.</div>
  </td></tr></table>
</body></html>`
  return { subject, html, preheader }
}

// ── Main ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({}))
    const lenhId: string | null = body.lenh_id ?? null
    const rawLotId: string | null = body.raw_lot_id ?? null
    const dry = body.dry === true
    if (!lenhId && !rawLotId) throw new Error('Thiếu lenh_id hoặc raw_lot_id')
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1) tổng kết
    const { data: tk, error: e1 } = lenhId
      ? await sb.rpc('fn_nvl_tong_ket_lenh', { p_lenh_id: lenhId })
      : await sb.rpc('fn_nvl_tong_ket_ma', { p_raw_lot_id: rawLotId })
    if (e1) throw new Error(`Tổng kết: ${e1.message}`)

    // 2) từng lần chèn + ảnh
    let q = sb.from('v_mix_issues').select('*').neq('status', 'cancelled').order('out_at').limit(300)
    q = lenhId ? q.eq('lenh_id', lenhId) : q.contains('raw_lot_ids', [rawLotId])
    const { data: issues, error: e2 } = await q
    if (e2) throw new Error(`Phiếu chèn: ${e2.message}`)
    const list = (issues ?? []).sort((a: any, b: any) => String(a.shift_date).localeCompare(String(b.shift_date)) || String(a.shift_id ?? '').localeCompare(String(b.shift_id ?? '')) || String(a.out_at).localeCompare(String(b.out_at)))
    const dem = new Map<string, number>()
    const phieu = list.map((i: any) => { const k = `${i.shift_date}|${i.shift_id ?? ''}`; const n = (dem.get(k) ?? 0) + 1; dem.set(k, n); return { i, lan: n, anh: [] as any[] } })
    if (phieu.length) {
      const { data: photos } = await sb.from('raw_photos').select('*').in('ref_id', phieu.map((r) => r.i.id)).in('ref_type', ['mix_issue_out', 'mix_issue_return']).order('taken_at')
      for (const a of photos ?? []) { const r = phieu.find((x) => x.i.id === a.ref_id); if (r) r.anh.push(a) }
      for (const r of phieu) r.anh.sort((a, b) => (a.ref_type === b.ref_type ? 0 : a.ref_type === 'mix_issue_out' ? -1 : 1))
    }

    // 3) người nhận: BGĐ (level ≤ 3, active, có email) ∪ MAIL_THEM ∪ body.to
    const recipients = new Map<string, { name: string; email: string }>()
    for (const b of Array.isArray(tk?.bgd) ? tk.bgd : []) if (b?.email) recipients.set(String(b.email).toLowerCase(), { name: b.name || b.email, email: b.email })
    for (const b of MAIL_THEM) recipients.set(b.email.toLowerCase(), b)
    for (const e of Array.isArray(body.to) ? body.to : []) if (typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) recipients.set(e.toLowerCase(), { name: e, email: e })
    const to = [...recipients.values()]

    const { subject, html, preheader } = renderHtml(tk, phieu, String(body.nguoi_lap ?? ''))
    if (dry) return new Response(JSON.stringify({ dry: true, subject, preheader, to, so_lan: phieu.length, so_anh: phieu.reduce((s, r) => s + r.anh.length, 0), html }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    if (!to.length) return new Response(JSON.stringify({ ok: [], loi: [], to: [], subject, msg: 'Không có người nhận' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const token = await getAccessToken()
    const ok: string[] = []; const loi: Array<{ email: string; msg: string }> = []
    for (const r of to) {
      try { await sendEmail(token, [r], subject, html); ok.push(r.email) }
      catch (e) { loi.push({ email: r.email, msg: (e as Error).message }) }
    }
    return new Response(JSON.stringify({ ok, loi, to: to.map((r) => r.email), subject, so_lan: phieu.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
