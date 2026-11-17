// ============================================================================
// LEDGER BALANCE CARD — Card hiển thị số dư công nợ đối tác
// File: src/components/b2b/LedgerBalanceCard.tsx
// Phase: E5
// ============================================================================

import { useState, useEffect } from 'react'
import { Statistic, Row, Col, Spin } from 'antd'
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import GlassCard from '../ui/GlassCard'
import PageState from '../common/PageState'
import { ledgerService } from '../../services/b2b/ledgerService'
import { fmtVndNum } from '../../utils/format'

interface LedgerBalanceCardProps {
  partnerId?: string
  balance?: {
    total_debit: number
    total_credit: number
    balance: number
  }
  loading?: boolean
}

const LedgerBalanceCard: React.FC<LedgerBalanceCardProps> = ({
  partnerId,
  balance: externalBalance,
  loading: externalLoading,
}) => {
  const [balance, setBalance] = useState(externalBalance || { total_debit: 0, total_credit: 0, balance: 0 })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (externalBalance) {
      setBalance(externalBalance)
      return
    }

    if (!partnerId) return

    const fetchBalance = async () => {
      try {
        setLoading(true)
        setLoadError(null)
        const data = await ledgerService.getPartnerBalance(partnerId)
        setBalance(data)
      } catch (error) {
        console.error('Error fetching balance:', error)
        setLoadError(error)
      } finally {
        setLoading(false)
      }
    }

    fetchBalance()
  }, [partnerId, externalBalance, reloadKey])

  const isLoading = externalLoading || loading

  // Tải lỗi → báo lỗi + Thử lại, KHÔNG hiện số dư 0 ₫ giả
  if (!isLoading && loadError) {
    return (
      <GlassCard>
        <PageState error={loadError} onRetry={() => setReloadKey(k => k + 1)} minHeight={100} />
      </GlassCard>
    )
  }

  if (isLoading) {
    return (
      <GlassCard>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard>
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Statistic
            title="Tổng Nợ"
            value={balance.total_debit}
            formatter={(value) => fmtVndNum(Number(value))}
            prefix={<ArrowUpOutlined />}
            valueStyle={{ color: '#ff4d4f', fontSize: 18 }}
            suffix="₫"
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Tổng Có"
            value={balance.total_credit}
            formatter={(value) => fmtVndNum(Number(value))}
            prefix={<ArrowDownOutlined />}
            valueStyle={{ color: '#52c41a', fontSize: 18 }}
            suffix="₫"
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Số dư"
            value={Math.abs(balance.balance)}
            formatter={(value) => fmtVndNum(Number(value))}
            prefix={<WalletOutlined />}
            valueStyle={{
              color: balance.balance > 0 ? '#ff4d4f' : balance.balance < 0 ? '#52c41a' : '#8c8c8c',
              fontSize: 18,
              fontWeight: 600,
            }}
            suffix={balance.balance > 0 ? '₫ (Nợ)' : balance.balance < 0 ? '₫ (Có)' : '₫'}
          />
        </Col>
      </Row>
    </GlassCard>
  )
}

export default LedgerBalanceCard
