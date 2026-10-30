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
import { mixService, MIX_SOURCE_LABELS, MIX_VI_TRI_LABELS, type MixIssue, type MixLot, type MixPurpose, type MixSourceType, type MixViTri } from '../../../services/wms/mixService'
import { fgLotService, type FgLot } from '../../../services/wms/fgLotService'
import { rawPhotoService, type RawPhoto } from '../../../services/wms/rawPhotoService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { rawLotService, type LenhChay, type RawLotBalance } from '../../../services/wms/rawLotService'
import { shiftBookService } from '../../../services/wms/shiftBookService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import type { OpsShiftOption } from '../../../services/opsService'
import { firstName } from '../opsUtil'
import { fmtKg, parseKhoScan, todayLocal, useKhoFacility } from './khoCommon'
import { detectShift, hhmm, I, KmxPhotoTiles, newUuid, Steps, type ShiftPick } from './khoMixUtil'
import './khoMix.css'

const DEFAULT_TEAMS = ['Vang', 'Hiền']   // tổ gọi theo tổ trưởng: Ca Vang, Ca Hiền
const INDEXES = ['Po', 'PRI', 'Mooney', 'Tạp chất', 'Khác']

export default function KhoMixOut() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { facilityId, facility } = useKhoFacility()
  const user = useAuthStore((s) => s.user)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [lots, setLots] = useState<MixLot[]>([])
  const [caIssues, setCaIssues] = useState<MixIssue[]>([])   // các lần đã chèn hôm nay → số lần kế tiếp
  const [lot, setLot] = useState<MixLot | null>(null)
  const [kg, setKg] = useState('')
  const [soLo, setSoLo] = useState('')   // lô cũ chưa có số lô: tổ gõ, máy ghi vào lô
  // cân theo sổ tay tổ ép: số bành · hàng + pallet · bì pallet → hàng chèn = cân − bì
  const [mode, setMode] = useState<'pallet' | 'kg'>(() => { try { return localStorage.getItem('kmx_can_mode') === 'kg' ? 'kg' : 'pallet' } catch { return 'pallet' } })
  const [soBanh, setSoBanh] = useState('')
  // chèn vào đâu: bể slap hay máy mix (nhớ lần trước)
  const [viTri, setViTri] = useState<MixViTri | null>(() => { try { const v = localStorage.getItem('kmx_vi_tri'); return v === 'be_slap' || v === 'may_mix' ? v : null } catch { return null } })
  const [gross, setGross] = useState('')
  // mã nguyên liệu gốc đang chạy mà ca này chèn vào (một hay nhiều)
  const [maList, setMaList] = useState<RawLotBalance[]>([])
  const [maChon, setMaChon] = useState<string[]>([])
  const [maNguon, setMaNguon] = useState<'phieu_ca' | 'lenh' | 'dang_chay' | 'tay' | null>(null)
  const [lenhs, setLenhs] = useState<LenhChay[]>([])   // lệnh đang chạy (SQL p13): một lệnh = 1..n mã gộp; nhiều lệnh → tổ chạm chọn lệnh
  const [shift, setShift] = useState<ShiftPick | null>(null)
  const [shifts, setShifts] = useState<OpsShiftOption[]>([])
  const [pickShift, setPickShift] = useState(false)
  const teams = DEFAULT_TEAMS
  const [team, setTeam] = useState('')
  const [purpose, setPurpose] = useState<MixPurpose>('chay_lai')
  const [targetIndex, setTargetIndex] = useState('Po')
  const [targetValue, setTargetValue] = useState('')
  const [note, setNote] = useState('')
  const [issueId, setIssueId] = useState(() => newUuid())
  const [photos, setPhotos] = useState<RawPhoto[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [scan, setScan] = useState(false)
  // phương án B (30/10, SQL p15): chọn NGUỒN + số lô trên bao (hoặc chạm lô TP) → máy tự tìm / tạo lô chèn; kho chèn không còn là cửa ải
  const [nguon, setNguon] = useState<MixSourceType | null>(() => { try { const v = localStorage.getItem('kmx_nguon'); return v === 'std' || v === 'loi' || v === 'dkl' || v === 'mua_ngoai' || v === 'khac' ? v : null } catch { return null } })
  const [fgLots, setFgLots] = useState<FgLot[]>([])
  const [lotsAll, setLotsAll] = useState<MixLot[]>([])   // kể cả lô đã hết: số lô dùng lại được
  const [soLoMoi, setSoLoMoi] = useState('')
  const [raKimLoai, setRaKimLoai] = useState(false)
  const [taoBusy, setTaoBusy] = useState(false)
  const [khoCu, setKhoCu] = useState(false)   // mở phần quét tem / chọn lô đã nhập trước
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [codeDone, setCodeDone] = useState<string>('')
  const [doneAt, setDoneAt] = useState<string>('')

  useEffect(() => {
    if (!facilityId) return
    let alive = true
    Promise.all([mixService.listLots(facilityId), rawSettingsService.getForFacility(facilityId), detectShift(user?.employee_id || null), rawLotService.maDangChay(facilityId).catch(() => [] as RawLotBalance[]), mixService.listIssues({ facilityId, date: todayLocal(), limit: 100 }).catch(() => [] as MixIssue[])])
      .then(([l, s, d, m, ci]) => {
        if (!alive) return
        const ok = l.filter((x) => x.ton_kg > 0.005)
        setLots(ok); setSettings(s); setShifts(d.shifts); setShift(d.pick); setMaList(m); setCaIssues(ci.filter((x) => x.status !== 'cancelled'))
        const pre = sp.get('lot'); const hit = pre ? ok.find((x) => x.id === pre) : null
        if (hit && !(hit.source_type === 'dkl' && !hit.metal_cleared)) { setLot(hit); setStep(2) }
      })
      .catch((e) => alive && setMsg(e?.message || 'Không tải được kho chèn'))
    return () => { alive = false }
  }, [facilityId]) // eslint-disable-line react-hooks/exhaustive-deps
  const taiNguon = useCallback(() => {
    if (!facilityId) return
    fgLotService.list(facilityId, { onlyTon: true }).then(setFgLots).catch(() => setFgLots([]))
    mixService.listLots(facilityId, true).then((l) => setLotsAll(l.filter((x) => x.status !== 'cancelled'))).catch(() => setLotsAll([]))
  }, [facilityId])
  useEffect(() => { taiNguon() }, [taiNguon])

  useEffect(() => { if (!facilityId) return; rawLotService.lenhDangChay(facilityId).then(setLenhs).catch(() => setLenhs([])) }, [facilityId])
  // mã gốc tự nhận: phiếu ca của ca này → một lệnh đang chạy → mã đang chạy duy nhất → tổ chạm chọn
  useEffect(() => {
    if (!facilityId || maNguon === 'tay') return
    let alive = true
    const fallback = () => {
      if (!alive) return
      if (lenhs.length === 1) { setMaChon(lenhs[0].raw_lot_ids); setMaNguon('lenh'); return }   // đúng một lệnh → mã của lệnh (gộp)
      const dc = maList.filter((x) => x.trang_thai === 'dang_chay')
      if (dc.length === 1) { setMaChon([dc[0].raw_lot_id]); setMaNguon('dang_chay') } else if (maNguon !== null) { setMaChon([]); setMaNguon(null) }
    }
    if (!shift?.id) { fallback(); return () => { alive = false } }
    shiftBookService.findReport(facilityId, todayLocal(), shift.id)
      .then((r) => {
        if (!alive) return
        const id = r?.rawLotId
        if (!id) { fallback(); return }
        setMaChon([id]); setMaNguon('phieu_ca')
        if (!maList.some((x) => x.raw_lot_id === id)) rawLotService.get(id).then((x) => { if (x && alive) setMaList((cur) => (cur.some((y) => y.raw_lot_id === id) ? cur : [x, ...cur])) }).catch(() => { /* bỏ qua */ })
      })
      .catch(fallback)
    return () => { alive = false }
  }, [facilityId, shift?.id, maList, lenhs]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadPhotos = useCallback(async () => { try { setPhotos(await rawPhotoService.list('mix_issue_out', issueId)) } catch { /* bỏ qua */ } }, [issueId])

  const required = settings.anh_bat_buoc?.length ? settings.anh_bat_buoc : ['toan_canh', 'man_hinh_can']
  const missing = rawPhotoService.missing(photos, required)
  const grossN = gross === '' ? null : Number(gross)
  // lúc lấy chỉ cân tổng (hàng + pallet); bì KHÔNG hỏi ở đây, khai lúc trả → kg lấy tạm = cân tổng
  const kgN = mode === 'pallet' ? (grossN !== null && Number.isFinite(grossN) ? grossN : null) : kg === '' ? null : Number(kg)
  const kgTxt = (n: number | null) => (n === null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }))
  // số bành tự tính theo cỡ bành của lô (35 kg); tổ chỉ chỉnh ± khi đếm khác
  const soBanhAuto = kgN !== null && kgN > 0 && lot ? Math.max(Math.round(Math.max(kgN - (mode === 'pallet' ? 15 : 0), 0) / (lot.kg_per_banh || 35)), 1) : null   // cân tổng: ước bớt ~15 kg pallet
  const soBanhN = soBanh === '' ? soBanhAuto : Math.round(Number(soBanh))
  const chinhBanh = (d: number) => setSoBanh(String(Math.max((soBanhN ?? 0) + d, 0)))
  const maLabel = maChon.map((id) => maList.find((x) => x.raw_lot_id === id)?.ma || '?').join(' + ')
  const doiMode = (m: 'pallet' | 'kg') => { setMode(m); try { localStorage.setItem('kmx_can_mode', m) } catch { /* bỏ qua */ } }
  const doiViTri = (v: MixViTri) => { setViTri(v); try { localStorage.setItem('kmx_vi_tri', v) } catch { /* bỏ qua */ } }
  const toggleMa = (id: string) => { setMaNguon('tay'); setMaChon((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])) }
  const kgOk = kgN !== null && Number.isFinite(kgN) && kgN > 0
  // phương án B: chỉ chặn vượt tồn với hàng lấy từ lô TP (tồn thật); SBR / số lô gõ tay lấy quá tồn → máy ghi nhập thêm, chỉ báo
  const fgCua = lot?.source_ref_type === 'fg_lot' ? fgLots.find((g) => g.id === lot.source_ref_id) ?? null : null
  const fgConKg = fgCua ? Math.max(fgCua.ton_banh, 0) * (fgCua.kg_per_banh || 35) : 0
  const qua = !!lot && kgN !== null && lot.source_ref_type === 'fg_lot' && kgN > lot.ton_kg + fgConKg + 0.01
  const nhapThem = lot && kgN !== null && kgN > lot.ton_kg + 0.01 ? Math.round((kgN - Math.max(lot.ton_kg, 0)) * 100) / 100 : 0
  const conLai = lot && kgN !== null ? Math.max(lot.ton_kg - kgN, 0) : null
  const teamFinal = team.trim()

  const chonLo = (l: MixLot) => { setLot(l); setSoLo(''); setMsg(null); setStep(2) }
  const chonNguon = (n: MixSourceType) => { setNguon(n); setSoLoMoi(''); setRaKimLoai(false); setMsg(null); try { localStorage.setItem('kmx_nguon', n) } catch { /* bỏ qua */ } }
  const fgTheoNguon = fgLots.filter((g) => nguon === 'dkl' ? g.material_code === 'DKL' : nguon === 'loi' ? g.material_code !== 'DKL' && (g.material_code === 'LOI' || g.qc_status !== 'dat') : nguon === 'std' ? g.qc_status === 'dat' && g.material_code !== 'LOI' && g.material_code !== 'DKL' : false)
  const soLoGoiY = (() => { const seen = new Set<string>(); const out: MixLot[] = []; for (const l of [...lotsAll].sort((a, b) => (b.received_date ?? '').localeCompare(a.received_date ?? ''))) { if (l.source_type !== nguon || !l.so_lo || seen.has(l.so_lo)) continue; seen.add(l.so_lo); out.push(l); if (out.length >= 6) break } return out })()
  async function dungLo(opts: { fgLotId?: string; soLo?: string }) {
    if (!facilityId || !nguon) return
    if (nguon === 'dkl' && !raKimLoai) { setMsg('Hàng DKL: tick "Đã rà kim loại" trước khi lấy'); return }
    setTaoBusy(true); setMsg(null)
    try {
      const id = await mixService.timHoacTaoLo({ facilityId, sourceType: nguon, soLo: opts.soLo ?? null, fgLotId: opts.fgLotId ?? null, metalCleared: nguon === 'dkl' ? raKimLoai : null })
      const l = await mixService.getLot(id)
      if (!l) throw new Error('Không tải được lô chèn vừa tạo')
      setLot(l); setSoLo(''); setStep(2)
    } catch (e: any) { setMsg(e?.message || 'Không tạo được lô chèn (cần SQL p15)') }
    finally { setTaoBusy(false) }
  }
  const soLoOk = !lot || !!lot.so_lo || soLo.trim().length > 0

  async function onScan(raw: string) {
    setScan(false)
    const p = parseKhoScan(raw)
    if (!p) return
    try {
      // tem CH-… hoặc số lô in trên bao (so_lo)
      const bySoLo = p.kind !== 'mix_lot' ? lots.find((x) => (x.so_lo || '').toUpperCase() === p.value.toUpperCase()) : undefined
      const l = p.kind === 'mix_lot' ? await mixService.findLotByCode(p.value) : bySoLo ?? null
      if (!l) { setMsg(`Không tìm thấy lô chèn có tem hoặc số lô "${p.value}"`); return }
      const inList = lots.find((x) => x.id === l.id)
      if (!inList) { setMsg(`${l.code} không còn hàng hoặc thuộc nhà máy khác`); return }
      if (inList.source_type === 'dkl' && !inList.metal_cleared) { setMsg(`${l.code} dính kim loại, chưa xử lý, chưa lấy được`); return }
      chonLo(inList)
    } catch (e: any) { setMsg(e?.message || 'Không đọc được mã') }
  }

  async function ghi() {
    if (!lot || !kgOk || qua || !soLoOk) return
    setBusy(true); setMsg(null)
    try {
      await mixService.lay({ id: issueId, lotId: lot.id, kg: kgN!, shiftDate: todayLocal(), shiftId: shift?.id ?? null, team: teamFinal || null, purpose, targetIndex: purpose === 'nang_chi_so' ? targetIndex : null, targetValue: purpose === 'nang_chi_so' && targetValue !== '' ? Number(targetValue) : null, note: note.trim() || null, soLo: lot.so_lo ? null : soLo.trim().toUpperCase(), viTri, rawLotIds: maChon, soBanh: soBanh === '' ? null : soBanhN, grossKg: mode === 'pallet' ? grossN : null, palletKg: null })
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
    setStep(1); setLot(null); setKg(''); setGross(''); setSoBanh(''); setNote('');
    if (facilityId) mixService.listIssues({ facilityId, date: todayLocal(), limit: 100 }).then((ci) => setCaIssues(ci.filter((x) => x.status !== 'cancelled'))).catch(() => { /* bỏ qua */ })
    setPurpose('chay_lai'); setTargetValue(''); setPhotos([]); setIssueId(newUuid()); setCodeDone(''); setMsg(null)
    setSoLoMoi(''); setRaKimLoai(false); setKhoCu(false); taiNguon()
    if (facilityId) mixService.listLots(facilityId).then((l) => setLots(l.filter((x) => x.ton_kg > 0.005))).catch(() => { /* bỏ qua */ })
  }

  const Head = ({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack: () => void }) => (
    <header className="kmx-hd">
      <button type="button" className="kmx-back" aria-label="Quay lại" onClick={onBack}>{I.back}</button>
      <div className="kmx-hd-txt"><span className="kmx-eyebrow">{eyebrow}</span><span className="kmx-title">{title}</span></div>
    </header>
  )
  const caTo = `${shift?.name || 'Ca ?'}${teamFinal ? ` · Ca ${teamFinal}` : ''}`
  // các lần đã chèn của ca này (theo ca tự nhận) → lần kế tiếp = n + 1
  const prevLan = caIssues.filter((x) => (shift ? x.shift_id === shift.id : true)).sort((a, b) => a.out_at.localeCompare(b.out_at))
  const lan = prevLan.length + 1

  // ── màn 4: đã ghi ──
  if (step === 4) {
    return (
      <div className="kmx">
        <div className="kmx-done">
          <span className="kmx-check"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h1>Đã ghi lần {lan}</h1>
            <span className="kmx-mono" style={{ fontSize: 20, fontWeight: 700, color: '#E8A838' }}>{codeDone}</span>
          </div>
          <div className="kmx-done-card">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="kmx-num xl">{kgTxt(kgN)}</span><span style={{ fontSize: 15, fontWeight: 600 }}>kg · {doneAt ? new Date(doneAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>
            <span>Lô <span className="kmx-mono" style={{ fontWeight: 600, color: '#fff' }}>{lot?.so_lo || soLo.trim().toUpperCase() || lot?.code}</span> · {lot ? MIX_SOURCE_LABELS[lot.source_type].toLowerCase() : ''}{lot?.source_desc ? ` · ${lot.source_desc}` : ''}</span>
            <span>{viTri ? `Chèn ${MIX_VI_TRI_LABELS[viTri]}` : ''}{soBanhN !== null ? ` · ${soBanhN} bành` : ''}</span>
            {maChon.length > 0 && <span>{maChon.length ? <>Chèn vào mã <b className="kmx-mono" style={{ color: '#fff' }}>{maLabel}</b></> : 'Mã gốc theo phiếu ca'}</span>}
            <span>{caTo} · {purpose === 'chay_lai' ? 'chạy lại' : `nâng ${targetIndex}${targetValue ? ' → ' + targetValue : ''}`} · {photos.length} ảnh · {firstName(user?.full_name) || ''}</span>
          </div>
          <div className="kmx-note gold" style={{ width: '100%', boxSizing: 'border-box', textAlign: 'left' }}>{I.clock}<span><b>Việc tiếp theo, cuối ca:</b> mở trang chính, bấm <b>Trả cuối ca</b>, dùng hết thì cân pallet rỗng (bì chính xác), còn dư thì cân hàng + pallet, chụp 2 ảnh.</span></div>
        </div>
        <div className="kmx-done-foot">
          <button type="button" className="kmx-btn white" onClick={() => nav('/m/kho/chen')}>Về trang chính</button>
          <button type="button" className="kmx-btn outline-w" onClick={layThem}>{I.plus}Lấy lần {lan + 1}</button>
        </div>
      </div>
    )
  }

  // ── màn 1: chọn lô ──
  if (step === 1) {
    const NGUON: { k: MixSourceType; t: string; s: string }[] = [
      { k: 'std', t: 'Hàng chuẩn', s: 'Hàng chuẩn lấy từ kho TP (lô đạt) để nâng chỉ số.' },
      { k: 'loi', t: 'Hàng lỗi', s: 'Lô TP bị QC đánh CXL / loại, hoặc hàng lỗi ghi số lô trên bao.' },
      { k: 'dkl', t: 'DKL', s: 'Hàng dính kim loại: phải rà kim loại trước khi chèn.' },
      { k: 'mua_ngoai', t: 'SBR / mua ngoài', s: 'SBR 1502, hàng mua ngoài: gõ số lô trên bao (ví dụ 1502).' },
    ]
    const tuKhoTp = nguon === 'std' || nguon === 'loi' || nguon === 'dkl'
    return (
      <div className="kmx">
        <Head eyebrow={`Lấy lần ${lan} · ${caTo}`} title="Nguồn và số lô" onBack={boDo} />
        <Steps cur={1} />
        <div className="kmx-body"><div className="kmx-inner">
          {msg && <div className="kmx-msg err">{msg}</div>}
          {prevLan.length > 0 && (
            <div className="kmx-card muted" style={{ gap: 3 }}>
              <span className="kmx-lbl">Ca này đã chèn {prevLan.length} lần · đang lấy lần {lan}</span>
              {prevLan.map((p, k) => <span key={p.id} className="kmx-sm kmx-mono" style={{ color: '#1F2937' }}>L{k + 1} · {p.so_banh !== null ? `${p.so_banh} b ` : ''}{p.lot_so_lo || p.lot_code} · {kgTxt(p.kg_out)} kg{p.gross_kg !== null ? ` (cả pallet ${kgTxt(p.gross_kg)} − bì ${kgTxt(p.pallet_kg ?? 0)})` : ''}{p.status === 'issued' ? ' · đang ở dây chuyền' : ''}</span>)}
            </div>
          )}
          <section className="kmx-card" aria-label="Nguồn hàng chèn" style={{ gap: 8 }}>
            <span className="kmx-strong" style={{ fontSize: 13 }}>Pallet này là hàng gì?</span>
            <div className="kmx-seg">{NGUON.map((n) => <button key={n.k} type="button" className={nguon === n.k ? 'on' : ''} onClick={() => chonNguon(n.k)}>{n.t}</button>)}</div>
            <span className="kmx-sm">{NGUON.find((n) => n.k === nguon)?.s ?? 'Chạm nguồn, rồi chạm lô TP hoặc gõ số lô trên bao. Máy tự ghi vào kho chèn, không cần nhập lô trước.'}</span>
            {nguon === 'dkl' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: raKimLoai ? '#15803D' : '#B91C1C' }}>
                <input type="checkbox" checked={raKimLoai} onChange={(e) => setRaKimLoai(e.target.checked)} style={{ width: 20, height: 20 }} /> Đã rà kim loại pallet này (bắt buộc với DKL)
              </label>
            )}
          </section>
          {nguon && tuKhoTp && (
            <section className="kmx-card" aria-label="Lô thành phẩm" style={{ gap: 6 }}>
              <span className="kmx-lbl">Chạm lô TP còn tồn{fgTheoNguon.length ? ` · ${fgTheoNguon.length} lô` : ''}</span>
              {fgTheoNguon.length ? fgTheoNguon.slice(0, 12).map((g) => (
                <button key={g.id} type="button" className="kmx-card press" style={{ font: 'inherit', textAlign: 'left', width: '100%', padding: '8px 10px', boxShadow: 'none', border: '1px solid #E5E7EB' }} disabled={taoBusy} onClick={() => dungLo({ fgLotId: g.id })}>
                  <span className="kmx-row"><span className="kmx-col" style={{ gap: 0 }}><span className="kmx-mono" style={{ fontSize: 16, fontWeight: 800, color: '#0D2E25' }}>{g.so_lo}</span><span className="kmx-sm">{g.material_name} · {g.shift_date.slice(8, 10)}/{g.shift_date.slice(5, 7)}{g.team ? ` · Ca ${g.team}` : ''}{g.qc_status !== 'dat' ? ` · QC ${g.qc_status}` : ''}</span></span><span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className="kmx-num sm">{g.ton_banh} b</span><span className="kmx-sm">{fmtKg(g.ton_kg)} kg</span></span></span>
                </button>
              )) : <span className="kmx-sm">Không có lô TP {nguon === 'std' ? 'đạt' : nguon === 'dkl' ? 'DKL' : 'lỗi'} còn tồn. Gõ số lô trên bao bên dưới.</span>}
            </section>
          )}
          {nguon && (
            <section className="kmx-card" aria-label="Số lô" style={{ gap: 8 }}>
              <span className="kmx-lbl">{tuKhoTp ? 'Hoặc gõ số lô trên bao' : 'Số lô trên bao'}</span>
              {soLoGoiY.length > 0 && <div className="kmx-seg">{soLoGoiY.map((l) => <button key={l.id} type="button" className={soLoMoi.trim().toUpperCase() === l.so_lo ? 'on' : ''} onClick={() => setSoLoMoi(l.so_lo || '')}>{l.so_lo}{l.ton_kg > 0.005 ? ` · tồn ${fmtKg(l.ton_kg)}` : ''}</button>)}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="kmx-text kmx-mono" style={{ flex: 1, fontWeight: 700, fontSize: 17, textTransform: 'uppercase' }} placeholder="1502, S2308AB…" value={soLoMoi} onChange={(e) => setSoLoMoi(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && soLoMoi.trim()) dungLo({ soLo: soLoMoi }) }} aria-label="Số lô trên bao" />
                <button type="button" className="kmx-pill" disabled={!soLoMoi.trim() || taoBusy} onClick={() => dungLo({ soLo: soLoMoi })}>{taoBusy ? '…' : 'Dùng'}</button>
              </div>
              <span className="kmx-sm">Số lô đã có trong kho chèn thì lấy tiếp từ lô đó; chưa có thì máy tạo lô mới, nhập = lấy.</span>
            </section>
          )}
          <button type="button" className="kmx-link" style={{ alignSelf: 'center', background: 'none', border: 0, font: 'inherit', cursor: 'pointer' }} onClick={() => setKhoCu((v) => !v)}>{khoCu ? 'Ẩn lô nhập trước' : 'Quét tem CH / chọn lô đã nhập trước'}</button>
          {khoCu && (<>
          <button type="button" className="kmx-btn" style={{ minHeight: 64, background: '#E8F5F0', color: '#0D2E25', border: '2px dashed #2D8B6E', fontSize: 16 }} onClick={() => setScan(true)}>{I.qr}Quét tem trên lô</button>
          <div className="kmx-divider">hoặc chạm lô đã nhập trước</div>
          {!lots.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Kho chèn chưa có lô nhập trước nào.</div>}
          {lots.map((l) => {
            const khoa = l.source_type === 'dkl' && !l.metal_cleared
            const chip = l.source_type === 'loi' ? 'amb' : l.source_type === 'dkl' ? 'red' : l.source_type === 'std' ? 'blue' : 'mut'
            const body = (
              <>
                <span className="kmx-row"><span className="kmx-col" style={{ gap: 0 }}><span className="kmx-mono" style={{ fontSize: 16, fontWeight: 800, color: khoa ? '#6B7280' : l.so_lo ? '#0D2E25' : '#B91C1C' }}>{l.so_lo || 'Chưa có số lô'}</span><span className="kmx-sm kmx-mono">{l.code}</span></span><span className={`kmx-chip ${chip}`}>{MIX_SOURCE_LABELS[l.source_type].replace(/ \(.*\)/, '')}</span></span>
                <span className="kmx-row" style={{ alignItems: 'flex-end' }}>
                  <span className="kmx-col">
                    <span style={{ fontSize: 14, fontWeight: 600, color: khoa ? '#6B7280' : '#1F2937' }}>{l.source_desc || MIX_SOURCE_LABELS[l.source_type]}{l.grade ? ` · ${l.grade}` : ''}</span>
                    <span className="kmx-sm" style={khoa ? { color: '#B91C1C', fontWeight: 600 } : undefined}>{khoa ? 'Chưa xử lý kim loại, chưa lấy được. Báo thủ kho.' : `${l.po !== null ? `Po ${l.po}` : ''}${l.mooney !== null ? ` · Mooney ${l.mooney}` : ''}${l.pri !== null ? ` · PRI ${l.pri}` : ''}${l.qc_allow_mix_pct !== null ? ` · QC: trộn ≤ ${l.qc_allow_mix_pct} %` : ''}${l.qc_allow_rerun ? ', chạy lại được' : ' · KHÔNG chạy lại'}`}</span>
                  </span>
                  <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className={`kmx-num lg${khoa ? ' mut' : ''}`}>{fmtKg(l.ton_kg)}</span><span className="kmx-sm" style={{ fontWeight: 600 }}>kg · {l.ton_banh} bành</span></span>
                </span>
                {!khoa && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, fontSize: 13, fontWeight: 700, color: '#1B4D3E' }}>Chọn lô này{I.next}</span>}
              </>
            )
            return khoa
              ? <div key={l.id} className="kmx-card muted">{body}</div>
              : <button key={l.id} type="button" className="kmx-card press" style={{ font: 'inherit', textAlign: 'left', width: '100%' }} onClick={() => chonLo(l)}>{body}</button>
          })}
          </>)}
        </div></div>
        {scan && <OpsQrScanner onClose={() => setScan(false)} onDetect={onScan} />}
      </div>
    )
  }

  // ── màn 2: cân & chụp ──
  if (step === 2 && lot) {
    return (
      <div className="kmx">
        <Head eyebrow={`Lấy lần ${lan} · lô ${lot.so_lo || lot.code}`} title="Cân và chụp" onBack={() => setStep(1)} />
        <Steps cur={2} />
        <div className="kmx-body"><div className="kmx-inner">
          {msg && <div className="kmx-msg err">{msg}</div>}
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
              <span className="kmx-lbl">Tổ trưởng · ca của ai</span>
              <div className="kmx-seg">
                {teams.map((t) => <button key={t} type="button" className={team === t ? 'on' : ''} onClick={() => setTeam(t)}>Ca {t}</button>)}
              </div>
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

          {!lot.so_lo && (
            <section className="kmx-card" aria-label="Số lô" style={{ gap: 8, borderColor: soLo.trim() ? '#E5E7EB' : '#FECACA' }}>
              <label htmlFor="kmx-solo" className="kmx-strong" style={{ fontSize: 13 }}>Lô {lot.code} chưa có số lô <span style={{ fontWeight: 500, color: '#B45309' }}>· gõ số lô trên bao</span></label>
              <input id="kmx-solo" className="kmx-text kmx-mono" style={{ textTransform: 'uppercase', fontWeight: 700, fontSize: 17 }} placeholder="vd S2308AB" value={soLo} onChange={(e) => setSoLo(e.target.value)} autoCapitalize="characters" />
              <span className="kmx-sm">Máy ghi số lô này vào lô chèn, lần sau không phải gõ nữa.</span>
            </section>
          )}
          <section className="kmx-card" aria-label="Chèn vào đâu" style={{ gap: 8 }}>
            <span className="kmx-strong" style={{ fontSize: 13 }}>Chèn vào đâu? <span style={{ fontWeight: 500, color: viTri ? '#6B7280' : '#B45309' }}>{viTri ? '' : '· bắt buộc'}</span></span>
            <div className="kmx-seg">
              <button type="button" className={viTri === 'be_slap' ? 'on' : ''} onClick={() => doiViTri('be_slap')}>Chèn bể Slap</button>
              <button type="button" className={viTri === 'may_mix' ? 'on' : ''} onClick={() => doiViTri('may_mix')}>Chèn máy Mix</button>
            </div>
          </section>

          <section className="kmx-card" aria-label="Số đọc trên cân" style={{ gap: 10 }}>
            <div className="kmx-row">
              <span className="kmx-strong" style={{ fontSize: 13 }}>{mode === 'pallet' ? 'Cân cả pallet (bì khai lúc trả)' : 'Đọc đúng số trên màn hình cân'}</span>
              <button type="button" className="kmx-pill sm" onClick={() => doiMode(mode === 'pallet' ? 'kg' : 'pallet')}>{mode === 'pallet' ? 'Gõ thẳng kg' : 'Cân cả pallet'}</button>
            </div>
            {mode === 'pallet' ? (
              <>
                <label htmlFor="kmx-kg" className="kmx-lbl">Cân cả pallet · số trên cân (không trừ bì)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input id="kmx-kg" className={`kmx-input${qua || (kgN !== null && kgN <= 0) ? ' red' : ''}`} type="number" inputMode="decimal" placeholder="0" value={gross} onChange={(e) => { setGross(e.target.value); setSoBanh('') }} autoFocus />
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span>
                </div>
                <div className="kmx-tint" style={kgN !== null && kgN <= 0 ? { background: '#FEE2E2', color: '#B91C1C' } : { background: '#E8F5F0', color: '#0D2E25' }}><span>Cả pallet · bì sẽ trừ lúc trả</span><span className="kmx-num sm" style={kgN !== null && kgN <= 0 ? { color: '#B91C1C' } : undefined}>{kgN === null ? '—' : `${kgTxt(kgN)} kg`}</span></div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input id="kmx-kg" className={`kmx-input${qua ? ' red' : ''}`} type="number" inputMode="decimal" placeholder="0" value={kg} onChange={(e) => { setKg(e.target.value); setSoBanh('') }} autoFocus />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span>
              </div>
            )}
            <div className="kmx-tint" style={qua ? { background: '#FEE2E2', color: '#B91C1C' } : undefined}><span>{qua ? `Lấy nhiều hơn tồn lô TP (${fgCua ? fgCua.ton_banh : 0} bành)` : nhapThem > 0 ? `Lô tồn ${kgTxt(lot.ton_kg)} kg → máy ghi nhập thêm ${kgTxt(nhapThem)} kg${fgCua ? ' từ lô TP' : ''}` : 'Lô còn lại sau khi lấy'}</span><span className="kmx-num sm" style={qua ? { color: '#B91C1C' } : undefined}>{conLai === null ? `${fmtKg(lot.ton_kg)} kg trong kho` : `${fmtKg(Math.max(conLai, 0))} kg`}</span></div>
            <div className="kmx-row" style={{ alignItems: 'center' }}>
              <span className="kmx-col"><span className="kmx-lbl">Số bành</span><span className="kmx-sm">ước {lot.kg_per_banh} kg/bành, máy tính lại lúc trả{soBanh !== '' ? ' · bạn đã chỉnh, giữ nguyên' : ''}</span></span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="kmx-pill sm" style={{ width: 44, padding: 0, fontSize: 20 }} aria-label="Bớt 1 bành" disabled={soBanhN === null || soBanhN <= 0} onClick={() => chinhBanh(-1)}>−</button>
                <span className="kmx-num md" style={{ minWidth: 40, textAlign: 'center' }}>{soBanhN ?? '—'}</span>
                <button type="button" className="kmx-pill sm" style={{ width: 44, padding: 0, fontSize: 20 }} aria-label="Thêm 1 bành" disabled={soBanhN === null} onClick={() => chinhBanh(1)}>+</button>
              </div>
            </div>
          </section>

          <section className="kmx-card" aria-label="Chèn vào mã nguyên liệu" style={{ gap: 8 }}>
            <div className="kmx-row">
              <span className="kmx-strong" style={{ fontSize: 13 }}>Chèn vào lệnh / mã nguyên liệu nào?</span>
              {maNguon === 'phieu_ca' && <span className="kmx-chip ok">theo phiếu ca</span>}
              {maNguon === 'dang_chay' && <span className="kmx-chip ok">mã đang chạy</span>}
              {maNguon === 'lenh' && <span className="kmx-chip ok">theo lệnh</span>}
              {maNguon === 'tay' && maChon.length > 0 && <span className="kmx-chip blue">bạn chọn</span>}
            </div>
            {lenhs.length > 0 && (
              <div className="kmx-seg">
                {lenhs.map((g) => { const on = g.raw_lot_ids.length === maChon.length && g.raw_lot_ids.every((x) => maChon.includes(x)); return <button key={g.id} type="button" className={on ? 'on' : ''} onClick={() => { setMaChon(g.raw_lot_ids); setMaNguon('lenh') }}>{g.ma_gop}</button> })}
              </div>
            )}
            {lenhs.length > 1 && maNguon !== 'lenh' && <span className="kmx-sm" style={{ color: '#B45309', fontWeight: 600 }}>Đang chạy {lenhs.length} lệnh song song — chạm lệnh pallet này chèn vào.</span>}
            {lenhs.length > 0 && maList.length > 0 && <span className="kmx-sm">Hoặc chọn mã lẻ (không theo lệnh):</span>}
            {maList.length ? (
              <div className="kmx-seg">
                {maList.map((m) => <button key={m.raw_lot_id} type="button" className={maChon.includes(m.raw_lot_id) ? 'on' : ''} onClick={() => toggleMa(m.raw_lot_id)}>{m.ma}{m.trang_thai === 'dang_chay' ? ' · đang chạy' : ''}</button>)}
              </div>
            ) : <span className="kmx-sm">Kho NVL chưa có mã nào đang chạy hay sẵn sàng. Không bắt buộc: khi thủ kho nhận, máy lấy mã theo phiếu ca.</span>}
            <span className="kmx-sm">{maChon.length > 1 ? `Chèn chung ${maChon.length} mã (${maLabel}): khi gom, kg chia đều cho mỗi mã.` : maChon.length === 1 ? `Ca này chèn vào ${maLabel}. Chạm thêm mã nữa nếu ca chạy chung hai mã (ví dụ KHMN-15 + 17).` : 'Chạm mã đang chạy. Chọn được nhiều mã nếu ca chạy chung.'}</span>
          </section>

          <section className="kmx-card" aria-label="Chụp ảnh">
            <div className="kmx-row"><span className="kmx-strong" style={{ fontSize: 13 }}>Chụp 2 ảnh ngay tại cân</span><span className={`kmx-chip ${missing.length ? 'red' : 'ok'}`}>{required.length - missing.length}/{required.length} đã chụp</span></div>
            <KmxPhotoTiles refType="mix_issue_out" refId={issueId} photos={photos} required={required} facilityCode={facility?.code} onChange={loadPhotos} onError={setMsg} />
            <span className="kmx-sm">Ảnh tự gắn giờ, vị trí và người chụp. Thiếu ảnh 1 hoặc 2 thì chưa qua bước sau được.</span>
          </section>
        </div></div>
        <div className="kmx-foot">
          <button type="button" className="kmx-btn" disabled={!kgOk || qua || missing.length > 0 || !viTri || !soLoOk} onClick={() => { setMsg(null); setStep(3) }}>{!soLoOk ? 'Gõ số lô của lô chèn' : viTri ? 'Tiếp tục' : 'Chọn chèn bể Slap hay máy Mix'}{I.next}</button>
        </div>
      </div>
    )
  }

  // ── màn 3: xác nhận ──
  if (step === 3 && lot) {
    const thumbs = ['toan_canh', 'man_hinh_can'].map((k) => photos.filter((p) => p.kind === k).slice(-1)[0]).filter(Boolean) as RawPhoto[]
    return (
      <div className="kmx">
        <Head eyebrow={`Lấy lần ${lan} · ${caTo}`} title="Xem lại rồi ghi" onBack={() => setStep(2)} />
        <Steps cur={3} />
        <div className="kmx-body"><div className="kmx-inner">
          {msg && <div className="kmx-msg err">{msg}</div>}
          <section className="kmx-card" aria-label="Tóm tắt phiếu" style={{ gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, padding: '6px 0 2px' }}><span className="kmx-num xxl">{kgTxt(kgN)}</span><span style={{ fontSize: 20, fontWeight: 700, color: '#6B7280' }}>kg</span></div>
            <div style={{ borderTop: '1px solid #F3F4F6' }}>
              <div className="kmx-kv"><span className="k">Lô chèn</span><span className="v"><span className="kmx-mono" style={{ color: '#0D2E25', fontWeight: 700 }}>{lot.so_lo || soLo.trim().toUpperCase()}</span> <span className="kmx-sm kmx-mono">{lot.code}</span><br /><span className="kmx-sm" style={{ fontWeight: 500 }}>{MIX_SOURCE_LABELS[lot.source_type]}{lot.grade ? ` · ${lot.grade}` : ''}</span></span></div>
              <div className="kmx-kv"><span className="k">Chèn vào</span><span className="v">{viTri ? MIX_VI_TRI_LABELS[viTri] : '—'}</span></div>
              <div className="kmx-kv"><span className="k">Cân</span><span className="v">{mode === 'pallet' ? `${soBanhN !== null ? `${soBanhN} bành${soBanh === '' ? ' (ước)' : ''} · ` : ''}cả pallet ${kgTxt(grossN)} kg · bì trừ lúc trả` : 'gõ thẳng kg hàng'}</span></div>
              <div className="kmx-kv"><span className="k">Chèn vào mã</span><span className="v">{maChon.length ? <span className="kmx-mono" style={{ color: '#0D2E25' }}>{maLabel}</span> : <span style={{ color: '#B45309' }}>chưa chọn · lấy theo phiếu ca</span>}</span></div>
              <div className="kmx-kv"><span className="k">Ca · tổ</span><span className="v">{caTo}</span></div>
              <div className="kmx-kv"><span className="k">Dùng để</span><span className="v">{purpose === 'chay_lai' ? 'Chạy lại' : `Nâng ${targetIndex}${targetValue ? ' → ' + targetValue : ''}`}</span></div>
              <div className="kmx-kv" style={{ alignItems: 'center' }}><span className="k">Ảnh lúc lấy</span><span className="v" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{thumbs.map((p) => <span key={p.id} className="kmx-thumb" style={{ width: 46, height: 46 }}><img src={p.public_url || ''} alt="" /></span>)}<span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>{required.length - missing.length}/{required.length}</span></span></div>
            </div>
          </section>
          <section className="kmx-card" aria-label="Ghi chú" style={{ gap: 6 }}>
            <label htmlFor="kmx-note" className="kmx-strong" style={{ fontSize: 13 }}>Ghi chú <span style={{ fontWeight: 500, color: '#6B7280' }}>(không bắt buộc)</span></label>
            <input id="kmx-note" className="kmx-text" placeholder="Ví dụ: chèn vào mẻ SVR 10 máy 2" value={note} onChange={(e) => setNote(e.target.value)} />
          </section>
          <div className="kmx-note amb">{I.clock}<span><b>Cuối ca</b> vào <b>Trả cuối ca</b> ở trang chính, cân phần còn lại. Tiêu hao = {kgTxt(kgN)} − số trả. Kho chèn chỉ trừ khi thủ kho nhận.</span></div>
        </div></div>
        <div className="kmx-foot">
          <button type="button" className="kmx-btn" disabled={busy} onClick={ghi}>{I.check}{busy ? 'Đang ghi…' : `Ghi lần ${lan} · ${kgTxt(kgN)} kg`}</button>
          <button type="button" className="kmx-btn ghost" disabled={busy} onClick={() => setStep(2)}>Sửa lại</button>
        </div>
      </div>
    )
  }

  return <div className="kmx"><Head eyebrow="Lấy đầu ca" title="Đang tải…" onBack={() => nav('/m/kho/chen')} /><div className="kmx-body"><div className="kmx-skel" /></div></div>
}
