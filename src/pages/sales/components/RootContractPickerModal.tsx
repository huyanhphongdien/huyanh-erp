// ============================================================================
// RootContractPickerModal — modal "Mua tiếp theo HĐ đã ký…": chọn HĐ GỐC để tạo đợt mua tiếp
// File: src/pages/sales/components/RootContractPickerModal.tsx (sales_family_parties_p1, owner duyệt 17/11/2026)
//
// Gõ số HĐ hoặc tên người mua (đợi 400 ms) → salesOrderService.searchRootContracts. Mỗi dòng hiện: số HĐ, người mua,
// ngày ký, số file HĐ đã ký (0 → cảnh báo), số đợt của họ, grade · tấn, trạng thái. Ẩn đơn huỷ / đơn chưa có số HĐ.
// Gõ số của một ĐỢT (vd HA20260301) cũng ra HĐ gốc của nó. onPick(root) → nơi gọi mở tab tạo đợt
// (đơn nguồn gợi ý = root.latest_member_id để lấy quy cách mới nhất).
// Dùng ở Kanban (nút tách "Tạo đơn hàng ▾") và trang Khách (lọc sẵn người mua qua buyerId).
// ============================================================================

import { useEffect, useState } from 'react'
import { Input, Modal, Space, Typography } from 'antd'
import { FileDoneOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { salesOrderService, type RootContractOption } from '../../../services/sales/salesOrderService'
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  countryFlag,
  partyShortName,
} from '../../../services/sales/salesTypes'
import { EnumTag } from '../../../components/common/EnumTag'
import PageState from '../../../components/common/PageState'
import { useDebounce } from '../../../hooks/useDebounce'
import { useIsPhone } from '../../../hooks/useIsPhone'
import { fmtDate, fmtNum } from '../../../utils/format'
import { palette } from '../../../theme/palette'

const { Text } = Typography

/** Props modal chọn HĐ gốc để mua tiếp. */
export interface RootContractPickerModalProps {
  open: boolean
  onClose: () => void
  /** Chọn xong một HĐ gốc. Nơi gọi mở tab 'sales-order-continue-<sourceId>' (gợi ý sourceId = root.latest_member_id). */
  onPick: (root: RootContractOption) => void
  /** Lọc sẵn người mua (trang Khách → "Mua tiếp theo HĐ…") */
  buyerId?: string | null
  title?: string
}

export default function RootContractPickerModal({ open, onClose, onPick, buyerId, title }: RootContractPickerModalProps) {
  const isPhone = useIsPhone()
  const [q, setQ] = useState('')
  const debounced = useDebounce(q.trim(), 400)

  useEffect(() => { if (!open) setQ('') }, [open])

  const { data = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['sales-root-contracts', debounced, buyerId || null],
    queryFn: () => salesOrderService.searchRootContracts(debounced, buyerId),
    enabled: open,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,   // giữ danh sách cũ (mờ) trong lúc tìm chuỗi mới
  })

  const pick = (r: RootContractOption) => {
    onPick(r)
    onClose()
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title={title || 'Mua tiếp theo HĐ đã ký — chọn HĐ gốc'}
      width={isPhone ? '100%' : 640}
      style={isPhone ? { top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 } : undefined}
    >
      <Text type="secondary" style={{ display: 'block', fontSize: 13, marginBottom: 10 }}>
        Đợt mua tiếp là một đơn mới gắn vào HĐ đã ký: không ký lại HĐ, chứng từ vẫn ghi số HĐ gốc; tiền, lô, công nợ
        của từng đợt tách riêng. Cùng người mua và cùng đồng tiền với HĐ gốc.
      </Text>
      <Input
        autoFocus
        allowClear
        size="large"
        prefix={<SearchOutlined />}
        placeholder="Gõ số HĐ (vd HA20260302) hoặc tên người mua…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onPressEnter={() => { if (data.length === 1) pick(data[0]) }}
        aria-label="Tìm HĐ gốc"
      />
      <div style={{ marginTop: 12, maxHeight: isPhone ? 'calc(100vh - 230px)' : 440, overflowY: 'auto' }}>
        <PageState
          loading={isLoading}
          error={error}
          onRetry={() => refetch()}
          empty={!isLoading && data.length === 0}
          emptyText={debounced
            ? `Không có HĐ nào khớp "${debounced}" — HĐ đã huỷ hoặc chưa có số HĐ không hiện ở đây`
            : 'Chưa có HĐ nào để mua tiếp'}
          minHeight={140}
        >
          <Space direction="vertical" size={8} style={{ width: '100%', opacity: isFetching ? 0.6 : 1 }}>
            {data.map((r) => {
              const noFile = r.contract_file_count === 0
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => pick(r)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(r) } }}
                  style={{
                    border: `1px solid ${palette.brandBg}`,
                    borderLeft: `3px solid ${palette.brand}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <Text strong style={{ fontFamily: 'monospace', fontSize: 15, overflowWrap: 'anywhere' }}>{r.contract_no}</Text>
                    <Text style={{ overflowWrap: 'anywhere' }}>
                      {countryFlag(r.customer?.country)} {partyShortName(r.customer)}
                    </Text>
                    <EnumTag value={r.status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 4, fontSize: 12.5 }}>
                    <Text type="secondary">{r.contract_date ? `Ký ${fmtDate(r.contract_date)}` : `Đặt ${fmtDate(r.order_date)}`}</Text>
                    {noFile
                      ? <Text type="warning"><FileDoneOutlined /> chưa có file HĐ đã ký</Text>
                      : <Text type="secondary"><FileDoneOutlined /> {r.contract_file_count} file HĐ</Text>}
                    <Text type="secondary">{r.family_size} đợt</Text>
                    <Text type="secondary">{r.grade || '—'} · {fmtNum(r.quantity_tons, 2)} t (đợt 1)</Text>
                    {r.matched_via && <Text type="secondary">khớp qua đợt {r.matched_via}</Text>}
                  </div>
                </div>
              )
            })}
          </Space>
        </PageState>
      </div>
    </Modal>
  )
}
