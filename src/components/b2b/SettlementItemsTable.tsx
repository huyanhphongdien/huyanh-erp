// ============================================================================
// SETTLEMENT ITEMS TABLE — Bảng hạng mục quyết toán (editable)
// File: src/components/b2b/SettlementItemsTable.tsx
// Phase: E5
// ============================================================================

import { useState } from 'react'
import {
  Table,
  Button,
  Input,
  InputNumber,
  Select,
  Space,
  Popconfirm,
  Typography,
  Switch,
} from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

export interface SettlementItemRow {
  id?: string
  key: string
  item_type: string
  description: string
  quantity: number | null
  unit_price: number | null
  amount: number
  is_credit: boolean
  notes: string | null
}

interface SettlementItemsTableProps {
  items: SettlementItemRow[]
  editable?: boolean
  onChange?: (items: SettlementItemRow[]) => void
}

const ITEM_TYPE_OPTIONS = [
  { value: 'rubber', label: 'Mủ cao su' },
  { value: 'transport', label: 'Vận chuyển' },
  { value: 'processing', label: 'Gia công' },
  { value: 'deduction', label: 'Khấu trừ' },
  { value: 'bonus', label: 'Thưởng' },
  { value: 'penalty', label: 'Phạt' },
  { value: 'other', label: 'Khác' },
]

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('vi-VN').format(value)
}

const SettlementItemsTable: React.FC<SettlementItemsTableProps> = ({
  items,
  editable = false,
  onChange,
}) => {
  const handleFieldChange = (key: string, field: keyof SettlementItemRow, value: any) => {
    if (!onChange) return

    const newItems = items.map(item => {
      if (item.key !== key) return item

      const updated = { ...item, [field]: value }

      // Auto-calc amount from qty * price
      if (field === 'quantity' || field === 'unit_price') {
        const qty = field === 'quantity' ? value : item.quantity
        const price = field === 'unit_price' ? value : item.unit_price
        if (qty && price) {
          updated.amount = qty * price
        }
      }

      return updated
    })

    onChange(newItems)
  }

  const handleAdd = () => {
    if (!onChange) return

    const newItem: SettlementItemRow = {
      key: `new-${Date.now()}`,
      item_type: 'rubber',
      description: '',
      quantity: null,
      unit_price: null,
      amount: 0,
      is_credit: true,
      notes: null,
    }

    onChange([...items, newItem])
  }

  const handleRemove = (key: string) => {
    if (!onChange) return
    onChange(items.filter(item => item.key !== key))
  }

  const totalCredit = items.filter(i => i.is_credit).reduce((sum, i) => sum + i.amount, 0)
  const totalDebit = items.filter(i => !i.is_credit).reduce((sum, i) => sum + i.amount, 0)
  const netTotal = totalCredit - totalDebit

  const columns: ColumnsType<SettlementItemRow> = [
    {
      title: 'Loại',
      dataIndex: 'item_type',
      width: 140,
      render: (value: string, record) =>
        editable ? (
          <Select
            size="small"
            value={value}
            options={ITEM_TYPE_OPTIONS}
            onChange={v => handleFieldChange(record.key, 'item_type', v)}
            style={{ width: '100%' }}
          />
        ) : (
          ITEM_TYPE_OPTIONS.find(o => o.value === value)?.label || value
        ),
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      render: (value: string, record) =>
        editable ? (
          <Input
            size="small"
            value={value}
            onChange={e => handleFieldChange(record.key, 'description', e.target.value)}
            placeholder="Mô tả hạng mục"
          />
        ) : (
          value
        ),
    },
    {
      title: 'SL',
      dataIndex: 'quantity',
      width: 100,
      align: 'right',
      render: (value: number | null, record) =>
        editable ? (
          <InputNumber
            size="small"
            value={value}
            onChange={v => handleFieldChange(record.key, 'quantity', v)}
            min={0}
            style={{ width: '100%' }}
          />
        ) : (
          value?.toLocaleString('vi-VN') || '-'
        ),
    },
    {
      title: 'Đơn giá',
      dataIndex: 'unit_price',
      width: 130,
      align: 'right',
      render: (value: number | null, record) =>
        editable ? (
          <InputNumber
            size="small"
            value={value}
            onChange={v => handleFieldChange(record.key, 'unit_price', v)}
            min={0}
            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={v => Number(v?.replace(/,/g, '') || 0)}
            style={{ width: '100%' }}
          />
        ) : (
          value ? formatCurrency(value) : '-'
        ),
    },
    {
      title: 'Thành tiền',
      dataIndex: 'amount',
      width: 140,
      align: 'right',
      render: (value: number, record) =>
        editable ? (
          <InputNumber
            size="small"
            value={value}
            onChange={v => handleFieldChange(record.key, 'amount', v || 0)}
            min={0}
            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={v => Number(v?.replace(/,/g, '') || 0)}
            style={{ width: '100%' }}
          />
        ) : (
          <Text strong>{formatCurrency(value)} ₫</Text>
        ),
    },
    {
      title: 'Loại',
      dataIndex: 'is_credit',
      width: 90,
      align: 'center',
      render: (value: boolean, record) =>
        editable ? (
          <Switch
            size="small"
            checked={value}
            onChange={v => handleFieldChange(record.key, 'is_credit', v)}
            checkedChildren="Có"
            unCheckedChildren="Nợ"
          />
        ) : (
          <Text type={value ? 'success' : 'danger'}>{value ? 'Có' : 'Nợ'}</Text>
        ),
    },
  ]

  if (editable) {
    columns.push({
      title: '',
      width: 50,
      align: 'center',
      render: (_: any, record) => (
        <Popconfirm title="Xóa hạng mục này?" onConfirm={() => handleRemove(record.key)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    })
  }

  return (
    <div>
      <Table
        columns={columns}
        dataSource={items}
        rowKey="key"
        pagination={false}
        size="small"
        bordered
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4} align="right">
                <Text strong>Tổng cộng:</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <Text strong style={{ color: '#1B4D3E' }}>
                  {formatCurrency(netTotal)} ₫
                </Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} colSpan={editable ? 2 : 1} />
            </Table.Summary.Row>
            {totalDebit > 0 && (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4} align="right">
                  <Text type="secondary">Khấu trừ:</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <Text type="danger">-{formatCurrency(totalDebit)} ₫</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5} colSpan={editable ? 2 : 1} />
              </Table.Summary.Row>
            )}
          </Table.Summary>
        )}
      />
      {editable && (
        <Button
          type="dashed"
          onClick={handleAdd}
          icon={<PlusOutlined />}
          style={{ width: '100%', marginTop: 8 }}
        >
          Thêm hạng mục
        </Button>
      )}
    </div>
  )
}

export default SettlementItemsTable
