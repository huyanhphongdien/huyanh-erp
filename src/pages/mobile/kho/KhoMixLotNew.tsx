// ============================================================================
// KhoMixLotNew — nhập lô chèn mới từ điện thoại (nguồn, kg, grade, chỉ số, QC cho phép).
// File: src/pages/mobile/kho/KhoMixLotNew.tsx · Route: /m/kho/chen/kho/nhap
// ============================================================================
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mixService, MIX_SOURCE_LABELS, type MixSourceType } from '../../../services/wms/mixService'
import { fmtKg, todayLocal, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const GRADES = ['SVR 3L', 'SVR 5', 'SVR 10', 'SVR 20', 'SVR CV50', 'SVR CV60', 'SVR L', 'RSS 3', 'SBR 1502']

export default function KhoMixLotNew() {
  const nav = useNavigate()
  const { facilityId, facility } = useKhoFacility()
  const [sourceType, setSourceType] = useState<MixSourceType>('loi')
  const [desc, setDesc] = useState('')
  const [grade, setGrade] = useState('')
  const [gradeOther, setGradeOther] = useState(false)
  const [kg, setKg] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [more, setMore] = useState(false)
  const [po, setPo] = useState(''); const [mooney, setMooney] = useState(''); const [pri, setPri] = useState('')
  const [mixPct, setMixPct] = useState('')
  const [rerun, setRerun] = useState(true)
  const [metal, setMetal] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const kgN = kg === '' ? null : Number(kg)
  const kgOk = kgN !== null && Number.isFinite(kgN) && kgN > 0
  const num = (s: string) => (s.trim() === '' ? null : Number.isFinite(Number(s)) ? Number(s) : null)

  async function ghi() {
    if (!facilityId || !kgOk) return
    setBusy(true); setMsg(null)
    try {
      await mixService.createLot({ facilityId, sourceType, sourceDesc: desc.trim() || null, grade: grade.trim() || null, kgIn: kgN!, po: num(po), mooney: num(mooney), pri: num(pri), qcAllowMixPct: num(mixPct), qcAllowRerun: rerun, metalCleared: sourceType === 'dkl' ? metal : false, receivedDate: date || null, note: note.trim() || null })
      nav('/m/kho/chen/kho', { replace: true, state: { msg: `Đã nhập lô chèn ${fmtKg(kgN)} kg (${MIX_SOURCE_LABELS[sourceType]})` } })
    } catch (e: any) { setMsg(e?.message || 'Không nhập được') }
    finally { setBusy(false) }
  }

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Quay lại kho chèn" onClick={() => nav('/m/kho/chen/kho')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">Kho chèn · {facility?.code || ''}</span><span className="kmx-title">Nhập lô chèn</span></div>
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {msg && <div className="kmx-msg err">{msg}</div>}
        <section className="kmx-card" aria-label="Nguồn hàng" style={{ gap: 10 }}>
          <span className="kmx-lbl">Nguồn hàng</span>
          <div className="kmx-seg">
            {(Object.keys(MIX_SOURCE_LABELS) as MixSourceType[]).map((k) => <button key={k} type="button" className={sourceType === k ? 'on' : ''} onClick={() => setSourceType(k)}>{MIX_SOURCE_LABELS[k].replace(/ \(.*\)/, '')}</button>)}
          </div>
          <div className="kmx-col" style={{ gap: 4 }}>
            <label htmlFor="lot-desc" className="kmx-lbl">Mô tả</label>
            <input id="lot-desc" className="kmx-text" placeholder={sourceType === 'loi' ? 'Ví dụ: Po thấp tổ Đen 27/10' : sourceType === 'std' ? 'Ví dụ: SVR 3L kho thành phẩm' : sourceType === 'mua_ngoai' ? 'Ví dụ: Cty Đại Lộc' : 'Ví dụ: DKL ca 2'} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="kmx-col" style={{ gap: 6 }}>
            <span className="kmx-lbl">Grade</span>
            <div className="kmx-seg">
              {GRADES.map((g) => <button key={g} type="button" className={!gradeOther && grade === g ? 'on' : ''} style={{ minWidth: 0, height: 40, fontSize: 13 }} onClick={() => { setGrade(g); setGradeOther(false) }}>{g}</button>)}
              <button type="button" className={gradeOther ? 'on' : ''} style={{ minWidth: 0, height: 40, fontSize: 13 }} onClick={() => { setGradeOther(true); setGrade('') }}>Khác…</button>
            </div>
            {gradeOther && <input className="kmx-text" placeholder="Grade" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade khác" />}
          </div>
        </section>

        <section className="kmx-card" aria-label="Khối lượng" style={{ gap: 8 }}>
          <label htmlFor="lot-kg" className="kmx-strong" style={{ fontSize: 13 }}>Khối lượng nhập (kg)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input id="lot-kg" className="kmx-input" type="number" inputMode="decimal" placeholder="0" value={kg} onChange={(e) => setKg(e.target.value)} />
            <span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span>
          </div>
          <div className="kmx-col" style={{ gap: 4 }}>
            <label htmlFor="lot-date" className="kmx-lbl">Ngày nhập</label>
            <input id="lot-date" className="kmx-text" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </section>

        {sourceType === 'dkl' && (
          <section className="kmx-card" aria-label="Kim loại" style={{ borderColor: '#FECACA' }}>
            <label className="kmx-check-row" htmlFor="lot-metal"><input id="lot-metal" type="checkbox" checked={metal} onChange={(e) => setMetal(e.target.checked)} /><span><b>Đã xử lý kim loại</b><br /><span className="kmx-sm">Chưa tick thì nhập được nhưng chưa lấy chèn được; sau xử lý vào Kho chèn bấm mở.</span></span></label>
          </section>
        )}

        <section className="kmx-card" aria-label="Chỉ số và QC" style={{ gap: 10 }}>
          <button type="button" className="kmx-row" style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer', width: '100%' }} onClick={() => setMore((v) => !v)} aria-expanded={more}>
            <span className="kmx-strong" style={{ fontSize: 13 }}>Chỉ số và QC cho phép <span style={{ fontWeight: 500, color: '#6B7280' }}>(không bắt buộc)</span></span>
            <span style={{ transform: more ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>{I.chev}</span>
          </button>
          {more && (
            <>
              <div className="kmx-grid3">
                <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-po" className="kmx-lbl">Po</label><input id="lot-po" className="kmx-text" type="number" inputMode="decimal" value={po} onChange={(e) => setPo(e.target.value)} /></div>
                <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-mooney" className="kmx-lbl">Mooney</label><input id="lot-mooney" className="kmx-text" type="number" inputMode="decimal" value={mooney} onChange={(e) => setMooney(e.target.value)} /></div>
                <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-pri" className="kmx-lbl">PRI</label><input id="lot-pri" className="kmx-text" type="number" inputMode="decimal" value={pri} onChange={(e) => setPri(e.target.value)} /></div>
              </div>
              <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-mix" className="kmx-lbl">Trộn tối đa (%) · trống = không giới hạn</label><input id="lot-mix" className="kmx-text" type="number" inputMode="decimal" value={mixPct} onChange={(e) => setMixPct(e.target.value)} /></div>
              <label className="kmx-check-row" htmlFor="lot-rerun"><input id="lot-rerun" type="checkbox" checked={rerun} onChange={(e) => setRerun(e.target.checked)} /><span>QC cho phép chạy lại</span></label>
              <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-note" className="kmx-lbl">Ghi chú</label><input id="lot-note" className="kmx-text" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </>
          )}
        </section>
      </div></div>
      <div className="kmx-foot">
        <button type="button" className="kmx-btn" disabled={!kgOk || busy} onClick={ghi}>{I.check}{busy ? 'Đang nhập…' : kgOk ? `Nhập kho chèn · ${fmtKg(kgN)} kg` : 'Nhập kho chèn'}</button>
      </div>
    </div>
  )
}
