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
import { ledgerService } from '../../services/b2b/ledgerService'

interface LedgerBalanceCardProps {
  partnerId?: string
  balance?: {
    total_debit: number
    total_credit: number
    balance: number
  }
  loading?: boolean
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('vi-VN').format(value)
}

const LedgerBalanceCard: React.FC<LedgerBalanceCardProps> = ({
  partnerId,
  balance: externalBalance,
  loading: externalLoading,
}) => {
  const [balance, setBalance] = useState(externalBalance || { total_debit: 0, total_credit: 0, balance: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (externalBalance) {
      setBalance(externalBalance)
      return
    }

    if (!partnerId) return

    const fetchBalance = async () => {
      try {
        setLoading(true)
        const data = await ledgerService.getPartnerBalance(partnerId)
        setBalance(data)
      } catch (error) {
        console.error('Error fetching balance:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchBalance()
  }, [partnerId, externalBalance])

  const isLoading = externalLoading || loading

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
            title="Tổng nợ (Debit)"
            value={balance.total_debit}
            formatter={(value) => formatCurrency(Number(value))}
            prefix={<ArrowUpOutlined />}
            valueStyle={{ color: '#ff4d4f', fontSize: 18 }}
            suffix="₫"
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Tổng có (Credit)"
            value={balance.total_credit}
            formatter={(value) => formatCurrency(Number(value))}
            prefix={<ArrowDownOutlined />}
            valueStyle={{ color: '#52c41a', fontSize: 18 }}
            suffix="₫"
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Số dư"
            value={Math.abs(balance.balance)}
            formatter={(value) => formatCurrency(Number(value))}
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
