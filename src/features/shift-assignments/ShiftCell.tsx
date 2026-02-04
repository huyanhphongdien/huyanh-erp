// ============================================================
// SHIFT CELL - Ô ca trong Calendar grid
// File: src/features/shift-assignments/ShiftCell.tsx
// ============================================================

import { Star } from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

export interface ShiftCellData {
  id: string;
  shift_id: string;
  shift_code: string;
  shift_name: string;
  shift_category: string;
  start_time: string;
  end_time: string;
  assignment_type: string;
  is_override: boolean;
}

interface ShiftCellProps {
  data: ShiftCellData | null;
  date: string;
  isSundayOff: boolean;  // ★ CHỈ true khi CN + phòng nghỉ CN (KT/RD)
  isToday: boolean;
  isPast: boolean;
  onClick?: () => void;
  readonly?: boolean;
}

// ============================================================
// CONSTANTS
// ============================================================

const SHIFT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SHORT_1:     { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200' },
  SHORT_2:     { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200' },
  SHORT_3:     { bg: 'bg-indigo-50',   text: 'text-indigo-700',   border: 'border-indigo-200' },
  LONG_DAY:    { bg: 'bg-orange-50',   text: 'text-orange-700',   border: 'border-orange-200' },
  LONG_NIGHT:  { bg: 'bg-purple-50',   text: 'text-purple-700',   border: 'border-purple-200' },
  ADMIN_PROD:  { bg: 'bg-gray-50',     text: 'text-gray-700',     border: 'border-gray-200' },
  ADMIN_OFFICE:{ bg: 'bg-sky-50',      text: 'text-sky-700',      border: 'border-sky-200' },
};

const SHIFT_SHORT_LABELS: Record<string, string> = {
  SHORT_1:      'Ca 1',
  SHORT_2:      'Ca 2',
  SHORT_3:      'Ca 3',
  LONG_DAY:     'Ngày',
  LONG_NIGHT:   'Đêm',
  ADMIN_PROD:   'HC-SX',
  ADMIN_OFFICE: 'HC-VP',
};

// ============================================================
// HELPER
// ============================================================

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  return timeStr.substring(0, 5);
}

function getColors(shiftCode: string) {
  return SHIFT_COLORS[shiftCode] || { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' };
}

// ============================================================
// COMPONENT
// ============================================================

export function ShiftCell({ data, date, isSundayOff, isToday, isPast, onClick, readonly }: ShiftCellProps) {
  // ★ Ô nghỉ CN — CHỈ hiện cho phòng KT + RD vào Chủ nhật
  if (isSundayOff) {
    return (
      <td className="p-0.5">
        <div className="h-10 rounded bg-gray-100 flex items-center justify-center">
          <span className="text-[10px] text-gray-400 italic">CN</span>
        </div>
      </td>
    );
  }

  // Empty cell (no assignment) — bao gồm cả CN cho phòng không nghỉ
  if (!data) {
    return (
      <td className="p-0.5">
        <div
          className={`h-10 rounded border border-dashed flex items-center justify-center
            ${isPast ? 'border-gray-200 bg-gray-50/50' : 'border-gray-300 bg-white hover:bg-blue-50 hover:border-blue-300'}
            ${!readonly && !isPast ? 'cursor-pointer' : ''}
            ${isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
          `}
          onClick={!readonly && !isPast ? onClick : undefined}
          title={`${date} - Chưa phân ca`}
        >
          <span className="text-[10px] text-gray-300">{!isPast && !readonly ? '+' : '—'}</span>
        </div>
      </td>
    );
  }

  // Shift cell with data
  const colors = getColors(data.shift_code);
  const shortLabel = SHIFT_SHORT_LABELS[data.shift_code] || data.shift_name;
  const timeRange = `${formatTime(data.start_time)}-${formatTime(data.end_time)}`;

  return (
    <td className="p-0.5">
      <div
        className={`h-10 rounded border flex flex-col items-center justify-center relative
          ${colors.bg} ${colors.border}
          ${!readonly ? 'cursor-pointer hover:shadow-sm hover:brightness-95' : ''}
          ${isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
          ${isPast ? 'opacity-70' : ''}
        `}
        onClick={!readonly ? onClick : undefined}
        title={`${data.shift_name} (${timeRange})${data.is_override ? ' ★ Đổi ca' : ''}`}
      >
        <span className={`text-[11px] font-semibold leading-none ${colors.text}`}>
          {shortLabel}
        </span>
        <span className={`text-[9px] leading-none mt-0.5 ${colors.text} opacity-70`}>
          {timeRange}
        </span>

        {/* Override/swap badge */}
        {data.is_override && (
          <Star size={8} className="absolute top-0.5 right-0.5 text-yellow-500 fill-yellow-400" />
        )}
      </div>
    </td>
  );
}

export default ShiftCell;