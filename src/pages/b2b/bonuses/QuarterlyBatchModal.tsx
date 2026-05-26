// ============================================================================
// QUARTERLY BATCH MODAL — Tạo phiếu chi quý từ bonus đã approved
// File: src/pages/b2b/bonuses/QuarterlyBatchModal.tsx
// ============================================================================
//
// Quy chế: cuối quý gom 3 tháng bonus đã approved → 1 phiếu b2b_settlements
// cho mỗi partner. Modal này hiển thị preview rồi tạo bulk.

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, FileText, AlertTriangle, Check } from 'lucide-react'

import { supabase } from '../../../lib/supabase'
import { bonusSettlementService, type QuarterlyBonusBundle } from '../../../services/b2b/bonusSettlementService'

interface QuarterlyBatchModalProps {
  year: number
  quarter: 1 | 2 | 3 | 4
  onClose: () => void
  onCreated: () => void
}

interface PartnerLookup {
  id: string
  code: string | null
  name: string | null
}

export function QuarterlyBatchModal({ year, quarter, onClose, onCreated }: QuarterlyBatchModalProps) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<Array<{ partner: string; ok: boolean; msg: string }>>([])

  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ['bonus-quarterly-bundles', year, quarter],
    queryFn: () => bonusSettlementService.getApprovedBundlesForQuarter(year, quarter),
  })

  const partnerIds = Array.from(new Set(bundles.map((b) => b.partner_id)))
  const { data: partnerMap = {} } = useQuery({
    queryKey: ['quarterly-partners-lookup', partnerIds],
    queryFn: async (): Promise<Record<string, PartnerLookup>> => {
      if (partnerIds.length === 0) return {}
      const { data, error } = await supabase
        .from('b2b_partners')
        .select('id, code, name')
        .in('id', partnerIds)
      if (error) throw error
      const m: Record<string, PartnerLookup> = {}
      for (const p of (data ?? []) as PartnerLookup[]) m[p.id] = p
      return m
    },
    enabled: partnerIds.length > 0,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const out: Array<{ partner: string; ok: boolean; msg: string }> = []
      setProgress({ done: 0, total: bundles.length })
      for (let i = 0; i < bundles.length; i++) {
        const b = bundles[i]
        const partnerCode = partnerMap[b.partner_id]?.code ?? b.partner_id.slice(0, 8)
        try {
          const r = await bonusSettlementService.createQuarterlySettlement(b, partnerCode)
          out.push({ partner: partnerCode, ok: true, msg: `${r.settlement_code} — ${r.total_bonus_vnd.toLocaleString('vi-VN')}đ` })
        } catch (e: unknown) {
          out.push({ partner: partnerCode, ok: false, msg: (e as Error).message })
        }
        setProgress({ done: i + 1, total: bundles.length })
        setResults([...out])
      }
      return out
    },
  })

  const totalAmount = bundles.reduce((s, b) => s + b.total_bonus_vnd, 0)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-md max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-3 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold">Tạo phiếu chi quý Q{quarter}/{year}</h3>
            <p className="text-xs text-slate-500">
              Gom bonus đã <span className="font-medium">approved</span> → 1 phiếu chi/đại lý.
              Phiếu chi tạo ở status <code className="bg-slate-100 px-1 rounded">draft</code> để BGĐ duyệt.
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {isLoading && <div className="text-slate-500 text-sm">Đang tải bonus của quý…</div>}

          {!isLoading && bundles.length === 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-md p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-800">
                Không có bonus nào đã <strong>approved + chưa tạo phiếu chi</strong> trong Q{quarter}/{year}.
                Anh cần duyệt bonus ở list page trước.
              </div>
            </div>
          )}

          {!isLoading && bundles.length > 0 && (
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm">
                <div>
                  <strong>{bundles.length}</strong> đại lý — Tổng:{' '}
                  <strong>{totalAmount.toLocaleString('vi-VN')}đ</strong>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Sau khi tạo, kế toán sẽ thấy {bundles.length} phiếu mới ở module Settlement với prefix{' '}
                  <code className="bg-white px-1 rounded">BONUS-…</code>.
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Đại lý</th>
                      <th className="px-3 py-2 text-center">Tháng (loại mủ)</th>
                      <th className="px-3 py-2 text-right">Tổng</th>
                      <th className="px-3 py-2 text-center w-8">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundles.map((b) => (
                      <BundleRow
                        key={b.partner_id}
                        bundle={b}
                        partner={partnerMap[b.partner_id]}
                        result={results.find((r) => r.partner === partnerMap[b.partner_id]?.code)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {progress && (
                <div className="text-sm text-slate-600">
                  Tiến độ: {progress.done}/{progress.total}
                </div>
              )}

              {/* Banner lỗi — hiển thị ngay không cần hover */}
              {results.some((r) => !r.ok) && (
                <div className="border border-rose-300 bg-rose-50 rounded-md p-3 space-y-1 text-sm">
                  <div className="font-medium text-rose-800 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {results.filter((r) => !r.ok).length} phiếu chi tạo THẤT BẠI:
                  </div>
                  <ul className="text-xs text-rose-900 list-disc list-inside max-h-40 overflow-y-auto">
                    {results
                      .filter((r) => !r.ok)
                      .map((r, i) => (
                        <li key={i}>
                          <span className="font-mono">{r.partner}</span>: {r.msg}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm">
            Đóng
          </button>
          {bundles.length > 0 && !createMutation.isSuccess && (
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="px-3 py-1.5 bg-emerald-700 text-white rounded text-sm hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              {createMutation.isPending ? 'Đang tạo…' : `Tạo ${bundles.length} phiếu chi`}
            </button>
          )}
          {createMutation.isSuccess && (
            <button
              onClick={onCreated}
              className="px-3 py-1.5 bg-emerald-700 text-white rounded text-sm hover:bg-emerald-800 flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              Hoàn tất
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function BundleRow({
  bundle,
  partner,
  result,
}: {
  bundle: QuarterlyBonusBundle
  partner: PartnerLookup | undefined
  result: { ok: boolean; msg: string } | undefined
}) {
  return (
    <tr className="border-t">
      <td className="px-3 py-2">
        <div className="font-medium text-slate-900">{partner?.name ?? bundle.partner_id.slice(0, 8)}</div>
        <div className="text-xs text-slate-500 font-mono">{partner?.code}</div>
      </td>
      <td className="px-3 py-2 text-center text-xs">
        {bundle.bonuses.map((b) => (
          <div key={b.id}>
            T{b.month} ({b.rubber_type === 'tap' ? 'tạp' : 'nước'}): {Number(b.total_bonus_vnd).toLocaleString('vi-VN')}đ
          </div>
        ))}
      </td>
      <td className="px-3 py-2 text-right font-medium">
        {bundle.total_bonus_vnd.toLocaleString('vi-VN')}đ
      </td>
      <td className="px-3 py-2 text-center">
        {result?.ok && <Check className="w-4 h-4 text-emerald-600 inline" />}
        {result?.ok === false && (
          <span title={result.msg}>
            <AlertTriangle className="w-4 h-4 text-rose-600 inline" />
          </span>
        )}
      </td>
    </tr>
  )
}

export default QuarterlyBatchModal
