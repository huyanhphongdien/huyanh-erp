// ============================================================================
// TRACEABILITY TREE COMPONENT
// File: src/components/wms/TraceabilityTree.tsx
// Module: Kho Thanh Pham (WMS) - Huy Anh Rubber ERP
// Mo ta: Hien thi cay truy xuat nguon goc san pham (Ant Design Tree)
// ============================================================================

import React, { useEffect, useState, useMemo } from 'react'
import { Tree, Spin, Empty, Tag, Typography } from 'antd'
import {
  GiftOutlined,
  ToolOutlined,
  ExperimentOutlined,
  InboxOutlined,
  FileTextOutlined,
  UserOutlined,
} from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import { traceabilityService, type TraceNode, type TraceNodeType } from '../../services/wms/traceabilityService'

const { Text } = Typography

// ============================================================================
// CONFIG
// ============================================================================

const NODE_CONFIG: Record<TraceNodeType, {
  icon: React.ReactNode
  color: string
  tagColor: string
  tagLabel: string
}> = {
  finished_product: {
    icon: <GiftOutlined />,
    color: '#52c41a',
    tagColor: 'green',
    tagLabel: 'Thành phẩm',
  },
  production: {
    icon: <ToolOutlined />,
    color: '#1890ff',
    tagColor: 'blue',
    tagLabel: 'Sản xuất',
  },
  raw_batch: {
    icon: <ExperimentOutlined />,
    color: '#fa8c16',
    tagColor: 'orange',
    tagLabel: 'NVL',
  },
  stock_in: {
    icon: <InboxOutlined />,
    color: '#722ed1',
    tagColor: 'purple',
    tagLabel: 'Nhập kho',
  },
  deal: {
    icon: <FileTextOutlined />,
    color: '#13c2c2',
    tagColor: 'cyan',
    tagLabel: 'Deal',
  },
  partner: {
    icon: <UserOutlined />,
    color: '#eb2f96',
    tagColor: 'magenta',
    tagLabel: 'Đại lý',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

let nodeKeyCounter = 0

function traceNodeToDataNode(node: TraceNode): DataNode {
  const config = NODE_CONFIG[node.type]
  const key = `${node.type}-${node.id}-${nodeKeyCounter++}`

  const titleContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Tag color={config.tagColor} style={{ margin: 0, fontSize: 11 }}>
          {config.tagLabel}
        </Tag>
        <Text strong style={{ color: config.color, fontSize: 14 }}>
          {node.label}
        </Text>
        {node.date && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {node.date}
          </Text>
        )}
      </div>
      {node.detail && (
        <Text type="secondary" style={{ fontSize: 12, paddingLeft: 4 }}>
          {node.detail}
        </Text>
      )}
    </div>
  )

  return {
    key,
    title: titleContent,
    icon: <span style={{ color: config.color, fontSize: 16 }}>{config.icon}</span>,
    children: node.children.map(traceNodeToDataNode),
  }
}

function collectAllKeys(dataNodes: DataNode[]): React.Key[] {
  const keys: React.Key[] = []
  for (const node of dataNodes) {
    keys.push(node.key)
    if (node.children) {
      keys.push(...collectAllKeys(node.children as DataNode[]))
    }
  }
  return keys
}

// ============================================================================
// PROPS
// ============================================================================

export interface TraceabilityTreeProps {
  /** ID lo thanh pham - truy xuat nguoc ve NVL, deal, dai ly */
  batchId?: string
  /** ID deal - truy xuat xuoi ve thanh pham */
  dealId?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

const TraceabilityTree: React.FC<TraceabilityTreeProps> = ({ batchId, dealId }) => {
  const [loading, setLoading] = useState(false)
  const [traceData, setTraceData] = useState<TraceNode | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTrace = async () => {
      if (!batchId && !dealId) {
        setTraceData(null)
        return
      }

      setLoading(true)
      setError(null)
      nodeKeyCounter = 0

      try {
        let result: TraceNode | null = null

        if (batchId) {
          result = await traceabilityService.traceFromBatch(batchId)
        } else if (dealId) {
          result = await traceabilityService.traceFromDeal(dealId)
        }

        setTraceData(result)
      } catch (err: any) {
        console.error('Loi truy xuat nguon goc:', err)
        setError(err?.message || 'Không thể truy xuất nguồn gốc')
      } finally {
        setLoading(false)
      }
    }

    fetchTrace()
  }, [batchId, dealId])

  const { treeData, expandedKeys } = useMemo(() => {
    if (!traceData) return { treeData: [], expandedKeys: [] }
    nodeKeyCounter = 0
    const dataNodes = [traceNodeToDataNode(traceData)]
    const allKeys = collectAllKeys(dataNodes)
    return { treeData: dataNodes, expandedKeys: allKeys }
  }, [traceData])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Spin size="large" tip="Đang truy xuất nguồn gốc..." />
      </div>
    )
  }

  if (error) {
    return (
      <Empty
        description={
          <Text type="danger">{error}</Text>
        }
      />
    )
  }

  if (!traceData) {
    return (
      <Empty description="Không tìm thấy dữ liệu truy xuất nguồn gốc" />
    )
  }

  return (
    <Tree
      showIcon
      showLine={{ showLeafIcon: false }}
      defaultExpandAll
      defaultExpandedKeys={expandedKeys}
      treeData={treeData}
      selectable={false}
      style={{ padding: '8px 0' }}
    />
  )
}

export default TraceabilityTree
