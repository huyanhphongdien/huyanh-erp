// ============================================================================
// KhoMixPallet — SỔ PALLET HÀNG CHÈN (p19, chủ DN 10/11/2026): khai báo pallet · chữ viết tắt · số kg (bì pallet rỗng)
//   Lưới HC1→HC30 (trống / ở dây chuyền / chưa khai số kg / tắt) + form khai liên tiếp + danh sách + lịch sử cân lại.
//   Thủ kho (bước 3 nhận kho) hoặc BGĐ ghi sổ; QS chỉ xem. Phiếu đang mở giữ bì lúc lấy, cân lại không đổi phiếu.
// File: src/pages/mobile/kho/KhoMixPallet.tsx · Route: /m/kho/chen/so-pallet (?hc=HC7 từ tem QR)
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { mixService, MIX_PALLET_BI_CU_NGAY, MIX_PALLET_LOG_LABELS, MIX_PALLET_TRANG_THAI_LABELS, type MixPallet, type MixPalletLog } from '../../../services/wms/mixService'
import { useMixRole } from '../../../hooks/useMixRole'
import { firstName } from '../opsUtil'
import { fmtD, fmtDt, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const kg1 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }))
const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '')
const CELL: Record<MixPallet['trang_thai'], string> = { trong: '', day_chuyen: 'line', chua_bi: 'nobi', tat: 'off' }
const CHIP: Record<MixPallet['trang_thai'], string> = { trong: 'ok', day_chuyen: 'amb', chua_bi: 'red', tat: 'mut' }
const HC_BG: Record<MixPallet['trang_thai'], string | undefined> = { trong: undefined, day_chuyen: '#B45309', chua_bi: '#B91C1C', tat: '#9CA3AF' }

export default function KhoMixPallet() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { facilityId, facility } = useKhoFacility()
  const role = useMixRole(facilityId)
  const canEdit = role.nhanKho
  const [rows, setRows] = useState<MixPallet[]>([])
  const [logs, setLogs] = useState<MixPalletLog[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // form khai báo: chạm pallet ở lưới / danh sách → điền sẵn tên, chữ viết tắt, số kg
  const [selId, setSelId] = useState<string | null>(null)
  const [ten, setTen] = useState('')
  const [code, setCode] = useState('')
  const [bi, setBi] = useState('')
  const [lyDo, setLyDo] = useState('')
  const [tatAsk, setTatAsk] = useState<string | null>(null)
  const [tatLyDo, setTatLyDo] = useState('')
  const [themMo, setThemMo] = useState(false)
  const [themTu, setThemTu] = useState('')
  const [themDen, setThemDen] = useState('')
  const [showLogs, setShowLogs] = useState(false)
  const [showTat, setShowTat] = useState(false)

  const taiLai = useCallback(async (): Promise<MixPallet[]> => {
    if (!facilityId) return []
    const [p, l] = await Promise.all([mixService.listPallets(facilityId), mixService.palletLogs(facilityId, null, 30).catch(() => [] as MixPalletLog[])])
    setRows(p); setLogs(l)
    return p
  }, [facilityId])
  useEffect(() => {
    let alive = true
    setLoading(true); setMsg(null)
    taiLai().catch((e: any) => alive && setMsg({ ok: false, text: e?.message || 'Không tải được Sổ pallet (cần chạy SQL p19)' })).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [taiLai])
  // quét tem ?hc=HC7 → chọn pallet đó
  useEffect(() => {
    const hc = sp.get('hc')
    if (!hc || !rows.length) return
    const p = rows.find((x) => x.code.toUpperCase() === hc.toUpperCase())
    if (p) chon(p)
  }, [sp, rows.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const sel = rows.find((x) => x.id === selId) ?? null
  function chon(p: MixPallet) { setSelId(p.id); setTen(p.ten ?? ''); setCode(p.code); setBi(p.bi_kg === null ? '' : String(p.bi_kg)); setLyDo(''); setTatAsk(null); setMsg(null) }
  const dem = useMemo(() => ({
    trong: rows.filter((x) => x.trang_thai === 'trong').length, dc: rows.filter((x) => x.trang_thai === 'day_chuyen').length,
    chuaBi: rows.filter((x) => x.trang_thai === 'chua_bi').length, tat: rows.filter((x) => x.trang_thai === 'tat').length,
  }), [rows])
  const hienThi = showTat ? rows : rows.filter((x) => x.is_active)
  const biN = bi === '' ? null : Number(bi)
  const biOk = biN !== null && Number.isFinite(biN) && biN > 0 && biN < 200
  const codeNorm = code.trim().replace(/\s+/g, '').toUpperCase()
  const canLai = !!sel && sel.bi_kg !== null && biOk && Math.abs(sel.bi_kg - biN!) > 0.005
  const daDoi = !!sel && (ten.trim() !== (sel.ten ?? '') || codeNorm !== sel.code || sel.bi_kg === null || canLai)
  const soMax = rows.reduce((m, x) => Math.max(m, x.so ?? 0), 0)

  async function ghi() {
    if (!sel || !biOk || !codeNorm) return
    setBusy('ghi'); setMsg(null)
    try {
      const r = await mixService.khaiPallet(sel.id, { ten: ten.trim() || null, code: codeNorm, biKg: biN, lyDo: lyDo.trim() || null })
      const fresh = await taiLai()
      // khai liên tiếp cả bộ: nhảy sang pallet đang dùng kế tiếp chưa có số kg
      const next = fresh.filter((x) => x.is_active && x.bi_kg === null && x.id !== sel.id).sort((a, b) => (a.so ?? 0) - (b.so ?? 0))[0]
      setMsg({ ok: true, text: `Đã ghi ${r.code} · ${kg1(r.bi_kg)} kg${next ? ` · tiếp theo: ${next.code}` : ''}` })
      if (next) { setSelId(next.id); setTen(ten.trim() || (next.ten ?? '')); setCode(next.code); setBi(''); setLyDo('') } else { setSelId(null) }
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không ghi được' }) }
    finally { setBusy(null) }
  }
  async function tat(p: MixPallet, tatHay: boolean) {
    setBusy(p.id); setMsg(null)
    try {
      await mixService.tatPallet(p.id, tatHay, tatLyDo.trim() || null)
      await taiLai(); setTatAsk(null); setTatLyDo('')
      setMsg({ ok: true, text: tatHay ? `Đã tắt ${p.code}, không hiện ở màn lấy nữa` : `Đã bật lại ${p.code}` })
      if (!tatHay && p.bi_kg === null) chon({ ...p, is_active: true })
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không đổi được' }) }
    finally { setBusy(null) }
  }
  async function themBo() {
    if (!facilityId) return
    const tu = Number(themTu), den = Number(themDen)
    if (!Number.isInteger(tu) || !Number.isInteger(den) || tu < 1 || den < tu) { setMsg({ ok: false, text: 'Gõ số từ / đến hợp lệ (ví dụ 31 → 40)' }); return }
    setBusy('them'); setMsg(null)
    try {
      const n = await mixService.taoBoPallet(facilityId, tu, den)
      await taiLai(); setThemMo(false)
      setMsg({ ok: true, text: n ? `Đã thêm ${n} pallet HC${tu}→HC${den}, chưa có số kg` : 'Các mã này đã có trong sổ' })
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không thêm được' }) }
    finally { setBusy(null) }
  }
  const moTa = (p: MixPallet) => {
    if (p.trang_thai === 'day_chuyen') return `${p.issue_code ?? ''}${p.issue_lot_so_lo ? ` · lô ${p.issue_lot_so_lo}` : ''}${p.issue_kg_out !== null ? ` · ${kg1(p.issue_kg_out)} kg` : ''}${p.issue_out_at ? ` · ${hm(p.issue_out_at)}` : ''}${p.issue_lenh_ma_gop ? ` · ${p.issue_lenh_ma_gop}` : ''}`
    if (p.trang_thai === 'tat') return `tắt${p.tat_ly_do ? ` · ${p.tat_ly_do}` : ''}`
    if (p.trang_thai === 'chua_bi') return 'chưa khai số kg → chưa lấy được'
    return `khai ${p.bi_khai_at ? fmtD(p.bi_khai_at) : '—'}${p.bi_khai_name ? ` · ${firstName(p.bi_khai_name)}` : ''}${p.note ? ` · ${p.note}` : ''}${p.so_lan_can_lai ? ` · cân lại ${p.so_lan_can_lai} lần` : ''}`
  }
  const cuBi = (p: MixPallet) => p.is_active && p.bi_kg !== null && (p.bi_cu_ngay ?? 0) > MIX_PALLET_BI_CU_NGAY

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Về trang chính" onClick={() => nav('/m/kho/chen')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">Hàng chèn · {facility?.code || ''} · {rows.length} pallet</span><span className="kmx-title">Sổ pallet hàng chèn</span></div>
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {msg && <div className={`kmx-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        {loading && !rows.length && <><div className="kmx-skel" /><div className="kmx-skel" /></>}
        <div className="kmx-grid3">
          <div className="kmx-stat ok"><span className="kmx-lbl ok">Trống</span><span className="kmx-num md ok">{dem.trong}</span></div>
          <div className="kmx-stat" style={dem.dc ? { background: '#FEF3C7' } : undefined}><span className="kmx-lbl">Dây chuyền</span><span className="kmx-num md" style={dem.dc ? { color: '#B45309' } : undefined}>{dem.dc}</span></div>
          <div className="kmx-stat" style={dem.chuaBi ? { background: '#FEE2E2' } : undefined}><span className="kmx-lbl" style={dem.chuaBi ? { color: '#B91C1C' } : undefined}>Chưa số kg</span><span className="kmx-num md" style={dem.chuaBi ? { color: '#B91C1C' } : undefined}>{dem.chuaBi}</span></div>
        </div>

        <section className="kmx-card" aria-label="Lưới pallet" style={{ gap: 8 }}>
          <div className="kmx-row"><span className="kmx-strong" style={{ fontSize: 13 }}>Chạm pallet để xem / khai</span><span className="kmx-sm">{dem.tat ? `${dem.tat} tắt` : ''}</span></div>
          <div className="kmx-pal">
            {rows.filter((p) => p.is_active).map((p) => (
              <button key={p.id} type="button" className={`${CELL[p.trang_thai]}${selId === p.id ? ' sel' : ''}`} onClick={() => chon(p)} aria-label={`${p.code} · ${MIX_PALLET_TRANG_THAI_LABELS[p.trang_thai]}`}>
                {p.code}<small>{p.bi_kg === null ? 'kg?' : `${kg1(p.bi_kg)} kg`}</small>
              </button>
            ))}
          </div>
          <span className="kmx-sm">Xanh nhạt = trống · vàng = đang ở dây chuyền · nét đứt = chưa khai số kg (chưa lấy được). Pallet tắt không hiện ở lưới.</span>
        </section>

        {canEdit ? (
          <section className="kmx-card" aria-label="Khai báo pallet" style={{ gap: 8, borderColor: '#1B4D3E' }}>
            <div className="kmx-row"><span className="kmx-strong" style={{ fontSize: 13 }}>Khai báo pallet{sel ? ` · ${sel.code}` : ''}</span>{sel && <button type="button" className="kmx-pill sm" style={{ flex: '0 0 auto' }} onClick={() => setSelId(null)}>Đóng</button>}</div>
            {!sel ? (
              <span className="kmx-sm">Ba cột như sổ giấy: <b>Pallet</b> (tên, loại) · <b>Chữ viết tắt</b> (in trên pallet, tổ chạm lúc lấy) · <b>Số kg</b> (cân pallet rỗng). Chạm một pallet để khai hoặc cân lại; ghi xong máy nhảy sang pallet chưa có số kg kế tiếp.</span>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 86px 86px', gap: 6 }}>
                  <label className="kmx-col" style={{ gap: 4 }}><span className="kmx-lbl">Pallet</span><input className="kmx-text" placeholder="Pallet gỗ 1,1 m" value={ten} onChange={(e) => setTen(e.target.value)} aria-label="Tên pallet" /></label>
                  <label className="kmx-col" style={{ gap: 4 }}><span className="kmx-lbl">Viết tắt</span><input className="kmx-text kmx-mono" style={{ fontWeight: 800, textTransform: 'uppercase' }} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Chữ viết tắt" /></label>
                  <label className="kmx-col" style={{ gap: 4 }}><span className="kmx-lbl">Số kg</span><input className="kmx-text kmx-mono" style={{ fontWeight: 800 }} type="number" inputMode="decimal" placeholder="0" value={bi} onChange={(e) => setBi(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && biOk && daDoi) ghi() }} autoFocus aria-label="Số kg bì" /></label>
                </div>
                {canLai && <input className="kmx-text" placeholder="Lý do cân lại (thay ván, sửa pallet, tới kỳ…)" value={lyDo} onChange={(e) => setLyDo(e.target.value)} aria-label="Lý do cân lại" />}
                {sel.trang_thai === 'day_chuyen' && <span className="kmx-sm" style={{ color: '#B45309', fontWeight: 600 }}>Đang ở dây chuyền ({sel.issue_code}): đổi được tên và số kg, phiếu đang mở vẫn giữ bì lúc lấy; chữ viết tắt đổi sau khi trả.</span>}
                {sel.note && sel.bi_kg !== null && <span className="kmx-sm">{sel.note}</span>}
                <button type="button" className="kmx-btn md" disabled={!biOk || !codeNorm || !daDoi || busy === 'ghi'} onClick={ghi}>{I.check}{busy === 'ghi' ? 'Đang ghi…' : `Ghi ${codeNorm || sel.code} · ${biOk ? `${kg1(biN)} kg` : 'gõ số kg'}`}</button>
              </>
            )}
          </section>
        ) : !role.loading && <div className="kmx-card muted" style={{ fontSize: 13 }}>Chỉ thủ kho (bước 3 nhận kho) và Ban Giám đốc ghi được Sổ pallet. Bạn xem được số kg và pallet nào đang ở dây chuyền.</div>}

        <section aria-label="Danh sách pallet" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="kmx-row" style={{ padding: '0 2px' }}>
            <h2 className="kmx-h2">Sổ pallet · {hienThi.length}</h2>
            {dem.tat > 0 && <button type="button" className="kmx-pill sm" style={{ flex: '0 0 auto' }} onClick={() => setShowTat((v) => !v)}>{showTat ? 'Ẩn pallet tắt' : `Xem ${dem.tat} pallet tắt`}</button>}
          </div>
          <div className="kmx-list">
            {hienThi.map((p) => (
              <div key={p.id} className="kmx-li" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 5, borderColor: selId === p.id ? '#1B4D3E' : undefined }}>
                <div className="kmx-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span className="kmx-hc" style={HC_BG[p.trang_thai] ? { background: HC_BG[p.trang_thai] } : undefined}>{p.code}</span>
                    <span className="kmx-num sm" style={{ whiteSpace: 'nowrap', color: p.bi_kg === null ? '#B91C1C' : undefined }}>{p.bi_kg === null ? '— kg' : `${kg1(p.bi_kg)} kg`}</span>
                    <span className="kmx-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.ten || ''}</span>
                  </span>
                  <span className={`kmx-chip ${cuBi(p) && p.trang_thai === 'trong' ? 'amb' : CHIP[p.trang_thai]}`}>{cuBi(p) && p.trang_thai === 'trong' ? 'cân lại' : MIX_PALLET_TRANG_THAI_LABELS[p.trang_thai]}</span>
                </div>
                <span className="kmx-sm">{moTa(p)}{cuBi(p) ? ` · bì khai ${p.bi_cu_ngay} ngày trước` : ''}</span>
                {canEdit && (
                  <div className="kmx-row" style={{ gap: 6, justifyContent: 'flex-start' }}>
                    {p.is_active && <button type="button" className="kmx-pill sm" style={{ flex: '0 0 auto' }} onClick={() => { chon(p); window.scrollTo({ top: 0 }) }}>{p.bi_kg === null ? 'Khai số kg' : 'Sửa · cân lại'}</button>}
                    {p.is_active && p.trang_thai !== 'day_chuyen' && tatAsk !== p.id && <button type="button" className="kmx-pill sm" style={{ flex: '0 0 auto', color: '#B91C1C' }} onClick={() => { setTatAsk(p.id); setTatLyDo('') }}>Tắt</button>}
                    {!p.is_active && <button type="button" className="kmx-pill sm" style={{ flex: '0 0 auto' }} disabled={busy === p.id} onClick={() => tat(p, false)}>{busy === p.id ? '…' : 'Bật lại'}</button>}
                  </div>
                )}
                {tatAsk === p.id && (
                  <div className="kmx-tint col" style={{ alignItems: 'stretch', gap: 6, background: '#FEE2E2' }}>
                    <input className="kmx-text" placeholder="Vì sao tắt (gãy ván, hỏng…)" value={tatLyDo} onChange={(e) => setTatLyDo(e.target.value)} aria-label="Lý do tắt" />
                    <div className="kmx-row" style={{ gap: 6 }}>
                      <button type="button" className="kmx-pill sm" style={{ background: '#B91C1C', color: '#fff', borderColor: '#B91C1C' }} disabled={busy === p.id} onClick={() => tat(p, true)}>{busy === p.id ? '…' : `Tắt ${p.code}`}</button>
                      <button type="button" className="kmx-pill sm" onClick={() => setTatAsk(null)}>Không</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!loading && !rows.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Nhà máy này chưa có Sổ pallet. {canEdit ? 'Bấm "Thêm pallet…" để tạo bộ HC.' : 'Báo thủ kho tạo bộ pallet.'}</div>}
          </div>
        </section>

        {canEdit && (
          <section className="kmx-card" aria-label="Thêm pallet" style={{ gap: 8 }}>
            <div className="kmx-row"><span className="kmx-strong" style={{ fontSize: 13 }}>Thêm pallet vào sổ</span><button type="button" className="kmx-pill sm" style={{ flex: '0 0 auto' }} onClick={() => { setThemMo((v) => !v); setThemTu(String(soMax + 1)); setThemDen(String(soMax + 10)) }}>{themMo ? 'Đóng' : 'Thêm pallet…'}</button></div>
            {themMo && (
              <div className="kmx-row" style={{ gap: 6, alignItems: 'flex-end' }}>
                <label className="kmx-col" style={{ gap: 4, flex: 1 }}><span className="kmx-lbl">HC từ</span><input className="kmx-text kmx-mono" type="number" inputMode="numeric" value={themTu} onChange={(e) => setThemTu(e.target.value)} aria-label="Số từ" /></label>
                <label className="kmx-col" style={{ gap: 4, flex: 1 }}><span className="kmx-lbl">đến</span><input className="kmx-text kmx-mono" type="number" inputMode="numeric" value={themDen} onChange={(e) => setThemDen(e.target.value)} aria-label="Số đến" /></label>
                <button type="button" className="kmx-pill" style={{ flex: '0 0 auto', height: 44 }} disabled={busy === 'them'} onClick={themBo}>{busy === 'them' ? '…' : 'Thêm'}</button>
              </div>
            )}
            <span className="kmx-sm">Pallet mới chưa có số kg, khai ở trên rồi mới lấy được. Pallet hỏng thì Tắt, không xoá (lịch sử phiếu còn tham chiếu).</span>
          </section>
        )}

        <section aria-label="Lịch sử" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="kmx-hlink" style={{ border: 0, background: 'transparent', font: 'inherit', cursor: 'pointer', textAlign: 'left' }} onClick={() => setShowLogs((v) => !v)}>
            <span className="kmx-h2" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1B4D3E' }}>Lịch sử sổ pallet · {logs.length}{I.chev}</span>
            <span className="kmx-sm">Khai số kg, cân lại, đổi chữ viết tắt, tắt / bật. Không xoá.</span>
          </button>
          {showLogs && (
            <div className="kmx-list">
              {logs.map((l) => (
                <div key={l.id} className="kmx-li" style={{ gap: 8 }}>
                  <span className="kmx-col" style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0D2E25' }}><span className="kmx-mono">{l.pallet_code}</span> · {MIX_PALLET_LOG_LABELS[l.loai] ?? l.loai}{l.loai === 'khai' || l.loai === 'can_lai' ? ` · ${l.bi_cu === null ? '—' : kg1(l.bi_cu)} → ${kg1(l.bi_moi)} kg` : l.loai === 'doi_ma' ? ` · ${l.code_cu} → ${l.code_moi}` : ''}</span>
                    <span className="kmx-sm">{fmtDt(l.at)}{l.by_name ? ` · ${firstName(l.by_name)}` : ''}{l.ly_do ? ` · ${l.ly_do}` : ''}</span>
                  </span>
                </div>
              ))}
              {!logs.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Chưa có lần ghi nào.</div>}
            </div>
          )}
        </section>
        <span className="kmx-sm kmx-center" style={{ color: '#9CA3AF' }}>Lúc lấy: chạm chữ viết tắt trên pallet, gõ số trên cân, máy trừ số kg này · cuối ca: dùng hết một chạm, còn dư cân một lần</span>
      </div></div>
    </div>
  )
}
