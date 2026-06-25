// ============================================================================
// FinanceAuditLogPage — Nhật ký kiểm toán MODULE TÀI CHÍNH (CHỈ ADMIN)
// Ghi nhận mọi tạo/sửa/xóa trên toàn bộ bảng fin_* (qua DB trigger).
// File: src/pages/finance/FinanceAuditLogPage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Card, Input, Select, DatePicker, Button, Tag, Spin, Empty, Tooltip, Pagination, Modal } from 'antd'
import { Shield, RefreshCw, FileSearch, Plus, Edit, Trash2, Lock } from 'lucide-react'
import dayjs from 'dayjs'
import {
  financeAuditService, formatFinChanges, FIN_TABLE_LABELS, FIN_FIELD_LABELS,
  type AuditLogEntry, type AuditLogListParams,
} from '../../services/finance/financeAuditService'
import { isFinanceAdmin } from '../../lib/financeAccess'
import { useAuthStore } from '../../stores/authStore'

const { RangePicker } = DatePicker

const ACTION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  INSERT: { label: 'Tạo mới', color: 'green', icon: <Plus size={12} /> },
  UPDATE: { label: 'Cập nhật', color: 'blue', icon: <Edit size={12} /> },
  DELETE: { label: 'Xóa', color: 'red', icon: <Trash2 size={12} /> },
}

export default function FinanceAuditLogPage() {
  const user = useAuthStore(s => s.user)
  const isAuthorized = isFinanceAdmin(user)

  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ today: 0, last_7d: 0, last_30d: 0, by_action: { INSERT: 0, UPDATE: 0, DELETE: 0 } })

  const [tableName, setTableName] = useState<string>('all')
  const [action, setAction] = useState<'INSERT' | 'UPDATE' | 'DELETE' | 'all'>('all')
  const [recordCode, setRecordCode] = useState('')
  const [changedByEmail, setChangedByEmail] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 50

  const [detailEntry, setDetailEntry] = useState<AuditLogEntry | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: AuditLogListParams = {
        page, pageSize,
        tableName: tableName === 'all' ? undefined : tableName,
        action,
        recordCode: recordCode || undefined,
        changedByEmail: changedByEmail || undefined,
        dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
        dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      }
      const res = await financeAuditService.getList(params)
      setEntries(res.data)
      setTotal(res.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [page, tableName, action, recordCode, changedByEmail, dateRange])

  useEffect(() => { if (isAuthorized) fetchData() }, [fetchData, isAuthorized])
  useEffect(() => { if (isAuthorized) financeAuditService.getStats().then(setStats).catch(console.error) }, [isAuthorized])

  if (!isAuthorized) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Lock size={48} style={{ color: '#cf1322', margin: '0 auto 16px' }} />
        <h2 style={{ color: '#cf1322' }}>Không có quyền truy cập</h2>
        <p style={{ color: '#6b7280' }}>
          Nhật ký kiểm toán tài chính chỉ dành cho <strong>Admin</strong>.<br />
          (Dữ liệu tài chính nhạy cảm — Ban giám đốc / Kế toán không xem được nhật ký này.)
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={20} style={{ color: '#1B4D3E' }} />
            <span style={{ color: '#1B4D3E', fontSize: 17, fontWeight: 700 }}>Nhật ký kiểm toán — Module Tài chính</span>
            <Tag color="red" style={{ marginLeft: 6 }}>CHỈ ADMIN</Tag>
          </div>
        }
        extra={<Button icon={<RefreshCw size={14} />} onClick={fetchData} loading={loading} size="small">Làm mới</Button>}
        style={{ borderRadius: 12 }}
        styles={{ body: { padding: 14 } }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
          <StatCard label="Sự kiện hôm nay" value={stats.today} color="#1B4D3E" />
          <StatCard label="7 ngày" value={stats.last_7d} color="#0a72ef" />
          <StatCard label="30 ngày" value={stats.last_30d} color="#6366f1" />
          <StatCard label="🟢 Tạo mới (30d)" value={stats.by_action.INSERT} color="#10b981" />
          <StatCard label="🔵 Cập nhật (30d)" value={stats.by_action.UPDATE} color="#0a72ef" />
          <StatCard label="🔴 Xóa (30d)" value={stats.by_action.DELETE} color="#cf1322" />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 12, background: '#f8f9fa', borderRadius: 8, marginBottom: 14, alignItems: 'center' }}>
          <Select value={tableName} onChange={(v) => { setTableName(v); setPage(1) }} style={{ width: 190 }} size="small"
            options={[{ value: 'all', label: 'Tất cả mục' }, ...Object.entries(FIN_TABLE_LABELS).map(([value, label]) => ({ value, label }))]} />
          <Select value={action} onChange={(v) => { setAction(v); setPage(1) }} style={{ width: 140 }} size="small"
            options={[
              { value: 'all', label: 'Tất cả thao tác' },
              { value: 'INSERT', label: '🟢 Tạo mới' },
              { value: 'UPDATE', label: '🔵 Cập nhật' },
              { value: 'DELETE', label: '🔴 Xóa' },
            ]} />
          <Input.Search placeholder="Mã (KU-001 / TG-01 / khách…)" value={recordCode} onChange={(e) => setRecordCode(e.target.value)}
            onSearch={() => { setPage(1); fetchData() }} style={{ width: 230 }} size="small" allowClear />
          <Input.Search placeholder="Email người thao tác" value={changedByEmail} onChange={(e) => setChangedByEmail(e.target.value)}
            onSearch={() => { setPage(1); fetchData() }} style={{ width: 210 }} size="small" allowClear />
          <RangePicker value={dateRange as any} onChange={(d) => { setDateRange(d as any); setPage(1) }} size="small" style={{ width: 240 }} placeholder={['Từ ngày', 'Đến ngày']} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : entries.length === 0 ? (
          <Empty description="Chưa có sự kiện nào (hoặc chưa chạy migration finance_audit_log_v1.sql)" style={{ padding: 40 }} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 1050 }}>
              <thead>
                <tr style={{ background: '#fafafa', textAlign: 'left' }}>
                  <Th>Thời gian</Th><Th>Mục</Th><Th>Thao tác</Th><Th>Bản ghi</Th><Th>Người thao tác</Th><Th>Thay đổi</Th><Th align="right">Chi tiết</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const meta = ACTION_META[e.action] || ACTION_META.UPDATE
                  return (
                    <tr key={e.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <Td>
                        <div style={{ fontSize: 12, color: '#374151' }}>{dayjs(e.changed_at).format('DD/MM/YYYY')}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{dayjs(e.changed_at).format('HH:mm:ss')}</div>
                      </Td>
                      <Td><span style={{ fontSize: 12 }}>{FIN_TABLE_LABELS[e.table_name] || e.table_name}</span></Td>
                      <Td><Tag color={meta.color} style={{ marginInlineEnd: 0, fontSize: 11, fontWeight: 600 }} icon={meta.icon}>{meta.label}</Tag></Td>
                      <Td><span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{e.record_code || (e.record_id ? e.record_id.substring(0, 8) : '—')}</span></Td>
                      <Td>
                        <div style={{ fontSize: 12 }}>{e.changed_by_name || '—'}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{e.changed_by_email || ''}</div>
                      </Td>
                      <Td>
                        <Tooltip title={formatFinChanges(e.changed_fields, 50)} mouseEnterDelay={0.4}>
                          <span style={{ fontSize: 11, color: '#6b7280', maxWidth: 340, display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {e.action === 'UPDATE' ? formatFinChanges(e.changed_fields, 3) : (e.action === 'INSERT' ? 'tạo bản ghi mới' : 'xóa bản ghi')}
                          </span>
                        </Tooltip>
                      </Td>
                      <Td align="right"><Button type="link" size="small" icon={<FileSearch size={12} />} onClick={() => setDetailEntry(e)}>Xem</Button></Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > pageSize && (
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <Pagination current={page} pageSize={pageSize} total={total} onChange={setPage} showSizeChanger={false} showTotal={(t) => `Tổng ${t} sự kiện`} size="small" />
          </div>
        )}
      </Card>

      <Modal
        title={detailEntry ? (
          <span>
            {ACTION_META[detailEntry.action]?.label || detailEntry.action}{' '}
            <code style={{ fontFamily: 'monospace', fontSize: 12, background: '#f3f4f6', padding: '2px 6px', borderRadius: 3 }}>{detailEntry.record_code || detailEntry.record_id?.substring(0, 8)}</code>{' '}
            — bởi {detailEntry.changed_by_name || detailEntry.changed_by_email}
          </span>
        ) : null}
        open={!!detailEntry}
        onCancel={() => setDetailEntry(null)}
        footer={null}
        width={820}
      >
        {detailEntry && <DetailView entry={detailEntry} />}
      </Modal>
    </div>
  )
}

interface ThProps { children: React.ReactNode; align?: 'left' | 'right' | 'center' }
function Th({ children, align = 'left' }: ThProps) {
  return <th style={{ padding: '8px 10px', fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: align }}>{children}</th>
}
interface TdProps { children: React.ReactNode; align?: 'left' | 'right' | 'center' }
function Td({ children, align = 'left' }: TdProps) {
  return <td style={{ padding: '10px', textAlign: align, verticalAlign: 'middle' }}>{children}</td>
}
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: '10px 14px', background: '#fff', border: '1px solid #e4e4e7', borderLeft: `3px solid ${color}`, borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function DetailView({ entry }: { entry: AuditLogEntry }) {
  // UPDATE → diff; INSERT/DELETE → toàn bộ giá trị bản ghi
  const fields = entry.changed_fields ? Object.entries(entry.changed_fields) : []
  const snapshot = entry.action === 'INSERT' ? entry.new_values : entry.action === 'DELETE' ? entry.old_values : null
  const lbl = (k: string) => FIN_FIELD_LABELS[k] || k
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8, fontSize: 13, marginBottom: 16 }}>
        <strong>Thời gian:</strong><span>{dayjs(entry.changed_at).format('DD/MM/YYYY HH:mm:ss')}</span>
        <strong>Mục:</strong><span>{FIN_TABLE_LABELS[entry.table_name] || entry.table_name}</span>
        <strong>Bản ghi:</strong><code style={{ fontFamily: 'monospace' }}>{entry.record_code || entry.record_id}</code>
        <strong>Thao tác:</strong><Tag color={ACTION_META[entry.action]?.color}>{ACTION_META[entry.action]?.label}</Tag>
        <strong>Người thao tác:</strong>
        <div>
          <div>{entry.changed_by_name || '—'}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{entry.changed_by_email}</div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
        {entry.action === 'UPDATE' ? (
          <>
            <h4 style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>Trường thay đổi ({fields.length})</h4>
            {fields.length === 0 ? <Empty description="Không có trường nào thay đổi" /> : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#fafafa' }}><Th>Trường</Th><Th>Giá trị cũ</Th><Th>→</Th><Th>Giá trị mới</Th></tr></thead>
                <tbody>
                  {fields.map(([f, { old: o, new: n }]) => (
                    <tr key={f} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <Td><span style={{ fontWeight: 600 }}>{lbl(f)}</span> <code style={{ fontFamily: 'monospace', fontSize: 10, color: '#9ca3af' }}>{f}</code></Td>
                      <Td><span style={{ color: '#cf1322', fontFamily: 'monospace' }}>{o === null || o === 'null' ? '∅' : JSON.stringify(o)}</span></Td>
                      <Td>→</Td>
                      <Td><span style={{ color: '#10b981', fontFamily: 'monospace' }}>{n === null || n === 'null' ? '∅' : JSON.stringify(n)}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <>
            <h4 style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{entry.action === 'INSERT' ? 'Giá trị bản ghi tạo mới' : 'Giá trị bản ghi đã xóa'}</h4>
            {!snapshot ? <Empty description="Không có dữ liệu" /> : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <tbody>
                  {Object.entries(snapshot).filter(([k]) => !['created_at', 'updated_at'].includes(k)).map(([k, v]) => (
                    <tr key={k} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <Td><span style={{ fontWeight: 600 }}>{lbl(k)}</span> <code style={{ fontFamily: 'monospace', fontSize: 10, color: '#9ca3af' }}>{k}</code></Td>
                      <Td><span style={{ fontFamily: 'monospace', color: '#374151' }}>{v === null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v)}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}
