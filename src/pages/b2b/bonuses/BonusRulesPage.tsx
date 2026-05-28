// ============================================================================
// BONUS RULES PAGE — Admin cấu hình quy chế thưởng (ngưỡng + mức)
// File: src/pages/b2b/bonuses/BonusRulesPage.tsx
// ============================================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, Save, X } from 'lucide-react'
import { message } from 'antd'

import { bonusRulesService } from '../../../services/b2b/bonusRulesService'
import type { BonusRule, RubberType } from '../../../types/b2b.types'

const RUBBER_TABS: { value: RubberType; label: string }[] = [
  { value: 'tap', label: 'Mủ tạp' },
  { value: 'nuoc', label: 'Mủ nước' },
]

export function BonusRulesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<RubberType>('tap')
  const [showAddForm, setShowAddForm] = useState(false)

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['bonus-rules', tab],
    queryFn: () => bonusRulesService.list({ rubber_type: tab, includeExpired: true }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bonusRulesService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bonus-rules'] })
    },
    onError: (e: Error) => message.error(`Lỗi xoá: ${e.message}`),
  })

  return (
    <div style={{ padding: 24 }} className="space-y-4">
      <button
        onClick={() => navigate('/b2b/bonuses')}
        className="text-sm text-emerald-700 hover:underline flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại danh sách bonus
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quy chế thưởng đại lý</h1>
          <p className="text-sm text-slate-500">
            Cấu hình ngưỡng + mức thưởng theo từng loại mủ. Khi quy chế đổi, thêm rule mới với
            <code className="text-xs bg-slate-100 px-1 rounded">effective_from</code> mới.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-2 bg-emerald-700 text-white rounded-md text-sm hover:bg-emerald-800 flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          Thêm rule
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {RUBBER_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.value
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-right">Min (T)</th>
              <th className="px-3 py-2 text-right">Max (T)</th>
              <th className="px-3 py-2 text-right">Đơn thưởng</th>
              <th className="px-3 py-2 text-center">Hiệu lực từ</th>
              <th className="px-3 py-2 text-center">Hiệu lực đến</th>
              <th className="px-3 py-2 text-left">Ghi chú</th>
              <th className="px-3 py-2 text-center w-12" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Đang tải…
                </td>
              </tr>
            )}
            {!isLoading && rules.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Chưa có rule nào cho loại mủ này.
                </td>
              </tr>
            )}
            {rules.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                onDelete={() => {
                  if (confirm(`Xoá rule "${r.tier_label}"?`)) deleteMutation.mutate(r.id)
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showAddForm && (
        <AddRuleForm
          rubberType={tab}
          onClose={() => setShowAddForm(false)}
          onSaved={() => {
            setShowAddForm(false)
            qc.invalidateQueries({ queryKey: ['bonus-rules'] })
          }}
        />
      )}
    </div>
  )
}

function RuleRow({ rule, onDelete }: { rule: BonusRule; onDelete: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const expired = rule.effective_to && rule.effective_to < today
  return (
    <tr className={`border-t hover:bg-slate-50 ${expired ? 'opacity-50' : ''}`}>
      <td className="px-3 py-2 font-medium">{rule.tier_label}</td>
      <td className="px-3 py-2 text-right font-mono">{rule.threshold_min_tons}</td>
      <td className="px-3 py-2 text-right font-mono">{rule.threshold_max_tons ?? '∞'}</td>
      <td className="px-3 py-2 text-right font-mono">{Number(rule.bonus_per_ton_vnd).toLocaleString('vi-VN')}đ/T</td>
      <td className="px-3 py-2 text-center text-xs">{rule.effective_from}</td>
      <td className="px-3 py-2 text-center text-xs">{rule.effective_to ?? '—'}</td>
      <td className="px-3 py-2 text-xs text-slate-600">{rule.notes ?? ''}</td>
      <td className="px-3 py-2 text-center">
        <button
          onClick={onDelete}
          className="text-rose-600 hover:bg-rose-50 p-1 rounded"
          title="Xoá rule"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}

function AddRuleForm({
  rubberType,
  onClose,
  onSaved,
}: {
  rubberType: RubberType
  onClose: () => void
  onSaved: () => void
}) {
  const [tierLabel, setTierLabel] = useState('')
  const [minTons, setMinTons] = useState<number>(0)
  const [maxTons, setMaxTons] = useState<string>('')
  const [bonusPerTon, setBonusPerTon] = useState<number>(0)
  const [effectiveFrom, setEffectiveFrom] = useState<string>(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState<string>('')

  const createMutation = useMutation({
    mutationFn: () =>
      bonusRulesService.create({
        rubber_type: rubberType,
        tier_label: tierLabel.trim(),
        threshold_min_tons: minTons,
        threshold_max_tons: maxTons.trim() === '' ? null : Number(maxTons),
        bonus_per_ton_vnd: bonusPerTon,
        effective_from: effectiveFrom,
        notes: notes.trim() || null,
      }),
    onSuccess: () => onSaved(),
    onError: (e: Error) => message.error(`Lỗi: ${e.message}`),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-md max-w-md w-full p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Thêm rule cho {rubberType === 'tap' ? 'Mủ tạp' : 'Mủ nước'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs text-slate-600 mb-0.5">Tên tier *</label>
            <input
              value={tierLabel}
              onChange={(e) => setTierLabel(e.target.value)}
              placeholder="vd: Tier 5 / Kim Cương / Bạch Kim..."
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-slate-600 mb-0.5">Min tons * (exclusive)</label>
              <input
                type="number"
                value={minTons}
                onChange={(e) => setMinTons(Number(e.target.value))}
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-0.5">Max tons (để trống = ∞)</label>
              <input
                type="number"
                value={maxTons}
                onChange={(e) => setMaxTons(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-0.5">Đơn thưởng (đ/T) *</label>
            <input
              type="number"
              value={bonusPerTon}
              onChange={(e) => setBonusPerTon(Number(e.target.value))}
              placeholder="vd: 200000"
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
            {bonusPerTon > 0 && (
              <div className="text-xs text-slate-500 mt-0.5">
                = {bonusPerTon.toLocaleString('vi-VN')}đ/T
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-0.5">Hiệu lực từ *</label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-0.5">Ghi chú</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button onClick={onClose} className="px-3 py-1.5 border rounded text-sm">
            Huỷ
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!tierLabel.trim() || bonusPerTon <= 0 || createMutation.isPending}
            className="px-3 py-1.5 bg-emerald-700 text-white rounded text-sm hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1"
          >
            <Save className="w-3.5 h-3.5" />
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}

export default BonusRulesPage
