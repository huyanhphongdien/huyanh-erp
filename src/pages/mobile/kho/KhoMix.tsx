// ============================================================================
// KhoMix — tab "Hàng chèn": tồn kho chèn, phiếu đang mở, lô còn hàng, nút Lấy đầu ca
// File: src/pages/mobile/kho/KhoMix.tsx · Route: /m/kho/chen
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { mixService, MIX_ISSUE_STATUS_LABELS, MIX_SOURCE_LABELS, type MixBalance, type MixIssue, type MixLot } from '../../../services/wms/mixService'
import { useRawRole } from '../../../hooks/useRawRole'
import { FacilitySelect, KhoAppBar, fmtD, fmtKg, useKhoFacility } from './khoCommon'

const CHIP: Record<MixIssue['status'], string> = { issued: 'lime', returned: 'amb', submitted: 'amb', qc_confirmed: 'amb', received: 'ok', cancelled: 'red' }

export default function KhoMix() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const lotHi = sp.get('lot')
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useRawRole(facilityId)
  const [bal, setBal] = useState<MixBalance | null>(null)
  const [open, setOpen] = useState<MixIssue[]>([])
  const [done, setDone] = useState<MixIssue[]>([])
  const [lots, setLots] = useState<MixLot[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setErr(null)
    try {
      const [b, o, d, l] = await Promise.all([
        mixService.balance(facilityId),
        mixService.listIssues({ facilityId, status: ['issued', 'returned', 'submitted', 'qc_confirmed'] }),
        mixService.listIssues({ facilityId, status: ['received'], limit: 10 }),
        mixService.listLots(facilityId),
      ])
      setBal(b); setOpen(o); setDone(d); setLots(l)
    } catch (e: any) { setErr(e?.message || 'Không tải được hàng chèn') }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const canTake = role.perms.submit || role.isKeeper || role.isBGD
  const lotsCoHang = lots.filter((l) => l.ton_kg > 0.005)

  const IssueCard = ({ i }: { i: MixIssue }) => (
    <div className="ops-card press" onClick={() => nav(`/m/kho/chen/phieu/${i.id}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/m/kho/chen/phieu/${i.id}`)}>
      <div className="ops-rw">
        <div className="ops-mono" style={{ fontWeight: 800 }}>{i.code}</div>
        <span className={`ops-chip ${CHIP[i.status]}`}>{MIX_ISSUE_STATUS_LABELS[i.status]}</span>
      </div>
      <div className="ops-rw" style={{ marginTop: 4 }}>
        <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{i.lot_code} · {MIX_SOURCE_LABELS[i.source_type]}</div><div className="ops-sm">{fmtD(i.shift_date)}{i.shift_name ? ` · ${i.shift_name}` : ''}{i.team ? ` · ${i.team}` : ''} · {i.out_name || ''}</div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="ops-mid ops-mono">{i.kg_used !== null ? `${fmtKg(i.kg_used)} kg` : `${fmtKg(i.kg_out)} kg`}<span className="ops-sm"> {i.kg_used !== null ? 'tiêu hao' : 'đã lấy'}</span></div>
          <div className="ops-sm">ảnh lấy {i.so_anh_lay}{i.kg_return !== null ? ` · trả ${i.so_anh_tra}` : ''}{i.thieu_anh && i.status !== 'issued' ? ' · THIẾU' : ''}</div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <KhoAppBar title="Hàng chèn" sub={<span>{facility?.code || ''} · tại kho {fmtKg(bal?.tai_kho_kg)} kg · dây chuyền {fmtKg(bal?.o_day_chuyen_kg)} kg</span>}
        right={<FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />} />
      <div className="ops-body">
        <div className="ops-inner">
          {err && <div className="ops-card" style={{ color: 'var(--red)', fontWeight: 700 }}>{err}</div>}
          <div className="ops-card tint">
            <div className="ops-rw">
              <div><div className="ops-lbl">Tại kho chèn</div><div className="ops-big">{fmtKg(bal?.tai_kho_kg)}<span className="ops-sm"> kg</span></div></div>
              <div style={{ textAlign: 'right' }}><div className="ops-lbl">Đang ở dây chuyền</div><div className="ops-mid ops-mono">{fmtKg(bal?.o_day_chuyen_kg)} kg</div><div className="ops-sm">{bal?.so_lo ?? 0} lô còn hàng</div></div>
            </div>
          </div>
          <button className="ops-btn l" disabled={!canTake || !lotsCoHang.length} onClick={() => nav(`/m/kho/chen/lay${lotHi ? `?lot=${lotHi}` : ''}`)}>➕ Lấy hàng chèn đầu ca</button>
          {!lotsCoHang.length && !loading && <div className="ops-sm" style={{ textAlign: 'center' }}>Kho chèn chưa có lô còn hàng — nhập lô trên ERP (Kho chèn).</div>}

          <div className="ops-sh">Phiếu đang mở · {open.length}</div>
          {loading && !open.length && <div className="ops-skel" />}
          {!loading && !open.length && <div className="ops-card ops-sm" style={{ textAlign: 'center' }}>Không có phiếu đang mở</div>}
          {open.map((i) => <IssueCard key={i.id} i={i} />)}

          <div className="ops-sh">Lô chèn còn hàng · {lotsCoHang.length}</div>
          {lotsCoHang.map((l) => (
            <div key={l.id} className="ops-card" style={{ boxShadow: l.id === lotHi ? '0 0 0 2px var(--lime), var(--el1)' : undefined }}>
              <div className="ops-rw">
                <div><div className="ops-mono" style={{ fontWeight: 800 }}>{l.code}</div><div className="ops-sm">{MIX_SOURCE_LABELS[l.source_type]}{l.grade ? ` · ${l.grade}` : ''}{l.source_desc ? ` · ${l.source_desc}` : ''}</div></div>
                <div style={{ textAlign: 'right' }}><div className="ops-mid ops-mono">{fmtKg(l.ton_kg)} <span className="ops-sm">kg</span></div>{l.source_type === 'dkl' && !l.metal_cleared && <span className="ops-chip red">chưa xử lý KL</span>}</div>
              </div>
            </div>
          ))}

          {done.length > 0 && <div className="ops-sh">Đã nhận gần đây</div>}
          {done.map((i) => <IssueCard key={i.id} i={i} />)}
        </div>
      </div>
    </>
  )
}
