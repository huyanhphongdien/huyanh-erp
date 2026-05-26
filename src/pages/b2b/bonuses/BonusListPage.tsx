// ============================================================================
// BONUS LIST PAGE — Admin quản lý bonus đại lý B2B
// File: src/pages/b2b/bonuses/BonusListPage.tsx
// ============================================================================

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RefreshCw,
  Send,
  CheckCircle2,
  XCircle,
  FileText,
  Filter,
  Settings as SettingsIcon,
  Calculator,
} from 'lucide-react'

import { supabase } from '../../../lib/supabase'
import { monthlyBonusService, type ListMonthlyBonusParams } from '../../../services/b2b/monthlyBonusService'
import type { MonthlyBonus, MonthlyBonusStatus, RubberType } from '../../../types/b2b.types'
import { BonusTierBadge } from '../../../components/b2b/BonusTierBadge'
import { Hac13CodeDisplay } from '../../../components/master-data/Hac13CodeDisplay'
import { QuarterlyBatchModal } from './QuarterlyBatchModal'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_QUARTER = Math.ceil((new Date().getMonth() + 1) / 3) as 1 | 2 | 3 | 4

const STATUS_LABELS: Record<MonthlyBonusStatus, string> = {
  draft: 'Nháp',
  pending_approval: 'Chờ duyệt',
  approved: 'Đã duyệt',
  paid: 'Đã chi',
  cancelled: 'Đã huỷ',
}

const STATUS_COLORS: Record<MonthlyBonusStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
}

interface PartnerLite {
  id: string
  code: string | null
  name: string | null
}

export function BonusListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [year, setYear] = useState<number>(CURRENT_YEAR)
  const [quarter, setQuarter] = useState<'all' | 1 | 2 | 3 | 4>(CURRENT_QUARTER)
  const [rubberType, setRubberType] = useState<'all' | RubberType>('all')
  const [status, setStatus] = useState<'all' | MonthlyBonusStatus>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showBatchModal, setShowBatchModal] = useState(false)

  // ─── Dashboard summary (1-row) ──────────────────────────────────────────
  const { data: dashboard } = useQuery({
    queryKey: ['b2b-bonus-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_b2b_bonus_admin_dashboard')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data
    },
    staleTime: 60_000,
  })

  // ─── Pending actions card ───────────────────────────────────────────────
  const { data: pendingActions } = useQuery({
    queryKey: ['b2b-bonus-pending-actions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_b2b_bonus_pending_actions').select('*')
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  // ─── List bonuses với filter ────────────────────────────────────────────
  const params: ListMonthlyBonusParams = useMemo(
    () => ({
      year,
      quarter: quarter === 'all' ? undefined : quarter,
      rubber_type: rubberType === 'all' ? undefined : rubberType,
      status: status === 'all' ? undefined : status,
      pageSize: 200,
    }),
    [year, quarter, rubberType, status],
  )

  const { data: listResult, isLoading, refetch } = useQuery({
    queryKey: ['b2b-bonus-list', params],
    queryFn: () => monthlyBonusService.list(params),
    staleTime: 30_000,
  })

  // ─── Partners lookup (cho tên + HAC-13) ─────────────────────────────────
  const partnerIds = useMemo(
    () => Array.from(new Set((listResult?.data ?? []).map((b) => b.partner_id))),
    [listResult],
  )

  const { data: partnerMap = {} } = useQuery({
    queryKey: ['b2b-bonus-partners-lookup', partnerIds],
    queryFn: async (): Promise<Record<string, PartnerLite>> => {
      if (partnerIds.length === 0) return {}
      const { data, error } = await supabase
        .from('b2b_partners')
        .select('id, code, name')
        .in('id', partnerIds)
      if (error) throw error
      const m: Record<string, PartnerLite> = {}
      for (const p of (data ?? []) as PartnerLite[]) m[p.id] = p
      return m
    },
    enabled: partnerIds.length > 0,
  })

  // ─── Mutations ──────────────────────────────────────────────────────────
  const recomputeMutation = useMutation({
    mutationFn: () => monthlyBonusService.recomputeQuarter(year, quarter === 'all' ? CURRENT_QUARTER : quarter),
    onSuccess: (r) => {
      alert(`Đã tính lại ${r.row_count} dòng bonus cho Q${quarter === 'all' ? CURRENT_QUARTER : quarter}/${year}.`)
      qc.invalidateQueries({ queryKey: ['b2b-bonus-list'] })
      qc.invalidateQueries({ queryKey: ['b2b-bonus-dashboard'] })
    },
    onError: (e: Error) => alert(`Lỗi: ${e.message}`),
  })

  const submitMutation = useMutation({
    mutationFn: (ids: string[]) => monthlyBonusService.submitForApproval(ids),
    onSuccess: (count) => {
      alert(`Đã submit ${count} bonus → chờ duyệt.`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['b2b-bonus-list'] })
    },
    onError: (e: Error) => alert(`Lỗi: ${e.message}`),
  })

  const approveMutation = useMutation({
    mutationFn: (ids: string[]) => monthlyBonusService.approve(ids),
    onSuccess: (count) => {
      alert(`Đã duyệt ${count} bonus.`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['b2b-bonus-list'] })
      qc.invalidateQueries({ queryKey: ['b2b-bonus-pending-actions'] })
    },
    onError: (e: Error) => alert(`Lỗi: ${e.message}`),
  })

  // ─── Selection helpers ──────────────────────────────────────────────────
  const rows = listResult?.data ?? []
  const allSelectedIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows])
  const isAllSelected = rows.length > 0 && selected.size === rows.length
  const toggleAll = () => {
    if (isAllSelected) setSelected(new Set())
    else setSelected(allSelectedIds)
  }
  const toggleOne = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  // Selected bonus theo bulk action constraint
  const selectedDraftIds = useMemo(
    () => rows.filter((r) => selected.has(r.id) && r.status === 'draft').map((r) => r.id),
    [rows, selected],
  )
  const selectedPendingIds = useMemo(
    () => rows.filter((r) => selected.has(r.id) && r.status === 'pending_approval').map((r) => r.id),
    [rows, selected],
  )

  // ─── Totals ─────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const t = { volume: 0, bonus: 0 }
    for (const r of rows) {
      if (r.status === 'cancelled') continue
      t.volume += Number(r.volume_tons || 0)
      t.bonus += Number(r.total_bonus_vnd || 0)
    }
    return t
  }, [rows])

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Thưởng đại lý B2B</h1>
          <p className="text-sm text-slate-500">
            Quy chế thưởng SL mủ tạp (T1/2026+) và mủ nước (T6/2026+). Chốt cuối quý, chi trước 15 tháng đầu quý kế.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/b2b/intake-manual')}
            className="px-3 py-2 border rounded-md text-sm hover:bg-slate-50 flex items-center gap-1"
            title="Nhập tay phiếu cân (single + CSV bulk import)"
          >
            <FileText className="w-4 h-4" />
            Nhập phiếu cân
          </button>
          <button
            onClick={() => navigate('/b2b/bonus-rules')}
            className="px-3 py-2 border rounded-md text-sm hover:bg-slate-50 flex items-center gap-1"
          >
            <SettingsIcon className="w-4 h-4" />
            Cấu hình quy chế
          </button>
          <button
            onClick={() => setShowBatchModal(true)}
            className="px-3 py-2 bg-emerald-700 text-white rounded-md text-sm hover:bg-emerald-800 flex items-center gap-1"
          >
            <FileText className="w-4 h-4" />
            Tạo phiếu chi quý
          </button>
        </div>
      </div>

      {/* Dashboard cards */}
      {dashboard != null && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SummaryCard
            label={`Bonus tháng ${dashboard.month}/${dashboard.year}`}
            value={formatVnd(dashboard.month_total_bonus_vnd)}
            sub={`${dashboard.month_bonus_count} dòng · ${formatNum(dashboard.month_total_volume_tons)} T`}
          />
          <SummaryCard
            label={`Bonus Q${dashboard.quarter}/${dashboard.year}`}
            value={formatVnd(dashboard.quarter_total_bonus_vnd)}
            sub={`Đã chi: ${formatVnd(dashboard.quarter_paid_bonus_vnd)}`}
          />
          <SummaryCard
            label={`Bonus năm ${dashboard.year}`}
            value={formatVnd(dashboard.year_total_bonus_vnd)}
            sub={`Tạp: ${formatVnd(dashboard.year_tap_bonus_vnd)} · Nước: ${formatVnd(dashboard.year_nuoc_bonus_vnd)}`}
          />
          <SummaryCard
            label="Chờ xử lý"
            value={`${dashboard.pending_approval_count} duyệt`}
            sub={`+ ${dashboard.approved_unpaid_count} chờ chi`}
            highlight={dashboard.pending_approval_count > 0 || dashboard.approved_unpaid_count > 0}
          />
        </div>
      )}

      {/* Pending actions list */}
      {pendingActions && pendingActions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1">
          {(pendingActions as Array<{ action_type: string; count: number; amount_vnd: number | null; description: string }>)
            .filter((a) => a.count > 0)
            .map((a) => (
              <div key={a.action_type} className="text-sm flex justify-between">
                <span>
                  <span className="font-medium">{a.count}</span> · {a.description}
                </span>
                <span className="text-amber-700 font-mono text-xs">
                  {a.amount_vnd ? formatVnd(a.amount_vnd) : ''}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border rounded-md p-3 flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-1.5 border rounded-md text-sm bg-white"
        >
          {[CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => (
            <option key={y} value={y}>
              Năm {y}
            </option>
          ))}
        </select>
        <select
          value={String(quarter)}
          onChange={(e) => setQuarter(e.target.value === 'all' ? 'all' : (Number(e.target.value) as 1 | 2 | 3 | 4))}
          className="px-3 py-1.5 border rounded-md text-sm bg-white"
        >
          <option value="all">Tất cả quý</option>
          <option value="1">Q1 (T1-T3)</option>
          <option value="2">Q2 (T4-T6)</option>
          <option value="3">Q3 (T7-T9)</option>
          <option value="4">Q4 (T10-T12)</option>
        </select>
        <select
          value={rubberType}
          onChange={(e) => setRubberType((e.target.value === 'all' ? 'all' : e.target.value) as 'all' | RubberType)}
          className="px-3 py-1.5 border rounded-md text-sm bg-white"
        >
          <option value="all">Tất cả loại mủ</option>
          <option value="tap">Mủ tạp</option>
          <option value="nuoc">Mủ nước</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus((e.target.value === 'all' ? 'all' : e.target.value) as 'all' | MonthlyBonusStatus)}
          className="px-3 py-1.5 border rounded-md text-sm bg-white"
        >
          <option value="all">Tất cả status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          Tải lại
        </button>

        <button
          onClick={() => recomputeMutation.mutate()}
          disabled={recomputeMutation.isPending || quarter === 'all'}
          className="px-3 py-1.5 bg-sky-700 text-white rounded-md text-sm hover:bg-sky-800 flex items-center gap-1 disabled:opacity-50"
          title={quarter === 'all' ? 'Chọn 1 quý cụ thể để tính lại' : ''}
        >
          <Calculator className="w-3 h-3" />
          Tính lại Q{quarter === 'all' ? '?' : quarter}/{year}
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-2 flex items-center gap-2 text-sm">
          <span className="font-medium">{selected.size} dòng đã chọn.</span>
          {selectedDraftIds.length > 0 && (
            <button
              onClick={() => submitMutation.mutate(selectedDraftIds)}
              disabled={submitMutation.isPending}
              className="px-2 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700 flex items-center gap-1"
            >
              <Send className="w-3 h-3" />
              Submit duyệt ({selectedDraftIds.length})
            </button>
          )}
          {selectedPendingIds.length > 0 && (
            <button
              onClick={() => approveMutation.mutate(selectedPendingIds)}
              disabled={approveMutation.isPending}
              className="px-2 py-1 bg-emerald-700 text-white rounded text-xs hover:bg-emerald-800 flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" />
              Duyệt ({selectedPendingIds.length})
            </button>
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded text-xs flex items-center gap-1"
          >
            <XCircle className="w-3 h-3" />
            Bỏ chọn
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left w-8">
                <input type="checkbox" checked={isAllSelected} onChange={toggleAll} />
              </th>
              <th className="px-3 py-2 text-left">Đại lý</th>
              <th className="px-3 py-2 text-center">Tháng</th>
              <th className="px-3 py-2 text-center">Loại mủ</th>
              <th className="px-3 py-2 text-right">SL (T)</th>
              <th className="px-3 py-2 text-center">Tier</th>
              <th className="px-3 py-2 text-right">Đơn thưởng</th>
              <th className="px-3 py-2 text-right">Tổng thưởng</th>
              <th className="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  Đang tải…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  Không có bonus nào khớp bộ lọc. Bấm "Tính lại Q{quarter}/{year}" để tạo.
                </td>
              </tr>
            )}
            {rows.map((b) => (
              <BonusRow
                key={b.id}
                bonus={b}
                partner={partnerMap[b.partner_id]}
                checked={selected.has(b.id)}
                onToggle={() => toggleOne(b.id)}
              />
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-slate-50 border-t font-medium">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right">
                  Tổng ({rows.length} dòng):
                </td>
                <td className="px-3 py-2 text-right font-mono">{formatNum(totals.volume)}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right font-mono">{formatVnd(totals.bonus)}</td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showBatchModal && (
        <QuarterlyBatchModal
          year={year}
          quarter={quarter === 'all' ? CURRENT_QUARTER : quarter}
          onClose={() => setShowBatchModal(false)}
          onCreated={() => {
            setShowBatchModal(false)
            qc.invalidateQueries({ queryKey: ['b2b-bonus-list'] })
            qc.invalidateQueries({ queryKey: ['b2b-bonus-dashboard'] })
            qc.invalidateQueries({ queryKey: ['b2b-bonus-pending-actions'] })
          }}
        />
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div
      className={`p-3 rounded-md border ${
        highlight ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900 mt-0.5">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function BonusRow({
  bonus,
  partner,
  checked,
  onToggle,
}: {
  bonus: MonthlyBonus
  partner: PartnerLite | undefined
  checked: boolean
  onToggle: () => void
}) {
  const isFinal = bonus.status === 'paid' || bonus.status === 'cancelled'
  return (
    <tr className={`border-t ${isFinal ? 'opacity-60' : ''} hover:bg-slate-50`}>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={isFinal}
        />
      </td>
      <td className="px-3 py-2">
        <div className="font-medium text-slate-900">{partner?.name ?? 'N/A'}</div>
        {partner?.code && partner.code.length === 13 && partner.code.startsWith('8999') ? (
          <Hac13CodeDisplay code={partner.code} variant="badge" showCopy={false} />
        ) : (
          <div className="text-xs text-slate-500 font-mono">{partner?.code}</div>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        T{bonus.month}/{bonus.year}
      </td>
      <td className="px-3 py-2 text-center">
        {bonus.rubber_type === 'tap' ? 'Mủ tạp' : 'Mủ nước'}
      </td>
      <td className="px-3 py-2 text-right font-mono">{formatNum(bonus.volume_tons)}</td>
      <td className="px-3 py-2 text-center">
        <BonusTierBadge tier={bonus.tier_applied} rubberType={bonus.rubber_type} size="sm" />
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        {bonus.bonus_per_ton ? `${formatVnd(bonus.bonus_per_ton)}/T` : '—'}
      </td>
      <td className="px-3 py-2 text-right font-mono font-medium">{formatVnd(bonus.total_bonus_vnd)}</td>
      <td className="px-3 py-2 text-center">
        <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[bonus.status]}`}>
          {STATUS_LABELS[bonus.status]}
        </span>
      </td>
    </tr>
  )
}

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatVnd(n: number | string | null | undefined): string {
  const num = Number(n || 0)
  return num.toLocaleString('vi-VN') + 'đ'
}
function formatNum(n: number | string | null | undefined): string {
  const num = Number(n || 0)
  return num.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
}

export default BonusListPage
