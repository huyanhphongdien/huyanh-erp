// ============================================================================
// PARTNER MATCH SUGGESTIONS — Gợi ý đại lý phù hợp
// File: src/components/b2b/PartnerMatchSuggestions.tsx
// Hiện khi tạo demand hoặc trong demand detail
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { Card, Tag, Progress, Empty, Spin, Typography, Button, Tooltip } from 'antd'
import { TrophyOutlined, SendOutlined, StarFilled } from '@ant-design/icons'
import { partnerMatchingService, type MatchCriteria } from '../../services/b2b/partnerMatchingService'

const { Text } = Typography

const TIER_COLOR: Record<string, string> = {
  platinum: '#722ed1', gold: '#faad14', silver: '#8c8c8c', bronze: '#d48806', new: '#d9d9d9',
}

interface Props {
  criteria: MatchCriteria
  onInvite?: (partnerId: string, partnerName: string) => void
}

export default function PartnerMatchSuggestions({ criteria, onInvite }: Props) {
  const hasAnyCriteria = criteria.product_type || criteria.min_drc || criteria.region

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ['partner-matches', criteria],
    queryFn: () => partnerMatchingService.findMatches(criteria, 8),
    enabled: !!hasAnyCriteria,
    staleTime: 30000,
  })

  if (!hasAnyCriteria) return null
  if (isLoading) return <Card size="small" style={{ borderRadius: 12 }}><Spin size="small" /> Đang tìm đại lý phù hợp...</Card>
  if (matches.length === 0) return null

  return (
    <Card
      size="small"
      title={<><TrophyOutlined style={{ color: '#faad14' }} /> Gợi ý đại lý phù hợp ({matches.length})</>}
      style={{ borderRadius: 12, borderColor: '#ffe58f' }}
      styles={{ header: { background: '#fffbe6', borderBottom: '1px solid #ffe58f' } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {matches.map((m, idx) => (
          <div key={m.partner_id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
              borderRadius: 10, background: idx === 0 ? '#f6ffed' : idx < 3 ? '#fafafa' : 'transparent',
              border: idx === 0 ? '1px solid #b7eb8f' : '1px solid #f0f0f0',
            }}>
            {/* Rank */}
            <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : <Text type="secondary">{idx + 1}</Text>}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Text strong style={{ fontSize: 13 }}>{m.name}</Text>
                <Tag color={TIER_COLOR[m.tier]} style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>
                  {m.tier}
                </Tag>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                {m.reasons.slice(0, 3).map((r, i) => (
                  <Text key={i} type="secondary" style={{ fontSize: 11 }}>• {r}</Text>
                ))}
              </div>
            </div>

            {/* Score */}
            <div style={{ textAlign: 'center', flexShrink: 0, width: 50 }}>
              <Progress
                type="circle"
                percent={m.score}
                size={36}
                strokeColor={m.score >= 80 ? '#52c41a' : m.score >= 50 ? '#faad14' : '#ff4d4f'}
                format={p => <span style={{ fontSize: 11, fontWeight: 700 }}>{p}</span>}
              />
            </div>

            {/* Invite button */}
            {onInvite && (
              <Tooltip title="Gửi mời báo giá">
                <Button
                  type="text"
                  size="small"
                  icon={<SendOutlined />}
                  onClick={() => onInvite(m.partner_id, m.name)}
                  style={{ color: '#1B4D3E' }}
                />
              </Tooltip>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
