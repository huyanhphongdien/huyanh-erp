// ============================================================================
// SHIPPING TAB — Tab Vận chuyển trong Detail Panel v4
// File: src/pages/sales/components/ShippingTab.tsx
// BP Logistics nhập: Booking, B/L, ETD/ETA, L/C, DHL, Cước/BH, Hải quan
// ⚠ Đặt cọc / Chiết khấu NH / Phí NH: CHỈ nhập ở tab Tài chính (audit 17/11/2026 — trước đây
//   sửa được ở cả 2 tab, 2 bộ phận ghi đè cùng cột sales_orders + cùng tự tính remaining_amount).
//   Tab này chỉ hiện chỉ-đọc.
// ============================================================================

import { useState } from 'react'
import {
  Card,
  Descriptions,
  Tag,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Button,
  Space,
  Divider,
  Alert,
  message,
} from 'antd'
import {
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  WarningOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import { PORT_OF_LOADING_OPTIONS, polLabel } from '../../../services/sales/salesTypes'
import { toUsdEquivalent } from '../../../services/sales/salesMoney'
import type { SalesRole } from '../../../services/sales/salesPermissionService'
import { getVisibleTabs, isFieldEditableV4 } from '../../../services/sales/salesPermissionService'
import { fmtDate, fmtUsd, usdInputProps } from '../../../utils/format'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import OrderActionButtons from './OrderActionButtons'
import ShippingDocsSection from './ShippingDocsSection'
import BookingTableSection from './BookingTableSection'

// ============================================================================
// HELPERS
// ============================================================================

/** Tiền USD của tab (cước, BH, L/C, cọc, CK, số dư) — giữ cent: số này đối chiếu chứng từ/ngân hàng. */
const fmtCurrency = (v: number | undefined | null) => fmtUsd(v, 2)

// Trạng thái thông quan — MỘT map cho cả ô chọn lẫn Tag hiển thị (trước đây 2 bộ nhãn khác nhau)
const CUSTOMS_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ thông quan',
  cleared: 'Đã thông quan',
  rejected: 'Bị từ chối',
}
const CUSTOMS_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  cleared: 'green',
  rejected: 'red',
}

// L/C expiry warning
function lcExpiryTag(expiryDate: string | undefined | null) {
  if (!expiryDate) return <span style={{ color: '#ccc' }}>—</span>
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000)
  if (days <= 0) return <Tag color="red">Đã hết hạn ({Math.abs(days)} ngày)</Tag>
  if (days <= 7) return <Tag icon={<WarningOutlined />} color="red">{fmtDate(expiryDate)} — còn {days} ngày</Tag>
  if (days <= 20) return <Tag icon={<WarningOutlined />} color="orange">{fmtDate(expiryDate)} — còn {days} ngày</Tag>
  return <span>{fmtDate(expiryDate)}</span>
}

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  order: SalesOrder
  salesRole: SalesRole | null
  editable: boolean
  onSaved: () => void
  /** Nhảy sang tab khác của chi tiết đơn (vd 'finance' để sửa Đặt cọc/Chiết khấu). Tuỳ chọn. */
  onNavigateTab?: (tabKey: string) => void
}

const BL_TYPE_OPTIONS = [
  { value: 'original', label: 'Original' },
  { value: 'telex', label: 'Telex Release' },
  { value: 'surrendered', label: 'Surrendered' },
]

// Cảng xếp hàng: dùng CHUNG PORT_OF_LOADING_OPTIONS (salesTypes) với tab Hợp đồng — trước đây tab này
// khai danh mục riêng 6 mục, thiếu ANY_PORT_VN → đơn chọn "Any port" ở Hợp đồng hiện nguyên mã ở đây.
// Value (mã) khớp PORT_LABELS trong documentService để chứng từ map ra tên tiếng Anh đầy đủ.
const POL_SELECT_OPTIONS = PORT_OF_LOADING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))

// ============================================================================
// COMPONENT
// ============================================================================

export default function ShippingTab({ order, salesRole, editable, onSaved, onNavigateTab }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const canEditLogistics = editable && (salesRole === 'logistics' || salesRole === 'admin')
  const canEditFinanceFields = isFieldEditableV4(salesRole, 'discount_exchange_rate') || salesRole === 'admin'
  // Link "Sửa ở tab Tài chính →" chỉ khi vai trò CÓ tab đó — cùng nguồn getVisibleTabs mà chi tiết đơn
  // dùng để dựng tab (vd sale không có tab Tài chính: bấm là không đi đâu)
  const canOpenFinanceTab = !!onNavigateTab && getVisibleTabs(salesRole).includes('finance')

  const startEdit = () => {
    form.setFieldsValue({
      // Vận chuyển
      shipping_line: order.shipping_line,
      vessel_name: order.vessel_name,
      voyage_number: order.voyage_number,
      booking_reference: order.booking_reference,
      bl_number: order.bl_number,
      bl_type: order.bl_type,
      bl_date: order.bl_date ? dayjs(order.bl_date) : null,
      etd: order.etd ? dayjs(order.etd) : null,
      eta: order.eta ? dayjs(order.eta) : null,
      cutoff_date: order.cutoff_date ? dayjs(order.cutoff_date) : null,
      dhl_number: order.dhl_number,
      // Cảng
      port_of_loading: order.port_of_loading,
      port_of_destination: order.port_of_destination,
      port_of_discharge: order.port_of_discharge,
      shipping_marks: order.shipping_marks,
      // Cước & bảo hiểm (CIF) + hóa đơn
      freight_amount: order.freight_amount,
      insurance_amount: order.insurance_amount,
      invoice_no: order.invoice_no,
      invoice_date: order.invoice_date ? dayjs(order.invoice_date) : null,
      // L/C
      lc_number: order.lc_number,
      lc_bank: order.lc_bank,
      lc_expiry_date: order.lc_expiry_date ? dayjs(order.lc_expiry_date) : null,
      lc_amount: order.lc_amount,
      // (Đặt cọc / Chiết khấu / Phí NH: nhập ở tab Tài chính — không nạp vào form này)
      // Hải quan (gộp từ bản full-page)
      customs_declaration_no: order.customs_declaration_no,
      customs_declaration_date: order.customs_declaration_date ? dayjs(order.customs_declaration_date) : null,
      customs_clearance_status: order.customs_clearance_status || 'pending',
      // Chi tiết Commercial Invoice (gộp từ bản full-page)
      proforma_date: order.proforma_date ? dayjs(order.proforma_date) : null,
      item_no: order.item_no,
      packing_desc: order.packing_desc,
      invoice_extra_lines: order.invoice_extra_lines,
    })
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    form.resetFields()
  }

  const handleSave = async () => {
    try {
      const vals = await form.validateFields()
      setSaving(true)

      const updateData: Record<string, any> = {
        shipping_line: vals.shipping_line || null,
        vessel_name: vals.vessel_name || null,
        voyage_number: vals.voyage_number || null,
        booking_reference: vals.booking_reference || null,
        bl_number: vals.bl_number || null,
        bl_type: vals.bl_type || null,
        bl_date: vals.bl_date?.format('YYYY-MM-DD') || null,
        etd: vals.etd?.format('YYYY-MM-DD') || null,
        eta: vals.eta?.format('YYYY-MM-DD') || null,
        cutoff_date: vals.cutoff_date?.format('YYYY-MM-DD') || null,
        dhl_number: vals.dhl_number || null,
        port_of_loading: vals.port_of_loading || null,
        port_of_destination: vals.port_of_destination || null,
        port_of_discharge: vals.port_of_discharge || null,
        shipping_marks: vals.shipping_marks || null,
        freight_amount: vals.freight_amount ?? null,
        insurance_amount: vals.insurance_amount ?? null,
        invoice_no: vals.invoice_no || null,
        invoice_date: vals.invoice_date?.format('YYYY-MM-DD') || null,
        lc_number: vals.lc_number || null,
        lc_bank: vals.lc_bank || null,
        lc_expiry_date: vals.lc_expiry_date?.format('YYYY-MM-DD') || null,
        lc_amount: vals.lc_amount || null,
        // ⚠ KHÔNG gửi deposit_* / discount_* / bank_charges / remaining_amount: các cột này do tab
        // Tài chính giữ (một cửa nhập). Gửi kèm từ snapshot form cũ là đè mất số kế toán vừa sửa.
        // Hải quan
        customs_declaration_no: vals.customs_declaration_no || null,
        customs_declaration_date: vals.customs_declaration_date?.format('YYYY-MM-DD') || null,
        customs_clearance_status: vals.customs_clearance_status || null,
        // Chi tiết Commercial Invoice
        proforma_date: vals.proforma_date?.format('YYYY-MM-DD') || null,
        item_no: vals.item_no || null,
        packing_desc: vals.packing_desc || null,
        invoice_extra_lines: vals.invoice_extra_lines || null,
      }
      // (remaining_amount = Tổng − Cọc − CK − Phí NH: chỉ tab Tài chính tính lại khi lưu — không
      //  ô nào ở form này đổi các số đó.)

      await salesOrderService.updateFields(order.id, updateData)
      message.success('Đã cập nhật vận chuyển')
      setEditing(false)
      onSaved()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error(dichLoiHeThong(e, 'Lỗi cập nhật'))
    } finally {
      setSaving(false)
    }
  }

  // ── Computed ──
  // Cùng cách tính với tab Tài chính: đơn VNĐ dùng số quy đổi USD (không lấy tấn × giá VNĐ gắn "$")
  const totalUSD = order.total_value_usd || toUsdEquivalent(order.quantity_tons * order.unit_price, order.currency, order.exchange_rate)
  // Còn lại = Tổng HĐ - Đặt cọc - Chiết khấu - Phí NH
  const remainingAmount = (order.remaining_amount != null)
    ? order.remaining_amount
    : totalUSD - (order.deposit_amount || 0) - (order.discount_amount || 0) - (order.bank_charges || 0)

  // ══════════════════════════════════════════════════════════════
  // EDIT MODE
  // ══════════════════════════════════════════════════════════════

  if (editing) {
    return (
      <Form form={form} layout="vertical" size="small" style={{ padding: '8px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <Button icon={<CloseOutlined />} onClick={cancelEdit}>Hủy</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            style={{ background: '#d48806' }}
          >
            Lưu
          </Button>
        </div>

        {/* Booking & Tàu */}
        <SectionHeader title="Booking & Tàu" color="#d48806" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Hãng tàu" name="shipping_line">
            <Input placeholder="Maersk, MSC..." />
          </Form.Item>
          <Form.Item label="Số booking" name="booking_reference">
            <Input placeholder="Số booking hãng tàu" />
          </Form.Item>
          <Form.Item label="Tàu / Chuyến" name="vessel_name">
            <Input placeholder="VD: MSC ANNA / VY2604E" />
          </Form.Item>
        </div>

        {/* Cảng — POL/POD (bắt buộc cho chứng từ) */}
        <SectionHeader title="Cảng (dùng cho chứng từ)" color="#1257a8" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Cảng xếp (POL)" name="port_of_loading">
            <Select allowClear showSearch optionFilterProp="label" options={POL_SELECT_OPTIONS} placeholder="Chọn cảng VN" />
          </Form.Item>
          <Form.Item label="Cảng đến (POD)" name="port_of_destination">
            <Input placeholder="VD: Nhava Sheva, India" />
          </Form.Item>
          <Form.Item label="Cảng dỡ (nếu khác)" name="port_of_discharge">
            <Input placeholder="Tuỳ chọn" />
          </Form.Item>
        </div>
        <Form.Item label="Shipping mark (riêng đơn này — trống thì dùng hồ sơ khách)" name="shipping_marks">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Nhập nếu đơn này khác hồ sơ (grade/số HĐ/lô...)" />
        </Form.Item>

        {/* B/L */}
        <SectionHeader title="Vận đơn (B/L)" color="#d48806" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Số B/L" name="bl_number">
            <Input placeholder="Số vận đơn" />
          </Form.Item>
          <Form.Item label="Loại B/L" name="bl_type">
            <Select allowClear options={BL_TYPE_OPTIONS} placeholder="Chọn..." />
          </Form.Item>
          <Form.Item label="Ngày B/L" name="bl_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </div>

        {/* Ngày */}
        <SectionHeader title="Ngày tháng" color="#d48806" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="ETD" name="etd">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="ETA" name="eta">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Cutoff" name="cutoff_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </div>

        {/* DHL */}
        <Form.Item label="DHL Tracking" name="dhl_number">
          <Input placeholder="Mã vận đơn DHL" />
        </Form.Item>

        {/* L/C */}
        <SectionHeader title="L/C (Thư tín dụng)" color="#d48806" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Số L/C" name="lc_number">
            <Input placeholder="Số L/C" />
          </Form.Item>
          <Form.Item label="Ngân hàng phát hành" name="lc_bank">
            <Input placeholder="Ngân hàng phát hành L/C" />
          </Form.Item>
          <Form.Item label="Hạn L/C" name="lc_expiry_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Số tiền L/C (USD)" name="lc_amount">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="USD" {...usdInputProps} />
          </Form.Item>
        </div>

        {/* Cước & Bảo hiểm (CIF/CFR) + Hóa đơn thương mại */}
        <SectionHeader title="Cước, Bảo hiểm & Hóa đơn (cho Invoice)" color="#1257a8" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <Button size="small" icon={<ThunderboltOutlined />} onClick={() => {
            const cont = order.container_count || 0
            // Bảo hiểm = trị giá CIF × 110% (giá trị bảo hiểm) × 0,04% (phí) × 1,1 (VAT 10%)
            const insurance = Math.round(totalUSD * 1.1 * 0.0004 * 1.1 * 100) / 100
            const freight = 5 * cont   // $5 / container (sửa lại nếu đơn giá cước khác)
            form.setFieldsValue({ insurance_amount: insurance, freight_amount: freight })
            message.info(`Đã tính theo công thức: BH $${insurance} · cước $${freight} (${cont} cont × $5) — hãy KIỂM TRA LẠI rồi mới Lưu.`)
          }}>Tính tự động</Button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            BH = trị giá CIF × 1,1 × 0,04% × 1,1 · Cước = $5 × số cont · <b style={{ color: '#b9770e' }}>số tự tính — kiểm tra lại</b> <i>(sửa nếu đơn giá cước khác)</i>
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Cước vận chuyển (USD)" name="freight_amount"
            tooltip="CIF/CFR: nhập cước — sẽ TRỪ khỏi trị giá CIF để ra 'THE COST' (số Hối phiếu draw)">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="USD" {...usdInputProps} />
          </Form.Item>
          <Form.Item label="Phí bảo hiểm (USD)" name="insurance_amount"
            tooltip="Tự tính: trị giá CIF × 1,1 × 0,04% × 1,1 (giá trị BH 110% × phí 0,04% × VAT 10%). Bấm 'Tính tự động' hoặc nhập tay.">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="USD" {...usdInputProps} />
          </Form.Item>
          <Form.Item label="Số hóa đơn (Invoice No.)" name="invoice_no"
            tooltip="Để trống → hệ tự dùng INV-<mã đơn>">
            <Input placeholder="VD: HA20260080" />
          </Form.Item>
          <Form.Item label="Ngày hóa đơn" name="invoice_date"
            tooltip="Để trống → hệ dùng ngày hôm nay">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </div>

        {/* Chi tiết Commercial Invoice (khớp mẫu) */}
        <SectionHeader title="Chi tiết Commercial Invoice (khớp mẫu)" color="#1257a8" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Ngày Proforma (PI)" name="proforma_date" tooltip='Dòng "AS PER PROFORMA … DATED …" trên Invoice'>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="ITEM NO. (mã hàng khách)" name="item_no" tooltip="Trống → mặc định hồ sơ khách">
            <Input placeholder="VD: RRB01021" />
          </Form.Item>
          <Form.Item label="Kiểu đóng gói (PACKING)" name="packing_desc" tooltip="Trống → mặc định hồ sơ khách">
            <Input placeholder="VD: 35 KG/BALE. LOOSE BALES." />
          </Form.Item>
          <Form.Item label="Dòng mô tả riêng" name="invoice_extra_lines" tooltip="Mỗi dòng 1 mục (nếu L/C yêu cầu)">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="VD: BANK NAME: COMMERCIAL BANK OF CEYLON PLC" />
          </Form.Item>
        </div>

        {/* Hải quan */}
        <SectionHeader title="Hải quan" color="#666" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Số tờ khai" name="customs_declaration_no">
            <Input placeholder="Số tờ khai HQ" />
          </Form.Item>
          <Form.Item label="Ngày đăng ký" name="customs_declaration_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Thông quan" name="customs_clearance_status">
            <Select options={Object.entries(CUSTOMS_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
        </div>

        {/* Đặt cọc / Chiết khấu NH / Phí NH — một cửa nhập ở tab Tài chính */}
        <Alert
          type="info" showIcon style={{ marginTop: 4 }}
          message="Đặt cọc, Chiết khấu ngân hàng và Phí NH nhập ở tab Tài chính"
          description="Một chỗ nhập duy nhất để hai bộ phận không ghi đè số của nhau."
        />
      </Form>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // VIEW MODE
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <OrderActionButtons order={order} salesRole={salesRole} onSaved={onSaved} tab="shipping" size="small" />
        <div style={{ display: 'flex', gap: 8 }}>
          {canEditLogistics && (
            <Button
              type="primary"
              icon={<EditOutlined />}
              size="small"
              onClick={startEdit}
              style={{
                background: '#1B4D3E',
                borderColor: '#1B4D3E',
                color: '#ffffff',
                fontWeight: 500,
              }}
            >
              Chỉnh sửa
            </Button>
          )}
        </div>
      </div>

      {/* Booking & Tàu — booking CHÍNH (cho dashboard ETD) */}
      <SectionHeader title="Booking & Tàu (chính)" color="#d48806" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Hãng tàu">{order.shipping_line || '—'}</Descriptions.Item>
        <Descriptions.Item label="Số booking">{order.booking_reference || '—'}</Descriptions.Item>
        <Descriptions.Item label="Tàu / Chuyến">{order.vessel_name || '—'}</Descriptions.Item>
      </Descriptions>

      {/* Mức 2: bảng nhiều booking/lô (đơn đi nhiều booking) */}
      <BookingTableSection orderId={order.id} canEdit={canEditLogistics} />

      <Divider style={{ margin: '12px 0' }} />

      {/* Cảng */}
      <SectionHeader title="Cảng (chứng từ)" color="#1257a8" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="Cảng xếp (POL)">{polLabel(order.port_of_loading)}</Descriptions.Item>
        <Descriptions.Item label="Cảng đến (POD)">{order.port_of_destination || '—'}</Descriptions.Item>
        <Descriptions.Item label="Cảng dỡ">{order.port_of_discharge || '—'}</Descriptions.Item>
        <Descriptions.Item label="Shipping mark (đơn)" span={3}>
          {order.shipping_marks
            ? <span style={{ whiteSpace: 'pre-line' }}>{order.shipping_marks}</span>
            : <span style={{ color: '#aaa' }}>(dùng mark hồ sơ khách)</span>}
        </Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* B/L */}
      <SectionHeader title="Vận đơn (B/L)" color="#d48806" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="Số B/L">
          {order.bl_number ? <Tag color="blue">{order.bl_number}</Tag> : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Loại B/L">
          {BL_TYPE_OPTIONS.find(o => o.value === order.bl_type)?.label || order.bl_type || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Ngày B/L">{fmtDate(order.bl_date)}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Cước & Bảo hiểm + Hóa đơn */}
      <SectionHeader title="Cước, Bảo hiểm & Hóa đơn (Invoice)" color="#1257a8" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Cước (USD)">{fmtCurrency(order.freight_amount)}</Descriptions.Item>
        <Descriptions.Item label="Bảo hiểm (USD)">{fmtCurrency(order.insurance_amount)}</Descriptions.Item>
        <Descriptions.Item label="Số hóa đơn">{order.invoice_no || <span style={{ color: '#aaa' }}>INV-{order.code}</span>}</Descriptions.Item>
        <Descriptions.Item label="Ngày hóa đơn">{order.invoice_date ? fmtDate(order.invoice_date) : <span style={{ color: '#aaa' }}>(hôm nay khi sinh)</span>}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Chi tiết Commercial Invoice (khớp mẫu) */}
      <SectionHeader title="Chi tiết Commercial Invoice (khớp mẫu)" color="#1257a8" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Ngày Proforma (PI)">{fmtDate(order.proforma_date)}</Descriptions.Item>
        <Descriptions.Item label="ITEM NO.">{order.item_no || <span style={{ color: '#aaa' }}>(hồ sơ khách)</span>}</Descriptions.Item>
        <Descriptions.Item label="Kiểu đóng gói">{order.packing_desc || <span style={{ color: '#aaa' }}>(hồ sơ khách)</span>}</Descriptions.Item>
        <Descriptions.Item label="Dòng mô tả riêng">{order.invoice_extra_lines ? <span style={{ whiteSpace: 'pre-line' }}>{order.invoice_extra_lines}</span> : <span style={{ color: '#aaa' }}>(hồ sơ khách)</span>}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Hải quan */}
      <SectionHeader title="Hải quan" color="#666" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="Số tờ khai">{order.customs_declaration_no || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày đăng ký">{fmtDate(order.customs_declaration_date)}</Descriptions.Item>
        <Descriptions.Item label="Thông quan">
          {(() => {
            const cs = order.customs_clearance_status || 'pending'
            return <Tag color={CUSTOMS_STATUS_COLORS[cs] || 'default'}>{CUSTOMS_STATUS_LABELS[cs] || cs}</Tag>
          })()}
        </Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Ngày tháng */}
      <SectionHeader title="Ngày tháng" color="#d48806" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="ETD">{fmtDate(order.etd)}</Descriptions.Item>
        <Descriptions.Item label="ETA">{fmtDate(order.eta)}</Descriptions.Item>
        <Descriptions.Item label="Cutoff">{fmtDate(order.cutoff_date)}</Descriptions.Item>
      </Descriptions>

      {/* Tài liệu vận chuyển (Booking / B/L / SI…) — đính kèm file ngay tại đây */}
      <ShippingDocsSection orderId={order.id} canEdit={canEditLogistics} />

      {/* DHL */}
      {order.dhl_number && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="DHL Tracking">{order.dhl_number}</Descriptions.Item>
          </Descriptions>
        </>
      )}

      <Divider style={{ margin: '12px 0' }} />

      {/* L/C */}
      <SectionHeader title="L/C (Thư tín dụng)" color="#d48806" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Số L/C">
          {order.lc_number ? <Tag color="purple">{order.lc_number}</Tag> : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="NH phát hành">{order.lc_bank || '—'}</Descriptions.Item>
        <Descriptions.Item label="Hạn L/C">{lcExpiryTag(order.lc_expiry_date)}</Descriptions.Item>
        <Descriptions.Item label="Số tiền L/C">{fmtCurrency(order.lc_amount)}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Đặt cọc + Chiết khấu NH: CHỈ ĐỌC ở đây — kế toán nhập ở tab Tài chính (một cửa nhập) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          Đặt cọc · Chiết khấu NH · Phí NH do kế toán nhập ở tab Tài chính.
        </span>
        {canOpenFinanceTab && (
          <Button size="small" type="link" style={{ padding: 0 }} onClick={() => onNavigateTab?.('finance')}>
            Sửa ở tab Tài chính →
          </Button>
        )}
      </div>
      <SectionHeader title="Đặt cọc" color="#722ed1" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="Số tiền">{fmtCurrency(order.deposit_amount)}</Descriptions.Item>
        <Descriptions.Item label="Ngày">{fmtDate(order.deposit_date)}</Descriptions.Item>
        <Descriptions.Item label="Ghi chú">{order.deposit_note || '—'}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Chiết khấu */}
      <SectionHeader title="Chiết khấu Ngân hàng" color="#d48806" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="NH chiết khấu">{order.discount_bank || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày CK">{fmtDate(order.discount_date)}</Descriptions.Item>
        <Descriptions.Item label="Số tiền CK">{fmtCurrency(order.discount_amount)}</Descriptions.Item>
        <Descriptions.Item label="Phí NH">{fmtCurrency(order.bank_charges)}</Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Tổng hợp */}
      <SectionHeader title="Tổng hợp" color="#666" />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
        padding: 12,
        background: '#fafafa',
        borderRadius: 8,
      }}>
        <SummaryCard label="Tổng HĐ" value={fmtCurrency(totalUSD)} color="#1B4D3E" />
        <SummaryCard label="Đặt cọc" value={fmtCurrency(order.deposit_amount)} color="#722ed1" />
        <SummaryCard label="Chiết khấu" value={fmtCurrency(order.discount_amount)} color="#d48806" />
        <SummaryCard label="Phí NH" value={fmtCurrency(order.bank_charges)} color="#cf1322" />
        <SummaryCard label="Còn lại" value={fmtCurrency(remainingAmount)} color="#1677ff" bold />
      </div>
    </div>
  )
}

// ── Helpers ──

function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
      color, letterSpacing: 1, marginBottom: 8, marginTop: 4,
    }}>
      {title}
    </div>
  )
}

function SummaryCard({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? 700 : 600, color }}>{value}</div>
    </div>
  )
}
