// src/features/reports/TaskReportsPage.tsx
// Phase 6.3: Task Reports - Main Page (COMPLETE + RESPONSIVE)
// ============================================================

import React, { useState } from 'react'
import { 
  FileText, 
  TrendingUp, 
  Settings,
  BarChart3,
  PieChart
} from 'lucide-react'

// Import all tabs
import CompletionReportTab from './CompletionReportTab'
import PerformanceReportTab from './PerformanceReportTab'
import CustomReportTab from './CustomReportTab'

// ============================================================================
// TYPES
// ============================================================================

type TabKey = 'completion' | 'performance' | 'custom'

interface Tab {
  key: TabKey
  label: string
  shortLabel: string
  icon: React.ReactNode
  description: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS: Tab[] = [
  {
    key: 'completion',
    label: 'Báo cáo hoàn thành',
    shortLabel: 'Hoàn thành',
    icon: <BarChart3 className="w-4 h-4" />,
    description: 'Thống kê hoàn thành theo phòng ban, chức vụ, nhân viên'
  },
  {
    key: 'performance',
    label: 'Phân tích hiệu suất',
    shortLabel: 'Hiệu suất',
    icon: <TrendingUp className="w-4 h-4" />,
    description: 'Đánh giá hiệu suất làm việc và top performers'
  },
  {
    key: 'custom',
    label: 'Báo cáo tùy chỉnh',
    shortLabel: 'Tùy chỉnh',
    icon: <Settings className="w-4 h-4" />,
    description: 'Tạo báo cáo với các tiêu chí tùy chọn'
  }
]

// ============================================================================
// COMPONENT
// ============================================================================

export default function TaskReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('completion')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="p-1.5 sm:p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Báo cáo công việc
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
                Phân tích và thống kê hiệu suất làm việc
              </p>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg
                    font-medium text-xs sm:text-sm whitespace-nowrap transition-all flex-shrink-0
                    ${isActive
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }
                  `}
                >
                  {tab.icon}
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tab Description */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
          <div className="flex items-start gap-2 sm:gap-3">
            <PieChart className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs sm:text-sm text-blue-900 font-medium">
                {TABS.find(t => t.key === activeTab)?.label}
              </p>
              <p className="text-[11px] sm:text-xs text-blue-700 mt-0.5 sm:mt-1">
                {TABS.find(t => t.key === activeTab)?.description}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6">
        {activeTab === 'completion' && <CompletionReportTab />}
        {activeTab === 'performance' && <PerformanceReportTab />}
        {activeTab === 'custom' && <CustomReportTab />}
      </div>
    </div>
  )
}