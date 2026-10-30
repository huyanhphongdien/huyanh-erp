// ============================================================================
// KhoMixOut — LẤY HÀNG CHÈN ĐẦU CA, 3 bước theo mockup 30/10:
//   1 chọn lô (quét tem hoặc chạm thẻ) → 2 cân & chụp 2 ảnh ngay (ca tự nhận, tổ bằng nút)
//   → 3 xem lại & ghi → màn "đã ghi". Ảnh chụp TRƯỚC khi ghi nhờ uuid phiếu sinh sẵn (fn_mix_lay p_id).
// File: src/pages/mobile/kho/KhoMixOut.tsx · Route: /m/kho/chen/lay
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import OpsQrScanner from '../OpsQrScanner'
import { useAuthStore } from '../../../stores/authStore'
import { mixService, MIX_SOURCE_LABELS, type MixLot, type MixPurpose } from '../../../services/wms/mixService'
import { rawPhotoService, type RawPhoto } from '../../../services/wms/rawPhotoService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import type { OpsShiftOption } from '../../../services/opsService'
import { firstName } from '../opsUtil'
import { fmtKg, parseKhoScan, todayLocal, useKhoFacility } from './khoCommon'
import { detectShift, hhmm, I, KmxPhotoTiles, newUuid, Steps, type ShiftPick } from './khoMixUtil'
import './khoMix.css'

const DEFAULT_TEAMS = ['Đen', 'Vàng']
const INDEXES = ['Po', 'PRI', 'Mooney', 'Tạp chất', 'Khác']

export default function KhoMixOut() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { facilityId, facility } = useKhoFacility()
  const user = useAuthStore((s) => s.user)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [lots, setLots] = useState<MixLot[]>([])
  const [lot, setLot] = useState<MixLot | null>(null)
  const [kg, setKg] = useState('')
  const [shift, setShift] = useState<ShiftPick | null>(null)
  const [shifts, setShifts] = useState<OpsShiftOption[]>([])
  const [pickShift, setPickShift] = useState(false)
  const [teams, setTeams] = useState<string[]>(DEFAULT_TEAMS)
  const [team, setTeam] = useState('')
  const [teamOther, setTeamOther] = useState(false)
  const [purpose, setPurpose] = useState<MixPurpose>('chay_lai')
  const [targetIndex, setTargetIndex] = useState('Po')
  const [targetValue, setTargetValue] = useState('')
  const [note, setNote] = useState('')
  const [issueId, setIssueId] = useState(() => newUuid())
  const [photos, setPhotos] = useState<RawPhoto[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [scan, setScan] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [codeDone, setCodeDone] = useState<string>('')
  const [doneAt, setDoneAt] = useState<string>('')

  useEffect(() => {
    if (!facilityId) return
    let alive = true
    Promise.all([mixService.listLots(facilityId), rawSettingsService.getForFacility(facilityId), mixService.listTeams(facilityId), detectShift(user?.employee_id || null)])
      .then(([l, s, t, d]) => {
        if (!alive) return
        const ok = l.filter((x) => x.ton_kg > 0.005)
        setLots(ok); setSettings(s); setShifts(d.shifts); setShift(d.pick)
        const tl = [...new Set([...t, ...DEFAULT_TEAMS])]; setTeams(tl)
        const pre = sp.get('lot'); const hit = pre ? ok.find((x) => x.id === pre) : null
        if (hit && !(hit.source_type === 'dkl' && !hit.metal_cleared)) { setLot(hit); setStep(2) }
      })
      .catch((e) => alive && setMsg(e?.message || 'Không tải được kho chèn'))
    return () => { alive = false }
  }, [facilityId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPhotos = useCallback(async () => { try { setPhotos(await rawPhotoService.list('mix_issue_out', issueId)) } catch { /* bỏ qua */ } }, [issueId])

  const required = settings.anh_bat_buoc?.length ? settings.anh_bat_buoc : ['toan_canh', 'man_hinh_can']
  const missing = rawPhotoService.missing(photos, required)
  const kgN = kg === '' ? null : Number(kg)
  const kgOk = kgN !== null && Number.isFinite(kgN) && kgN > 0
  const qua = !!lot && kgN !== null && kgN > lot.ton_kg + 0.01
  const conLai = lot && kgN !== null ? lot.ton_kg - kgN : null
  const teamFinal = team.trim()

  const chonLo = (l: MixLot) => { setLot(l); setMsg(null); setStep(2) }

  async function onScan(raw: string) {
    setScan(false)
    const p = parseKhoScan(raw)
    if (!p) return
    try {
      const l = p.kind === 'mix_lot' ? await mixService.findLotByCode(p.value) : null
      if (!l) { setMsg(`Không tìm thấy lô chèn "${p.value}"`); return }
      const inList = lots.find((x) => x.id === l.id)
      if (!inList) { setMsg(`${l.code} không còn hàng hoặc thuộc nhà máy khác`); return }
      if (inList.source_type === 'dkl' && !inList.metal_cleared) { setMsg(`${l.code} dính kim loại, chưa xử lý, chưa lấy được`); return }
      chonLo(inList)
    } catch (e: any) { setMsg(e?.message || 'Không đọc được mã') }
  }

  async function ghi() {
    if (!lot || !kgOk || qua) return
    setBusy(true); setMsg(null)
    try {
      await mixService.lay({ id: issueId, lotId: lot.id, kg: kgN!, shiftDate: todayLocal(), shiftId: shift?.id ?? null, team: teamFinal || null, purpose, targetIndex: purpose === 'nang_chi_so' ? targetIndex : null, targetValue: purpose === 'nang_chi_so' && targetValue !== '' ? Number(targetValue) : null, note: note.trim() || null })
      const i = await mixService.getIssue(issueId)
      setCodeDone(i?.code || ''); setDoneAt(i?.out_at || new Date().toISOString()); setStep(4)
    } catch (e: any) { setMsg(e?.message || 'Không ghi được') }
    finally { setBusy(false) }
  }

  async function boDo() {
    // bỏ dở: xóa ảnh đã tải (phiếu chưa ghi) rồi về trang chính
    for (const p of photos) rawPhotoService.remove(p.id).catch(() => { /* bỏ qua */ })
    nav('/m/kho/chen')
  }

  function layThem() {
    setStep(1); setLot(null); setKg(''); setNote(''); setPurpose('chay_lai'); setTargetValue(''); setPhotos([]); setIssueId(newUuid()); setCodeDone(''); setMsg(null)
    if (facilityId) mixService.listLots(facilityId).then((l) => setLots(l.filter((x) => x.ton_kg > 0.005))).catch(() => { /* bỏ qua */ })
  }

  const Head = ({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack: () => void }) => (
    <header className="kmx-hd">
      <button type="button" className="kmx-back" aria-label="Quay lại" onClick={onBack}>{I.back}</button>
      <div className="kmx-hd-txt"><span className="kmx-eyebrow">{eyebrow}</span><span className="kmx-title">{title}</span></div>
    </header>
  )
  const caTo = `${shift?.name || 'Ca ?'}${teamFinal ? ` · Tổ ${teamFinal}` : ''}`

  // ── màn 4: đã ghi ──
  if (step === 4) {
    return (
      <div className="kmx">
        <div className="kmx-done">
          <span className="kmx-check"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1>Đã ghi lấy đầu ca</h1>
            <span className="kmx-mono" style={{ fontSize: 20, fontWeight: 700, color: '#E8A838' }}>{codeDone}</span>
          </div>
          <div className="kmx-done-card">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="kmx-num xl">{fmtKg(kgN)}</span><span style={{ fontSize: 15, fontWeight: 600 }}>kg · {doneAt ? new Date(doneAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>
            <span>Lô <span className="kmx-mono" style={{ fontWeight: 600, color: '#fff' }}>{lot?.code}</span> · {lot ? MIX_SOURCE_LABELS[lot.source_type].toLowerCase() : ''}{lot?.source_desc ? ` · ${lot.source_desc}` : ''}</span>
            <span>{caTo} · {purpose === 'chay_lai' ? 'chạy lại' : `nâng ${targetIndex}${targetValue ? ' → ' + targetValue : ''}`} · {photos.length} ảnh · {firstName(user?.full_name) || ''}</span>
          </div>
          <div className="kmx-note gold" style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left' }}>{I.clock}<span><b>Việc tiếp theo, cuối ca:</b> mở trang chính, bấm <b>Trả cuối ca</b>, cân phần còn lại và chụp 2 ảnh.</span></div>
        </div>
        <div className="kmx-done-foot">
          <button type="button" className="kmx-btn white" onClick={() => nav('/m/kho/chen')}>Về trang chính</button>
          <button type="button" className="kmx-btn outline-w" onClick={layThem}>{I.plus}Lấy thêm lô khác</button>
        </div>
      </div>
    )
  }

  // ── màn 1: chọn lô ──
  if (step === 1) {
    return (
      <div className="kmx">
        <Head eyebrow={`Lấy đầu ca · ${caTo}`} title="Chọn lô chèn" onBack={boDo} />
        <Steps cur={1} />
        <div className="kmx-body"><div className="kmx-inner">
          {msg && <div className="kmx-msg err">{msg}</div>}
          <button type="button" className="kmx-btn" style={{ minHeight: 64, background: '#E8F5F0', color: '#0D2E25', border: '2px dashed #2D8B6E', fontSize: 16 }} onClick={() => setScan(true)}>{I.qr}Quét tem trên lô</button>
          <div className="kmx-divider">hoặc chạm chọn trong kho chèn</div>
          {!lots.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Kho chèn chưa có lô còn hàng. Nhờ thủ kho nhập lô trên máy tính, mục Kho chèn.</div>}
          {lots.map((l) => {
            const khoa = l.source_type === 'dkl' && !l.metal_cleared
            const chip = l.source_type === 'loi' ? 'amb' : l.source_type === 'dkl' ? 'red' : l.source_type === 'std' ? 'blue' : 'mut'
            const body = (
              <>
                <span className="kmx-row"><span className="kmx-mono" style={{ fontSize: 15, fontWeight: 700, color: khoa ? '#6B7280' : '#0D2E25' }}>{l.code}</span><span className={`kmx-chip ${chip}`}>{MIX_SOURCE_LABELS[l.source_type].replace(/ \(.*\)/, '')}</span></span>
                <span className="kmx-row" style={{ alignItems: 'flex-end' }}>
                  <span className="kmx-col">
                    <span style={{ fontSize: 14, fontWeight: 600, color: khoa ? '#6B7280' : '#1F2937' }}>{l.source_desc || MIX_SOURCE_LABELS[l.source_type]}{l.grade ? ` · ${l.grade}` : ''}</span>
                    <span className="kmx-sm" style={khoa ? { color: '#B91C1C', fontWeight: 600 } : undefined}>{khoa ? 'Chưa xử lý kim loại, chưa lấy được. Báo thủ kho.' : `${l.po !== null ? `Po ${l.po}` : ''}${l.mooney !== null ? ` · Mooney ${l.mooney}` : ''}${l.pri !== null ? ` · PRI ${l.pri}` : ''}${l.qc_allow_mix_pct !== null ? ` · QC: trộn ≤ ${l.qc_allow_mix_pct} %` : ''}${l.qc_allow_rerun ? ', chạy lại được' : ' · KHÔNG chạy lại'}`}</span>
                  </span>
                  <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className={`kmx-num lg${khoa ? ' mut' : ''}`}>{fmtKg(l.ton_kg)}</span><span className="kmx-sm" style={{ fontWeight: 600 }}>kg trong kho</span></span>
                </span>
                {!khoa && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, fontSize: 13, fontWeight: 700, color: '#1B4D3E' }}>Chọn lô này{I.next}</span>}
              </>
            )
            return khoa
              ? <div key={l.id} className="kmx-card muted">{body}</div>
              : <button key={l.id} type="button" className="kmx-card press" style={{ font: 'inherit', textAlign: 'left', width: '100%' }} onClick={() => chonLo(l)}>{body}</button>
          })}
        </div></div>
        {scan && <OpsQrScanner onClose={() => setScan(false)} onDetect={onScan} />}
      </div>
    )
  }

  // ── màn 2: cân & chụp ──
  if (step === 2 && lot) {
    return (
      <div className="kmx">
        <Head eyebrow={`Lấy đầu ca · lô ${lot.code}`} title="Cân và chụp" onBack={() => setStep(1)} />
        <Steps cur={2} />
        <div className="kmx-body"><div className="kmx-inner">
          {msg && <div className="kmx-msg err">{msg}</div>}
          <section className="kmx-card" aria-label="Số đọc trên cân">
            <label htmlFor="kmx-kg" className="kmx-strong" style={{ fontSize: 13 }}>Đọc đúng số trên màn hình cân</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input id="kmx-kg" className={`kmx-input${qua ? ' red' : ''}`} type="number" inputMode="decimal" placeholder="0" value={kg} onChange={(e) => setKg(e.target.value)} autoFocus />
              <span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span>
            </div>
            <div className="kmx-tint" style={qua ? { background: '#FEE2E2', color: '#B91C1C' } : undefined}><span>{qua ? 'Lấy nhiều hơn tồn của lô' : 'Lô còn lại sau khi lấy'}</span><span className="kmx-num sm" style={qua ? { color: '#B91C1C' } : undefined}>{conLai === null ? `${fmtKg(lot.ton_kg)} kg trong kho` : `${fmtKg(Math.max(conLai, 0))} kg`}</span></div>
          </section>

          <section className="kmx-card" aria-label="Ca và tổ" style={{ gap: 10 }}>
            <div className="kmx-row">
              <span className="kmx-col"><span className="kmx-lbl">Ca</span><span className="kmx-strong" style={{ fontSize: 15 }}>{shift ? `${shift.name}${shift.start_time ? ` · ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : ''}` : 'Chưa chọn ca'}</span><span className="kmx-sm" style={{ color: shift ? '#15803D' : '#B45309' }}>{shift?.nguon === 'cham_cong' ? 'tự nhận theo chấm công của bạn' : shift?.nguon === 'gio' ? 'tự nhận theo giờ hiện tại' : shift ? 'bạn chọn' : 'chọn ca để sổ ca tự điền'}</span></span>
              <button type="button" className="kmx-pill sm" onClick={() => setPickShift((v) => !v)}>{pickShift ? 'Đóng' : 'Đổi ca'}</button>
            </div>
            {pickShift && (
              <div className="kmx-seg">
                {shifts.map((s) => <button key={s.id} type="button" className={shift?.id === s.id ? 'on' : ''} onClick={() => { setShift({ id: s.id, name: s.name, code: s.code, start_time: s.start_time, end_time: s.end_time, nguon: 'tay' }); setPickShift(false) }}>{s.name}</button>)}
              </div>
            )}
            <div className="kmx-col" style={{ gap: 6 }}>
              <span className="kmx-lbl">Tổ</span>
              <div className="kmx-seg">
                {teams.map((t) => <button key={t} type="button" className={!teamOther && team === t ? 'on' : ''} onClick={() => { setTeam(t); setTeamOther(false) }}>Tổ {t}</button>)}
                <button type="button" className={teamOther ? 'on' : ''} onClick={() => { setTeamOther(true); setTeam('') }}>Khác…</button>
              </div>
              {teamOther && <input className="kmx-text" placeholder="Tên tổ" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Tên tổ" />}
            </div>
            <div className="kmx-col" style={{ gap: 6 }}>
              <span className="kmx-lbl">Dùng để</span>
              <div className="kmx-seg">
                <button type="button" className={purpose === 'chay_lai' ? 'on' : ''} onClick={() => setPurpose('chay_lai')}>Chạy lại</button>
                <button type="button" className={purpose === 'nang_chi_so' ? 'on' : ''} onClick={() => setPurpose('nang_chi_so')}>Nâng chỉ số</button>
              </div>
              {purpose === 'nang_chi_so' && (
                <div className="kmx-grid2">
                  <select className="kmx-text" value={targetIndex} onChange={(e) => setTargetIndex(e.target.value)} aria-label="Chỉ số">{INDEXES.map((v) => <option key={v} value={v}>{v}</option>)}</select>
                  <input className="kmx-text" type="number" inputMode="decimal" placeholder="Mục tiêu" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} aria-label="Mục tiêu" />
                </div>
              )}
            </div>
          </section>

          <section className="kmx-card" aria-label="Chụp ảnh">
            <div className="kmx-row"><span className="kmx-strong" style={{ fontSize: 13 }}>Chụp 2 ảnh ngay tại cân</span><span className={`kmx-chip ${missing.length ? 'red' : 'ok'}`}>{required.length - missing.length}/{required.length} đã chụp</span></div>
            <KmxPhotoTiles refType="mix_issue_out" refId={issueId} photos={photos} required={required} facilityCode={facility?.code} onChange={loadPhotos} onError={setMsg} />
            <span className="kmx-sm">Ảnh tự gắn giờ, vị trí và người chụp. Thiếu ảnh 1 hoặc 2 thì chưa qua bước sau được.</span>
          </section>
        </div></div>
        <div className="kmx-foot">
          <button type="button" className="kmx-btn" disabled={!kgOk || qua || missing.length > 0} onClick={() => { setMsg(null); setStep(3) }}>Tiếp tục{I.next}</button>
        </div>
      </div>
    )
  }

  // ── màn 3: xác nhận ──
  if (step === 3 && lot) {
    const thumbs = ['toan_canh', 'man_hinh_can'].map((k) => photos.filter((p) => p.kind === k).slice(-1)[0]).filter(Boolean) as RawPhoto[]
    return (
      <div className="kmx">
        <Head eyebrow={`Lấy đầu ca · ${caTo}`} title="Xem lại rồi ghi" onBack={() => setStep(2)} />
        <Steps cur={3} />
        <div className="kmx-body"><div className="kmx-inner">
          {msg && <div className="kmx-msg err">{msg}</div>}
          <section className="kmx-card" aria-label="Tóm tắt phiếu" style={{ gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, padding: '6px 0 2px' }}><span className="kmx-num xxl">{fmtKg(kgN)}</span><span style={{ fontSize: 20, fontWeight: 700, color: '#6B7280' }}>kg</span></div>
            <div style={{ borderTop: '1px solid #F3F4F6' }}>
              <div className="kmx-kv"><span className="k">Lô chèn</span><span className="v"><span className="kmx-mono" style={{ color: '#0D2E25' }}>{lot.code}</span><br /><span className="kmx-sm" style={{ fontWeight: 500 }}>{MIX_SOURCE_LABELS[lot.source_type]}{lot.grade ? ` · ${lot.grade}` : ''}</span></span></div>
              <div className="kmx-kv"><span className="k">Ca · tổ</span><span className="v">{caTo}</span></div>
              <div className="kmx-kv"><span className="k">Dùng để</span><span className="v">{purpose === 'chay_lai' ? 'Chạy lại' : `Nâng ${targetIndex}${targetValue ? ' → ' + targetValue : ''}`}</span></div>
              <div className="kmx-kv" style={{ alignItems: 'center' }}><span className="k">Ảnh lúc lấy</span><span className="v" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{thumbs.map((p) => <span key={p.id} className="kmx-thumb" style={{ width: 46, height: 46 }}><img src={p.public_url || ''} alt="" /></span>)}<span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>{required.length - missing.length}/{required.length}</span></span></div>
            </div>
          </section>
          <section className="kmx-card" aria-label="Ghi chú" style={{ gap: 6 }}>
            <label htmlFor="kmx-note" className="kmx-strong" style={{ fontSize: 13 }}>Ghi chú <span style={{ fontWeight: 500, color: '#6B7280' }}>(không bắt buộc)</span></label>
            <input id="kmx-note" className="kmx-text" placeholder="Ví dụ: chèn vào mẻ SVR 10 máy 2" value={note} onChange={(e) => setNote(e.target.value)} />
          </section>
          <div className="kmx-note amb">{I.clock}<span><b>Cuối ca</b> vào <b>Trả cuối ca</b> ở trang chính, cân phần còn lại. Tiêu hao = {fmtKg(kgN)} − số trả. Kho chèn chỉ trừ khi thủ kho nhận.</span></div>
        </div></div>
        <div className="kmx-foot">
          <button type="button" className="kmx-btn" disabled={busy} onClick={ghi}>{I.check}{busy ? 'Đang ghi…' : `Ghi lấy đầu ca · ${fmtKg(kgN)} kg`}</button>
          <button type="button" className="kmx-btn ghost" disabled={busy} onClick={() => setStep(2)}>Sửa lại</button>
        </div>
      </div>
    )
  }

  return <div className="kmx"><Head eyebrow="Lấy đầu ca" title="Đang tải…" onBack={() => nav('/m/kho/chen')} /><div className="kmx-body"><div className="kmx-skel" /></div></div>
}
