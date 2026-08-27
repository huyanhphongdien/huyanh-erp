// ============================================================================
// BẢNG TIẾN ĐỘ TỪNG LÔ của MỘT đơn — dùng trong tab Tiến độ của panel chi tiết
// File: src/components/sales/LotProgressTable.tsx
//
// VÌ SAO CÓ: trước 27/08/2026 hai nửa của cùng một câu hỏi nằm cách nhau ba tab —
// nửa GIAO ở tab Đóng gói, nửa TIỀN ở cuối tab Tài chính. Tab Tiến độ, tab duy nhất
// có nhiệm vụ trả lời "đơn này tới đâu rồi", không có lấy một chữ "lô".
//
// ⚠ BỐN trạng thái, KHÔNG được vẽ giống nhau:
//   đang tải       → khung xám, không kết luận
//   tải hỏng       → nói thẳng là hỏng
//   đã tải, 0 lô   → "đơn chưa chia lô"
//   đã tải, có lô  → bảng
// Gộp ba cái đầu vào cái thứ ba là đúng lỗi undefined ≠ 0 mà LotChipStrip đã tự cảnh
// báo và tự né bằng máng gạch chéo.
//
// ⚠ Dòng "Chưa gán lô" ở cuối là BẮT BUỘC khi có container chưa chia. Thiếu nó thì tổng
// cấp lô không bao giờ khớp tổng cấp đơn và người dùng kết luận hệ thống sai.
// ============================================================================
import { Card, Table, Tag, Typography, Tooltip, Skeleton, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { SalesOrder } from '../../services/sales/salesTypes'
import { useOrderLotAxes } from '../../hooks/useOrderLotAxes'
import LotChipStrip, { mergeLotAxes, type LotChipData } from './LotChipStrip'

const { Text } = Typography

const OVER = '#c2410c'   // cùng màu "thu vượt" với LotChipStrip — hai nơi phải nói giống nhau

const fmtUSD = (v: number | null | undefined): string =>
  v == null ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const fmtTon = (kg: number | null | undefined): string =>
  !kg ? '—' : `${(kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} T`

const Frame = ({ children }: { children: React.ReactNode }) => (
  <Card size="small" title="📦 Tiến độ từng lô" style={{ marginBottom: 12 }}>{children}</Card>
)

export default function LotProgressTable({ order }: { order: SalesOrder }) {
  // Tự nạp, không nhận qua prop — xem lý do ở đầu useOrderLotAxes.ts.
  // Token = updated_at: đơn được lưu / realtime bắn về là bảng tự nạp lại.
  const { lotProgress, lotPay, loading, deliveryFailed, payFailed } =
    useOrderLotAxes(order.id, order.updated_at)

  // CHƯA BIẾT — chưa được nói gì về lô.
  if (loading && !lotProgress && !lotPay) {
    return <Frame><Skeleton active title={false} paragraph={{ rows: 2 }} /></Frame>
  }
  if (deliveryFailed && payFailed) {
    return (
      <Frame>
        <Alert type="warning" showIcon message="Không tải được tiến độ lô"
          description="Chưa kết luận được đơn này đã chia lô hay chưa. Tải lại trang để thử lại." />
      </Frame>
    )
  }

  const rows = mergeLotAxes(lotProgress?.deliveryByLot, lotPay?.moneyByLot)

  // Đơn chưa chia lô: đừng vẽ bảng rỗng, nói thẳng ra và chỉ chỗ đi chia.
  if (rows.length === 0) {
    return (
      <Frame>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Đơn này <strong>chưa chia lô</strong>
          {lotProgress && lotProgress.contsTotal > 0
            ? ` — ${lotProgress.contsDelivered}/${lotProgress.contsTotal} container đã giao.`
            : '.'}
          {' '}Chia lô ở tab <strong>Đóng gói</strong> để theo dõi giao hàng và thu tiền theo từng lô.
        </Text>
      </Frame>
    )
  }

  const cols: ColumnsType<LotChipData> = [
    {
      // Viên chip đã in sẵn số lô — chữ "Lô 12" là nhắc lại, nhưng giữ cho dễ đọc thành tiếng.
      title: 'Lô', dataIndex: 'lotNo', width: 104,
      render: (v: number, r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          <LotChipStrip lots={[r]} size="m" />
          <strong>Lô {v}</strong>
        </span>
      ),
    },
    {
      title: 'Container', width: 92, align: 'center',
      render: (_, r) => r.contsTotal > 0
        ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.contsDelivered}/{r.contsTotal}</span>
        : <Text type="secondary">chưa gán</Text>,
    },
    {
      title: 'Tấn', width: 130, align: 'right',
      render: (_, r) => r.netKgTotal > 0
        ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmtTon(r.netKgDelivered)} <Text type="secondary">/ {fmtTon(r.netKgTotal)}</Text>
          </span>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Trị giá lô', width: 132, align: 'right',
      render: (_, r) => {
        if (r.valueUsd === undefined) return <Text type="secondary">—</Text>
        if (r.valueUsd <= 0) return (
          <Tooltip title="Lô chưa có trị giá — không kết luận được đã thu đủ hay chưa. Chốt ở trang Sổ lô.">
            <Text type="warning">chưa chốt</Text>
          </Tooltip>
        )
        // Có số, nhưng CHỐT hay TẠM TÍNH là hai chuyện khác nhau: số tạm tính =
        // net/1000 × đơn giá, mà net bị ghi đè mỗi lần gán lại container.
        if (r.valueLocked) return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(r.valueUsd)}</span>
        return (
          <Tooltip title="TẠM TÍNH theo cân hiện tại (net/1000 × đơn giá) — chưa ai chốt. Con số này đổi mỗi lần gán lại container, kể cả sau khi đã phát hoá đơn. Chốt ở trang Sổ lô.">
            <span style={{ fontVariantNumeric: 'tabular-nums', color: '#8a5a05', cursor: 'help' }}>
              {fmtUSD(r.valueUsd)} <span style={{ fontSize: 10.5, fontWeight: 600 }}>~</span>
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: 'Đã thu', width: 130, align: 'right',
      render: (_, r) => {
        const paid = r.paidUsd ?? 0
        const val = r.valueUsd ?? 0
        const over = val > 0 && paid > val + 0.01
        return (
          <span style={{
            fontVariantNumeric: 'tabular-nums',
            color: over ? OVER : paid > 0 ? '#15803d' : '#9ca3af',
          }}>
            {fmtUSD(paid)}
            {val > 0 && <Text type="secondary" style={{ fontSize: 11 }}> ({Math.round((paid / val) * 100)}%)</Text>}
          </span>
        )
      },
    },
    {
      title: 'Trạng thái', width: 150,
      render: (_, r) => {
        const paid = r.paidUsd ?? 0
        const val = r.valueUsd ?? 0
        // Tính LẠI tại chỗ từ tiền so với trị giá — KHÔNG đọc lot_status, cột đó là số
        // nhập tay và đang trái chứng cứ ở gần nửa số lô.
        // Ngưỡng 0,01 phải giống hệt LotChipStrip, nếu không viên chip báo "thu vượt"
        // mà thẻ ngay cạnh lại xanh "đã thu đủ".
        const tag = val <= 0 ? <Tag>chưa có mẫu số</Tag>
          : paid > val + 0.01 ? <Tag color="orange">thu vượt</Tag>
          : paid + 0.01 >= val ? <Tag color="green">đã thu đủ</Tag>
          : paid > 0 ? <Tag color="gold">thu 1 phần</Tag>
          : <Tag color="red">chưa thu</Tag>
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {val > 0 && !r.valueLocked
              ? <Tooltip title="Kết luận này dựa trên mẫu số TẠM TÍNH, chưa chốt — chốt trị giá lô rồi hãy tin.">
                  <span style={{ cursor: 'help' }}>{tag}</span>
                </Tooltip>
              : tag}
            {r.mismatch && (
              <Tooltip title="Ghi chú trạng thái của lô trái với chứng cứ giao hàng.">
                <span style={{ color: '#dc2626', fontWeight: 700, cursor: 'help' }}>⚠</span>
              </Tooltip>
            )}
          </span>
        )
      },
    },
  ]

  const totalVal = rows.reduce((s, r) => s + (r.valueUsd ?? 0), 0)
  // Tổng có lẫn số tạm tính thì bản thân tổng cũng là số tạm tính — phải nói ra.
  const totalEstimated = rows.some((r) => (r.valueUsd ?? 0) > 0 && !r.valueLocked)
  const totalPaid = rows.reduce((s, r) => s + (r.paidUsd ?? 0), 0)
  const lotsDelivered = rows.filter((r) => r.contsTotal > 0 && r.contsDelivered === r.contsTotal).length
  const lotsPaid = rows.filter((r) => (r.valueUsd ?? 0) > 0 && (r.paidUsd ?? 0) + 0.01 >= (r.valueUsd ?? 0)).length

  const contract = order.total_value_usd
  const gap = contract != null ? totalVal - contract : null

  return (
    <Frame>
      {payFailed && (
        <Alert type="warning" showIcon style={{ marginBottom: 8 }} message="Không tải được phần TIỀN theo lô — cột Đã thu / Trạng thái bên dưới chưa kết luận được." />
      )}
      <Table<LotChipData>
        rowKey="lotNo"
        size="small"
        bordered
        pagination={false}
        columns={cols}
        dataSource={rows}
        scroll={{ x: 760 }}
      />

      {/* Container chưa gán lô — không nằm trong dòng nào ở trên. */}
      {lotProgress && lotProgress.contsNoLot > 0 && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef3c7', borderRadius: 6, fontSize: 12.5 }}>
          <strong>Chưa gán lô:</strong> {lotProgress.contsNoLotDelivered}/{lotProgress.contsNoLot} container
          {lotProgress.netKgNoLot > 0 && <> · {fmtTon(lotProgress.netKgNoLotDelivered)} / {fmtTon(lotProgress.netKgNoLot)}</>}
          {' '}— phần này <strong>không nằm trong bảng trên</strong>. Gán lô ở tab Đóng gói.
        </div>
      )}

      <div style={{
        marginTop: 8, padding: '8px 10px', background: '#f0fdf4', borderRadius: 6,
        fontSize: 12.5, display: 'flex', gap: 18, flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums',
      }}>
        <span>🟢 Đã giao <strong>{lotsDelivered}/{rows.length}</strong> lô</span>
        <span>💵 Đã thu <strong>{lotsPaid}/{rows.length}</strong> lô</span>
        <span>
          <strong>{fmtUSD(totalPaid)}</strong> / {fmtUSD(totalVal)}
          {totalEstimated && (
            <Tooltip title="Có lô chưa chốt trị giá — mẫu số này là tạm tính theo cân hiện tại và sẽ đổi nếu gán lại container.">
              <span style={{ color: '#8a5a05', cursor: 'help', fontWeight: 600 }}> ~</span>
            </Tooltip>
          )}
        </span>
        {/* Lệch với trị giá HĐ có HAI chiều nghĩa khác hẳn nhau, đừng trấn an cả hai:
            THIẾU thường là còn container chưa gán lô; VƯỢT là cân thật hơn danh nghĩa. */}
        {gap != null && Math.abs(gap) > 0.01 && (
          gap < 0 ? (
            <Tooltip title={lotProgress && lotProgress.contsNoLot > 0
              ? `Còn ${lotProgress.contsNoLot} container chưa gán lô — phần đó chưa nằm trong tổng lô.`
              : 'Tổng trị giá các lô còn THIẾU so với hợp đồng — kiểm lại phần hàng chưa chia lô.'}>
              <span style={{ color: OVER, cursor: 'help' }}>
                thiếu {fmtUSD(-gap)} so với HĐ {fmtUSD(contract)}
              </span>
            </Tooltip>
          ) : (
            <Tooltip title="Trị giá hợp đồng tính theo khối lượng danh nghĩa lúc ký; trị giá lô là cân thật trên Commercial Invoice. Vượt là bình thường.">
              <span style={{ color: '#8a5a05', cursor: 'help' }}>
                vượt {fmtUSD(gap)} so với HĐ {fmtUSD(contract)}
              </span>
            </Tooltip>
          )
        )}
      </div>
    </Frame>
  )
}
