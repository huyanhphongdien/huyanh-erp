// ============================================================================
// TAB CONTENT — Keep-alive wrapper cho 1 tab
// File: src/components/common/TabContent.tsx
//
// Render component của 1 tab. Dùng display:none khi inactive để giữ DOM
// + component state (không unmount) — đây là cách implement keep-alive
// thủ công trong React (React không có `<KeepAlive>` native).
//
// Component được mount lần đầu khi tab được tạo và giữ mounted đến khi
// tab được close. Switch tab qua lại không làm component remount.
// ============================================================================

import { memo, Suspense } from 'react'
import type { OpenTab } from '../../stores/tabStore'
import { getTabComponent } from '../../stores/tabStore'
import { Result, Spin } from 'antd'

interface TabContentProps {
  tab: OpenTab
  isActive: boolean
}

function TabContentInner({ tab, isActive }: TabContentProps) {
  const Component = getTabComponent(tab.componentId)

  if (!Component) {
    // Registry bị mất (VD: F5 nhưng component chưa register) — hiện placeholder
    return (
      <div style={{ display: isActive ? 'block' : 'none', padding: 24 }}>
        <Result
          status="warning"
          title="Không tải được tab"
          subTitle={`Component "${tab.componentId}" chưa được đăng ký. Thử mở lại từ menu.`}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        display: isActive ? 'block' : 'none',
        height: '100%',
        overflow: 'auto',
      }}
      data-tab-key={tab.key}
    >
      <Suspense
        fallback={
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        }
      >
        <Component {...tab.props} />
      </Suspense>
    </div>
  )
}

// memo để switch tab không re-render các tab inactive
export const TabContent = memo(TabContentInner, (prev, next) => {
  // Chỉ re-render nếu isActive đổi hoặc tab data thực sự đổi
  return (
    prev.isActive === next.isActive &&
    prev.tab.key === next.tab.key &&
    prev.tab.componentId === next.tab.componentId &&
    JSON.stringify(prev.tab.props) === JSON.stringify(next.tab.props)
  )
})
