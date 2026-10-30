// ============================================================================
// KhoMixSign — "Chờ bạn ký": phiếu chèn đang chờ chữ ký theo quy trình 30/10
//   bước 1 QS khai báo · bước 2 QC duyệt · bước 3 thủ kho nhận (trừ kho chèn, điền sổ ca).
//   Mỗi thẻ có số lấy-trả-tiêu hao, ảnh thu nhỏ, nút ký đúng bước của người đang đăng nhập;
//   đầu trang có "Ký tất cả phiếu ca này" — một chạm cho cả ca (5–7 pallet).
// File: src/pages/mobile/kho/KhoMixSign.tsx · Route: /m/kho/chen/ky
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { mixService, MIX_PURPOSE_LABELS, MIX_SOURCE_LABELS, MIX_VI_TRI_LABELS, type MixIssue } from '../../../services/wms/mixService'
import { rawPhotoService, type RawPhoto } from '../../../services/wms/rawPhotoService'
import { useMixRole } from '../../../hooks/useMixRole'
import { fmtD, fmtDt, fmtKg, useKhoFacility } from './khoCommon'
import { I, Lightbox, PhotoStrip } from './khoMixUtil'
import './khoMix.css'

const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '')
type Buoc = 'submit' | 'qc_confirm' | 'receive'
const buocOf = (s: MixIssue['status']): Buoc => (s === 'returned' ? 'submit' : s === 'submitted' ? 'qc_confirm' : 'receive')
const STEP: Record<Buoc, { n: string; who: string; cls: string; btn: string }> = {
  submit: { n: '1/3', who: 'QS khai báo', cls: 'amb', btn: 'Ký khai báo (QS)' },
  qc_confirm: { n: '2/3', who: 'QC', cls: 'gold', btn: 'Duyệt QC' },
  receive: { n: '3/3', who: 'Thủ kho', cls: 'blue', btn: 'Nhận · trừ kho chèn' },
}

interface Nhom { key: string; label: string; buoc: Buoc; ids: string[]; boQua: number; kg: number }

export default function KhoMixSign() {
  const nav = useNavigate()
  const { facilityId, facility } = useKhoFacility()
  const role = useMixRole(facilityId)
  const [rows, setRows] = useState<MixIssue[]>([])
  const [pOut, setPOut] = useState<Record<string, RawPhoto[]>>({})
  const [pRet, setPRet] = useState<Record<string, RawPhoto[]>>({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [big, setBig] = useState<{ src: string; cap: string } | null>(null)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    try {
      const list = await mixService.listIssues({ facilityId, status: ['returned', 'submitted', 'qc_confirmed'] })
      const ids = list.map((x) => x.id)
      const [a, b] = await Promise.all([rawPhotoService.listMany('mix_issue_out', ids), rawPhotoService.listMany('mix_issue_return', ids)])
      setRows(list); setPOut(a); setPRet(b)
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không tải được danh sách' }) }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const canFor = useCallback((i: MixIssue) => (i.status === 'returned' ? role.khaiBao : i.status === 'submitted' ? role.duyetQc : i.status === 'qc_confirmed' ? role.nhanKho : false), [role.khaiBao, role.duyetQc, role.nhanKho])
  const mine = useMemo(() => rows.filter(canFor).length, [rows, canFor])

  // gom theo ca + bước để ký một chạm
  const nhom = useMemo<Nhom[]>(() => {
    const m = new Map<string, Nhom>()
    for (const i of rows) {
      if (!canFor(i)) continue
      const buoc = buocOf(i.status)
      const key = `${i.shift_date}|${i.shift_id ?? ''}|${buoc}`
      const g = m.get(key) ?? { key, label: `${fmtD(i.shift_date)} · ${i.shift_name || 'ca ?'}${i.team ? ` · Tổ ${i.team}` : ''} · ${STEP[buoc].who}`, buoc, ids: [], boQua: 0, kg: 0 }
      if (buoc === 'submit' && i.thieu_anh) g.boQua += 1
      else { g.ids.push(i.id); g.kg += i.kg_used ?? 0 }
      m.set(key, g)
    }
    return [...m.values()].filter((g) => g.ids.length > 0)
  }, [rows, canFor])

  async function ky(i: MixIssue) {
    const buoc = buocOf(i.status)
    setBusy(i.id); setMsg(null)
    try {
      const r = await mixService.ky(i.id, buoc)
      setMsg({ ok: true, text: buoc === 'receive' ? `${i.code}: thủ kho đã nhận, kho chèn trừ ${fmtKg(i.kg_used)} kg${r.next_issue_id ? ' · đã mở phiếu bàn giao cho ca sau' : ''}` : `${i.code}: đã ký` })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không ký được' }) }
    finally { setBusy(null) }
  }

  async function kyCa(g: Nhom) {
    setBusy(g.key); setMsg(null)
    try {
      const r = await mixService.kyNhieu(g.ids, g.buoc)
      const loi = r.loi.length ? ` · lỗi ${r.loi.length}: ${r.loi.map((x) => `${x.code || ''} ${x.loi}`).join('; ')}` : ''
      setMsg({ ok: r.loi.length === 0, text: `Đã ký ${r.so_ky}/${g.ids.length} phiếu · ${g.label}${loi}` })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không ký được' }) }
    finally { setBusy(null) }
  }

  const vaiTro = role.laBgd ? 'BGĐ' : role.nhanKho ? 'Thủ kho' : role.duyetQc ? 'QC' : role.khaiBao ? 'QS' : 'Xem'

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Về trang chính" onClick={() => nav('/m/kho/chen')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">{vaiTro} · {facility?.name || facility?.code || ''}</span><span className="kmx-title">Chờ bạn ký</span></div>
        <span className="kmx-badge">{mine || rows.length}</span>
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {msg && <div className={`kmx-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        {loading && !rows.length && <><div className="kmx-skel" /><div className="kmx-skel" /></>}
        {!loading && !rows.length && <div className="kmx-card muted kmx-center" style={{ padding: 32 }}><span style={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>Không có phiếu chờ ký</span><span className="kmx-sm">Phiếu đã trả cuối ca sẽ hiện ở đây</span></div>}

        {nhom.length > 0 && (
          <section className="kmx-card" aria-label="Ký cả ca" style={{ gap: 8, borderColor: '#1B4D3E' }}>
            <span className="kmx-strong" style={{ fontSize: 13 }}>Ký một chạm cho cả ca</span>
            {nhom.map((g) => (
              <button key={g.key} type="button" className="kmx-btn md" disabled={busy === g.key} onClick={() => kyCa(g)}>
                {g.buoc === 'receive' ? I.intake : I.pen}{busy === g.key ? 'Đang ký…' : `Ký tất cả ${g.ids.length} phiếu · ${g.label}`}
              </button>
            ))}
            {nhom.some((g) => g.boQua > 0) && <span className="kmx-sm" style={{ color: '#B45309' }}>Phiếu thiếu ảnh bắt buộc không ký được theo lô, mở từng phiếu chụp bổ sung.</span>}
            <span className="kmx-sm">Tổng tiêu hao các phiếu sắp ký: {fmtKg(nhom.reduce((s, g) => s + g.kg, 0))} kg. Số nào thấy sai thì mở phiếu đó trước khi ký.</span>
          </section>
        )}

        {rows.map((i) => {
          const buoc = buocOf(i.status)
          const step = STEP[buoc]
          const can = canFor(i)
          const outs = pOut[i.id] || [], rets = pRet[i.id] || []
          return (
            <section key={i.id} className="kmx-card" aria-label={`Phiếu ${i.code}`} style={{ gap: 10 }}>
              <div className="kmx-row"><span className="kmx-mono" style={{ fontSize: 15, fontWeight: 700, color: '#0D2E25' }}>{i.code}</span><span className={`kmx-chip ${step.cls}`}>Bước {step.n} · {step.who}</span></div>
              <span className="kmx-md">{fmtD(i.shift_date)} · {i.shift_name || 'ca ?'}{i.team ? ` · Tổ ${i.team}` : ''} · lô {i.lot_so_lo || i.lot_code} {MIX_SOURCE_LABELS[i.source_type].toLowerCase()}{i.vi_tri ? ` · chèn ${MIX_VI_TRI_LABELS[i.vi_tri].toLowerCase()}` : ''}{i.ma_goc_all ? ` · vào mã ${i.ma_goc_all}` : ''} · {MIX_PURPOSE_LABELS[i.purpose].toLowerCase()}</span>
              <div className="kmx-grid3">
                <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>Lấy {hm(i.out_at)}{i.so_banh !== null ? ` · ${i.so_banh} b` : ''}</span><span className="kmx-num md">{fmtKg(i.kg_out)}</span></div>
                <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>Trả {hm(i.return_at)}</span><span className="kmx-num md">{fmtKg(i.kg_return)}</span></div>
                <div className="kmx-stat ok"><span className="kmx-lbl ok" style={{ fontSize: 10 }}>Tiêu hao</span><span className="kmx-num md ok">{fmtKg(i.kg_used)}</span></div>
              </div>
              <div className="kmx-col" style={{ gap: 6 }}>
                <span className="kmx-lbl">{outs.length + rets.length} ảnh{(i.kg_return ?? 0) <= 0.005 ? ' · dùng hết, không cần ảnh trả' : ''} · chạm để xem to</span>
                <PhotoStrip out={outs} ret={rets} onOpen={(p, cap) => setBig({ src: p.public_url!, cap: `${cap} · ${fmtDt(p.taken_at)}` })} />
              </div>
              <span className="kmx-sm">{i.return_name ? `Trả: ${i.return_name}` : ''}{i.submitted_name ? ` · QS ${i.submitted_name} ký ${hm(i.submitted_at)}` : ''}{i.qc_confirmed_name ? ` · QC ${i.qc_confirmed_name} duyệt ${hm(i.qc_confirmed_at)}` : ''}{i.handover_to_next ? ' · bàn giao ca sau' : ''}</span>
              {i.thieu_anh && i.status === 'returned' && <div className="kmx-note red" style={{ padding: '8px 10px' }}>{I.info}<span>Thiếu ảnh bắt buộc, mở phiếu để chụp bổ sung rồi mới ký được.</span></div>}
              {can
                ? <button type="button" className="kmx-btn md" disabled={busy === i.id || (i.status === 'returned' && !!i.thieu_anh)} onClick={() => ky(i)}>{buoc === 'receive' ? I.intake : I.check}{busy === i.id ? 'Đang ký…' : buoc === 'receive' ? `${step.btn} ${fmtKg(i.kg_used)} kg` : step.btn}</button>
                : <span className="kmx-md kmx-center">Chờ {step.who} ký. Bạn không ký bước này.</span>}
              <Link to={`/m/kho/chen/phieu/${i.id}`} className="kmx-btn ghost" style={{ color: i.status === 'returned' ? '#1B4D3E' : '#B91C1C', fontSize: 13 }}>{i.status === 'returned' ? 'Mở phiếu · sửa kg trả' : 'Số không đúng, mở phiếu hỏi lại'}</Link>
              {i.status === 'qc_confirmed' && can && <span className="kmx-sm kmx-center">Sau bước này kho chèn trừ {fmtKg(i.kg_used)} kg, sổ ca ép bành tự điền dòng CHÈN</span>}
            </section>
          )
        })}
      </div></div>
      {big && <Lightbox src={big.src} caption={big.cap} onClose={() => setBig(null)} />}
    </div>
  )
}
