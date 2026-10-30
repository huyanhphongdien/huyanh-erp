// ============================================================================
// KhoMixSign — "Chờ bạn ký": phiếu chèn đang chờ chữ ký (bên giao / QS / thủ kho),
// mỗi thẻ có số lấy-trả-tiêu hao, 4 ảnh thu nhỏ, nút ký đúng bước của người đang đăng nhập.
// File: src/pages/mobile/kho/KhoMixSign.tsx · Route: /m/kho/chen/ky
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { mixService, MIX_PURPOSE_LABELS, MIX_SOURCE_LABELS, type MixIssue } from '../../../services/wms/mixService'
import { rawPhotoService, type RawPhoto } from '../../../services/wms/rawPhotoService'
import { useRawRole } from '../../../hooks/useRawRole'
import { fmtD, fmtDt, fmtKg, useKhoFacility } from './khoCommon'
import { I, Lightbox, PhotoStrip } from './khoMixUtil'
import './khoMix.css'

const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '')

export default function KhoMixSign() {
  const nav = useNavigate()
  const { facilityId, facility } = useKhoFacility()
  const role = useRawRole(facilityId)
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

  const canFor = useCallback((i: MixIssue) => (i.status === 'returned' ? role.perms.submit || role.isBGD : i.status === 'submitted' ? role.isQC || role.isBGD : i.status === 'qc_confirmed' ? role.isKeeper || role.isBGD : false), [role])
  const mine = useMemo(() => rows.filter(canFor).length, [rows, canFor])

  async function ky(i: MixIssue) {
    const buoc = i.status === 'returned' ? 'submit' : i.status === 'submitted' ? 'qc_confirm' : 'receive'
    setBusy(i.id); setMsg(null)
    try {
      const r = await mixService.ky(i.id, buoc)
      setMsg({ ok: true, text: buoc === 'receive' ? `${i.code}: thủ kho đã nhận, kho chèn trừ ${fmtKg(i.kg_used)} kg${r.next_issue_id ? ' · đã mở phiếu bàn giao cho ca sau' : ''}` : `${i.code}: đã ký` })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không ký được' }) }
    finally { setBusy(null) }
  }

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Về trang chính" onClick={() => nav('/m/kho/chen')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">{role.isQC ? 'QS' : role.isKeeper ? 'Thủ kho' : role.isBGD ? 'BGĐ' : 'Tổ sản xuất'} · {facility?.name || facility?.code || ''}</span><span className="kmx-title">Chờ bạn ký</span></div>
        <span className="kmx-badge">{mine || rows.length}</span>
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {msg && <div className={`kmx-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        {loading && !rows.length && <><div className="kmx-skel" /><div className="kmx-skel" /></>}
        {!loading && !rows.length && <div className="kmx-card muted kmx-center" style={{ padding: 32 }}><span style={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>Không có phiếu chờ ký</span><span className="kmx-sm">Phiếu đã trả cuối ca sẽ hiện ở đây</span></div>}
        {rows.map((i) => {
          const step = i.status === 'returned' ? { n: '1/3', who: 'Bên giao', cls: 'amb' } : i.status === 'submitted' ? { n: '2/3', who: 'QS', cls: 'amb' } : { n: '3/3', who: 'Thủ kho', cls: 'blue' }
          const can = canFor(i)
          const outs = pOut[i.id] || [], rets = pRet[i.id] || []
          return (
            <section key={i.id} className="kmx-card" aria-label={`Phiếu ${i.code}`} style={{ gap: 10 }}>
              <div className="kmx-row"><span className="kmx-mono" style={{ fontSize: 15, fontWeight: 700, color: '#0D2E25' }}>{i.code}</span><span className={`kmx-chip ${step.cls}`}>Bước {step.n} · {step.who}</span></div>
              <span className="kmx-md">{fmtD(i.shift_date)} · {i.shift_name || 'ca ?'}{i.team ? ` · Tổ ${i.team}` : ''} · lô {i.lot_code} {MIX_SOURCE_LABELS[i.source_type].toLowerCase()} · {MIX_PURPOSE_LABELS[i.purpose].toLowerCase()}</span>
              <div className="kmx-grid3">
                <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>Lấy {hm(i.out_at)}</span><span className="kmx-num md">{fmtKg(i.kg_out)}</span></div>
                <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>Trả {hm(i.return_at)}</span><span className="kmx-num md">{fmtKg(i.kg_return)}</span></div>
                <div className="kmx-stat ok"><span className="kmx-lbl ok" style={{ fontSize: 10 }}>Tiêu hao</span><span className="kmx-num md ok">{fmtKg(i.kg_used)}</span></div>
              </div>
              <div className="kmx-col" style={{ gap: 6 }}>
                <span className="kmx-lbl">{outs.length + rets.length} ảnh · chạm để xem to</span>
                <PhotoStrip out={outs} ret={rets} onOpen={(p, cap) => setBig({ src: p.public_url!, cap: `${cap} · ${fmtDt(p.taken_at)}` })} />
              </div>
              <span className="kmx-sm">{i.return_name ? `Trả: ${i.return_name}` : ''}{i.submitted_name ? ` · bên giao ${i.submitted_name} ký ${hm(i.submitted_at)}` : ''}{i.qc_confirmed_name ? ` · QS ${i.qc_confirmed_name} ký ${hm(i.qc_confirmed_at)}` : ''}{i.handover_to_next ? ' · bàn giao ca sau' : ''}</span>
              {i.thieu_anh && i.status === 'returned' && <div className="kmx-note red" style={{ padding: '8px 10px' }}>{I.info}<span>Thiếu ảnh bắt buộc, mở phiếu để chụp bổ sung rồi mới ký được.</span></div>}
              {can
                ? <button type="button" className="kmx-btn md" disabled={busy === i.id || (i.status === 'returned' && !!i.thieu_anh)} onClick={() => ky(i)}>{i.status === 'qc_confirmed' ? I.intake : I.check}{busy === i.id ? 'Đang ký…' : i.status === 'returned' ? 'Ký bên giao' : i.status === 'submitted' ? 'Xác nhận QS' : `Nhận · trừ kho chèn ${fmtKg(i.kg_used)} kg`}</button>
                : <span className="kmx-md kmx-center">Chờ {step.who.toLowerCase()} ký. Bạn không ký bước này.</span>}
              <Link to={`/m/kho/chen/phieu/${i.id}`} className="kmx-btn ghost" style={{ color: i.status === 'returned' ? '#1B4D3E' : '#B91C1C', fontSize: 13 }}>{i.status === 'returned' ? 'Mở phiếu · sửa kg trả' : 'Số không đúng, mở phiếu hỏi lại tổ'}</Link>
              {i.status === 'qc_confirmed' && can && <span className="kmx-sm kmx-center">Sau bước này sổ ca ép bành tự điền dòng CHÈN {fmtKg(i.kg_used)} kg</span>}
            </section>
          )
        })}
      </div></div>
      {big && <Lightbox src={big.src} caption={big.cap} onClose={() => setBig(null)} />}
    </div>
  )
}
