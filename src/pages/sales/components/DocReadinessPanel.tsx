// ============================================================================
// DOC READINESS PANEL — panel "Dữ liệu cần" cho 1 chứng từ: checklist ✓/✗
// gom theo NƠI nhập; mục thiếu có nút "Mở tab ↗" (mở đúng tab để điền).
// File: src/pages/sales/components/DocReadinessPanel.tsx
// ============================================================================
import { Button, Tag } from 'antd'
import { CheckOutlined, ExclamationOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { GROUP_LABEL, type ReadyResult, type ReadyGroup, type ReadyItem } from '../../../services/sales/docReadiness'

const BRAND = '#1B4D3E'

export default function DocReadinessPanel(
  { result, onQuickFill, onGotoNegotiation }:
  { result: ReadyResult; onQuickFill: (g: ReadyGroup) => void; onGotoNegotiation?: () => void },
) {
  if (result.status === 'idle') {
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: 13, color: '#8c8c8c' }}>{result.items[0]?.label}</div>
      </div>
    )
  }

  // gom theo group, giữ thứ tự xuất hiện
  const order: ReadyGroup[] = []
  const byGroup: Record<string, ReadyItem[]> = {}
  for (const it of result.items) {
    if (!byGroup[it.group]) { byGroup[it.group] = []; order.push(it.group) }
    byGroup[it.group].push(it)
  }

  const ready = result.requiredMissing === 0
  return (
    <div style={panelStyle} className="no-print">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>Dữ liệu cần cho chứng từ</span>
        <Tag color={ready ? 'success' : 'warning'} style={{ marginInlineEnd: 0, fontWeight: 700 }}>
          {ready ? '✓ Đủ dữ liệu' : `● Thiếu ${result.requiredMissing} mục bắt buộc`}
        </Tag>
        {result.recommendedMissing > 0 && (
          <Tag color="default" style={{ marginInlineEnd: 0 }}>+ {result.recommendedMissing} nên bổ sung</Tag>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {order.map((g) => {
          const items = byGroup[g]
          const groupHasMissing = items.some((i) => !i.ok)
          return (
            <div key={g} style={{ padding: '7px 0', borderTop: '1px dashed #eee' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#8c8c8c' }}>{GROUP_LABEL[g]}</span>
                {groupHasMissing && g !== 'auto' && (
                  <Button size="small" type="link" style={{ padding: 0, height: 'auto', fontSize: 12, color: BRAND, fontWeight: 600 }}
                    onClick={() => (g === 'negotiation' ? onGotoNegotiation?.() : onQuickFill(g))}>
                    {g === 'negotiation' ? 'Mở tab Đơn chiết khấu' : 'Nhập ngay'} <ArrowRightOutlined style={{ fontSize: 10 }} />
                  </Button>
                )}
              </div>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '3px 0' }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto', display: 'grid', placeItems: 'center',
                    fontSize: 11, fontWeight: 800,
                    background: it.ok ? '#e4f4ea' : (it.required ? '#fbeed6' : '#f0f0f0'),
                    color: it.ok ? '#1f9d55' : (it.required ? '#b5730a' : '#8c8c8c'),
                  }}>{it.ok ? <CheckOutlined style={{ fontSize: 10 }} /> : (it.required ? <ExclamationOutlined style={{ fontSize: 10 }} /> : '·')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: it.ok ? '#8c8c8c' : '#262626' }}>
                      {it.label}{!it.required && <span style={{ color: '#bbb', fontSize: 11.5 }}> · nên có</span>}
                    </div>
                    {!it.ok && it.sub && <div style={{ fontSize: 11.5, color: '#b5730a' }}>{it.sub}</div>}
                  </div>
                  {it.ok && it.value && <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.value}</span>}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  border: '1px solid #e8e8e8', borderRadius: 10, padding: '12px 16px', marginBottom: 14, background: '#fafafa',
}
