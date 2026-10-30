// ============================================================================
// KhoMixOut — LẤY HÀNG CHÈN ĐẦU CA: chọn lô, kg, ca, tổ, mục đích → tạo phiếu → sang trang ảnh
// File: src/pages/mobile/kho/KhoMixOut.tsx · Route: /m/kho/chen/lay
// ============================================================================
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { mixService, MIX_SOURCE_LABELS, type MixLot, type MixPurpose, type ShiftLite } from '../../../services/wms/mixService'
import { KhoAppBar, Msg, fmtKg, inp, inpBig, lbl, todayLocal, useKhoFacility } from './khoCommon'

export default function KhoMixOut() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { facilityId, facility } = useKhoFacility()
  const [lots, setLots] = useState<MixLot[]>([])
  const [shifts, setShifts] = useState<ShiftLite[]>([])
  const [lotId, setLotId] = useState<string>(sp.get('lot') || '')
  const [kg, setKg] = useState('')
  const [shiftId, setShiftId] = useState('')
  const [team, setTeam] = useState('')
  const [purpose, setPurpose] = useState<MixPurpose>('chay_lai')
  const [targetIndex, setTargetIndex] = useState('Po')
  const [targetValue, setTargetValue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!facilityId) return
    Promise.all([mixService.listLots(facilityId), mixService.listShifts()]).then(([l, s]) => {
      const ok = l.filter((x) => x.ton_kg > 0.005)
      setLots(ok); setShifts(s)
      if (!lotId && ok.length === 1) setLotId(ok[0].id)
    }).catch((e) => setMsg({ ok: false, text: e?.message || 'Không tải được lô chèn' }))
  }, [facilityId]) // eslint-disable-line react-hooks/exhaustive-deps

  const lot = lots.find((l) => l.id === lotId)
  const kgN = kg === '' ? null : Number(kg)
  const qua = !!lot && kgN !== null && kgN > lot.ton_kg + 0.01

  async function submit() {
    if (!lot) { setMsg({ ok: false, text: 'Chọn lô chèn' }); return }
    if (kgN === null || !Number.isFinite(kgN) || kgN <= 0) { setMsg({ ok: false, text: 'Nhập kg lấy' }); return }
    if (qua) { setMsg({ ok: false, text: `Lô chỉ còn ${fmtKg(lot.ton_kg)} kg` }); return }
    setBusy(true); setMsg(null)
    try {
      const id = await mixService.lay({ lotId: lot.id, kg: kgN, shiftDate: todayLocal(), shiftId: shiftId || null, team: team.trim() || null, purpose, targetIndex: purpose === 'nang_chi_so' ? targetIndex : null, targetValue: purpose === 'nang_chi_so' && targetValue !== '' ? Number(targetValue) : null, note: note.trim() || null })
      nav(`/m/kho/chen/phieu/${id}`, { replace: true })
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không ghi được' }) }
    finally { setBusy(false) }
  }

  return (
    <>
      <KhoAppBar title="Lấy hàng chèn đầu ca" sub={`${facility?.code || ''} · ${new Date().toLocaleDateString('vi-VN')}`} back="/m/kho/chen" />
      <div className="ops-body">
        <div className="ops-inner">
          <Msg m={msg} />
          <div className="ops-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><label style={lbl} htmlFor="mx-lot">Lô chèn</label>
              <select id="mx-lot" style={inp} value={lotId} onChange={(e) => setLotId(e.target.value)}>
                <option value="">— chọn lô —</option>
                {lots.map((l) => <option key={l.id} value={l.id} disabled={l.source_type === 'dkl' && !l.metal_cleared}>{l.code} · {MIX_SOURCE_LABELS[l.source_type]}{l.grade ? ` · ${l.grade}` : ''} · tồn {fmtKg(l.ton_kg)} kg{l.source_type === 'dkl' && !l.metal_cleared ? ' · CHƯA XỬ LÝ KL' : ''}</option>)}
              </select>
              {lot && <div className="ops-sm" style={{ marginTop: 4 }}>{lot.source_desc || ''} · Po {lot.po ?? '—'} · Mooney {lot.mooney ?? '—'} · PRI {lot.pri ?? '—'}{lot.qc_allow_mix_pct !== null ? ` · trộn ≤ ${lot.qc_allow_mix_pct} %` : ''}{!lot.qc_allow_rerun ? ' · KHÔNG chạy lại' : ''}</div>}
            </div>
            <div><label style={lbl} htmlFor="mx-kg">Kg lấy (đọc trên cân)</label><input id="mx-kg" style={{ ...inpBig, borderColor: qua ? 'var(--red)' : undefined }} type="number" inputMode="decimal" placeholder="0" value={kg} onChange={(e) => setKg(e.target.value)} />
              {lot && <div className="ops-sm" style={{ textAlign: 'right', color: qua ? 'var(--red)' : undefined }}>tồn lô {fmtKg(lot.ton_kg)} kg</div>}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label style={lbl} htmlFor="mx-shift">Ca</label><select id="mx-shift" style={inp} value={shiftId} onChange={(e) => setShiftId(e.target.value)}><option value="">— ca —</option>{shifts.map((s) => <option key={s.id} value={s.id}>{s.name || s.code}</option>)}</select></div>
              <div><label style={lbl} htmlFor="mx-team">Tổ</label><input id="mx-team" style={inp} value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Tổ Đen…" /></div>
            </div>
            <div><span style={lbl}>Mục đích</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {([['chay_lai', 'Chạy lại'], ['nang_chi_so', 'Nâng chỉ số']] as const).map(([k, t]) => <button key={k} type="button" className={`ops-chip ${purpose === k ? 'lime' : 'mut'}`} style={{ border: 0, cursor: 'pointer', padding: '9px 14px', fontSize: 13, flex: 1 }} onClick={() => setPurpose(k)}>{t}</button>)}
              </div>
            </div>
            {purpose === 'nang_chi_so' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={lbl} htmlFor="mx-ti">Chỉ số</label><select id="mx-ti" style={inp} value={targetIndex} onChange={(e) => setTargetIndex(e.target.value)}>{['Po', 'PRI', 'Mooney', 'Tạp chất', 'Khác'].map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                <div><label style={lbl} htmlFor="mx-tv">Mục tiêu</label><input id="mx-tv" style={inp} type="number" inputMode="decimal" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} /></div>
              </div>
            )}
            <div><label style={lbl} htmlFor="mx-note">Ghi chú</label><input id="mx-note" style={inp} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <button className="ops-btn g" disabled={busy || !lot || kgN === null || qua} onClick={submit}>{busy ? 'Đang ghi…' : 'Ghi lấy → chụp 2 ảnh'}</button>
          <div className="ops-sm" style={{ textAlign: 'center' }}>Sau khi ghi, chụp ảnh toàn cảnh + màn hình cân ngay tại cân.</div>
        </div>
      </div>
    </>
  )
}
