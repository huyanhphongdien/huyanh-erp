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
  AutoComplete,
} from 'antd'
import { EditOutlined, SaveOutlined, CloseOutlined, LockOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import { supabase } from '../../../lib/supabase'
import type { SalesOrder, SalesOrderItem } from '../../../services/sales/salesTypes'
import {
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  PACKING_TYPE_LABELS,
  PORT_OF_LOADING_OPTIONS,
  SVR_GRADE_OPTIONS,
  type Incoterm,
  type PaymentTerms,
  type PackingType,
} from '../../../services/sales/salesTypes'
import type { SalesRole } from '../../../services/sales/salesPermissionService'
import OrderActionButtons from './OrderActionButtons'

type EditItem = {
  id?: string
  grade: string
  quantity_tons: number
  unit_price: number
  bale_weight_kg: number
  bales_per_container: number
  packing_type: string
  payment_terms?: string
}

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
  const [editItems, setEditItems] = useState<EditItem[]>([])
  const [form] = Form.useForm()

  const isLocked = !!order.is_locked
  const canEdit = editable && !isLocked
  const hasItems = (order.items?.length || 0) > 0

  const itemsTotalTons = editItems.reduce((s, i) => s + (Number(i.quantity_tons) || 0), 0)
  const itemsTotalUSD = editItems.reduce((s, i) => s + (Number(i.quantity_tons) || 0) * (Number(i.unit_price) || 0), 0)

  const startEdit = () => {
    // Luôn dùng items editor — kể cả đơn cũ single-item (sẽ được promote
    // sang multi-item khi save, vì BGĐ muốn 1 đơn nhập được nhiều mặt hàng)
    if (hasItems && order.items) {
      setEditItems(order.items.map((it: SalesOrderItem) => ({
        id: it.id,
        grade: it.grade,
        quantity_tons: it.quantity_tons,
        unit_price: it.unit_price,
        bale_weight_kg: it.bale_weight_kg || 33.33,
        bales_per_container: it.bales_per_container || 576,
        packing_type: it.packing_type || 'loose_bale',
        payment_terms: it.payment_terms,
      })))
    } else {
      // Đơn legacy chưa có items → seed 1 dòng từ header để user có thể "Thêm dòng"
      setEditItems([{
        grade: order.grade || 'SVR_10',
        quantity_tons: order.quantity_tons || 0,
        unit_price: order.unit_price || 0,
        bale_weight_kg: order.bale_weight_kg || 33.33,
        bales_per_container: order.bales_per_container || 576,
        packing_type: order.packing_type || 'loose_bale',
        payment_terms: order.payment_terms || undefined,
      }])
    }
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
      commission_usd_per_mt: order.commission_usd_per_mt,
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

      // Validate items — bắt buộc phải có ≥1 sản phẩm hợp lệ
      const validItems = editItems.filter(i => i.grade && i.quantity_tons > 0 && i.unit_price > 0)
      if (validItems.length === 0) {
        message.error('Phải có ít nhất 1 sản phẩm hợp lệ')
        setSaving(false)
        return
      }

      const updateData: Record<string, any> = {
        customer_po: vals.customer_po || null,
        incoterm: vals.incoterm,
        payment_terms: vals.payment_terms || null,
        port_of_loading: vals.port_of_loading || null,
        port_of_destination: vals.port_of_destination || null,
        delivery_date: vals.delivery_date?.format('YYYY-MM-DD') || null,
        contract_date: vals.contract_date?.format('YYYY-MM-DD') || null,
        commission_pct: vals.commission_pct || null,
        commission_usd_per_mt: vals.commission_usd_per_mt || null,
        bank_name: vals.bank_name || null,
        bank_account: vals.bank_account || null,
        bank_swift: vals.bank_swift || null,
        contract_no: vals.contract_no || null,
        notes: vals.notes || null,
      }

      // ── Replace sales_order_items với giá trị mới (multi-item path luôn) ──
      const { error: delErr } = await supabase
        .from('sales_order_items')
        .delete()
        .eq('sales_order_id', order.id)
      if (delErr) throw delErr

      const itemRows = validItems.map((it, idx) => {
        const qtyKg = it.quantity_tons * 1000
        const bw = it.bale_weight_kg || 33.33
        const bales = Math.round(qtyKg / bw)
        const bpc = it.bales_per_container || 576
        return {
          sales_order_id: order.id,
          grade: it.grade,
          quantity_tons: it.quantity_tons,
          unit_price: it.unit_price,
          currency: order.currency || 'USD',
          payment_terms: it.payment_terms || null,
          total_value_usd: it.quantity_tons * it.unit_price,
          quantity_kg: qtyKg,
          bale_weight_kg: bw,
          total_bales: bales,
          bales_per_container: bpc,
          container_count: Math.ceil(bales / bpc),
          packing_type: it.packing_type || 'loose_bale',
          sort_order: idx,
        }
      })
      const { error: insErr } = await supabase.from('sales_order_items').insert(itemRows)
      if (insErr) throw insErr

      const totalTons = itemRows.reduce((s, i) => s + i.quantity_tons, 0)
      const totalValueUsd = itemRows.reduce((s, i) => s + (i.total_value_usd || 0), 0)
      const totalBales = itemRows.reduce((s, i) => s + (i.total_bales || 0), 0)
      const containerCount = itemRows.reduce((s, i) => s + (i.container_count || 0), 0)
      const aggregatedGrade = itemRows.length === 1 ? itemRows[0].grade : itemRows.map(i => i.grade).join(' + ')
      const firstItem = validItems[0]

      const avgUnitPrice = totalTons > 0 ? Math.round((totalValueUsd / totalTons) * 100) / 100 : 0
      const commissionAmount = vals.commission_usd_per_mt
        ? totalTons * vals.commission_usd_per_mt
        : (vals.commission_pct ? totalValueUsd * (vals.commission_pct / 100) : null)

      updateData.quantity_tons = totalTons
      updateData.quantity_kg = totalTons * 1000
      updateData.unit_price = avgUnitPrice
      updateData.total_value_usd = totalValueUsd
      updateData.total_bales = totalBales
      updateData.container_count = containerCount
      updateData.grade = aggregatedGrade
      updateData.bale_weight_kg = firstItem.bale_weight_kg
      updateData.bales_per_container = firstItem.bales_per_container
      updateData.packing_type = firstItem.packing_type
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
  // Ưu tiên giá trị đã tính chính xác trong DB (tổng các items), tránh recompute
  // từ quantity × unit_price (unit_price multi-item là trung bình đã làm tròn).
  const totalValueUSD = order.total_value_usd ?? ((order.quantity_tons || 0) * (order.unit_price || 0))
  const totalBales = order.total_bales || 0
  const containerCount = order.container_count || 0
  const commissionAmt = order.commission_amount
    || ((order.commission_usd_per_mt || 0) > 0
        ? (order.quantity_tons || 0) * (order.commission_usd_per_mt || 0)
        : totalValueUSD * (order.commission_pct || 0) / 100)

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

        {/* Section: Sản phẩm & Giá — luôn dùng multi-item table */}
        <SectionHeader title="Sản phẩm & Giá" color="#1B4D3E" />
        {!hasItems && editItems.length > 0 && (
          <div style={{
            padding: '6px 10px',
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            borderRadius: 4,
            fontSize: 11,
            color: '#874d00',
            marginBottom: 8,
          }}>
            ℹ️ Đơn này được tạo theo format cũ (1 mặt hàng). Bạn có thể bấm "Thêm dòng" để bổ sung mặt hàng — đơn sẽ tự convert sang multi-item.
          </div>
        )}
        <>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: '#666', minWidth: 110 }}>Grade</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: '#666', minWidth: 90 }}>Tấn</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: '#666', minWidth: 100 }}>$/tấn</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: '#666', minWidth: 100 }}>Thành tiền</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: '#666', minWidth: 80 }}>KL bành</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: '#666', minWidth: 80 }}>Bành/cont</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: '#666', minWidth: 130 }}>Đóng gói</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: '#666', minWidth: 110 }}>Thanh toán</th>
                    <th style={{ padding: '6px 8px', width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {editItems.map((it, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px 6px' }}>
                        <AutoComplete
                          size="small"
                          value={it.grade}
                          style={{ width: '100%' }}
                          placeholder="Chọn hoặc tự nhập"
                          options={SVR_GRADE_OPTIONS.map((g) => ({ value: g.value, label: g.label }))}
                          filterOption={(input, opt) =>
                            String(opt?.value || '').toLowerCase().includes(input.toLowerCase()) ||
                            String(opt?.label || '').toLowerCase().includes(input.toLowerCase())
                          }
                          onChange={(v: string) => {
                            const next = [...editItems]; next[idx] = { ...it, grade: v || '' }; setEditItems(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <InputNumber
                          size="small"
                          min={0}
                          step={0.01}
                          value={it.quantity_tons}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, quantity_tons: Number(v) || 0 }; setEditItems(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <InputNumber
                          size="small"
                          min={0}
                          step={0.01}
                          value={it.unit_price}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, unit_price: Number(v) || 0 }; setEditItems(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1B4D3E' }}>
                        ${(it.quantity_tons * it.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <InputNumber
                          size="small"
                          min={1}
                          max={100}
                          value={it.bale_weight_kg}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, bale_weight_kg: Number(v) || 33.33 }; setEditItems(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <InputNumber
                          size="small"
                          min={1}
                          value={it.bales_per_container}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, bales_per_container: Number(v) || 576 }; setEditItems(next)
                          }}
                        />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <Select
                          size="small"
                          value={it.packing_type}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, packing_type: v }; setEditItems(next)
                          }}
                          options={Object.entries(PACKING_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                        />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <Select
                          size="small"
                          allowClear
                          value={it.payment_terms}
                          style={{ width: '100%' }}
                          onChange={(v) => {
                            const next = [...editItems]; next[idx] = { ...it, payment_terms: v }; setEditItems(next)
                          }}
                          options={Object.entries(PAYMENT_TERMS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                        />
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          disabled={editItems.length <= 1}
                          onClick={() => setEditItems(editItems.filter((_, i) => i !== idx))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#fafafa', fontWeight: 600 }}>
                    <td style={{ padding: '6px 8px', fontSize: 11 }}>Tổng</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>{itemsTotalTons.toFixed(2)}</td>
                    <td />
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#1B4D3E' }}>
                      ${itemsTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <Button
              size="small"
              icon={<PlusOutlined />}
              style={{ marginBottom: 12 }}
              onClick={() => setEditItems([
                ...editItems,
                {
                  grade: 'SVR_10',
                  quantity_tons: 0,
                  unit_price: 0,
                  bale_weight_kg: editItems[0]?.bale_weight_kg || 33.33,
                  bales_per_container: editItems[0]?.bales_per_container || 576,
                  packing_type: editItems[0]?.packing_type || 'loose_bale',
                },
              ])}
            >
              Thêm dòng
            </Button>
        </>

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
          <Form.Item label="Hoa hồng (%)" name="commission_pct" tooltip="Tính theo % tổng giá trị. Dùng % HOẶC USD/MT.">
            <InputNumber min={0} max={20} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Hoa hồng (USD/MT)" name="commission_usd_per_mt" tooltip="Số USD trên mỗi tấn. Dùng khi môi giới tính theo đô/tấn.">
            <InputNumber min={0} max={1000} step={1} style={{ width: '100%' }} />
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <OrderActionButtons order={order} salesRole={salesRole} onSaved={onSaved} tab="contract" size="small" />
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit ? (
            <Button type="primary" ghost icon={<EditOutlined />} size="small" onClick={startEdit}>
              Chỉnh sửa
            </Button>
          ) : isLocked ? (
            <Tag icon={<LockOutlined />} color="default">Đã khóa</Tag>
          ) : null}
        </div>
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

      {/* Chi tiết sản phẩm (multi-item) */}
      {order.items && order.items.length > 1 && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <SectionHeader title="Chi tiết sản phẩm" color="#1B4D3E" />
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', border: '1px solid #f0f0f0', borderRadius: 6 }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#666' }}>Grade</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, color: '#666' }}>Tấn</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, color: '#666' }}>$/tấn</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, color: '#666' }}>Thành tiền</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#666' }}>Đóng gói</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#666' }}>Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item: any, i: number) => (
                <tr key={item.id || i} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 10px' }}><Tag color="green">{item.grade}</Tag></td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{item.quantity_tons}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace' }}>${item.unit_price?.toLocaleString()}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1B4D3E' }}>${item.total_value_usd?.toLocaleString()}</td>
                  <td style={{ padding: '6px 10px', fontSize: 11 }}>{item.packing_type?.replace('_', ' ') || '—'}</td>
                  <td style={{ padding: '6px 10px', fontSize: 11 }}>{item.payment_terms ? item.payment_terms.split(',').join(' + ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <Divider style={{ margin: '12px 0' }} />

      {/* Section: Điều khoản & Ngân hàng */}
      <SectionHeader title="Điều khoản" color="#1B4D3E" />
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Incoterm">
          <Tag>{INCOTERM_LABELS[order.incoterm as Incoterm] || order.incoterm || '—'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Thanh toán">
          {order.items && order.items.length > 0
            ? order.items.map((it: any) => it.payment_terms ? it.payment_terms.split(',').map((pt: string) => PAYMENT_TERMS_LABELS[pt as PaymentTerms] || pt).join(' + ') : '').filter(Boolean).join(' / ') || '—'
            : PAYMENT_TERMS_LABELS[order.payment_terms as PaymentTerms] || order.payment_terms || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Cảng xếp hàng">
          {PORT_OF_LOADING_OPTIONS.find(p => p.value === order.port_of_loading)?.label || order.port_of_loading || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Cảng đích">{order.port_of_destination || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ngày giao">{fmtDate(order.delivery_date)}</Descriptions.Item>
        <Descriptions.Item label="Hoa hồng">
          {commissionAmt > 0
            ? `${fmtCurrency(commissionAmt)} (${(order.commission_usd_per_mt || 0) > 0
                ? `$${order.commission_usd_per_mt}/MT`
                : `${order.commission_pct || 0}%`})`
            : '—'}
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
