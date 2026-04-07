// ============================================================================
// CONTRACT TAB — Tab Hợp đồng trong Detail Panel v4
// File: src/pages/sales/components/ContractTab.tsx
// ============================================================================

import { useState } from 'react'
import {
  Descriptions,
  Tag,
  Divider,
  Form,
  InputNumber,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  message,
} from 'antd'
import { EditOutlined, SaveOutlined, CloseOutlined, LockOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import {
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  PACKING_TYPE_LABELS,
  PORT_OF_LOADING_OPTIONS,
  type Incoterm,
  type PaymentTerms,
  type PackingType,
} from '../../../services/sales/salesTypes'
import type { SalesRole } from '../../../services/sales/salesPermissionService'

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  order: SalesOrder
  salesRole: SalesRole | null
  editable: boolean
  onSaved: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

const fmtCurrency = (v: number | undefined | null, currency = 'USD') => {
  if (!v) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v)
}

const fmtDate = (d: string | undefined | null) => {
  if (!d) return '—'
  return dayjs(d).format('DD/MM/YYYY')
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ContractTab({ order, salesRole, editable, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()

  const isLocked = !!order.is_locked
  const canEdit = editable && !isLocked

  const startEdit = () => {
    form.setFieldsValue({
      customer_po: order.customer_po,
      quantity_tons: order.quantity_tons,
      unit_price: order.unit_price,
      incoterm: order.incoterm,
      payment_terms: order.payment_terms,
      port_of_loading: order.port_of_loading,
      port_of_destination: order.port_of_destination,
      delivery_date: order.delivery_date ? dayjs(order.delivery_date) : null,
      contract_date: order.contract_date ? dayjs(order.contract_date) : null,
      bale_weight_kg: order.bale_weight_kg,
      bales_per_container: order.bales_per_container,
      packing_type: order.packing_type,
      commission_pct: order.commission_pct,
      bank_name: order.bank_name,
      bank_account: order.bank_account,
      bank_swift: order.bank_swift,
      contract_no: order.contract_no,
      notes: order.notes,
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
        customer_po: vals.customer_po || null,
        quantity_tons: vals.quantity_tons,
        unit_price: vals.unit_price,
        incoterm: vals.incoterm,
        payment_terms: vals.payment_terms || null,
        port_of_loading: vals.port_of_loading || null,
        port_of_destination: vals.port_of_destination || null,
        delivery_date: vals.delivery_date?.format('YYYY-MM-DD') || null,
        contract_date: vals.contract_date?.format('YYYY-MM-DD') || null,
        bale_weight_kg: vals.bale_weight_kg,
        bales_per_container: vals.bales_per_container,
        packing_type: vals.packing_type,
        commission_pct: vals.commission_pct || null,
        bank_name: vals.bank_name || null,
        bank_account: vals.bank_account || null,
        bank_swift: vals.bank_swift || null,
        contract_no: vals.contract_no || null,
        notes: vals.notes || null,
      }

      // Recalc derived fields
      const qtyKg = vals.quantity_tons * 1000
      const totalBales = Math.round(qtyKg / (vals.bale_weight_kg || 33.33))
      const totalValueUsd = vals.quantity_tons * vals.unit_price
      const containerCount = vals.bales_per_container > 0
        ? Math.ceil(totalBales / vals.bales_per_container)
        : order.container_count
      const commissionAmount = vals.commission_pct
        ? totalValueUsd * (vals.commission_pct / 100)
        : null

      updateData.quantity_kg = qtyKg
      updateData.total_bales = totalBales
      updateData.total_value_usd = totalValueUsd
      updateData.container_count = containerCount
      updateData.commission_amount = commissionAmount

      await salesOrderService.updateFields(order.id, updateData)
      message.success('Đã cập nhật hợp đồng')
      setEditing(false)
      onSaved()
    } catch (e: any) {
      if (e.errorFields) return // validation error
      message.error(e.message || 'Lỗi cập nhật')
    } finally {
      setSaving(false)
    }
  }

  // ── Computed ──
  const totalValueUSD = (order.quantity_tons || 0) * (order.unit_price || 0)
  const totalBales = order.total_bales || 0
  const containerCount = order.container_count || 0
  const commissionAmt = order.commission_amount || (totalValueUSD * (order.commission_pct || 0) / 100)

  // ══════════════════════════════════════════════════════════════
  // EDIT MODE
  // ══════════════════════════════════════════════════════════════

  if (editing) {
    return (
      <Form form={form} layout="vertical" size="small" style={{ padding: '8px 0' }}>
        {/* Action bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
          <Button icon={<CloseOutlined />} onClick={cancelEdit}>Hủy</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={handleSave}
            style={{ background: '#1B4D3E' }}
          >
            Lưu
          </Button>
        </div>

        {/* Section: Hợp đồng */}
        <SectionHeader title="Hợp đồng" color="#1B4D3E" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Số hợp đồng" name="contract_no">
            <Input placeholder="LTC2024/PD-ATC" />
          </Form.Item>
          <Form.Item label="Ngày HĐ" name="contract_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="PO# Khách hàng" name="customer_po">
            <Input />
          </Form.Item>
        </div>

        {/* Section: Sản phẩm & Giá */}
        <SectionHeader title="Sản phẩm & Giá" color="#1B4D3E" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Số lượng (tấn)" name="quantity_tons" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Đơn giá (USD/tấn)" name="unit_price" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="KL bành (kg)" name="bale_weight_kg">
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Bành/container" name="bales_per_container">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Loại đóng gói" name="packing_type">
            <Select options={Object.entries(PACKING_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
        </div>

        {/* Section: Điều khoản */}
        <SectionHeader title="Điều khoản" color="#1B4D3E" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Incoterm" name="incoterm">
            <Select options={Object.entries(INCOTERM_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item label="Thanh toán" name="payment_terms">
            <Select
              allowClear
              options={Object.entries(PAYMENT_TERMS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
          </Form.Item>
          <Form.Item label="Cảng xếp hàng" name="port_of_loading">
            <Select
              allowClear
              options={PORT_OF_LOADING_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
            />
          </Form.Item>
          <Form.Item label="Cảng đích" name="port_of_destination">
            <Input />
          </Form.Item>
          <Form.Item label="Ngày giao" name="delivery_date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label="Hoa hồng (%)" name="commission_pct">
            <InputNumber min={0} max={10} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        </div>

        {/* Section: Ngân hàng */}
        <SectionHeader title="Ngân hàng" color="#1B4D3E" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item label="Ngân hàng" name="bank_name">
            <Input placeholder="Vietcombank CN Huế" />
          </Form.Item>
          <Form.Item label="Số tài khoản" name="bank_account">
            <Input />
          </Form.Item>
          <Form.Item label="SWIFT code" name="bank_swift">
            <Input />
          </Form.Item>
        </div>

        {/* Section: Ghi chú */}
        <Form.Item label="Ghi chú" name="notes">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // VIEW MODE
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {canEdit ? (
          <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={startEdit}>
            Chỉnh sửa
          </Button>
        ) : isLocked ? (
          <Tag icon={<LockOutlined />} color="default">Đã khóa</Tag>
        ) : null}
      </div>

      {/* Section: Hợp đồng */}
      <SectionHeader title="Hợp đồng" color="#1B4D3E" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Số HĐ (Contract No.)">
          <strong>{order.contract_no || order.code}</strong>
        </Descriptions.Item>
        <Descriptions.Item label="Ngày HĐ">{fmtDate(order.contract_date || order.order_date)}</Descriptions.Item>
        <Descriptions.Item label="Khách hàng" span={2}>
          {order.customer ? (
            <Space>
              <Tag color="blue">{order.customer.code}</Tag>
              {order.customer.name}
              {order.customer.country && <Tag>{order.customer.country}</Tag>}
            </Space>
          ) : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="PO# KH">{order.customer_po || '—'}</Descriptions.Item>
        <Descriptions.Item label="Grade"><Tag color="green">{order.grade}</Tag></Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Section: Sản phẩm & Giá */}
      <SectionHeader title="Sản phẩm & Giá" color="#1B4D3E" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="Số lượng">{order.quantity_tons} tấn</Descriptions.Item>
        <Descriptions.Item label="Đơn giá">{fmtCurrency(order.unit_price)}/tấn</Descriptions.Item>
        <Descriptions.Item label="Tổng giá trị">
          <strong style={{ color: '#1B4D3E' }}>{fmtCurrency(totalValueUSD)}</strong>
        </Descriptions.Item>
        <Descriptions.Item label="KL bành">{order.bale_weight_kg || 33.33} kg</Descriptions.Item>
        <Descriptions.Item label="Tổng bành">{totalBales}</Descriptions.Item>
        <Descriptions.Item label="Container">
          {containerCount} x {order.container_type || '20ft'}
        </Descriptions.Item>
        {order.bales_per_container && (
          <Descriptions.Item label="Bành/cont">{order.bales_per_container}</Descriptions.Item>
        )}
        <Descriptions.Item label="Đóng gói">
          {PACKING_TYPE_LABELS[order.packing_type as PackingType] || order.packing_type || '—'}
          {order.shrink_wrap ? ' + Shrink wrap' : ''}
          {order.pallet_required ? ' + Pallet' : ''}
        </Descriptions.Item>
      </Descriptions>

      <Divider style={{ margin: '12px 0' }} />

      {/* Section: Điều khoản & Ngân hàng */}
      <SectionHeader title="Điều khoản" color="#1B4D3E" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Incoterm">
          <Tag>{INCOTERM_LABELS[order.incoterm as Incoterm] || order.incoterm || '—'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Thanh toán">
          {PAYMENT_TERMS_LABELS[order.payment_terms as PaymentTerms] || order.payment_terms || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Cảng xếp hàng">
          {PORT_OF_LOADING_OPTIONS.find(p => p.value === order.port_of_loading)?.label || order.port_of_loading || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Cảng đích">{order.port_of_destination || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày giao">{fmtDate(order.delivery_date)}</Descriptions.Item>
        <Descriptions.Item label="Hoa hồng">
          {commissionAmt > 0 ? `${fmtCurrency(commissionAmt)} (${order.commission_pct}%)` : '—'}
        </Descriptions.Item>
      </Descriptions>

      {(order.bank_name || order.bank_account || order.bank_swift) && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <SectionHeader title="Ngân hàng" color="#1B4D3E" />
          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label="Ngân hàng">{order.bank_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Tài khoản">{order.bank_account || '—'}</Descriptions.Item>
            <Descriptions.Item label="SWIFT">{order.bank_swift || '—'}</Descriptions.Item>
          </Descriptions>
        </>
      )}

      {/* Section: Chỉ tiêu kỹ thuật */}
      <Divider style={{ margin: '12px 0' }} />
      <SectionHeader title="Chỉ tiêu kỹ thuật" color="#666" />
      <Descriptions column={3} size="small" bordered>
        <Descriptions.Item label="DRC">{order.drc_min ?? '—'} ~ {order.drc_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="Moisture">{order.moisture_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="Dirt">{order.dirt_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="Ash">{order.ash_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="Nitrogen">{order.nitrogen_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="Volatile">{order.volatile_max ?? '—'} %</Descriptions.Item>
        <Descriptions.Item label="PRI">{order.pri_min ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Mooney">{order.mooney_max ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Color">{order.color_lovibond_max ?? '—'}</Descriptions.Item>
      </Descriptions>

      {/* Ghi chú */}
      {order.notes && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <SectionHeader title="Ghi chú" color="#666" />
          <div style={{ padding: '8px 12px', background: '#fafafa', borderRadius: 6, fontSize: 13 }}>
            {order.notes}
          </div>
        </>
      )}
    </div>
  )
}

// ── Section header ──
function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <div style={{
      fontSize: 12,
      fontWeight: 700,
      textTransform: 'uppercase',
      color,
      letterSpacing: 1,
      marginBottom: 8,
      marginTop: 4,
    }}>
      {title}
    </div>
  )
}
