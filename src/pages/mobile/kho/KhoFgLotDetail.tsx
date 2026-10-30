// ============================================================================
// KhoFgLotDetail — một lô thành phẩm: QC ghi kết quả (đạt / CXL / loại + Po, MV, lý do),
// lô lỗi → kho chèn, thủ kho xuất kho theo bành, hủy lô ghi nhầm. (GĐ7)
// File: src/pages/mobile/kho/KhoFgLotDetail.tsx · Route: /m/kho/tp/:id
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fgLotService, FG_QC_CHIP, FG_QC_LABELS, type FgLot } from '../../../services/wms/fgLotService'
import { useRawRole } from '../../../hooks/useRawRole'
import { fmtD, fmtDt, fmtKg } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const LY_DO = ['Po thấp', 'Po cao', 'MV thấp', 'MV cao', 'Tạp chất', 'Màu', 'Dính kim loại', 'Khác']

export default function KhoFgLotDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [l, setL] = useState<FgLot | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [qcOpen, setQcOpen] = useState(false)
  const [kq, setKq] = useState<'dat' | 'cxl' | 'loai'>('dat')
  const [po, setPo] = useState(['', '']); const [mv, setMv] = useState(['', ''])
  const [lyDo, setLyDo] = useState(''); const [qcNote, setQcNote] = useState('')
  const [chenBanh, setChenBanh] = useState(''); const [xuatBanh, setXuatBanh] = useState('')
  const role = useRawRole(l?.facility_id ?? null)

  const load = useCallback(async () => {
    if (!id) return
    try { const x = await fgLotService.get(id); if (!x) { setErr('Không tìm thấy lô'); return } setL(x); setChenBanh(String(x.ton_banh)); setXuatBanh(String(x.ton_banh)) }
    catch (e: any) { setErr(e?.message || 'Không tải được lô') }
  }, [id])
  useEffect(() => { load() }, [load])

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key); setMsg(null)
    try { await fn(); setMsg({ ok: true, text: ok }); await load() }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Thao tác thất bại' }) }
    finally { setBusy(null) }
  }
  const n = (s: string) => (s.trim() === '' ? null : Number.isFinite(Number(s)) ? Number(s) : null)

  if (err) return <div className="kmx"><header className="kmx-hd"><button type="button" className="kmx-back" aria-label="Quay lại" onClick={() => nav('/m/kho/tp')}>{I.back}</button><div className="kmx-hd-txt"><span className="kmx-title">Lô thành phẩm</span></div></header><div className="kmx-body"><div className="kmx-msg err">{err}</div></div></div>
  if (!l) return <div className="kmx"><header className="kmx-hd"><button type="button" className="kmx-back" aria-label="Quay lại" onClick={() => nav('/m/kho/tp')}>{I.back}</button><div className="kmx-hd-txt"><span className="kmx-title">Lô thành phẩm</span></div></header><div className="kmx-body"><div className="kmx-skel" /></div></div>

  const canQc = role.isQC || role.isBGD
  const canKho = role.isKeeper || role.isBGD
  const canChen = role.isKeeper || role.isQC || role.isBGD
  const loi = l.qc_status === 'cxl' || l.qc_status === 'loai' || ['LOI', 'DKL'].includes(l.material_code)
  const chipCls = FG_QC_CHIP[l.qc_status] === 'ok' ? 'ok' : FG_QC_CHIP[l.qc_status] === 'red' ? 'red' : FG_QC_CHIP[l.qc_status] === 'amb' ? 'amb' : 'mut'

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Về kho TP" onClick={() => nav('/m/kho/tp')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">Lô thành phẩm · {l.material_name}</span><span className="kmx-title kmx-mono">{l.so_lo}</span></div>
        <span className={`kmx-chip ${chipCls}`} style={{ flex: '0 0 auto' }}>{FG_QC_LABELS[l.qc_status]}</span>
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {msg && <div className={`kmx-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        <section className="kmx-card" style={{ gap: 10 }}>
          <div className="kmx-grid3">
            <div className="kmx-col kmx-center"><span className="kmx-lbl">Ép ra</span><span className="kmx-num md">{l.so_banh}</span><span className="kmx-sm">bành</span></div>
            <div className="kmx-col kmx-center"><span className="kmx-lbl">Đã xuất · chèn</span><span className="kmx-num md">{l.so_banh_da_xuat} · {l.so_banh_chen}</span><span className="kmx-sm">bành</span></div>
            <div className="kmx-col kmx-center kmx-stat ok"><span className="kmx-lbl ok">Còn</span><span className="kmx-num md ok">{l.ton_banh}</span><span className="kmx-sm">{fmtKg(l.ton_kg)} kg</span></div>
          </div>
          <div className="kmx-kv"><span className="k">Ca · tổ</span><span className="v">{fmtD(l.shift_date)}{l.shift_name ? ` · ${l.shift_name}` : ''}{l.team ? ` · Tổ ${l.team}` : ''}</span></div>
          <div className="kmx-kv"><span className="k">Mã nguyên liệu</span><span className="v kmx-mono">{l.ma_nvl || '—'}</span></div>
          <div className="kmx-kv"><span className="k">Cỡ bành</span><span className="v">{l.kg_per_banh} kg · {fmtKg(l.kg)} kg cả lô{l.co_chen ? ' · có chèn' : ''}{l.tu_so_lo ? ` · chạy lại từ ${l.tu_so_lo}` : ''}</span></div>
          <div className="kmx-kv"><span className="k">Ghi lúc</span><span className="v">{fmtDt(l.created_at)} · {l.created_name || ''}{l.report_status ? ` · phiếu ca ${l.report_status}` : ''}</span></div>
          {l.qc_at && <div className="kmx-kv"><span className="k">QC</span><span className="v">{FG_QC_LABELS[l.qc_status]}{l.qc_po_min !== null || l.qc_po_max !== null ? ` · Po ${l.qc_po_min ?? ''}–${l.qc_po_max ?? ''}` : ''}{l.qc_mv_min !== null || l.qc_mv_max !== null ? ` · MV ${l.qc_mv_min ?? ''}–${l.qc_mv_max ?? ''}` : ''}{l.qc_ly_do ? ` · ${l.qc_ly_do}` : ''}<br /><span className="kmx-sm">{fmtDt(l.qc_at)} · {l.qc_name || ''}</span></span></div>}
          {l.note && <span className="kmx-sm">Ghi chú: {l.note}</span>}
        </section>

        {/* ── QC ── */}
        <section className="kmx-card" style={{ gap: 10 }}>
          <div className="kmx-row"><h2 className="kmx-h2">Kết quả QC</h2>{!qcOpen && <button type="button" className="kmx-pill sm" disabled={!canQc} onClick={() => { setQcOpen(true); setKq(l.qc_status === 'chua_kiem' ? 'dat' : l.qc_status); setPo([l.qc_po_min?.toString() ?? '', l.qc_po_max?.toString() ?? '']); setMv([l.qc_mv_min?.toString() ?? '', l.qc_mv_max?.toString() ?? '']); setLyDo(l.qc_ly_do || ''); setQcNote(l.qc_note || '') }}>{l.qc_status === 'chua_kiem' ? 'Ghi kết quả' : 'Sửa'}</button>}</div>
          {!canQc && !role.loading && <span className="kmx-sm">Phòng QC (hoặc người được chỉ định) ghi kết quả.</span>}
          {qcOpen && (
            <>
              <div className="kmx-seg">
                <button type="button" className={kq === 'dat' ? 'on' : ''} onClick={() => setKq('dat')}>Đạt</button>
                <button type="button" className={kq === 'cxl' ? 'on' : ''} style={kq === 'cxl' ? { background: '#B45309', borderColor: '#B45309' } : undefined} onClick={() => setKq('cxl')}>Chờ xử lý</button>
                <button type="button" className={kq === 'loai' ? 'on' : ''} style={kq === 'loai' ? { background: '#B91C1C', borderColor: '#B91C1C' } : undefined} onClick={() => setKq('loai')}>Loại</button>
              </div>
              <div className="kmx-grid2">
                <div className="kmx-col" style={{ gap: 4 }}><span className="kmx-lbl">Po (min – max)</span><div style={{ display: 'flex', gap: 6 }}><input className="kmx-text" type="number" inputMode="decimal" step="0.5" placeholder="min" value={po[0]} onChange={(e) => setPo([e.target.value, po[1]])} aria-label="Po min" /><input className="kmx-text" type="number" inputMode="decimal" step="0.5" placeholder="max" value={po[1]} onChange={(e) => setPo([po[0], e.target.value])} aria-label="Po max" /></div></div>
                <div className="kmx-col" style={{ gap: 4 }}><span className="kmx-lbl">MV (min – max)</span><div style={{ display: 'flex', gap: 6 }}><input className="kmx-text" type="number" inputMode="decimal" step="0.1" placeholder="min" value={mv[0]} onChange={(e) => setMv([e.target.value, mv[1]])} aria-label="MV min" /><input className="kmx-text" type="number" inputMode="decimal" step="0.1" placeholder="max" value={mv[1]} onChange={(e) => setMv([mv[0], e.target.value])} aria-label="MV max" /></div></div>
              </div>
              {kq !== 'dat' && <div className="kmx-col" style={{ gap: 6 }}><span className="kmx-lbl">Lý do · bắt buộc</span><div className="kmx-seg">{LY_DO.map((v) => <button key={v} type="button" className={lyDo === v ? 'on' : ''} style={{ minWidth: 0, height: 40, fontSize: 13 }} onClick={() => setLyDo(v)}>{v}</button>)}</div></div>}
              <input className="kmx-text" placeholder="Ghi chú QC" value={qcNote} onChange={(e) => setQcNote(e.target.value)} aria-label="Ghi chú QC" />
              <div className="kmx-grid2">
                <button type="button" className="kmx-btn md" disabled={busy === 'qc' || (kq !== 'dat' && !lyDo)} onClick={() => run('qc', () => fgLotService.qc(l.id, kq, { poMin: n(po[0]), poMax: n(po[1]), mvMin: n(mv[0]), mvMax: n(mv[1]), lyDo: lyDo || null, note: qcNote.trim() || null }).then(() => setQcOpen(false)), kq === 'dat' ? `✅ ${l.so_lo}: đạt` : `${l.so_lo}: ${FG_QC_LABELS[kq]} — đã ghi vào sổ hàng không đạt`)}>{I.check}Lưu kết quả</button>
                <button type="button" className="kmx-btn sec" onClick={() => setQcOpen(false)}>Thôi</button>
              </div>
            </>
          )}
        </section>

        {/* ── Lô lỗi → kho chèn ── */}
        {loi && l.ton_banh > 0 && (
          <section className="kmx-card" style={{ gap: 8, borderColor: '#FECACA' }}>
            <h2 className="kmx-h2">Chuyển sang kho chèn</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><input className="kmx-input" style={{ height: 52, fontSize: 24 }} type="number" inputMode="numeric" value={chenBanh} onChange={(e) => setChenBanh(e.target.value)} aria-label="Số bành chuyển chèn" /><span style={{ fontSize: 16, fontWeight: 700, color: '#6B7280' }}>/ {l.ton_banh} bành</span></div>
            <button type="button" className="kmx-btn md" disabled={!canChen || busy === 'chen' || !(Number(chenBanh) > 0)} onClick={() => run('chen', () => fgLotService.chuyenChen(l.id, Number(chenBanh), null, l.material_code === 'DKL' ? false : null), `✅ ${chenBanh} bành (${fmtKg(Number(chenBanh) * l.kg_per_banh)} kg) đã vào kho chèn, giữ dây truy ngược lô ${l.so_lo}`)}>{I.next}Chuyển {chenBanh || 0} bành vào kho chèn</button>
          </section>
        )}

        {/* ── Xuất kho TP ── */}
        {!loi && l.ton_banh > 0 && (
          <section className="kmx-card" style={{ gap: 8 }}>
            <h2 className="kmx-h2">Xuất kho thành phẩm</h2>
            {l.qc_status === 'chua_kiem' && <div className="kmx-note amb" style={{ padding: '8px 10px' }}>{I.info}<span>Lô chưa có kết quả QC. Xuất được nhưng nên kiểm trước.</span></div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><input className="kmx-input" style={{ height: 52, fontSize: 24 }} type="number" inputMode="numeric" value={xuatBanh} onChange={(e) => setXuatBanh(e.target.value)} aria-label="Số bành xuất" /><span style={{ fontSize: 16, fontWeight: 700, color: '#6B7280' }}>/ {l.ton_banh} bành</span></div>
            <button type="button" className="kmx-btn md" disabled={!canKho || busy === 'xuat' || !(Number(xuatBanh) > 0)} onClick={() => run('xuat', () => fgLotService.xuat(l.id, Number(xuatBanh)), `✅ Xuất ${xuatBanh} bành lô ${l.so_lo}`)}>{I.intake}Xuất {xuatBanh || 0} bành</button>
            {!canKho && !role.loading && <span className="kmx-sm">Thủ kho mới được xuất.</span>}
          </section>
        )}

        {l.so_banh_da_xuat === 0 && l.so_banh_chen === 0 && l.status !== 'huy' && (role.perms.submit || role.isBGD) && (
          <button type="button" className="kmx-btn ghost" style={{ color: '#B91C1C' }} disabled={busy === 'huy'} onClick={() => { if (window.confirm(`Hủy lô ${l.so_lo} (ghi nhầm)?`)) run('huy', () => fgLotService.huy(l.id, 'Ghi nhầm'), 'Đã hủy lô, phiếu ca đã trừ lại') }}>Ghi nhầm? Hủy lô</button>
        )}
      </div></div>
    </div>
  )
}
