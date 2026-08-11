// ============================================================================
// QualityTab — bảng so sánh chỉ tiêu kỹ thuật (yêu cầu đơn vs tiêu chuẩn grade).
// Component CHUNG cho cả trang chi tiết (full-page) lẫn panel Bảng/Split,
// để 2 dạng xem hiển thị GIỐNG hệt nhau. Tự load tiêu chuẩn grade.
// ============================================================================
import { useEffect, useState } from 'react'
import { Card, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import { SVR_GRADE_OPTIONS } from '../../../services/sales/salesTypes'
import { rubberGradeService } from '../../../services/wms/rubberGradeService'
import type { RubberGradeStandard } from '../../../services/wms/wms.types'

interface QualityRow {
  key: string
  parameter: string
  unit: string
  required: number | null | undefined
  standard: number | null | undefined
  type: 'min' | 'max'
}

export default function QualityTab({ order }: { order: SalesOrder }) {
  const [gradeStandard, setGradeStandard] = useState<RubberGradeStandard | null>(null)
  const gradeLabel = SVR_GRADE_OPTIONS.find((g: any) => g.value === order.grade)?.label || order.grade

  useEffect(() => {
    let alive = true
    if (order.grade) {
      rubberGradeService.getByGrade(order.grade as any)
        .then((std) => { if (alive) setGradeStandard(std) })
        .catch(() => {})
    }
    return () => { alive = false }
  }, [order.grade])

  const rows: QualityRow[] = [
    { key: 'drc_min', parameter: 'DRC', unit: '%', required: order.drc_min, standard: gradeStandard?.drc_min, type: 'min' },
    { key: 'drc_max', parameter: 'DRC', unit: '%', required: order.drc_max, standard: gradeStandard?.drc_max, type: 'max' },
    { key: 'moisture', parameter: 'Moisture', unit: '%', required: order.moisture_max, standard: gradeStandard?.moisture_max, type: 'max' },
    { key: 'dirt', parameter: 'Dirt', unit: '%', required: order.dirt_max, standard: gradeStandard?.dirt_max, type: 'max' },
    { key: 'ash', parameter: 'Ash', unit: '%', required: order.ash_max, standard: gradeStandard?.ash_max, type: 'max' },
    { key: 'nitrogen', parameter: 'Nitrogen', unit: '%', required: order.nitrogen_max, standard: gradeStandard?.nitrogen_max, type: 'max' },
    { key: 'volatile', parameter: 'Volatile', unit: '%', required: order.volatile_max, standard: gradeStandard?.volatile_matter_max, type: 'max' },
    { key: 'pri', parameter: 'PRI', unit: '', required: order.pri_min, standard: gradeStandard?.pri_min, type: 'min' },
    { key: 'mooney', parameter: 'Mooney', unit: '', required: order.mooney_max, standard: gradeStandard?.mooney_max, type: 'max' },
    { key: 'color', parameter: 'Color Lovibond', unit: '', required: order.color_lovibond_max, standard: gradeStandard?.color_lovibond_max, type: 'max' },
  ]

  const columns: ColumnsType<QualityRow> = [
    { title: 'Chỉ tiêu', dataIndex: 'parameter', key: 'parameter' },
    { title: 'Loại', dataIndex: 'type', key: 'type', render: (t) => t === 'min' ? 'Min' : 'Max' },
    {
      title: 'Yêu cầu đơn hàng',
      dataIndex: 'required',
      key: 'required',
      render: (v, row) => (v != null ? `${v} ${row.unit}` : '-'),
    },
    {
      title: `Tiêu chuẩn ${gradeLabel}`,
      dataIndex: 'standard',
      key: 'standard',
      render: (v, row) => (v != null ? `${v} ${row.unit}` : '-'),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_: unknown, row: QualityRow) => {
        if (row.required == null || row.standard == null) return <Tag>N/A</Tag>
        const inSpec = row.type === 'min' ? row.required >= row.standard : row.required <= row.standard
        return inSpec ? <Tag color="green">Đạt</Tag> : <Tag color="red">Không đạt</Tag>
      },
    },
  ]

  return (
    <Card title="So sánh chỉ tiêu kỹ thuật" size="small">
      <Table dataSource={rows} columns={columns} pagination={false} size="small" bordered />
    </Card>
  )
}
