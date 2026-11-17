// ============================================================================
// AuditLogPage — Nhật ký hệ thống: lịch sử ai sửa gì (Admin/BGĐ only)
// File: src/pages/admin/AuditLogPage.tsx
// 17/11/2026 (Đợt 3 audit UI): lỗi tải hiện khối lỗi + Thử lại (trước: rơi xuống "Không có sự kiện nào"),
// thẻ thống kê lỗi hiện "—" thay vì 0, quyền xem khớp menu (Admin hoặc level ≤ 3), nhãn tiếng Việt.
// Giờ hiển thị GIỮ giây (HH:mm:ss) — nhật ký kiểm toán cần thứ tự từng giây, ngoại lệ có chủ ý so với chuẩn 'DD/MM HH:mm'.
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, Input, Select, DatePicker, Button, Tag, Spin, Empty, Tooltip, Pagination, Modal } from 'antd'
import { Shield, RefreshCw, FileSearch, Plus, Edit, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import {
  auditLogService,
  formatChangedFields,
  type AuditLogEntry,
  type AuditLogListParams,
} from '../../services/auditLogService'
import { useAuthStore } from '../../stores/authStore'
import PageState from '../../components/common/PageState'
import { fmtNum } from '../../utils/format'
// Cùng luật với Sidebar (mục 'Nhật ký hệ thống (BGĐ)' executiveOnly): Admin luôn thấy, còn lại level ≤ 3.
// Ai là Admin: MỘT nguồn src/lib/adminAccess.ts (Sidebar + Tài chính dùng chung) — đừng chép lại danh sách email.
import { isAdminUser } from '../../lib/adminAccess'

const { RangePicker } = DatePicker

const TABLE_LABELS: Record<string, string> = {
  sales_orders: '📦 Đơn hàng bán',
}

const ACTION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  INSERT: { label: 'Tạo mới', color: 'green', icon: <Plus size={12} /> },
  UPDATE: { label: 'Cập nhật', color: 'blue', icon: <Edit size={12} /> },
  DELETE: { label: 'Xóa', color: 'red', icon: <Trash2 size={12} /> },
}

export default function AuditLogPage() {
  const user = useAuthStore(s => s.user)
  const isAdmin = isAdminUser(user)
  const userLevel = (user as any)?.position_level ?? 7
  // Trước đây chỉ xét level ≤ 3 → Admin có level > 3 (hoặc chưa gán chức vụ) thấy mục menu nhưng bấm vào bị chặn
  const isAuthorized = isAdmin || userLevel <= 3   // Admin / BGĐ (level 1-3)

  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>(null)
  // null = chưa tải được → thẻ hiện "—" (không hiện 0 giả)
  const [stats, setStats] = useState<{ today: number; last_7d: number; last_30d: number; by_action: { INSERT: number; UPDATE: number; DELETE: number } } | null>(null)

  // Filters
  const [tableName, setTableName] = useState<string>('all')
  const [action, setAction] = useState<'INSERT' | 'UPDATE' | 'DELETE' | 'all'>('all')
  const [recordCode, setRecordCode] = useState('')
  const [changedByEmail, setChangedByEmail] = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)

  // Detail modal
  const [detailEntry, setDetailEntry] = useState<AuditLogEntry | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: AuditLogListParams = {
        page,
        pageSize,
        tableName: tableName === 'all' ? undefined : tableName,
        action,
        recordCode: recordCode || undefined,
        changedByEmail: changedByEmail || undefined,
        dateFrom: dateRange?.[0]?.format('YYYY-MM-DD'),
        dateTo: dateRange?.[1]?.format('YYYY-MM-DD'),
      }
      const res = await auditLogService.getList(params)
      setEntries(res.data)
      setTotal(res.total)
      setLoadError(null)
    } catch (e: any) {
      console.error(e)
      // Lỗi tải ≠ "không có sự kiện" — hiện khối lỗi + Thử lại
      setLoadError(e)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, tableName, action, recordCode, changedByEmail, dateRange])

  useEffect(() => {
    if (isAuthorized) fetchData()
  }, [fetchData, isAuthorized])

  useEffect(() => {
    if (isAuthorized) {
      auditLogService.getStats().then(setStats).catch((e) => { console.error(e); setStats(null) })
    }
  }, [isAuthorized])

  if (!isAuthorized) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Shield size={48} style={{ color: '#cf1322', margin: '0 auto 16px' }} />
        <h2 style={{ color: '#cf1322' }}>Không có quyền truy cập</h2>
        <p style={{ color: '#6b7280' }}>
          Nhật ký hệ thống chỉ dành cho <strong>Admin</strong> và <strong>Ban Giám Đốc</strong> (level 1-3).
          <br />
          Liên hệ Admin nếu cần quyền.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={20} style={{ color: '#1B4D3E' }} />
            <span style={{ color: '#1B4D3E', fontSize: 17, fontWeight: 700 }}>
              Nhật ký hệ thống — Lịch sử ai chỉnh sửa gì
            </span>
            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>
              (chỉ Admin + BGĐ thấy)
            </span>
          </div>
        }
        extra={
          <Button icon={<RefreshCw size={14} />} onClick={fetchData} loading={loading} size="small">
            Tải lại
          </Button>
        }
        style={{ borderRadius: 12 }}
        bodyStyle={{ padding: 14 }}
      >
        {/* Stats summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}>
          <StatCard label="Sự kiện hôm nay" value={stats?.today} color="#1B4D3E" />
          <StatCard label="7 ngày" value={stats?.last_7d} color="#0a72ef" />
          <StatCard label="30 ngày" value={stats?.last_30d} color="#6366f1" />
          <StatCard label="🟢 Tạo mới (30 ngày)" value={stats?.by_action.INSERT} color="#10b981" />
          <StatCard label="🔵 Cập nhật (30 ngày)" value={stats?.by_action.UPDATE} color="#0a72ef" />
          <StatCard label="🔴 Xóa (30 ngày)" value={stats?.by_action.DELETE} color="#cf1322" />
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          padding: 12,
          background: '#f8f9fa',
          borderRadius: 8,
          marginBottom: 14,
          alignItems: 'center',
        }}>
          <Select
            value={tableName}
            onChange={(v) => { setTableName(v); setPage(1) }}
            style={{ width: 200 }}
            size="small"
            options={[
              { value: 'all', label: 'Tất cả phân hệ' },
              { value: 'sales_orders', label: '📦 Đơn hàng bán' },
            ]}
          />
          <Select
            value={action}
            onChange={(v) => { setAction(v); setPage(1) }}
            style={{ width: 140 }}
            size="small"
            options={[
              { value: 'all', label: 'Tất cả thao tác' },
              { value: 'INSERT', label: '🟢 Tạo mới' },
              { value: 'UPDATE', label: '🔵 Cập nhật' },
              { value: 'DELETE', label: '🔴 Xóa' },
            ]}
          />
          <Input.Search
            placeholder="Mã đơn (vd SO-2026-0021)"
            value={recordCode}
            onChange={(e) => setRecordCode(e.target.value)}
            onSearch={() => { setPage(1); fetchData() }}
            style={{ width: 220 }}
            size="small"
            allowClear
          />
          <Input.Search
            placeholder="Email người sửa"
            value={changedByEmail}
            onChange={(e) => setChangedByEmail(e.target.value)}
            onSearch={() => { setPage(1); fetchData() }}
            style={{ width: 220 }}
            size="small"
            allowClear
          />
          <RangePicker
            value={dateRange as any}
            onChange={(d) => { setDateRange(d as any); setPage(1) }}
            size="small"
            style={{ width: 240 }}
            placeholder={['Từ ngày', 'Đến ngày']}
          />
        </div>

        {/* Table — lỗi xét TRƯỚC trống */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : loadError ? (
          <PageState error={loadError} onRetry={fetchData} />
        ) : entries.length === 0 ? (
          <Empty description="Không có sự kiện nào khớp bộ lọc" style={{ padding: 40 }} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                <tr style={{ background: '#fafafa', textAlign: 'left' }}>
                  <Th>Thời gian</Th>
                  <Th>Phân hệ</Th>
                  <Th>Thao tác</Th>
                  <Th>Bản ghi</Th>
                  <Th>Người sửa</Th>
                  <Th>Trường thay đổi</Th>
                  <Th align="right">Chi tiết</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const meta = ACTION_META[e.action] || ACTION_META.UPDATE
                  return (
                    <tr key={e.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <Td>
                        <div style={{ fontSize: 12, color: '#374151' }}>
                          {dayjs(e.changed_at).format('DD/MM/YYYY')}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>
                          {dayjs(e.changed_at).format('HH:mm:ss')}
                        </div>
                      </Td>
                      <Td>
                        <span style={{ fontSize: 12 }}>
                          {TABLE_LABELS[e.table_name] || e.table_name}
                        </span>
                      </Td>
                      <Td>
                        <Tag color={meta.color} style={{ marginInlineEnd: 0, fontSize: 11, fontWeight: 600 }} icon={meta.icon}>
                          {meta.label}
                        </Tag>
                      </Td>
                      <Td>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>
                          {e.record_code || e.record_id.substring(0, 8)}
                        </span>
                      </Td>
                      <Td>
                        <div style={{ fontSize: 12 }}>{e.changed_by_name || '—'}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>
                          {e.changed_by_email || ''}
                        </div>
                      </Td>
                      <Td>
                        <Tooltip title={formatChangedFields(e.changed_fields, 50)} mouseEnterDelay={0.5}>
                          <span style={{ fontSize: 11, color: '#6b7280', maxWidth: 360, display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {formatChangedFields(e.changed_fields, 3)}
                          </span>
                        </Tooltip>
                      </Td>
                      <Td align="right">
                        <Button
                          type="link"
                          size="small"
                          icon={<FileSearch size={12} />}
                          onClick={() => setDetailEntry(e)}
                        >
                          Xem
                        </Button>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loadError && total > pageSize && (
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={setPage}
              showSizeChanger={false}
              showTotal={(t) => `Tổng ${t} sự kiện`}
              size="small"
            />
          </div>
        )}
      </Card>

      {/* Detail modal */}
      <Modal
        title={
          detailEntry ? (
            <span>
              {ACTION_META[detailEntry.action]?.label || detailEntry.action}
              {' '}
              <code style={{ fontFamily: 'monospace', fontSize: 12, background: '#f3f4f6', padding: '2px 6px', borderRadius: 3 }}>
                {detailEntry.record_code}
              </code>
              {' '}
              — bởi {detailEntry.changed_by_name || detailEntry.changed_by_email}
            </span>
          ) : null
        }
        open={!!detailEntry}
        onCancel={() => setDetailEntry(null)}
        footer={null}
        width={800}
      >
        {detailEntry && <DetailView entry={detailEntry} />}
      </Modal>
    </div>
  )
}

// ── Helpers ──

interface ThProps { children: React.ReactNode; align?: 'left' | 'right' | 'center' }
function Th({ children, align = 'left' }: ThProps) {
  return (
    <th style={{ padding: '8px 10px', fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: align }}>
      {children}
    </th>
  )
}

interface TdProps { children: React.ReactNode; align?: 'left' | 'right' | 'center' }
function Td({ children, align = 'left' }: TdProps) {
  return (
    <td style={{ padding: '10px', textAlign: align, verticalAlign: 'middle' }}>
      {children}
    </td>
  )
}

function StatCard({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  return (
    <div style={{ padding: '10px 14px', background: '#fff', border: '1px solid #e4e4e7', borderLeft: `3px solid ${color}`, borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{fmtNum(value)}</div>
    </div>
  )
}

function DetailView({ entry }: { entry: AuditLogEntry }) {
  const fields = entry.changed_fields ? Object.entries(entry.changed_fields) : []
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, fontSize: 13, marginBottom: 16 }}>
        <strong>Thời gian:</strong>
        <span>{dayjs(entry.changed_at).format('DD/MM/YYYY HH:mm:ss')}</span>
        <strong>Phân hệ:</strong>
        <span>{TABLE_LABELS[entry.table_name] || entry.table_name}</span>
        <strong>Bản ghi:</strong>
        <code style={{ fontFamily: 'monospace' }}>{entry.record_code}</code>
        <strong>Thao tác:</strong>
        <Tag color={ACTION_META[entry.action]?.color}>{ACTION_META[entry.action]?.label}</Tag>
        <strong>Người sửa:</strong>
        <div>
          <div>{entry.changed_by_name || '—'}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>
            {entry.changed_by_email}
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
        <h4 style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>
          Trường thay đổi ({fields.length})
        </h4>
        {fields.length === 0 ? (
          <Empty description="Không có trường nào thay đổi" />
        ) : (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <Th>Trường</Th>
                <Th>Giá trị cũ</Th>
                <Th>→</Th>
                <Th>Giá trị mới</Th>
              </tr>
            </thead>
            <tbody>
              {fields.map(([field, { old: o, new: n }]) => (
                <tr key={field} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <Td>
                    <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{field}</code>
                  </Td>
                  <Td>
                    <span style={{ color: '#cf1322', fontFamily: 'monospace' }}>
                      {o === null || o === 'null' ? '∅' : JSON.stringify(o)}
                    </span>
                  </Td>
                  <Td>→</Td>
                  <Td>
                    <span style={{ color: '#10b981', fontFamily: 'monospace' }}>
                      {n === null || n === 'null' ? '∅' : JSON.stringify(n)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
