// ============================================================================
// KhoMixMaTongKet — tổng kết một mã nguyên liệu trên điện thoại (sau nút Kết thúc mã ở trang Hàng chèn)
//   · chèn tiêu hao (vị trí, nguồn, lô, theo ca) · NVL vào · thành phẩm · lưu ý
//   · mail BGĐ soạn sẵn: gửi qua hệ thống · mở ứng dụng mail · sao chép
// File: src/pages/mobile/kho/KhoMixMaTongKet.tsx · Route: /m/kho/chen/ma/:id/tong-ket
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { rawLotService, RAW_LOT_TRANG_THAI_LABELS, type RawLotTongKet } from '../../../services/wms/rawLotService'
import { MIX_SOURCE_LABELS, MIX_VI_TRI_LABELS } from '../../../services/wms/mixService'
import { guiMailTongKet, mailtoTongKet, soanMailTongKet } from '../../../services/wms/maTongKetMail'
import { fmtD, fmtDt, fmtKg } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const okEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export default function KhoMixMaTongKet() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const vua = sp.get('vua') === '1'
  const laLenh = useLocation().pathname.includes('/lenh/')   // /m/kho/chen/lenh/:id/tong-ket = tổng kết theo lệnh (gộp mã)
  const [tk, setTk] = useState<RawLotTongKet | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [to, setTo] = useState<string[]>([])
  const [them, setThem] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!id) return
    let alive = true
    const req = laLenh ? rawLotService.tongKetLenh(id) : rawLotService.tongKetMa(id)
    req.then((r) => { if (!alive) return; setTk(r); setTo(r.bgd.map((b) => b.email)) }).catch((e: any) => { if (alive) setErr(e?.message || 'Không tổng kết được (cần chạy SQL p12 + p13)') })
    return () => { alive = false }
  }, [id, laLenh])

  const mail = useMemo(() => (tk ? soanMailTongKet(tk) : null), [tk])
  const toOk = to.filter(okEmail)
  const toggle = (email: string) => setTo((cur) => (cur.includes(email) ? cur.filter((x) => x !== email) : [...cur, email]))
  const themEmail = () => { const e = them.trim().toLowerCase(); if (!okEmail(e)) { setMsg({ ok: false, text: 'Địa chỉ mail chưa đúng' }); return } if (!to.includes(e)) setTo([...to, e]); setThem('') }

  const gui = async () => {
    if (!mail || !toOk.length) return
    setBusy('gui'); setMsg(null)
    try {
      const r = await guiMailTongKet(toOk, mail)
      setMsg(r.loi.length ? { ok: r.ok.length > 0, text: `${r.ok.length ? `Đã gửi ${r.ok.length}. ` : ''}Không gửi được: ${r.loi.map((x) => x.email).join(', ')} — dùng nút Mở ứng dụng mail` } : { ok: true, text: `Đã gửi cho ${r.ok.join(', ')}` })
    } finally { setBusy(null) }
  }
  const copy = async () => {
    if (!mail) return
    try { await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.text}`); setMsg({ ok: true, text: 'Đã sao chép tiêu đề + nội dung' }) }
    catch { setMsg({ ok: false, text: 'Máy không cho sao chép, dùng nút Mở ứng dụng mail' }) }
  }

  const hd = (
    <header className="kmx-hd">
      <button type="button" className="kmx-back" aria-label="Về trang Hàng chèn" onClick={() => nav('/m/kho/chen')}>{I.back}</button>
      <div className="kmx-hd-txt"><span className="kmx-eyebrow">{tk?.lenh_code ? `Tổng kết lệnh ${tk.lenh_code}` : laLenh ? 'Tổng kết lệnh chạy' : 'Tổng kết mã nguyên liệu'}</span><span className="kmx-title">{tk?.ma ?? '…'}</span></div>
    </header>
  )
  if (err) return <div className="kmx">{hd}<div className="kmx-body"><div className="kmx-inner"><div className="kmx-msg err">{err}</div></div></div></div>
  if (!tk || !mail) return <div className="kmx">{hd}<div className="kmx-body"><div className="kmx-inner"><div className="kmx-skel" /><div className="kmx-skel" /></div></div></div>

  const tieuHao = tk.chen?.chen_kg ?? tk.phieu.tieu_hao_da_nhan
  const luuY = [tk.phieu.chua_tra > 0 ? `${tk.phieu.chua_tra} phiếu chưa trả` : '', tk.phieu.cho_ky > 0 ? `${tk.phieu.cho_ky} phiếu chờ ký` : '', tk.dang_chay ? 'mã vẫn đang khai đang chạy' : ''].filter(Boolean)
  const chipOn = { background: '#1B4D3E', color: '#fff', borderColor: '#1B4D3E' } as const

  return (
    <div className="kmx">
      {hd}
      <div className="kmx-body">
        <div className="kmx-inner">
          {vua && <div className="kmx-msg" style={{ background: '#E8F5F0', color: '#0D2E25', fontWeight: 600 }}>Đã kết thúc {tk.lenh_code ? `lệnh ${tk.lenh_code} (${tk.ma})` : `chạy mã ${tk.ma}`}. Kiểm tra số rồi gửi báo cáo Ban Giám đốc.</div>}
          {msg && <div className={`kmx-msg${msg.ok ? '' : ' err'}`}>{msg.text}</div>}

          <section className="kmx-card hero" style={{ gap: 6 }}>
            <div className="kmx-row">
              <span className="kmx-lbl">Tiêu hao hàng chèn vào mã</span>
              <span className="kmx-chip blue">{tk.dang_chay ? 'Đang chạy' : RAW_LOT_TRANG_THAI_LABELS[tk.trang_thai]}</span>
            </div>
            <span className="kmx-num" style={{ color: '#1B4D3E' }}>{fmtKg(tieuHao)} <span className="kmx-unit">kg</span></span>
            <span className="kmx-sm">{tk.chen?.ty_le_pct !== null && tk.chen?.ty_le_pct !== undefined ? `= ${tk.chen.ty_le_pct} % hàng vào máy · ` : ''}{tk.phieu.tong} lần / {tk.phieu.so_ca} ca · {tk.phieu.so_banh} bành · lấy {fmtKg(tk.phieu.kg_lay)} · trả {fmtKg(tk.phieu.kg_tra)} kg</span>
            <div className="kmx-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <span className="kmx-chip">bể Slap {fmtKg(tk.chen?.be_kg ?? tk.phieu.be_slap)} kg</span>
              <span className="kmx-chip">máy Mix {fmtKg(tk.chen?.mix_kg ?? tk.phieu.may_mix)} kg</span>
              {tk.chen && tk.chen.loi_kg > 0 && <span className="kmx-chip">lỗi {fmtKg(tk.chen.loi_kg)}</span>}
              {tk.chen && tk.chen.dkl_kg > 0 && <span className="kmx-chip">DKL {fmtKg(tk.chen.dkl_kg)}</span>}
              {tk.chen && tk.chen.chuan_kg > 0 && <span className="kmx-chip">chuẩn {fmtKg(tk.chen.chuan_kg)}</span>}
              {tk.chen && tk.chen.khac_kg > 0 && <span className="kmx-chip">khác {fmtKg(tk.chen.khac_kg)}</span>}
            </div>
            {luuY.length > 0 && <span className="kmx-sm" style={{ color: '#B45309', fontWeight: 600 }}>{luuY.join(' · ')} — tiêu hao có thể còn thay đổi.</span>}
          </section>

          <section className="kmx-card" style={{ gap: 4 }}>
            <span className="kmx-strong" style={{ fontSize: 13 }}>Nguyên liệu & thành phẩm</span>
            {tk.ma_list && tk.ma_list.length > 1 && tk.ma_list.map((m) => <div key={m.ma} className="kmx-kv"><span className="k">· {m.ma}</span><span className="v">nhập {fmtKg(m.nhap_kho_kg ?? m.dry_kg)} · xuất {fmtKg(m.xuat_sx_kho_kg)} kg</span></div>)}
            <div className="kmx-kv"><span className="k">{tk.ma_list && tk.ma_list.length > 1 ? 'Tổng nhập kho' : 'Nhập kho'}</span><span className="v">{tk.so_xe} xe · {fmtKg(tk.nhap_kho_kg ?? tk.dry_kg)} kg khô{tk.drc_pct !== null ? ` · DRC ${tk.drc_pct} %` : ''}</span></div>
            <div className="kmx-kv"><span className="k">Xuất vào máy</span><span className="v">{fmtKg(tk.xuat_sx_kho_kg)} kg khô · còn kho {fmtKg(tk.dry_kg)} kg</span></div>
            <div className="kmx-kv"><span className="k">Thành phẩm</span><span className="v">{tk.so_ca_ep ?? 0} ca ép · đạt {fmtKg(tk.tp_dat_kg)} kg · lỗi + DKL {fmtKg(tk.loi_dkl_kg)} kg</span></div>
            <div className="kmx-kv"><span className="k">Hiệu suất</span><span className="v">{tk.hieu_suat_pct !== null ? `${tk.hieu_suat_pct} %` : '—'}</span></div>
            <div className="kmx-kv"><span className="k">Đợt chạy</span><span className="v">{tk.dot_chay.length ? tk.dot_chay.map((r) => `${fmtDt(r.started_at)} → ${r.ended_at ? fmtDt(r.ended_at) : 'đang chạy'}`).join(' · ') : 'chưa khai'}</span></div>
          </section>

          <section className="kmx-card" style={{ gap: 4 }}>
            <span className="kmx-strong" style={{ fontSize: 13 }}>Chèn theo ca</span>
            {tk.theo_ca.length ? tk.theo_ca.map((x) => (
              <div key={`${x.shift_date}|${x.shift_name}|${x.team ?? ''}`} className="kmx-kv">
                <span className="k">{fmtD(x.shift_date)} {x.shift_name}{x.team ? ` · Ca ${x.team}` : ''} · {x.so_lan} lần</span>
                <span className="v"><b>{fmtKg(x.tieu_hao)}</b> kg{x.chua_tra ? ` · ${x.chua_tra} chưa trả` : ''}{x.cho_ky ? ` · ${x.cho_ky} chờ ký` : ''}</span>
              </div>
            )) : <span className="kmx-sm">Chưa có phiếu chèn nào gắn mã này</span>}
            {tk.chen?.chi_tiet?.length ? <>
              <span className="kmx-strong" style={{ fontSize: 13, marginTop: 6 }}>Theo lô chèn</span>
              {tk.chen.chi_tiet.map((x) => (
                <div key={`${x.lot_code}|${x.vi_tri ?? ''}`} className="kmx-kv">
                  <span className="k">{x.lot_code}{x.so_lo ? ` · ${x.so_lo}` : ''} · {MIX_SOURCE_LABELS[x.source_type as keyof typeof MIX_SOURCE_LABELS] ?? x.source_type}{x.vi_tri ? ` · ${MIX_VI_TRI_LABELS[x.vi_tri]}` : ''}</span>
                  <span className="v"><b>{fmtKg(x.kg)}</b> kg</span>
                </div>
              ))}
            </> : null}
          </section>

          <section className="kmx-card" style={{ gap: 8 }}>
            <span className="kmx-strong" style={{ fontSize: 13 }}>Mail báo cáo Ban Giám đốc</span>
            <span className="kmx-sm">Chạm tên để bỏ / chọn người nhận.</span>
            <div className="kmx-row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {tk.bgd.map((b) => <button key={b.email} type="button" className="kmx-pill sm" style={to.includes(b.email) ? chipOn : undefined} onClick={() => toggle(b.email)}>{b.name}{b.chuc_vu ? ` · ${b.chuc_vu}` : ''}</button>)}
              {to.filter((e) => !tk.bgd.some((b) => b.email === e)).map((e) => <button key={e} type="button" className="kmx-pill sm" style={chipOn} onClick={() => toggle(e)}>{e}</button>)}
            </div>
            <div className="kmx-row" style={{ gap: 6 }}>
              <input className="kmx-text" type="email" inputMode="email" placeholder="Thêm địa chỉ mail" value={them} onChange={(e) => setThem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); themEmail() } }} aria-label="Thêm địa chỉ mail" />
              <button type="button" className="kmx-pill sm" onClick={themEmail}>Thêm</button>
            </div>
            <div className="kmx-tint col" style={{ alignItems: 'stretch', gap: 4 }}>
              <span className="kmx-strong" style={{ fontSize: 13 }}>{mail.subject}</span>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, lineHeight: 1.45, color: '#374151' }}>{mail.text}</pre>
            </div>
            <button type="button" className="kmx-btn" disabled={!toOk.length || busy === 'gui'} onClick={gui}>{busy === 'gui' ? 'Đang gửi…' : `Gửi mail cho BGĐ (${toOk.length})`}</button>
            <a className="kmx-btn sec" href={mailtoTongKet(toOk, mail)} style={{ textAlign: 'center', textDecoration: 'none' }}>Mở ứng dụng mail</a>
            <button type="button" className="kmx-btn ghost" onClick={copy}>Sao chép nội dung</button>
          </section>
        </div>
      </div>
    </div>
  )
}
