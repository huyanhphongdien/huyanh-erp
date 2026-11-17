// ============================================================================
// PartyFields — ô "NGƯỜI NHẬN HÀNG" dùng chung (form tạo đơn, form mua tiếp, thẻ Các bên của đơn)
// File: src/pages/sales/components/PartyFields.tsx (sales_family_parties_p1, owner duyệt 17/11/2026)
//
// Điều khiển kiểu antd (value/onChange) → bọc thẳng trong <Form.Item name="ship_to_customer_id">.
//   value = ship_to_customer_id · null/undefined = CHÍNH NGƯỜI MUA (đơn mua thẳng — một cách ghi duy nhất).
// Người nhận LUÔN là một hồ sơ khách: công ty chưa có hồ sơ → "+ Thêm người nhận mới…" mở form tạo nhanh
// (tên / nước / địa chỉ) qua salesCustomerService.create → vẫn "gõ tay tên + địa chỉ" nhưng lưu thành hồ sơ
// để thống kê khách cuối đúng. Không có đường "người nhận chỉ là chữ" (chữ in Consignee/Notify ở 4 ô riêng).
// Nơi gọi chỉ vẽ ô này khi salesOrderService.familyPartiesReady() = true.
// ============================================================================

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Alert, Button, Form, Input, Modal, Select, Space, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  salesCustomerService,
  type SalesCustomerPickerOption,
} from '../../../services/sales/salesCustomerService'
import {
  COUNTRY_OPTIONS,
  CUSTOMER_STATUS_LABELS,
  countryFlag,
  partyShortName,
  type CustomerStatus,
} from '../../../services/sales/salesTypes'
import { useIsPhone } from '../../../hooks/useIsPhone'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { palette } from '../../../theme/palette'

const { Text } = Typography

/** Khoá TanStack Query của danh sách khách gọn (dùng chung PartyFields ↔ nơi khác muốn làm mới sau khi tạo khách). */
export const SALES_CUSTOMER_PICKER_QUERY_KEY = ['sales-customers-picker'] as const

const BUYER = '__buyer__'
const NEW = '__new__'

/** Props ô Người nhận hàng (dùng như một control của antd Form.Item). */
export interface PartyFieldsProps {
  /** ship_to_customer_id; null/undefined = chính người mua */
  value?: string | null
  /** trả null khi chọn "Chính người mua" (hoặc chọn trúng người mua) */
  onChange?: (value: string | null) => void
  /** customer_id của đơn — loại khỏi danh sách; người nhận = người mua thì lưu NULL */
  buyerId?: string | null
  disabled?: boolean
  /** tô nổi + câu "Người nhận lần này — xác nhận" (đợt mua tiếp chép người nhận từ đơn nguồn) */
  highlight?: boolean
  placeholder?: string
  style?: CSSProperties
}

const norm = (s?: string | null) => (s || '').toUpperCase().replace(/[^A-Z0-9À-Ỹ]+/gi, ' ').replace(/\s+/g, ' ').trim()
/** Nước cho form tạo nhanh: mã ISO-2 thật (business_partners.country_iso là char(2) → bỏ 'OTHER'). */
const QUICK_COUNTRY_OPTIONS = COUNTRY_OPTIONS.filter((c) => c.value !== 'OTHER').map((c) => ({
  value: c.value as string,
  label: `${countryFlag(c.value)} ${c.label} (${c.value})`,
}))

export default function PartyFields({
  value,
  onChange,
  buyerId,
  disabled,
  highlight,
  placeholder,
  style,
}: PartyFieldsProps) {
  const isPhone = useIsPhone()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ name: string; short_name?: string; country: string; address?: string }>()
  const typedName = Form.useWatch('name', form)

  const { data: customers = [], isLoading, error, refetch } = useQuery({
    queryKey: SALES_CUSTOMER_PICKER_QUERY_KEY,
    queryFn: () => salesCustomerService.getPickerOptions(),
    staleTime: 5 * 60 * 1000,
  })

  const buyer = useMemo(() => customers.find((c) => c.id === buyerId) || null, [customers, buyerId])

  // Người nhận trùng người mua (vd đổi người mua sau khi đã chọn) → về "Chính người mua" (NULL)
  useEffect(() => {
    if (value && buyerId && value === buyerId) onChange?.(null)
  }, [value, buyerId, onChange])

  const selected = value ? customers.find((c) => c.id === value) || null : null

  const options = useMemo(() => {
    const opts: Array<{ value: string; label: React.ReactNode; searchText: string }> = [
      {
        value: BUYER,
        label: <span>Chính người mua{buyer ? <Text type="secondary"> ({partyShortName(buyer)})</Text> : null}</span>,
        searchText: '',
      },
    ]
    for (const c of customers) {
      if (c.id === buyerId) continue
      const inactive = c.status && c.status !== 'active'
      opts.push({
        value: c.id,
        label: (
          <span title={c.name}>
            {countryFlag(c.country)} {partyShortName(c)}
            {inactive ? <Text type="warning"> · {CUSTOMER_STATUS_LABELS[c.status as CustomerStatus] ?? c.status}</Text> : null}
          </span>
        ),
        searchText: `${c.name} ${c.short_name || ''} ${c.code || ''} ${c.country || ''}`.toLowerCase(),
      })
    }
    // Giá trị đang chọn mà danh sách chưa có (đang tải / khách đã bị xoá) — đừng in mã uuid ra ô
    if (value && !customers.some((c) => c.id === value)) {
      opts.push({ value, label: <Text type="secondary">{isLoading ? 'Đang tải…' : '(khách không còn trong danh sách)'}</Text>, searchText: '' })
    }
    opts.push({
      value: NEW,
      label: <span><PlusOutlined /> Thêm người nhận mới…</span>,
      searchText: '',
    })
    return opts
  }, [customers, buyer, buyerId, value, isLoading])

  const openCreate = (prefillName?: string) => {
    form.resetFields()
    form.setFieldsValue({ name: (prefillName || '').trim() || undefined })
    setCreateOpen(true)
  }

  const handleSelect = (v: string) => {
    if (v === NEW) {
      openCreate(search)
      return
    }
    if (v === BUYER) {
      onChange?.(null)
      return
    }
    onChange?.(v === buyerId ? null : v)
  }

  // Khách có tên gần giống tên đang gõ → gợi ý dùng lại, tránh tạo trùng hồ sơ
  const similar = useMemo<SalesCustomerPickerOption[]>(() => {
    const n = norm(typedName)
    if (n.length < 3) return []
    return customers
      .filter((c) => {
        const cn = norm(c.name)
        const cs = norm(c.short_name)
        return cn === n || cn.includes(n) || n.includes(cn) || (!!cs && (cs === n || n.includes(cs)))
      })
      .slice(0, 3)
  }, [typedName, customers])

  const pickExisting = (c: SalesCustomerPickerOption) => {
    setCreateOpen(false)
    onChange?.(c.id === buyerId ? null : c.id)
  }

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields()
      setSaving(true)
      const created = await salesCustomerService.create({
        name: vals.name.trim(),
        short_name: vals.short_name?.trim() || undefined,
        country: vals.country,
        address: vals.address?.trim() || undefined,
        status: 'active',
        notes: 'Tạo nhanh từ ô Người nhận hàng của đơn bán',
      })
      const opt: SalesCustomerPickerOption = {
        id: created.id,
        code: created.code ?? null,
        name: created.name,
        short_name: created.short_name ?? null,
        country: created.country ?? null,
        address: created.address ?? null,
        status: created.status ?? 'active',
      }
      qc.setQueryData<SalesCustomerPickerOption[]>(SALES_CUSTOMER_PICKER_QUERY_KEY, (old) =>
        [...(old || []).filter((c) => c.id !== opt.id), opt].sort((a, b) => a.name.localeCompare(b.name)))
      void qc.invalidateQueries({ queryKey: SALES_CUSTOMER_PICKER_QUERY_KEY })
      setCreateOpen(false)
      onChange?.(opt.id)
      message.success(`Đã tạo hồ sơ người nhận ${partyShortName(opt)}`)
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return   // lỗi form — antd tự tô đỏ
      message.error(dichLoiHeThong(e, 'Không tạo được hồ sơ người nhận'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={style}>
      <Select
        value={value || BUYER}
        onChange={handleSelect}
        options={options}
        disabled={disabled}
        loading={isLoading}
        placeholder={placeholder || 'Chính người mua'}
        style={{ width: '100%', ...(highlight ? { boxShadow: `0 0 0 2px ${palette.warning}`, borderRadius: 6 } : null) }}
        popupMatchSelectWidth={isPhone}
        showSearch={{
          onSearch: setSearch,
          filterOption: (input, opt) => {
            const o = opt as { value?: string; searchText?: string } | undefined
            if (!o || o.value === NEW || o.value === BUYER) return true
            return (o.searchText || '').includes(input.trim().toLowerCase())
          },
        }}
        aria-label="Người nhận hàng"
      />
      {highlight && (
        <Text type="warning" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
          Người nhận lần này — xác nhận (chép từ đơn trước, sửa được cho từng đợt)
        </Text>
      )}
      {error ? (
        <Space size={6} style={{ marginTop: 4, flexWrap: 'wrap' }}>
          <Text type="danger" style={{ fontSize: 12 }}>{dichLoiHeThong(error, 'Không tải được danh sách khách')}</Text>
          <Button size="small" type="link" onClick={() => refetch()} style={{ padding: 0 }}>Thử lại</Button>
        </Space>
      ) : null}
      {selected && selected.status && selected.status !== 'active' ? (
        <Text type="warning" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
          ⚠ {partyShortName(selected)} đang ở trạng thái "{CUSTOMER_STATUS_LABELS[selected.status as CustomerStatus] ?? selected.status}" — kiểm lại trước khi giao hàng
        </Text>
      ) : null}

      <Modal
        open={createOpen}
        title="Thêm người nhận hàng mới"
        okText="Tạo hồ sơ người nhận"
        cancelText="Huỷ"
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={saving}
        destroyOnHidden
        width={isPhone ? '100%' : 520}
        style={isPhone ? { top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 } : undefined}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
          Người nhận được lưu thành một hồ sơ khách (tự sinh mã) để thống kê "hàng về tay khách cuối" đúng.
          Công nợ, thanh toán, hoa hồng vẫn theo NGƯỜI MUA.
        </Text>
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Tên công ty nhận hàng (tên đầy đủ, in chứng từ)"
            rules={[{ required: true, whitespace: true, message: 'Nhập tên công ty nhận hàng' }]}
          >
            <Input placeholder="vd QINGDAO JINTONG TRADING CO., LTD" autoFocus maxLength={300} />
          </Form.Item>
          {similar.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Có thể đã có hồ sơ khách này"
              description={
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  {similar.map((c) => (
                    <Space key={c.id} size={8} wrap>
                      <span>{countryFlag(c.country)} {c.name}{c.code ? <Text type="secondary"> · {c.code}</Text> : null}</span>
                      <Button size="small" onClick={() => pickExisting(c)}>Dùng khách này</Button>
                    </Space>
                  ))}
                </Space>
              }
            />
          )}
          <Form.Item name="short_name" label="Tên ngắn (hiện trên thẻ, vd JINTONG)">
            <Input placeholder="Để trống: tự rút gọn từ tên đầy đủ" maxLength={60} />
          </Form.Item>
          <Form.Item name="country" label="Nước" rules={[{ required: true, message: 'Chọn nước của người nhận' }]}>
            <Select
              options={QUICK_COUNTRY_OPTIONS}
              placeholder="Chọn nước"
              showSearch={{ optionFilterProp: 'label' }}
            />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ (in ô Consignee/Notify)">
            <Input.TextArea rows={3} placeholder="Địa chỉ nhận hàng / địa chỉ đăng ký" maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
