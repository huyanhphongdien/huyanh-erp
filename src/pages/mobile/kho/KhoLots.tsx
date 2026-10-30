// ============================================================================
// KhoLots — tab "Lô NVL": tồn theo lô của nhà máy, tìm nhanh, chip đến hạn cân lại
// File: src/pages/mobile/kho/KhoLots.tsx · Route: /m/kho
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { rawStockService, type RawBatchBalance } from '../../../services/wms/rawStockService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { FacilitySelect, KhoAppBar, fmtKg, inp, useKhoFacility } from './khoCommon'

export default function KhoLots() {
  const nav = useNavigate()
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useRawRole(facilityId)
  const [rows, setRows] = useState<RawBatchBalance[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'due' | 'old'>('all')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setErr(null)
    try {
      const [b, s] = await Promise.all([rawStockService.getBatches({ facilityId, limit: 500 }), rawSettingsService.getForFacility(facilityId)])
      setRows(b); setSettings(s)
    } catch (e: any) { setErr(e?.message || 'Không tải được lô') }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const due = (r: RawBatchBalance) => r.ngay_tu_lan_do >= settings.chu_ky_can_lai_ngay
  const old = (r: RawBatchBalance) => r.tuoi_ngay > settings.tuoi_lo_canh_bao_ngay
  const list = useMemo(() => {
    const s = q.trim().toUpperCase()
    return rows
      .filter((r) => !s || r.batch_no.toUpperCase().includes(s) || r.rubber_type_name.toUpperCase().includes(s) || (r.supplier_name || '').toUpperCase().includes(s))
      .filter((r) => (filter === 'due' ? due(r) : filter === 'old' ? old(r) : true))
      .sort((a, b) => b.tuoi_ngay - a.tuoi_ngay)
  }, [rows, q, filter, settings]) // eslint-disable-line react-hooks/exhaustive-deps

  const tongKho = rows.reduce((s, r) => s + r.dry_kg, 0)
  const tongUot = rows.reduce((s, r) => s + r.wet_kg, 0)
  const nDue = rows.filter(due).length
  const nOld = rows.filter(old).length

  return (
    <>
      <KhoAppBar title="Kho NVL mủ" sub={<span>{facility?.name || facility?.code || ''} · {role.isKeeper ? 'Thủ kho' : role.isQC ? 'QC' : role.isBGD ? 'BGĐ' : 'Xem'}</span>}
        right={<FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />} />
      <div className="ops-body">
        <div className="ops-inner">
          <div className="ops-card tint">
            <div className="ops-rw">
              <div><div className="ops-lbl">Tồn khô</div><div className="ops-big">{fmtKg(tongKho)}<span className="ops-sm"> kg</span></div></div>
              <div style={{ textAlign: 'right' }}><div className="ops-lbl">Ướt · lô</div><div className="ops-mid">{fmtKg(tongUot)} kg</div><div className="ops-sm">{rows.length} lô còn hàng</div></div>
            </div>
          </div>
          <input style={inp} placeholder="Tìm mã lô, loại mủ, nhà cung cấp…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm lô" />
          <div style={{ display: 'flex', gap: 6 }}>
            {([['all', `Tất cả ${rows.length}`], ['due', `Đến hạn cân lại ${nDue}`], ['old', `Quá tuổi ${nOld}`]] as const).map(([k, t]) => (
              <button key={k} className={`ops-chip ${filter === k ? 'lime' : 'mut'}`} style={{ border: 0, cursor: 'pointer', padding: '7px 11px', fontSize: 12 }} onClick={() => setFilter(k)}>{t}</button>
            ))}
          </div>
          {err && <div className="ops-card" style={{ color: 'var(--red)', fontWeight: 700 }}>{err}</div>}
          {loading && !rows.length && <><div className="ops-skel" /><div className="ops-skel" /><div className="ops-skel" /></>}
          {!loading && !list.length && <div className="ops-empty"><div className="em">📦</div><div className="et">Không có lô</div><div className="ed">{rows.length ? 'Đổi bộ lọc hoặc từ khóa' : 'Kho chưa có lô nào còn hàng'}</div></div>}
          {list.map((r) => (
            <div key={r.batch_id} className={`ops-card press${due(r) ? '' : ''}`} onClick={() => nav(`/m/kho/lo/${r.batch_id}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/m/kho/lo/${r.batch_id}`)}>
              <div className="ops-rw">
                <div className="ops-mono" style={{ fontWeight: 800, fontSize: 14.5 }}>{r.batch_no}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {r.ton_dau_uoc && <span className="ops-chip amb">tồn đầu ước</span>}
                  {due(r) && <span className="ops-chip red">cân lại · {r.ngay_tu_lan_do} ng</span>}
                  {old(r) && !due(r) && <span className="ops-chip amb">{r.tuoi_ngay} ngày</span>}
                </div>
              </div>
              <div className="ops-rw" style={{ marginTop: 4 }}>
                <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.rubber_type_name}</div><div className="ops-sm">{r.supplier_name || r.nguon_hang || ''}{r.received_date ? ` · nhập ${new Date(r.received_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}` : ''} · {r.tuoi_ngay} ng</div></div>
                <div style={{ textAlign: 'right' }}><div className="ops-mid ops-mono">{fmtKg(r.dry_kg)} <span className="ops-sm">kg khô</span></div><div className="ops-sm ops-mono">{fmtKg(r.wet_kg)} ướt · DRC {r.drc_pct ?? '—'} %</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
