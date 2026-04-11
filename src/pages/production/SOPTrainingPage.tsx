// ============================================================================
// SOP TRAINING PAGE — Huấn luyện SOP
// File: src/pages/production/SOPTrainingPage.tsx
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { Tag, Typography, Button, Descriptions, Progress } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AdvancedDataTable, { type ColumnDef } from '../../components/common/AdvancedDataTable'

const { Text } = Typography

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  assigned: { label: 'Đã giao', color: 'blue' },
  in_progress: { label: 'Đang học', color: 'processing' },
  completed: { label: 'Hoàn thành', color: 'success' },
  overdue: { label: 'Quá hạn', color: 'error' },
}

interface TrainingAssignment {
  id: string; sop_id: string; employee_id: string; status: string
  due_date: string | null; completed_at: string | null; score: number | null
  assigned_at: string
  sop?: { code: string; name: string } | null
  employee?: { full_name: string; code: string } | null
}

export default function SOPTrainingPage() {
  const navigate = useNavigate()

  const { data: assignments = [], isLoading, refetch } = useQuery({
    queryKey: ['sop-training'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sop_training_assignments')
        .select('*, sop:sop_documents(code, name), employee:employees(full_name, code)')
        .order('assigned_at', { ascending: false })
      if (error) throw error
      return (data || []).map((a: any) => ({
        ...a,
        sop: Array.isArray(a.sop) ? a.sop[0] : a.sop,
        employee: Array.isArray(a.employee) ? a.employee[0] : a.employee,
      }))
    },
  })

  const columns: ColumnDef<TrainingAssignment>[] = [
    { key: 'sop_code', title: 'Mã SOP', dataIndex: ['sop', 'code'], width: 100,
      render: (_, r) => <Text strong style={{ fontFamily: 'monospace' }}>{r.sop?.code || '—'}</Text>,
      exportRender: (_, r) => r.sop?.code || '' },
    { key: 'sop_name', title: 'Tên SOP', dataIndex: ['sop', 'name'], width: 200, ellipsis: true,
      render: (_, r) => r.sop?.name || '—', exportRender: (_, r) => r.sop?.name || '' },
    { key: 'employee', title: 'Nhân viên', dataIndex: ['employee', 'full_name'], width: 150,
      render: (_, r) => <div><Text strong>{r.employee?.full_name || '—'}</Text><div style={{ fontSize: 11, color: '#999' }}>{r.employee?.code}</div></div>,
      exportRender: (_, r) => r.employee?.full_name || '' },
    { key: 'status', title: 'Trạng thái', dataIndex: 'status', width: 110,
      filterType: 'select', filterOptions: Object.entries(STATUS_MAP).map(([v, s]) => ({ value: v, label: s.label })),
      render: (v) => { const s = STATUS_MAP[v]; return s ? <Tag color={s.color}>{s.label}</Tag> : v } },
    { key: 'due_date', title: 'Hạn hoàn thành', dataIndex: 'due_date', width: 110, sortable: true,
      render: (v) => {
        if (!v) return '—'
        const overdue = new Date(v) < new Date()
        return <Text style={{ color: overdue ? '#ff4d4f' : '#666' }}>{v}{overdue ? ' ⚠️' : ''}</Text>
      } },
    { key: 'score', title: 'Điểm', dataIndex: 'score', width: 70, align: 'center',
      render: (v) => v != null ? <Tag color={v >= 80 ? 'success' : v >= 50 ? 'warning' : 'error'}>{v}</Tag> : '—' },
    { key: 'assigned_at', title: 'Ngày giao', dataIndex: 'assigned_at', width: 100, sortable: true,
      render: (v) => v ? new Date(v).toLocaleDateString('vi-VN') : '—' },
  ]

  // Summary stats
  const total = assignments.length
  const completed = assignments.filter(a => a.status === 'completed').length
  const overdue = assignments.filter(a => a.status === 'overdue' || (a.due_date && new Date(a.due_date) < new Date() && a.status !== 'completed')).length

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
        <Text strong style={{ fontSize: 18, color: '#1B4D3E' }}>🎓 Huấn luyện SOP</Text>
        <Tag color="blue">{completed}/{total} hoàn thành</Tag>
        {overdue > 0 && <Tag color="error">{overdue} quá hạn</Tag>}
      </div>
      <AdvancedDataTable<TrainingAssignment>
        columns={columns}
        dataSource={assignments}
        rowKey="id"
        loading={isLoading}
        title="Huấn luyện SOP"
        onRefresh={() => refetch()}
        exportFileName="Huan_Luyen_SOP"
        pageSize={50}
      />
    </div>
  )
}
