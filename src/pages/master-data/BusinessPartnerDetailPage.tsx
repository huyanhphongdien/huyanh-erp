// ============================================================================
// BUSINESS PARTNER DETAIL PAGE — HAC-13 v10
// File: src/pages/master-data/BusinessPartnerDetailPage.tsx
// ============================================================================

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, History, Briefcase, MapPin, Phone, Mail, Globe, CreditCard } from 'lucide-react'

import { supabase } from '../../lib/supabase'
import {
  businessPartnerService,
  type BpRole,
  type BpRoleType,
} from '../../services/businessPartnerService'
import { Hac13CodeDisplay } from '../../components/master-data/Hac13CodeDisplay'
import { ROLE_LABELS, ROLE_COLORS } from './BusinessPartnerListPage'

interface NameHistoryRow {
  id: string
  old_name: string
  new_name: string
  changed_at: string
}

interface AddressHistoryRow {
  id: string
  old_country_iso: string | null
  old_province_gso: string | null
  old_address_line: string | null
  new_country_iso: string | null
  new_province_gso: string | null
  new_address_line: string | null
  changed_at: string
}

export function BusinessPartnerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'overview' | 'roles' | 'history'>('overview')

  const { data: bp, isLoading } = useQuery({
    queryKey: ['business-partner', id],
    queryFn: () => businessPartnerService.getById(id!),
    enabled: Boolean(id),
  })

  if (isLoading) {
    return <div className="p-6 text-slate-500">Đang tải đối tác…</div>
  }
  if (!bp) {
    return (
      <div className="p-6">
        <button onClick={() => navigate(-1)} className="text-sm text-emerald-700 mb-2">
          ← Quay lại
        </button>
        <div className="text-rose-700">Không tìm thấy đối tác.</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <button
        onClick={() => navigate('/master-data/business-partners')}
        className="text-sm text-emerald-700 hover:underline flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" /> Danh sách đối tác
      </button>

      {/* Header */}
      <div className="bg-white border rounded-md p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{bp.legal_name}</h1>
            {bp.short_name && <div className="text-sm text-slate-500">{bp.short_name}</div>}
          </div>
          <StatusPill status={bp.status} />
        </div>
        <Hac13CodeDisplay code={bp.hac13_code} variant="large" showTypeBadge />
        <div className="flex flex-wrap gap-2">
          {bp.roles.map((role) => (
            <span
              key={role.id}
              className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role.role_type]}`}
            >
              {ROLE_LABELS[role.role_type]}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {(['overview', 'roles', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t === 'overview' ? 'Tổng quan' : t === 'roles' ? 'Vai trò' : 'Lịch sử'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab bp={bp} />}
      {tab === 'roles' && <RolesTab roles={bp.roles} />}
      {tab === 'history' && <HistoryTab bpId={bp.id} />}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'active'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'blocked'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-slate-100 text-slate-700'
  return <span className={`px-2 py-1 rounded text-xs font-medium ${cls}`}>{status}</span>
}

function OverviewTab({ bp }: { bp: NonNullable<Awaited<ReturnType<typeof businessPartnerService.getById>>> }) {
  return (
    <div className="bg-white border rounded-md p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      <KV icon={<Briefcase className="w-4 h-4" />} label="Mã số thuế (MST)" value={bp.tax_code} mono />
      <KV label="CCCD" value={bp.cccd} mono />
      <KV label="Quốc gia (ISO)" value={bp.country_iso} />
      <KV
        icon={<MapPin className="w-4 h-4" />}
        label="Địa chỉ"
        value={[bp.address_line, bp.ward, bp.district, bp.province_gso, bp.region_iso]
          .filter(Boolean)
          .join(', ')}
      />
      <KV icon={<Phone className="w-4 h-4" />} label="Điện thoại" value={bp.phone} />
      <KV icon={<Mail className="w-4 h-4" />} label="Email" value={bp.email} />
      <KV icon={<Globe className="w-4 h-4" />} label="Website" value={bp.website} />
      <KV
        icon={<CreditCard className="w-4 h-4" />}
        label="Ngân hàng"
        value={[bp.bank_name, bp.bank_account, bp.bank_holder, bp.bank_branch]
          .filter(Boolean)
          .join(' · ')}
      />
      {bp.notes && (
        <div className="md:col-span-2">
          <div className="text-xs text-slate-500 mb-1">Ghi chú</div>
          <div className="whitespace-pre-wrap text-slate-700">{bp.notes}</div>
        </div>
      )}
    </div>
  )
}

function KV({
  label,
  value,
  icon,
  mono,
}: {
  label: string
  value: string | null | undefined
  icon?: React.ReactNode
  mono?: boolean
}) {
  return (
    <div>
      <div className="text-xs text-slate-500 flex items-center gap-1 mb-1">
        {icon}
        {label}
      </div>
      <div className={mono ? 'font-mono text-slate-800' : 'text-slate-800'}>{value || '—'}</div>
    </div>
  )
}

function RolesTab({ roles }: { roles: BpRole[] }) {
  if (roles.length === 0) {
    return (
      <div className="bg-white border rounded-md p-8 text-center text-slate-500">
        Đối tác này chưa có vai trò nào.
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {roles.map((r) => (
        <RoleCard key={r.id} role={r} />
      ))}
    </div>
  )
}

function RoleCard({ role }: { role: BpRole }) {
  const data = role.role_data as Record<string, unknown>
  return (
    <div className="bg-white border rounded-md p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[role.role_type as BpRoleType]}`}>
            {ROLE_LABELS[role.role_type as BpRoleType]}
          </span>
          {role.is_primary && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700">Chính</span>
          )}
          <span className="text-xs text-slate-500">
            Kích hoạt {new Date(role.activated_at).toLocaleDateString('vi-VN')}
          </span>
        </div>
        <span className={`text-xs ${role.status === 'active' ? 'text-emerald-700' : 'text-slate-500'}`}>
          {role.status}
        </span>
      </div>
      {Object.keys(data).length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t pt-2">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-slate-500">{k}</span>
              <span className="text-slate-800 font-mono text-xs truncate">
                {v == null ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HistoryTab({ bpId }: { bpId: string }) {
  const { data: nameHistory } = useQuery({
    queryKey: ['bp-name-history', bpId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bp_name_history')
        .select('*')
        .eq('bp_id', bpId)
        .order('changed_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as NameHistoryRow[]
    },
  })
  const { data: addrHistory } = useQuery({
    queryKey: ['bp-address-history', bpId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bp_address_history')
        .select('*')
        .eq('bp_id', bpId)
        .order('changed_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AddressHistoryRow[]
    },
  })

  const events = [
    ...(nameHistory ?? []).map((r) => ({
      kind: 'name' as const,
      at: r.changed_at,
      detail: `Đổi tên: "${r.old_name}" → "${r.new_name}"`,
    })),
    ...(addrHistory ?? []).map((r) => ({
      kind: 'addr' as const,
      at: r.changed_at,
      detail: `Đổi địa chỉ: ${[r.old_country_iso, r.old_province_gso, r.old_address_line].filter(Boolean).join(', ')} → ${[r.new_country_iso, r.new_province_gso, r.new_address_line].filter(Boolean).join(', ')}`,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  if (events.length === 0) {
    return (
      <div className="bg-white border rounded-md p-8 text-center text-slate-500">
        Chưa có thay đổi nào được ghi nhận.
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-md p-4 space-y-2">
      {events.map((e, i) => (
        <div key={i} className="flex items-start gap-3 text-sm py-2 border-b last:border-b-0">
          <History className="w-4 h-4 mt-0.5 text-slate-400" />
          <div className="flex-1">
            <div className="text-slate-800">{e.detail}</div>
            <div className="text-xs text-slate-500">
              {new Date(e.at).toLocaleString('vi-VN')}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default BusinessPartnerDetailPage
