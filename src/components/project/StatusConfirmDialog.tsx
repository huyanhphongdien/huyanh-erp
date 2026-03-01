// ============================================================================
// FILE: src/components/project/StatusConfirmDialog.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// ============================================================================
// v2: Thêm option "Bắt đầu thực hiện ngay" khi phê duyệt
// - Hiển thị transition visual (from → to)
// - Textarea lý do (bắt buộc với cancel/on_hold)
// - Checkbox "Bắt đầu luôn" khi phê duyệt
// - Mobile-first bottom-sheet style
// ============================================================================

import React, { useState } from 'react'
import {
  X,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Ban,
  PauseCircle,
  FileEdit,
  Target,
  BarChart3,
  Play,
} from 'lucide-react'
import type { ProjectStatus } from '../../utils/projectPermissions'
import { getTransitionConfig, TRANSITION_LABELS } from '../../utils/projectPermissions'

// ============================================================================
// TYPES
// ============================================================================

interface StatusConfirmDialogProps {
  isOpen: boolean
  fromStatus: ProjectStatus
  toStatus: ProjectStatus
  projectName: string
  /** reason: lý do, startImmediately: true nếu user tick "Bắt đầu luôn" */
  onConfirm: (reason: string, startImmediately?: boolean) => Promise<void>
  onCancel: () => void
}

// ============================================================================
// STATUS ICONS
// ============================================================================

const STATUS_ICONS: Record<ProjectStatus, React.ReactNode> = {
  draft:       <FileEdit className="w-5 h-5" />,
  planning:    <Target className="w-5 h-5" />,
  approved:    <CheckCircle2 className="w-5 h-5" />,
  in_progress: <Play className="w-5 h-5" />,
  on_hold:     <PauseCircle className="w-5 h-5" />,
  completed:   <CheckCircle2 className="w-5 h-5" />,
  cancelled:   <Ban className="w-5 h-5" />,
}

// ============================================================================
// COMPONENT
// ============================================================================

const StatusConfirmDialog: React.FC<StatusConfirmDialogProps> = ({
  isOpen,
  fromStatus,
  toStatus,
  projectName,
  onConfirm,
  onCancel,
}) => {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [startImmediately, setStartImmediately] = useState(true) // Mặc định tick

  const config = getTransitionConfig(fromStatus, toStatus)

  // Có hiện checkbox "Bắt đầu luôn" không?
  const showStartOption = toStatus === 'approved'

  const handleConfirm = async () => {
    if (config.requiresReason && !reason.trim()) {
      setError('Vui lòng nhập lý do')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      await onConfirm(reason.trim(), showStartOption ? startImmediately : undefined)
      setReason('')
      setError('')
      setStartImmediately(true)
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    setReason('')
    setError('')
    setStartImmediately(true)
    onCancel()
  }

  if (!isOpen) return null

  // Accent colors
  const getAccentBg = () => {
    if (toStatus === 'cancelled') return 'bg-red-50'
    if (toStatus === 'approved') return 'bg-indigo-50'
    if (toStatus === 'completed') return 'bg-green-50'
    if (toStatus === 'on_hold') return 'bg-amber-50'
    if (toStatus === 'in_progress') return 'bg-emerald-50'
    return 'bg-gray-50'
  }

  const getAccentText = () => {
    if (toStatus === 'cancelled') return 'text-red-700'
    if (toStatus === 'approved') return 'text-indigo-700'
    if (toStatus === 'completed') return 'text-green-700'
    if (toStatus === 'on_hold') return 'text-amber-700'
    if (toStatus === 'in_progress') return 'text-emerald-700'
    return 'text-gray-700'
  }

  const getAccentIcon = () => {
    if (toStatus === 'cancelled') return 'text-red-500'
    if (toStatus === 'approved') return 'text-indigo-500'
    if (toStatus === 'completed') return 'text-green-500'
    if (toStatus === 'on_hold') return 'text-amber-500'
    if (toStatus === 'in_progress') return 'text-emerald-600'
    return 'text-[#1B4D3E]'
  }

  // Label nút xác nhận thay đổi theo checkbox
  const buttonLabel = showStartOption && startImmediately
    ? 'Duyệt & Bắt đầu'
    : config.confirmButtonLabel

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 animate-fadeIn"
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
        <div
          className="pointer-events-auto w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
          style={{ animation: 'slideUp .25s ease-out' }}
        >
          {/* Header */}
          <div className={`px-5 pt-5 pb-4 ${getAccentBg()}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white shadow-sm ${getAccentIcon()}`}>
                  {STATUS_ICONS[toStatus]}
                </div>
                <div>
                  <h3 className={`text-[16px] font-bold ${getAccentText()}`}>
                    {config.confirmTitle}
                  </h3>
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    {projectName}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancel}
                disabled={submitting}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/50 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Transition visual — thay đổi theo checkbox */}
            <div className="flex items-center gap-3 py-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 text-[12px] font-medium text-gray-600">
                {STATUS_ICONS[fromStatus]}
                <span>{TRANSITION_LABELS[fromStatus] || fromStatus}</span>
              </div>
              <div className="flex-1 border-t border-dashed border-gray-300 relative">
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-1.5 text-[11px] text-gray-400">→</span>
              </div>
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                showStartOption && startImmediately
                  ? 'bg-emerald-50 text-emerald-700'
                  : `${getAccentBg()} ${getAccentText()}`
              }`}>
                {showStartOption && startImmediately ? STATUS_ICONS['in_progress'] : STATUS_ICONS[toStatus]}
                <span>{showStartOption && startImmediately ? 'Bắt đầu thực hiện' : (TRANSITION_LABELS[toStatus] || toStatus)}</span>
              </div>
            </div>

            {/* Description */}
            <p className="text-[13px] text-gray-600 leading-relaxed">
              {config.confirmMessage}
            </p>

            {/* ✅ Checkbox "Bắt đầu thực hiện ngay" — chỉ hiện khi phê duyệt */}
            {showStartOption && (
              <label className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 cursor-pointer active:bg-emerald-50 transition-colors">
                <input
                  type="checkbox"
                  checked={startImmediately}
                  onChange={(e) => setStartImmediately(e.target.checked)}
                  disabled={submitting}
                  className="w-5 h-5 rounded-md border-2 border-emerald-300 text-emerald-600 focus:ring-emerald-500/30 accent-emerald-600 cursor-pointer"
                />
                <div>
                  <span className="text-[13px] font-semibold text-emerald-800">
                    Bắt đầu thực hiện ngay
                  </span>
                  <p className="text-[11px] text-emerald-600/70 mt-0.5">
                    Duyệt xong sẽ chuyển thẳng sang "Đang thực hiện"
                  </p>
                </div>
              </label>
            )}

            {/* Reason textarea */}
            <div>
              <label className="flex items-center gap-1 text-[12px] font-semibold text-gray-700 mb-1.5">
                {config.requiresReason ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Lý do <span className="text-red-500">*</span>
                  </>
                ) : (
                  'Ghi chú (tùy chọn)'
                )}
              </label>
              <textarea
                value={reason}
                onChange={(e) => { setReason(e.target.value); setError('') }}
                placeholder={config.requiresReason ? 'Nhập lý do...' : 'Ghi chú thêm (không bắt buộc)...'}
                rows={3}
                disabled={submitting}
                className={`
                  w-full px-3 py-2.5 text-[14px] bg-gray-50 rounded-xl
                  border outline-none resize-none transition-colors
                  ${error ? 'border-red-300 focus:border-red-400 focus:ring-1 focus:ring-red-200' : 'border-gray-200 focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20'}
                  disabled:opacity-50
                `}
                autoFocus={config.requiresReason}
              />
              {error && (
                <p className="text-[12px] text-red-500 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex gap-3">
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-medium text-gray-600 active:scale-[0.98] disabled:opacity-50 transition-transform"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || (config.requiresReason && !reason.trim())}
              className={`flex-1 py-3 rounded-xl text-white text-[14px] font-semibold active:scale-[0.98] disabled:opacity-50 transition-transform flex items-center justify-center gap-2 ${
                showStartOption && startImmediately ? 'bg-[#1B4D3E]' : config.confirmButtonColor
              }`}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : showStartOption && startImmediately ? (
                <Play className="w-4 h-4" />
              ) : (
                STATUS_ICONS[toStatus]
              )}
              {submitting ? 'Đang xử lý...' : buttonLabel}
            </button>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fadeIn { animation: fadeIn .2s ease-out; }
      `}</style>
    </>
  )
}

export default StatusConfirmDialog