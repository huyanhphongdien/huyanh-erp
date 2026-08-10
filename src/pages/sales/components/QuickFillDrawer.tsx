// ============================================================================
// QUICK-FILL DRAWER — nhập nhanh TẠI CHỖ dữ liệu còn thiếu cho 1 chứng từ.
// Mở từ panel "Dữ liệu cần" (nút "Nhập ngay"): chỉ mấy ô cần theo NƠI nhập
// (Hồ sơ khách · Hợp đồng · Vận chuyển · Đóng gói) → Lưu → readiness tự cập nhật.
// Kèm link phụ "Mở tab đầy đủ ↗" cho trường hợp cần form đầy đủ.
// File: src/pages/sales/components/QuickFillDrawer.tsx
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { Drawer, Form, Input, InputNumber, Select, DatePicker, Button, Space, Table, Typography, Alert, message } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { ReadyGroup, ReadyCtx } from '../../../services/sales/docReadiness'
import { GROUP_LABEL } from '../../../services/sales/docReadiness'
import { INCOTERM_LABELS, type SalesOrderContainer } from '../../../services/sales/salesTypes'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import { containerService } from '../../../services/sales/containerService'
import { customerExportProfileService, type CompanyBank } from '../../../services/sales/customerExportProfileService'

const { Text } = Typography
const BRAND = '#1B4D3E'
const CIF_TERMS = ['CIF', 'CNF', 'CFR', 'DDP']

export default function QuickFillDrawer(
  { open, group, ctx, onClose, onSaved, onOpenFullTab }:
  {
    open: boolean
    group: ReadyGroup | null
    ctx: ReadyCtx
    onClose: () => void
    onSaved: () => void
    onOpenFullTab: (g: ReadyGroup) => void
  },
) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [banks, setBanks] = useState<CompanyBank[]>([])
  // Đóng gói: nhập cont/seal/gross/pallet/lô theo từng container (id → patch)
  type CRow = { container_no: string; seal_no: string; gross_weight_kg: number | null; pallet_count: number | null; lot_no: number | null }
  const [rows, setRows] = useState<Record<string, CRow>>({})

  const order = ctx.order
  const conts = ctx.containers

  // nạp giá trị hiện có mỗi lần mở
  useEffect(() => {
    if (!open || !group) return
    if (group === 'profile') {
      customerExportProfileService.listBanks().then(setBanks).catch(() => setBanks([]))
      form.setFieldsValue({
        buyer_legal_name: ctx.profile?.buyer_legal_name || '',
        buyer_address: ctx.profile?.buyer_address || '',
        preferred_bank_id: ctx.profile?.preferred_bank_id || undefined,
      })
    } else if (group === 'contract') {
      form.setFieldsValue({
        grade: order.grade, quantity_tons: order.quantity_tons,
        unit_price: order.unit_price, incoterm: order.incoterm,
      })
    } else if (group === 'shipping') {
      form.setFieldsValue({
        port_of_loading: order.port_of_loading, port_of_destination: order.port_of_destination,
        vessel_name: order.vessel_name, bl_number: order.bl_number,
        freight_amount: order.freight_amount, insurance_amount: order.insurance_amount,
        proforma_date: order.proforma_date ? dayjs(order.proforma_date) : undefined,
        item_no: order.item_no, packing_desc: order.packing_desc,
      })
    } else if (group === 'packing') {
      const m: Record<string, CRow> = {}
      conts.forEach((c) => {
        if (c.id) m[c.id] = {
          container_no: c.container_no || '', seal_no: c.seal_no || '',
          gross_weight_kg: c.gross_weight_kg ?? null, pallet_count: c.pallet_count ?? null, lot_no: c.lot_no ?? null,
        }
      })
      setRows(m)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group])

  // FOB(COST) = CIF − cước − BH (xem trước cho đơn CIF)
  const isCIF = CIF_TERMS.includes((order.incoterm || '').toUpperCase())
  const costPreview = useMemo(() => {
    if (group !== 'shipping' || !isCIF) return null
    const cif = (order.quantity_tons || 0) * (order.unit_price || 0)
    return { cif }
  }, [group, isCIF, order.quantity_tons, order.unit_price])

  const setRow = (id: string, key: keyof CRow, val: string | number | null) =>
    setRows((p) => ({ ...p, [id]: { ...p[id], [key]: val } as CRow }))

  const doSave = async () => {
    if (!group) return
    setSaving(true)
    try {
      if (group === 'profile') {
        const v = await form.validateFields()
        if (!order.customer_id) throw new Error('Đơn chưa gắn khách hàng')
        await customerExportProfileService.upsert(order.customer_id, {
          buyer_legal_name: (v.buyer_legal_name || '').trim() || null,
          buyer_address: (v.buyer_address || '').trim() || null,
          preferred_bank_id: v.preferred_bank_id || null,
        })
      } else if (group === 'contract') {
        const v = await form.validateFields()
        await salesOrderService.updateFields(order.id, {
          grade: v.grade, quantity_tons: v.quantity_tons,
          unit_price: v.unit_price, incoterm: v.incoterm,
        })
      } else if (group === 'shipping') {
        const v = await form.validateFields()
        await salesOrderService.updateFields(order.id, {
          port_of_loading: v.port_of_loading || null,
          port_of_destination: v.port_of_destination || null,
          vessel_name: v.vessel_name || null,
          bl_number: v.bl_number || null,
          freight_amount: v.freight_amount ?? null,
          insurance_amount: v.insurance_amount ?? null,
          proforma_date: v.proforma_date ? v.proforma_date.format('YYYY-MM-DD') : null,
          item_no: v.item_no || null,
          packing_desc: v.packing_desc || null,
        })
      } else if (group === 'packing') {
        for (const c of conts) {
          if (!c.id) continue
          const r = rows[c.id]; if (!r) continue
          const patch: Partial<SalesOrderContainer> = {}
          if ((r.container_no || '') !== (c.container_no || '')) patch.container_no = r.container_no.trim() || null
          if ((r.seal_no || '') !== (c.seal_no || '')) patch.seal_no = r.seal_no.trim() || null
          if ((r.gross_weight_kg ?? null) !== (c.gross_weight_kg ?? null)) patch.gross_weight_kg = r.gross_weight_kg ?? null
          if ((r.pallet_count ?? null) !== (c.pallet_count ?? null)) patch.pallet_count = r.pallet_count ?? null
          if ((r.lot_no ?? null) !== (c.lot_no ?? null)) patch.lot_no = r.lot_no ?? null
          if (Object.keys(patch).length) await containerService.updateContainer(c.id, patch)
        }
      }
      message.success('Đã lưu — kiểm tra lại dữ liệu chứng từ')
      onSaved()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return // lỗi validate form → antd tự hiện
      message.error(err instanceof Error ? err.message : 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  const title = group ? `Nhập nhanh — ${GROUP_LABEL[group]}` : ''

  return (
    <Drawer
      title={title}
      width={group === 'packing' ? 760 : 480}
      open={open}
      onClose={onClose}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {group && group !== 'auto' && group !== 'negotiation' ? (
            <Button type="link" size="small" icon={<ExportOutlined />} style={{ padding: 0 }}
              onClick={() => onOpenFullTab(group)}>Mở tab đầy đủ</Button>
          ) : <span />}
          <Space>
            <Button onClick={onClose}>Đóng</Button>
            <Button type="primary" loading={saving} onClick={doSave} style={{ background: BRAND, borderColor: BRAND }}>
              Lưu
            </Button>
          </Space>
        </div>
      }
    >
      {group === 'profile' && (
        <Form form={form} layout="vertical">
          <Alert type="info" showIcon style={{ marginBottom: 14 }}
            message="Áp dụng cho MỌI đơn của khách này (hồ sơ chứng từ khách)" />
          <Form.Item name="buyer_legal_name" label="Buyer — tên pháp lý" rules={[{ required: true, message: 'Nhập tên buyer' }]}>
            <Input placeholder="VD: GRI ..." />
          </Form.Item>
          <Form.Item name="buyer_address" label="Địa chỉ buyer">
            <Input.TextArea rows={3} placeholder="Địa chỉ đầy đủ (hiện trên Invoice/PKL...)" />
          </Form.Item>
          <Form.Item name="preferred_bank_id" label="Ngân hàng thụ hưởng" rules={[{ required: true, message: 'Chọn ngân hàng' }]}>
            <Select
              placeholder="Chọn ngân hàng Huy Anh"
              options={banks.map((b) => ({ value: b.id, label: `${b.bank_name}${b.account_no ? ' · ' + b.account_no : ''}` }))}
            />
          </Form.Item>
        </Form>
      )}

      {group === 'contract' && (
        <Form form={form} layout="vertical">
          <Form.Item name="grade" label="Grade (loại mủ)" rules={[{ required: true }]}>
            <Input placeholder="VD: SVR 10" />
          </Form.Item>
          <Form.Item name="quantity_tons" label="Số lượng (tấn)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} addonAfter="tấn" />
          </Form.Item>
          <Form.Item name="unit_price" label="Đơn giá" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} addonAfter="USD/tấn" />
          </Form.Item>
          <Form.Item name="incoterm" label="Incoterm" rules={[{ required: true }]}>
            <Select options={Object.entries(INCOTERM_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
        </Form>
      )}

      {group === 'shipping' && (
        <Form form={form} layout="vertical">
          {isCIF && (
            <Alert type="warning" showIcon style={{ marginBottom: 14 }}
              message="Đơn CIF: cần Cước + Bảo hiểm"
              description={
                costPreview
                  ? <span>CIF ≈ <b>${costPreview.cif.toLocaleString('en-US')}</b>. FOB(COST) trên Hối phiếu = CIF − Cước − Bảo hiểm.</span>
                  : 'Thiếu → FOB(COST) sẽ bằng đúng CIF (sai giá trị hối phiếu).'
              }
            />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="freight_amount" label="Cước (Freight, USD)">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="insurance_amount" label="Bảo hiểm (Insurance, USD)">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="port_of_loading" label="Cảng xếp">
              <Input placeholder="VD: Ho Chi Minh City Port" />
            </Form.Item>
            <Form.Item name="port_of_destination" label="Cảng đến">
              <Input placeholder="VD: Colombo" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item name="vessel_name" label="Tên tàu">
              <Input />
            </Form.Item>
            <Form.Item name="bl_number" label="Số B/L">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="proforma_date" label="Ngày Proforma (PI)">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="item_no" label="ITEM NO. (mã hàng của khách)">
            <Input placeholder="VD: 5001-... (nếu khách yêu cầu)" />
          </Form.Item>
          <Form.Item name="packing_desc" label="Kiểu đóng gói (dòng PACKING)">
            <Input placeholder="VD: 35 PALLETS / 1.260 BALES ..." />
          </Form.Item>
        </Form>
      )}

      {group === 'packing' && (
        <>
          <Alert type="info" showIcon style={{ marginBottom: 12 }}
            message="Nhập Số cont · Seal · Gross · Pallet · Lô cho từng container"
            description='Cont/Seal trống → chứng từ in "TBD". Gán "Lô" giống nhau để chiết khấu theo lô.' />
          <Table<SalesOrderContainer>
            size="small" rowKey={(c) => c.id || ''} pagination={false} dataSource={conts}
            scroll={{ x: 620 }}
            columns={[
              { title: 'Số cont', width: 130, render: (_: unknown, c: SalesOrderContainer) => (
                <Input size="small" value={c.id ? rows[c.id]?.container_no : ''} placeholder="TBD"
                  onChange={(e) => c.id && setRow(c.id, 'container_no', e.target.value)} />) },
              { title: 'Seal', width: 120, render: (_: unknown, c: SalesOrderContainer) => (
                <Input size="small" value={c.id ? rows[c.id]?.seal_no : ''} placeholder="TBD"
                  onChange={(e) => c.id && setRow(c.id, 'seal_no', e.target.value)} />) },
              { title: 'Net (kg)', width: 80, align: 'right', render: (_: unknown, c: SalesOrderContainer) =>
                c.net_weight_kg ? c.net_weight_kg.toLocaleString('en-US') : <Text type="secondary">—</Text> },
              { title: 'Gross', width: 90, render: (_: unknown, c: SalesOrderContainer) => (
                <InputNumber size="small" min={0} style={{ width: '100%' }} value={c.id ? rows[c.id]?.gross_weight_kg ?? undefined : undefined}
                  onChange={(val) => c.id && setRow(c.id, 'gross_weight_kg', (val as number) ?? null)} />) },
              { title: 'Pallet', width: 70, render: (_: unknown, c: SalesOrderContainer) => (
                <InputNumber size="small" min={0} style={{ width: '100%' }} value={c.id ? rows[c.id]?.pallet_count ?? undefined : undefined}
                  onChange={(val) => c.id && setRow(c.id, 'pallet_count', (val as number) ?? null)} />) },
              { title: 'Lô', width: 62, render: (_: unknown, c: SalesOrderContainer) => (
                <InputNumber size="small" min={1} style={{ width: '100%' }} value={c.id ? rows[c.id]?.lot_no ?? undefined : undefined}
                  onChange={(val) => c.id && setRow(c.id, 'lot_no', (val as number) ?? null)} />) },
            ]}
          />
        </>
      )}
    </Drawer>
  )
}
