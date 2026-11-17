// ============================================================================
// ORDER PROGRESS DASHBOARD — Tiến độ tab content (match mock)
// File: src/pages/sales/components/OrderProgressDashboard.tsx
//
// Replaces the legacy single-card "Đang ở stage" với layout dashboard giống
// SALES_ORDERS_SPLIT_VIEW_MOCKUP.html:
//   - SLA alert banner (nếu overdue/at_risk)
//   - Workflow card (Sale → Kiểm tra → Ký) — 3 actor pull từ sales_order_contracts
//   - Activity timeline (gần đây)
//   - Items table
//   - Grid 3 card: Tài chính · Vận chuyển · Liên kết
// Họ HĐ (17/11/2026): thẻ "Quy trình HĐ" của ĐỢT CON ghi "Mua tiếp theo HĐ … — dùng HĐ gốc, không ký mới";
// thẻ "Liên kết" thêm "HĐ gốc" + "Các đợt (n)"; Files Widget ghi "HĐ gốc: n file". Điện thoại: các thẻ xếp dọc.
// ============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Tag, Spin, Modal, message } from 'antd'
import { useIsPhone } from '../../../hooks/useIsPhone'
import { useOpenSalesOrder, useOrderFamily } from './OrderFamilyBlock'
import type { SalesOrder, PackingType } from '../../../services/sales/salesTypes'
import {
  soDisplayCode, polLabel, PACKING_TYPE_LABELS, PAYMENT_TERMS_LABELS, PAYMENT_TERMS_EXTENDED_LABELS,
} from '../../../services/sales/salesTypes'
import { fmtMoney, priceUnitLabel, orderTotalInCurrency } from '../../../services/sales/salesMoney'
import { outstandingUsd } from '../../../services/sales/salesStages'
import { balesFromTons } from '../../../services/sales/baleMath'
import {
  salesContractWorkflowService,
  type SalesOrderContract,
} from '../../../services/sales/salesContractWorkflowService'
import { DEFAULT_BANK, amountToWords, type ContractFormData } from '../../../services/sales/contractGeneratorService'
import { fmtDate, fmtDateTime } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import OrderFilesWidget from './OrderFilesWidget'
import { CONTRACT_STATUS_LABELS } from './ContractWorkflowSection'
import LotProgressTable from '../../../components/sales/LotProgressTable'
import { palette } from '../../../theme/palette'

const PRIMARY = '#1B4D3E'

/** USD 0 số lẻ cho thẻ tổng quan (luôn có "$"). */
const fmtFull = (v: number | undefined | null) => fmtMoney(v, 'USD', { decimals: 0 })

// Trạng thái đơn mà hàng CHƯA rời nhà máy — chỉ những đơn này mới "quá hạn giao" được
const NOT_YET_SHIPPED = ['draft', 'confirmed', 'producing', 'ready', 'packing']

interface Props {
  order: SalesOrder
  onChanged?: () => void
  /** Callback khi user click 1 folder trong Files Widget → switch tab.
   * subType (tuỳ chọn, chỉ áp dụng cho tab 'contract') để scroll tới đúng nhóm HĐ. */
  onNavigateTab?: (tabKey: string, subType?: 'sent_to_customer' | 'ha_signed' | 'final_signed') => void
  // Tiến độ theo lô KHÔNG đi qua đây: <LotProgressTable> tự nạp bằng useOrderLotAxes.
  // Bản trước nhận qua prop và route /sales/orders/:orderId quên truyền — bảng im lặng
  // khẳng định "chưa chia lô" cho 9 đơn có lô thật. Xem đầu useOrderLotAxes.ts.
}

export default function OrderProgressDashboard({ order, onChanged, onNavigateTab }: Props) {
  const navigate = useNavigate()
  const isPhone = useIsPhone()
  const [contracts, setContracts] = useState<SalesOrderContract[]>([])
  const [loadingContracts, setLoadingContracts] = useState(true)
  const [creatingContract, setCreatingContract] = useState(false)

  // Họ HĐ (chỉ khi đã migration — fam.ready)
  const fam = useOrderFamily(order)
  const openOrder = useOpenSalesOrder()
  const isChild = fam.ready && fam.isChild
  const openRoot = () => { if (order.parent_order_id) openOrder(order.parent_order_id, fam.rootNo || 'gốc') }
  // Điện thoại: lưới 2/3 cột → 1 cột (minmax(0,…) để nội dung dài không đẩy tràn ngang)
  const twoColsR: React.CSSProperties = { ...twoCols, gridTemplateColumns: isPhone ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))' }
  const threeColsR: React.CSSProperties = { ...threeCols, gridTemplateColumns: isPhone ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))' }

  useEffect(() => {
    setLoadingContracts(true)
    salesContractWorkflowService
      .listBySalesOrder(order.id)
      .then(setContracts)
      .catch(() => setContracts([]))
      .finally(() => setLoadingContracts(false))
  }, [order.id])

  // Build form_data từ order fields (cho "Tạo HĐ workflow" — đơn draft chưa có HĐ)
  const buildFormDataFromOrder = (): Partial<ContractFormData> => {
    const o = order as SalesOrder & {
      incoterm?: string; port_of_loading?: string; port_of_destination?: string;
      container_count?: number; container_type?: string;
      total_value_usd?: number; bales_per_container?: number; bale_weight_kg?: number;
      shipment_time?: string; payment_terms_note?: string;
      packing_type?: string; packing_note?: string;
    }
    const isFOB = ['FOB', 'EXW'].includes((o.incoterm || 'FOB').toUpperCase())
    const totalUSD = o.total_value_usd || (o.quantity_tons || 0) * (o.unit_price || 0)
    const bales = balesFromTons(o.quantity_tons, o.bale_weight_kg)
    return {
      contract_no: o.contract_no || o.code || '',
      contract_date: o.contract_date ? new Date(o.contract_date).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
      }) : '',
      buyer_name: o.customer?.name || '',
      buyer_address: (o.customer as { address?: string } | undefined)?.address || '',
      buyer_phone: (o.customer as { phone?: string } | undefined)?.phone || '',
      grade: o.grade || '',
      quantity: o.quantity_tons ? o.quantity_tons.toFixed(2) : '',
      unit_price: o.unit_price ? o.unit_price.toLocaleString('en-US') : '',
      amount: totalUSD ? totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
      amount_words: totalUSD ? amountToWords(totalUSD) : '',
      incoterm: o.incoterm || 'FOB',
      pol: o.port_of_loading || '',
      pod: isFOB ? '' : (o.port_of_destination || ''),
      packing_type: o.packing_type || 'loose_bale',
      packing_desc: o.packing_note || (() => {
        const kg = o.bale_weight_kg || 35
        const pt = o.packing_type || 'loose_bale'
        const map: Record<string, string> = {
          loose_bale: 'Loose bales packing',
          sw_pallet: 'SW Pallet packing',
          sw_plastic_pallet: 'Shrink Wrapped plastic pallets',
          sw_wooden_pallet: 'Shrink Wrapped wooden pallets',
          wooden_pallet: 'Wooden pallets (fumigated)',
          plastic_pallet: 'Plastic pallets',
          metal_box: 'Metal box packing',
        }
        const human = map[pt] || 'Loose bales packing'
        return `${kg} kg/bale, ${human}`
      })(),
      bales_total: bales ? bales.toLocaleString('en-US') : '',
      // pallets_total: chỉ tính khi pallet packing, standard 36 bales/pallet
      pallets_total: (() => {
        const pt = o.packing_type || ''
        if (!['wooden_pallet', 'sw_pallet', 'sw_plastic_pallet', 'sw_wooden_pallet', 'plastic_pallet'].includes(pt)) return ''
        return bales > 0 ? String(Math.ceil(bales / 36)) : ''
      })(),
      containers: String(o.container_count || ''),
      cont_type: o.container_type === '40ft' ? '40HC' : '20DC',
      shipment_time: o.shipment_time || '',
      partial: 'Not Allowed',
      trans: 'Allowed',
      payment: o.payment_terms_note || 'LC at sight',
      payment_extra: '',
      claims_days: '20',
      arbitration: 'SICOM Singapore',
      freight_mark: isFOB ? 'freight Collect' : 'freight prepaid',
      ...DEFAULT_BANK,
    }
  }

  const handleCreateContract = () => {
    Modal.confirm({
      title: 'Tạo HĐ workflow cho đơn này?',
      content: (
        <div style={{ fontSize: 13 }}>
          <p>Hệ thống sẽ tạo HĐ workflow từ data của đơn hàng:</p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Số HĐ: <strong>{soDisplayCode(order)}</strong></li>
            <li>Khách hàng: <strong>{order.customer?.name || '—'}</strong></li>
            <li>Tấn: <strong>{order.quantity_tons}</strong> · Grade: <strong>{order.grade}</strong></li>
          </ul>
          <p style={{ marginTop: 12, color: '#d46b08' }}>
            ⚠️ Phú LV sẽ nhận trong queue kiểm tra để nhập bank info + duyệt.
          </p>
        </div>
      ),
      okText: 'Tạo + Trình Phú LV',
      cancelText: 'Huỷ',
      okButtonProps: { style: { background: PRIMARY, borderColor: PRIMARY } },
      onOk: async () => {
        setCreatingContract(true)
        try {
          const formData = buildFormDataFromOrder()
          await salesContractWorkflowService.createDraftAndSubmit(order.id, formData)
          message.success('Đã tạo HĐ workflow + trình Phú LV')
          // Reload contracts
          const rows = await salesContractWorkflowService.listBySalesOrder(order.id)
          setContracts(rows)
          onChanged?.()
        } catch (e: unknown) {
          message.error(dichLoiHeThong(e, 'Tạo HĐ thất bại'))
        } finally {
          setCreatingContract(false)
        }
      },
    })
  }

  // Tính SLA + overdue — chỉ với đơn hàng CHƯA xuất (đơn đã xuất/giao/thu tiền mà ngày giao đã
  // qua thì không phải "quá hạn giao"; trước đây banner đỏ hiện mãi cho cả đơn đã giao xong).
  let slaOver: number | null = null
  let slaTitle: string | null = null
  if (order.delivery_date && NOT_YET_SHIPPED.includes(order.status)) {
    const days = Math.floor((Date.now() - new Date(order.delivery_date).getTime()) / 86400000)
    if (days > 0) {
      slaOver = days
      slaTitle = `Đơn này quá hạn giao (ngày giao ${fmtDate(order.delivery_date)})`
    }
  }

  const latest = contracts[0]
  const orderItems = (order as { items?: unknown[] }).items as Array<{
    grade?: string; quantity_tons?: number; unit_price?: number;
    bale_weight_kg?: number; bales_per_container?: number;
    packing_type?: string; payment_terms?: string
  }> | undefined

  return (
    <div style={{ padding: '12px 4px' }}>

      {/* ═══ 0. FILES WIDGET (6 folder dùng chung — nổi bật trên cùng) ═══
          Đợt mua tiếp: thư mục Hợp đồng ghi thêm "HĐ gốc: n file" (HĐ đã ký nằm ở đơn gốc) */}
      <OrderFilesWidget
        salesOrderId={order.id}
        onNavigateTab={onNavigateTab}
        rootOrderId={isChild ? order.parent_order_id : null}
        rootLabel={isChild ? fam.rootNo : undefined}
      />

      {/* ═══ 0b. TIẾN ĐỘ TỪNG LÔ ═══
          Đây là tab DUY NHẤT có nhiệm vụ trả lời "đơn này tới đâu rồi", nhưng trước
          27/08/2026 nó không có lấy một chữ "lô". Nửa GIAO nằm ở tab Đóng gói, nửa TIỀN
          nằm cuối tab Tài chính — cách nhau ba tab, không ai ghép được.
          Bảng này ghép hai nửa lại, ngay khối đầu tiên. */}
      <LotProgressTable order={order} />

      {/* ═══ 1. SLA ALERT ═══ */}
      {slaOver !== null && (
        <div style={alertBanner}>
          <span style={{ fontSize: 20 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#cf1322', marginBottom: 4 }}>{slaTitle}</div>
            <div style={{ fontSize: 12, color: '#595959' }}>
              Đã quá <strong>{slaOver} ngày</strong>. Đề xuất: liên hệ Logistics + KH để dời ETD; cập nhật shipment plan.
            </div>
          </div>
          {/* Trước đây nút "→ Xử lý ngay" không có onClick (nút chết) — nay mở tab Vận chuyển để dời ETD */}
          {onNavigateTab && (
            <Button size="small" type="primary" danger onClick={() => onNavigateTab('shipping')}>
              → Mở tab Vận chuyển
            </Button>
          )}
        </div>
      )}

      {/* ═══ 2. WORKFLOW CARD + ACTIVITY TIMELINE (2 cols) ═══ */}
      <div style={twoColsR}>

        {/* Workflow */}
        <div style={{
          ...card,
          background: 'linear-gradient(135deg, #fff 0%, #f0f9f4 100%)',
          border: '1px solid #d9f4e3',
        }}>
          <div style={cardTitle}>📋 Quy trình HĐ</div>
          {/* Đợt mua tiếp: không ký HĐ mới — dùng HĐ gốc */}
          {isChild && (
            <div style={{ fontSize: 12, padding: 8, background: palette.brandBg, borderRadius: 6, marginBottom: latest ? 8 : 0, color: palette.brand }}>
              ⧉ <strong>Mua tiếp theo HĐ {fam.rootNo || 'gốc'}</strong>
              {order.parent?.contract_date ? ` (ký ${fmtDate(order.parent.contract_date)})` : ''} — dùng HĐ gốc, không ký mới.
              {' '}<a onClick={openRoot} style={{ color: palette.brand, textDecoration: 'underline' }}>Mở HĐ gốc</a>
            </div>
          )}
          {loadingContracts ? (
            <Spin size="small" />
          ) : !latest ? (isChild ? null : (
            <div style={empty}>
              {/* Bỏ hẳn quy trình duyệt/ký (2026-08-05) — HĐ quản lý trực tiếp ở tab "Hợp đồng" */}
              <div style={{ fontSize: 12, color: '#8c8c8c', padding: 8, background: '#fafafa',
                            borderRadius: 6, textAlign: 'left', maxWidth: 340 }}>
                📁 HĐ quản lý trực tiếp ở tab <strong>"Hợp đồng"</strong> — đính kèm file HĐ đã ký (Word/PDF).
                <br />
                <span style={{ color: '#bfbfbf' }}>Không còn bước trình duyệt/ký qua queue.</span>
              </div>
            </div>
          )) : (
            <>
              <ActorRow
                icon={latest.created_by ? '✓' : '·'}
                done={!!latest.submitted_at}
                title={`Sale${latest.created_by_employee ? ` (${latest.created_by_employee.full_name})` : ''} ${latest.submitted_at ? 'đã lên HĐ' : 'tạo HĐ'}`}
                meta={latest.submitted_at
                  ? `${fmtDateTime(latest.submitted_at)} · rev #${latest.revision_no}`
                  : 'Chưa trình'}
              />

              {latest.status === 'reviewing' && (
                <ActorRow
                  icon="⌛"
                  current
                  title={`${latest.reviewer_employee?.full_name || 'Kiểm tra'} đang duyệt`}
                  meta={`Đã ${humanDuration(latest.submitted_at)} từ lúc trình`}
                  cta="→ Vào duyệt"
                  ctaOnClick={() => navigate('/sales/contracts/review')}
                />
              )}
              {latest.status === 'rejected' && (
                <ActorRow
                  icon="✗"
                  reject
                  title={`${latest.reviewer_employee?.full_name || 'Kiểm tra'} trả lại`}
                  meta={latest.rejected_reason ? `"${latest.rejected_reason}"` : 'Không có lý do'}
                />
              )}
              {(latest.status === 'approved' || latest.status === 'signed' || latest.status === 'archived') && (
                <ActorRow
                  icon="✓"
                  done
                  title={`${latest.reviewer_employee?.full_name || 'Kiểm tra'} duyệt`}
                  meta={fmtDateTime(latest.reviewed_at)}
                />
              )}

              {latest.status === 'approved' && (
                <ActorRow
                  icon="⌛"
                  current
                  title="Mr. Trung / Mr. Huy chờ ký"
                  meta={`Đã duyệt ${humanDuration(latest.reviewed_at)}`}
                  cta="→ Vào trình ký"
                  ctaOnClick={() => navigate('/sales/contracts/sign')}
                />
              )}
              {(latest.status === 'signed' || latest.status === 'archived') && (
                <ActorRow
                  icon="✓"
                  done
                  title={`${latest.signer_employee?.full_name || 'Trình ký'} ký xong`}
                  meta={fmtDateTime(latest.signed_at)}
                />
              )}
              {(latest.status === 'drafting' || latest.status === 'reviewing' || latest.status === 'rejected') && (
                <ActorRow
                  icon="3"
                  pending
                  title="Mr. Trung / Mr. Huy sẽ ký"
                  meta="Sau khi Kiểm tra duyệt"
                />
              )}
            </>
          )}
        </div>

        {/* Activity timeline */}
        <div style={card}>
          <div style={cardTitle}>⏰ Lịch sử gần đây</div>
          {contracts.length === 0 ? (
            <div style={empty}>Chưa có hoạt động</div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{
                position: 'absolute', left: 7, top: 8, bottom: 8,
                width: 2, background: '#e8e8e8',
              }} />
              {contracts.flatMap(buildTimelineItems).slice(0, 5).map((item, idx) => (
                <div key={idx} style={{ position: 'relative', paddingBottom: 14 }}>
                  <div style={{
                    position: 'absolute', left: -20, top: 4, width: 14, height: 14,
                    borderRadius: 7, background: item.color, border: '2px solid #fff',
                    boxShadow: `0 0 0 2px ${item.color}`,
                  }} />
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>{item.meta}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ 3. ITEMS TABLE ═══ */}
      {orderItems && orderItems.length > 0 && (
        <>
          <div style={sectionH}>📦 Chi tiết hàng</div>
          {/* overflowX auto: bảng 7 cột cuộn trong thẻ trên điện thoại (trước là hidden → cắt mất cột) */}
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ background: '#fafafa' }}>
                <tr>
                  <th style={{ ...th, paddingLeft: 16 }}>Grade</th>
                  <th style={th}>Tấn</th>
                  <th style={th}>{priceUnitLabel(order.currency)}</th>
                  <th style={th}>Bành</th>
                  <th style={th}>Đóng gói</th>
                  <th style={th}>Thanh toán</th>
                  <th style={{ ...th, textAlign: 'right', paddingRight: 16 }}>Tổng {order.currency || 'USD'}</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item, idx) => {
                  const total = (item.quantity_tons || 0) * (item.unit_price || 0)
                  const bales = balesFromTons(item.quantity_tons, item.bale_weight_kg)
                  return (
                    <tr key={idx} style={{ borderTop: '1px solid #f5f5f5' }}>
                      <td style={{ ...td, paddingLeft: 16 }}><strong>{item.grade || '—'}</strong></td>
                      <td style={td}>{(item.quantity_tons || 0).toFixed(2)}</td>
                      <td style={td}>{fmtMoney(item.unit_price || 0, order.currency, { decimals: 0 })}</td>
                      <td style={td}>{bales.toLocaleString('vi-VN')}</td>
                      {/* Nhãn đóng gói / điều khoản từ map chung — không in mã thô 'sw_plastic_pallet', 'LC_30' */}
                      <td style={td}>{item.packing_type ? (PACKING_TYPE_LABELS[item.packing_type as PackingType] || item.packing_type.replace(/_/g, ' ')) : '—'}</td>
                      <td style={td}>{item.payment_terms
                        ? ((PAYMENT_TERMS_LABELS as Record<string, string>)[item.payment_terms] || PAYMENT_TERMS_EXTENDED_LABELS[item.payment_terms] || item.payment_terms)
                        : '—'}</td>
                      <td style={{ ...td, textAlign: 'right', paddingRight: 16 }}>
                        <strong>{fmtMoney(total, order.currency, { decimals: 0 })}</strong>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ 4. FINANCIAL + SHIPPING + LINKS (3 cols) ═══ */}
      <div style={sectionH}>📊 Tổng quan</div>
      <div style={threeColsR}>

        <div style={card}>
          <div style={cardTitle}>💰 Tài chính</div>
          <FieldRow label="Giá trị HĐ" value={fmtMoney(orderTotalInCurrency(order), order.currency, { decimals: 0 })} />
          <FieldRow
            label="L/C"
            value={
              (order as { lc_number?: string }).lc_number
                ? `${(order as { lc_number?: string }).lc_number} · ${(order as { lc_bank?: string }).lc_bank || '—'}`
                : '—'
            }
          />
          <FieldRow label="Hoa hồng" value={
            (order as { commission_amount?: number }).commission_amount
              ? fmtFull((order as { commission_amount?: number }).commission_amount)
              : '—'
          } />
          {/* ⚠ Trước đây đọc cột `paid_amount` KHÔNG tồn tại trên sales_orders → "Đã TT" luôn $0 và
              "Còn lại" luôn = cả hợp đồng. Số đã thu thật = actual_payment_amount (trigger
              trg_sop_sync_order cộng từ sales_order_payments); còn lại dùng outstandingUsd chung
              với Kanban. Đơn VNĐ: hai dòng này là USD quy đổi. */}
          <FieldRow label="Đã thu" value={fmtFull(order.actual_payment_amount || 0)} />
          <FieldRow
            label="Còn phải thu"
            value={fmtFull(outstandingUsd(order))}
            highlight
          />
        </div>

        <div style={card}>
          <div style={cardTitle}>🚢 Vận chuyển</div>
          <FieldRow label="Incoterm" value={(order as { incoterm?: string }).incoterm || '—'} />
          <FieldRow label="POL" value={polLabel(order.port_of_loading)} />
          <FieldRow label="POD" value={(order as { port_of_destination?: string }).port_of_destination || '—'} />
          <FieldRow
            label="Container"
            value={`${(order as { container_count?: number }).container_count || 0} × ${(order as { container_type?: string }).container_type || '20DC'}`}
          />
          <FieldRow
            label="Booking"
            value={(order as { booking_reference?: string }).booking_reference || '— chưa book'}
          />
          <FieldRow
            label="ETD / ETA"
            value={`${fmtDate((order as { etd?: string }).etd)} → ${fmtDate((order as { eta?: string }).eta)}`}
          />
        </div>

        <div style={card}>
          <div style={cardTitle}>🔗 Liên kết</div>
          {/* Họ HĐ: HĐ gốc (đợt con) + Các đợt (khối "Các đợt cùng HĐ" cuối tab Thông tin) */}
          {isChild && (
            <LinkRow icon="⧉" label="HĐ gốc"
                     value={`${fam.rootNo || 'gốc'}${order.continuation_seq ? ` · đợt ${order.continuation_seq}` : ''}`}
                     onClick={openRoot} />
          )}
          {fam.showBlock && (
            <LinkRow icon="🗂" label={`Các đợt (${fam.live.length})`}
                     value="Xem ở tab Thông tin"
                     onClick={onNavigateTab ? () => onNavigateTab('info') : undefined} />
          )}
          <LinkRow icon="📋" label={`HĐ${latest ? ` rev #${latest.revision_no}` : ''}`}
                   value={latest ? `Trạng thái: ${CONTRACT_STATUS_LABELS[latest.status] || latest.status}` : (isChild ? 'Dùng HĐ gốc' : 'Chưa có')}
                   onClick={latest ? () => navigate('/sales/contracts/review') : undefined} />
          {/* 3 dòng dưới trước đây in chữ CỐ ĐỊNH sai sự thật: Lệnh SX đọc cột không tồn tại (luôn
              "chưa lập"), "COA + PL — chưa lập" gõ cứng, "Phiếu cân: Đã cân" suy từ số booking.
              Nay đọc cờ thật trên đơn + mở đúng tab để xem. */}
          <LinkRow icon="🏭" label="Lệnh SX"
                   value={order.production_order_id ? 'Đã lập — xem tab Sản xuất' : '— chưa lập'}
                   onClick={order.production_order_id && onNavigateTab ? () => onNavigateTab('production') : undefined} />
          <LinkRow icon="📑" label="Invoice + PL"
                   value={`Invoice ${order.invoice_generated ? '✓' : '—'} · PL ${order.packing_list_generated ? '✓' : '—'}`}
                   onClick={onNavigateTab ? () => onNavigateTab('documents') : undefined} />
          <LinkRow icon="🚛" label="Giao hàng"
                   value="Xem tiến độ lô / tab Đóng gói"
                   onClick={onNavigateTab ? () => onNavigateTab('packing') : undefined} />
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function ActorRow({ icon, title, meta, cta, ctaOnClick, done, current, reject, pending }: {
  icon: string; title: string; meta?: string;
  cta?: string; ctaOnClick?: () => void;
  done?: boolean; current?: boolean; reject?: boolean; pending?: boolean;
}) {
  const bg = done ? '#f6ffed' : current ? '#f0f9f4' : reject ? '#fff1f0' : '#fafafa'
  const avBg = done ? '#389e0d' : current ? '#1B4D3E' : reject ? '#cf1322' : '#bfbfbf'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      borderRadius: 6, marginBottom: 6, background: bg,
      ...(current ? { boxShadow: 'inset 3px 0 0 #1B4D3E' } : {}),
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 14, background: avBg, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 13, flexShrink: 0,
        animation: current ? 'oprogPulse 1.5s infinite' : 'none',
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: pending ? '#8c8c8c' : '#262626' }}>{title}</div>
        {meta && <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 1 }}>{meta}</div>}
      </div>
      {cta && (
        <Button size="small" type="primary" style={{ background: PRIMARY }} onClick={ctaOnClick}>
          {cta}
        </Button>
      )}
      <style>{`@keyframes oprogPulse {
        0%,100%{box-shadow:0 0 0 0 rgba(27,77,62,0.4);}
        50%{box-shadow:0 0 0 6px rgba(27,77,62,0);}
      }`}</style>
    </div>
  )
}

function FieldRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '6px 0',
      borderBottom: '1px dashed #f0f0f0', fontSize: 12,
    }}>
      <span style={{ color: '#8c8c8c' }}>{label}</span>
      <span style={{
        fontWeight: 600,
        color: highlight ? PRIMARY : '#262626',
        fontSize: highlight ? 14 : 12,
      }}>{value}</span>
    </div>
  )
}

function LinkRow({ icon, label, value, onClick }: { icon: string; label: string; value: string; onClick?: () => void }) {
  return (
    <div
      style={{
        fontSize: 12, padding: '6px 10px', background: '#fafafa', borderRadius: 6,
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      <span>{icon}</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ color: onClick ? PRIMARY : '#8c8c8c', marginLeft: 'auto' }}>{value}</span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function humanDuration(s?: string | null): string {
  if (!s) return '—'
  const ms = Date.now() - new Date(s).getTime()
  const h = ms / 3600000
  if (h < 1) return `${Math.round(ms / 60000)} phút`
  if (h < 24) return `${Math.round(h)} giờ`
  return `${Math.round(h / 24)} ngày`
}

function buildTimelineItems(c: SalesOrderContract): Array<{
  title: string; meta: string; color: string; at: string;
}> {
  // `at` = mốc ISO gốc để SẮP XẾP — trước đây sort theo chuỗi ngày đã định dạng (sai thứ tự)
  const items: Array<{ title: string; meta: string; color: string; at: string }> = []
  if (c.signed_at) {
    items.push({
      title: `${c.signer_employee?.full_name || 'Trình ký'} ký HĐ rev #${c.revision_no}`,
      meta: fmtDateTime(c.signed_at), color: '#389e0d', at: c.signed_at,
    })
  }
  if (c.rejected_at) {
    items.push({
      title: `${c.reviewer_employee?.full_name || 'Kiểm tra'} trả lại rev #${c.revision_no}`,
      meta: `${fmtDateTime(c.rejected_at)}${c.rejected_reason ? ` — "${c.rejected_reason}"` : ''}`,
      color: '#cf1322', at: c.rejected_at,
    })
  }
  if (c.reviewed_at && !c.rejected_at) {
    items.push({
      title: `${c.reviewer_employee?.full_name || 'Kiểm tra'} duyệt rev #${c.revision_no}`,
      meta: fmtDateTime(c.reviewed_at), color: '#fa8c16', at: c.reviewed_at,
    })
  }
  if (c.submitted_at) {
    items.push({
      title: `${c.created_by_employee?.full_name || 'Sale'} trình rev #${c.revision_no}`,
      meta: fmtDateTime(c.submitted_at), color: '#1677ff', at: c.submitted_at,
    })
  }
  return items.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
}

// ─── Inline styles ───────────────────────────────────────────────────

const alertBanner: React.CSSProperties = {
  background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 10,
  padding: '12px 16px', marginBottom: 16,
  display: 'flex', alignItems: 'flex-start', gap: 12,
}

const twoCols: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16,
}

const threeCols: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16,
}

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 10, border: '1px solid #e8e8e8', padding: 16,
}

const cardTitle: React.CSSProperties = {
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8,
  color: '#8c8c8c', fontWeight: 700, marginBottom: 12,
}

const sectionH: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: PRIMARY, margin: '20px 0 10px',
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px', fontSize: 10, textTransform: 'uppercase',
  color: '#8c8c8c', fontWeight: 600, letterSpacing: 0.5,
  borderBottom: '1px solid #e8e8e8',
}

const td: React.CSSProperties = { padding: '10px 8px' }

const empty: React.CSSProperties = {
  padding: 20, textAlign: 'center', color: '#bfbfbf', fontSize: 12,
}
