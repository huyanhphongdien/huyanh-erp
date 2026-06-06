// ============================================================================
// PHIẾU CHỐT GIÁ — bản in (form giấy BM CL.BMQT.KH.01.01) — nhiều đại lý / phiếu
// Route: /b2b/price-lock/:id/print
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import logoImg from '../../../assets/logo.png'
import {
  priceLockService,
  PURCHASE_METHOD_LABELS,
  FEE_FLAG_LABELS,
  type PriceLockTicket,
  type PurchaseMethod,
} from '../../../services/b2b/priceLockService'

const fmt = (n: number | null | undefined) => (n != null && n !== 0 ? n.toLocaleString('vi-VN') : '')
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('vi-VN') : '…')

export default function PriceLockPrintPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [t, setT] = useState<PriceLockTicket | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    priceLockService.getById(id).then((r) => { setT(r); setLoading(false) }).catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" /></div>
  if (!t) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-gray-400">
      <p>Không tìm thấy phiếu</p>
      <button onClick={() => navigate('/b2b/price-lock')} className="mt-4 text-blue-600 text-sm">Quay lại</button>
    </div>
  )

  return (
    <div>
      <div className="no-print sticky top-0 z-10 bg-emerald-800 text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(`/b2b/price-lock/${id}`)} className="p-2 hover:bg-emerald-700 rounded"><ArrowLeft size={18} /></button>
        <div className="flex-1 text-sm font-medium">{t.code || 'Phiếu chốt giá'}</div>
        <button onClick={() => window.print()} className="bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded font-medium text-sm flex items-center gap-2"><Printer size={16} /> In phiếu</button>
      </div>

      <div className="no-print bg-gray-200 min-h-[calc(100vh-56px)] py-6 px-4 flex justify-center">
        <div className="bg-white shadow-md" style={{ width: '210mm', minHeight: '297mm', padding: '12mm' }}><Sheet t={t} /></div>
      </div>
      <div className="print-only"><Sheet t={t} /></div>

      <style>{`
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  )
}

function Chk({ on, label }: { on: boolean; label: string }) {
  return <span style={{ whiteSpace: 'nowrap', marginRight: 14 }}>{on ? '☑' : '☐'} {label}</span>
}

function Sheet({ t }: { t: PriceLockTicket }) {
  const feesTon = (t.fees || []).filter((f) => f.basis === 'ton')
  const feesLot = (t.fees || []).filter((f) => f.basis === 'lot')
  const sumTon = feesTon.reduce((s, f) => s + (f.amount || 0), 0)
  const sumLot = feesLot.reduce((s, f) => s + (f.amount || 0), 0)
  const ccyMark = (c: string) => t.currency === c
  const dealers = t.dealer_lines || []

  return (
    <div style={{ fontFamily: "'Times New Roman', serif", fontSize: 12.5, color: '#000' }}>
      {/* Company header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 10px', border: bd }}>
        <img src={logoImg} alt="Huy Anh" style={{ height: 48, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
        <div style={{ lineHeight: 1.4, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>CÔNG TY TNHH MỘT THÀNH VIÊN CAO SU HUY ANH PHONG ĐIỀN</div>
          <div style={{ fontSize: 11.5, color: '#222' }}>MST: 3301549896 · Khe Mạ, Phường Phong Điền, TP Huế · ĐT: 0963.504.688</div>
        </div>
      </div>

      {/* Title + form code band */}
      <div style={{ display: 'flex', border: bd, borderTop: 'none', minHeight: 56 }}>
        <div style={{ ...cell, flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, letterSpacing: 1, borderRight: bd }}>
          PHIẾU CHỐT GIÁ
        </div>
        <div style={{ ...cell, width: 200, fontSize: 11, lineHeight: 1.7 }}>
          <div>BM: CL.BMQT.KH.01.01</div>
          <div>Ngày ban hành: 29/04/2025</div>
          <div>Số phiếu: <strong>{t.code || '…'}</strong></div>
        </div>
      </div>

      {/* Thông tin chung */}
      <div style={{ border: bd, borderTop: 'none', padding: '5px 6px', lineHeight: 1.9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span>Địa điểm cân hàng : <strong>{t.facility_label || '…'}</strong></span>
          <span>Ngày chốt : <strong>{fmtDate(t.lock_date)}</strong></span>
        </div>
        <div style={{ marginTop: 2 }}>
          <strong>Hình thức mua:</strong>{' '}
          {(Object.entries(PURCHASE_METHOD_LABELS) as [PurchaseMethod, string][]).map(([k, v]) => (
            <Chk key={k} on={t.purchase_method === k} label={v} />
          ))}
        </div>
        <div>
          <strong>Loại tiền:</strong>{' '}
          <Chk on={ccyMark('VND')} label="VNĐ" /><Chk on={ccyMark('KIP')} label="KIP" />
          <Chk on={ccyMark('THB')} label="THB" /><Chk on={ccyMark('OTHER')} label={`Khác: ${t.currency_other || ''}`} />
          {(t.rate_thb_kip || t.rate_kip_vnd || t.rate_thb_vnd) ? (
            <span style={{ fontSize: 11, marginLeft: 8 }}>
              (Tỷ giá: THB/KIP {fmt(t.rate_thb_kip) || '…'} · KIP/VNĐ {fmt(t.rate_kip_vnd) || '…'} · THB/VNĐ {fmt(t.rate_thb_vnd) || '…'})
            </span>
          ) : null}
        </div>
      </div>

      {/* Bảng đại lý + giá áp */}
      <div style={{ ...secHead, border: bd, borderTop: 'none' }}>DANH SÁCH ĐẠI LÝ & GIÁ ÁP</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: bd, borderTop: 'none' }}>
        <thead>
          <tr>
            <th style={{ ...feeTh, width: 28 }}>STT</th>
            <th style={{ ...feeTh, borderLeft: bd, textAlign: 'left' }}>Đại lý</th>
            <th style={{ ...feeTh, borderLeft: bd, width: 110 }}>KL dự kiến (kg)</th>
            <th style={{ ...feeTh, borderLeft: bd, width: 90 }}>DRC dự kiến</th>
            <th style={{ ...feeTh, borderLeft: bd, width: 120 }}>Giá áp (đ/kg)</th>
            <th style={{ ...feeTh, borderLeft: bd, textAlign: 'left', width: 140 }}>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {dealers.length === 0 && (
            <tr>
              <td style={{ ...feeTd, textAlign: 'center', color: '#888', fontStyle: 'italic', padding: '12px 6px' }} colSpan={6}>
                (Chưa nhập đại lý)
              </td>
            </tr>
          )}
          {dealers.map((d, i) => (
            <tr key={i}>
              <td style={{ ...feeTd, textAlign: 'center' }}>{i + 1}</td>
              <td style={{ ...feeTd, borderLeft: bd, fontWeight: 600 }}>{d.dealer_name || '—'}</td>
              <td style={{ ...feeTd, borderLeft: bd, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(d.expected_weight_kg)}</td>
              <td style={{ ...feeTd, borderLeft: bd, textAlign: 'center' }}>{d.expected_drc_percent != null ? `${d.expected_drc_percent}%` : ''}</td>
              <td style={{ ...feeTd, borderLeft: bd, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(d.price_per_ton)}</td>
              <td style={{ ...feeTd, borderLeft: bd }}>{d.note || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Bảng giá tham chiếu */}
      <div style={{ border: bd, borderTop: 'none', padding: '5px 6px', display: 'flex', gap: 24 }}>
        <span style={{ fontWeight: 700 }}>GIÁ CAO SU THAM CHIẾU (đ/kg):</span>
        <span>Sàn: <strong>{fmt(t.price_floor_per_ton) || '…'}</strong></span>
        <span>Trung: <strong>{fmt(t.price_mid_per_ton) || '…'}</strong></span>
        <span>Cao: <strong>{fmt(t.price_high_per_ton) || '…'}</strong></span>
      </div>

      {/* CÁC PHÍ PHẢI CHI — checkbox tick nếu fee_flags hoặc có dòng fee với label đó */}
      <div style={{ border: bd, borderTop: 'none' }}>
        <div style={secHead}>CÁC PHÍ PHẢI CHI</div>
        <div style={{ padding: '5px 6px' }}>
          {Object.entries(FEE_FLAG_LABELS).map(([k, label]) => {
            const isApplied = !!(t.fee_flags || {})[k] || (t.fees || []).some((f) => f.label === label)
            return <Chk key={k} on={isApplied} label={label} />
          })}
        </div>
      </div>

      {/* CHI PHÍ THEO TẤN | THEO LÔ */}
      <div style={{ display: 'flex', border: bd, borderTop: 'none' }}>
        <FeeTable title="CHI PHÍ THEO TẤN" rows={feesTon} sum={sumTon} rightBorder />
        <FeeTable title="CHI PHÍ THEO LÔ" rows={feesLot} sum={sumLot} />
      </div>

      {/* THỜI GIAN */}
      <div style={{ border: bd, borderTop: 'none', padding: '5px 6px' }}>
        <strong>Thời gian cân:</strong> từ <strong>{fmtDate(t.weigh_from)}</strong> đến <strong>{fmtDate(t.weigh_to)}</strong>
      </div>

      {t.note && (
        <div style={{ border: bd, borderTop: 'none', padding: '5px 6px', fontStyle: 'italic' }}>Ghi chú: {t.note}</div>
      )}

      {/* Signatures */}
      <div style={{ display: 'flex', textAlign: 'center', border: bd, borderTop: 'none' }}>
        <div style={{ ...cell, flex: 1, borderRight: bd }}><div style={{ fontWeight: 700 }}>Ban giám đốc</div><div style={{ height: 56 }} /></div>
        <div style={{ ...cell, flex: 1, borderRight: bd }}><div style={{ fontWeight: 700 }}>Trưởng Phòng Thu Mua</div><div style={{ height: 56 }} /></div>
        <div style={{ ...cell, flex: 1 }}><div style={{ fontWeight: 700 }}>Người chốt giá</div><div style={{ height: 36 }} /><div>{t.signer_locker || ''}</div></div>
      </div>
    </div>
  )
}

function FeeTable({ title, rows, sum, rightBorder }: { title: string; rows: { label: string; amount: number }[]; sum: number; rightBorder?: boolean }) {
  return (
    <div style={{ flex: 1, borderRight: rightBorder ? bd : 'none' }}>
      <div style={secHead}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...feeTh }}>LOẠI CHI PHÍ</th>
            <th style={{ ...feeTh, width: 110, borderLeft: bd }}>GIÁ</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td style={feeTd}>&nbsp;</td><td style={{ ...feeTd, borderLeft: bd }}></td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={feeTd}>{r.label}</td>
              <td style={{ ...feeTd, borderLeft: bd, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.amount)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={{ ...feeTd, textAlign: 'right' }}>Tổng</td>
            <td style={{ ...feeTd, borderLeft: bd, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(sum)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const bd = '1px solid #000'
const cell: React.CSSProperties = { padding: '4px 6px' }
const secHead: React.CSSProperties = { background: '#E5E7EB', fontWeight: 700, padding: '3px 6px', borderBottom: bd, fontSize: 12 }
const feeTh: React.CSSProperties = { borderBottom: bd, padding: '3px 6px', fontSize: 11, fontWeight: 700, textAlign: 'center' }
const feeTd: React.CSSProperties = { borderBottom: '1px solid #999', padding: '3px 6px', fontSize: 11.5 }
