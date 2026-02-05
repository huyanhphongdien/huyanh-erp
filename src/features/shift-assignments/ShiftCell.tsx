// ============================================================
// SHIFT CELL V2 - Ô ca trong Calendar grid (Multi-shift + Team)
// File: src/features/shift-assignments/ShiftCell.tsx
// Hỗ trợ: 1-2 ca/ngày + badge đội A/B
// ============================================================

import { Star } from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

export interface DayAssignment {
  id: string;
  shift_id: string;
  shift_code: string;
  shift_name: string;
  shift_category: string;
  start_time: string;
  end_time: string;
  assignment_type: string;
  is_override: boolean;
  team_code?: string | null;
  team_name?: string | null;
}

// Backward compat alias
export type ShiftCellData = DayAssignment;

interface ShiftCellProps {
  /** Mảng assignments cho ngày này (0 = trống, 1 = 1 ca, 2 = 2 ca) */
  assignments: DayAssignment[];
  date: string;
  /** true nếu nhân viên thuộc phòng nghỉ CN (KT, R&D) VÀ ngày này là CN */
  isSundayOff: boolean;
  isToday: boolean;
  isPast: boolean;
  /** Click vào ô → mở override modal (truyền assignment index nếu multi) */
  onClick?: (assignmentIndex?: number) => void;
  readonly?: boolean;
}

// ============================================================
// SHIFT COLORS & LABELS
// ============================================================

const SHIFT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  SHORT_1:      { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-800' },
  SHORT_2:      { bg: 'bg-amber-100',   border: 'border-amber-300',   text: 'text-amber-800' },
  SHORT_3:      { bg: 'bg-indigo-100',  border: 'border-indigo-300',  text: 'text-indigo-800' },
  LONG_DAY:     { bg: 'bg-orange-100',  border: 'border-orange-300',  text: 'text-orange-800' },
  LONG_NIGHT:   { bg: 'bg-purple-100',  border: 'border-purple-300',  text: 'text-purple-800' },
  ADMIN_PROD:   { bg: 'bg-gray-100',    border: 'border-gray-300',    text: 'text-gray-700' },
  ADMIN_OFFICE: { bg: 'bg-sky-100',     border: 'border-sky-300',     text: 'text-sky-800' },
};

const SHIFT_SHORT_LABELS: Record<string, string> = {
  SHORT_1:      'Sáng',
  SHORT_2:      'Chiều',
  SHORT_3:      'Đêm',
  LONG_DAY:     'Ngày',
  LONG_NIGHT:   'Đêm',
  ADMIN_PROD:   'HC-SX',
  ADMIN_OFFICE: 'HC-VP',
};

const TEAM_BADGE_COLORS: Record<string, string> = {
  A: 'bg-blue-500 text-white',
  B: 'bg-rose-500 text-white',
};

function getColors(code: string) {
  return SHIFT_COLORS[code] || { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-700' };
}

function formatTime(t: string): string {
  if (!t) return '';
  return t.substring(0, 5);
}

// ============================================================
// COMPONENT
// ============================================================

export function ShiftCell({
  assignments,
  date,
  isSundayOff,
  isToday,
  isPast,
  onClick,
  readonly = false,
}: ShiftCellProps) {
  // ── Sunday off (chỉ cho KT + R&D) ──
  if (isSundayOff) {
    return (
      <td className="p-0.5">
        <div className="h-12 rounded border border-gray-200 bg-gray-50/50 flex items-center justify-center">
          <span className="text-[10px] text-gray-300 font-medium">CN</span>
        </div>
      </td>
    );
  }

  // ── Empty cell (chưa phân ca) ──
  if (!assignments || assignments.length === 0) {
    return (
      <td className="p-0.5">
        <div
          className={`h-12 rounded border flex items-center justify-center transition-colors
            ${readonly || isPast
              ? 'border-gray-200 bg-gray-50/50'
              : 'border-gray-300 bg-white active:bg-blue-50 active:border-blue-300'}
            ${!readonly && !isPast ? 'cursor-pointer' : ''}
            ${isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
          `}
          onClick={!readonly && !isPast ? () => onClick?.() : undefined}
          title={`${date} - Chưa phân ca`}
        >
          <span className="text-[10px] text-gray-300">{!isPast && !readonly ? '+' : '—'}</span>
        </div>
      </td>
    );
  }

  // ── Single shift ──
  if (assignments.length === 1) {
    const a = assignments[0];
    const colors = getColors(a.shift_code);
    const shortLabel = SHIFT_SHORT_LABELS[a.shift_code] || a.shift_name;
    const timeRange = `${formatTime(a.start_time)}-${formatTime(a.end_time)}`;
    const teamBadge = a.team_code ? TEAM_BADGE_COLORS[a.team_code] || 'bg-gray-500 text-white' : null;

    return (
      <td className="p-0.5">
        <div
          className={`h-12 rounded border flex flex-col items-center justify-center relative
            ${colors.bg} ${colors.border}
            ${!readonly ? 'cursor-pointer active:brightness-90' : ''}
            ${isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
            ${isPast ? 'opacity-70' : ''}
          `}
          onClick={!readonly ? () => onClick?.(0) : undefined}
          title={`${a.shift_name} (${timeRange})${a.team_name ? ` • Đội ${a.team_code}` : ''}${a.is_override ? ' ★ Đổi ca' : ''}`}
        >
          <span className={`text-[11px] font-semibold leading-none ${colors.text}`}>
            {shortLabel}
          </span>
          <span className={`text-[9px] leading-none mt-0.5 ${colors.text} opacity-70`}>
            {timeRange}
          </span>

          {/* Team badge */}
          {teamBadge && (
            <span className={`absolute top-0.5 left-0.5 text-[7px] font-bold rounded-sm px-0.5 leading-[12px] ${teamBadge}`}>
              {a.team_code}
            </span>
          )}

          {/* Override badge */}
          {a.is_override && (
            <Star size={8} className="absolute top-0.5 right-0.5 text-yellow-500 fill-yellow-400" />
          )}
        </div>
      </td>
    );
  }

  // ── Multi shift (2 ca/ngày — stacked) ──
  // Sort by start_time: ca sớm hơn ở trên
  const sorted = [...assignments].sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <td className="p-0.5">
      <div
        className={`h-12 rounded border border-gray-200 flex flex-col overflow-hidden relative
          ${isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
          ${isPast ? 'opacity-70' : ''}
        `}
      >
        {sorted.map((a, idx) => {
          const colors = getColors(a.shift_code);
          const shortLabel = SHIFT_SHORT_LABELS[a.shift_code] || a.shift_name;
          const teamBadge = a.team_code ? TEAM_BADGE_COLORS[a.team_code] || 'bg-gray-500 text-white' : null;

          return (
            <div
              key={a.id}
              className={`flex-1 flex items-center justify-center relative cursor-pointer active:brightness-90
                ${colors.bg}
                ${idx < sorted.length - 1 ? 'border-b border-gray-200' : ''}
              `}
              onClick={() => onClick?.(idx)}
              title={`${a.shift_name} (${formatTime(a.start_time)}-${formatTime(a.end_time)})${a.team_name ? ` • Đội ${a.team_code}` : ''}${a.is_override ? ' ★ Đổi ca' : ''}`}
            >
              <span className={`text-[9px] font-semibold leading-none ${colors.text}`}>
                {shortLabel}
              </span>

              {/* Team badge (nhỏ hơn cho multi) */}
              {teamBadge && (
                <span className={`absolute ${idx === 0 ? 'top-px' : 'bottom-px'} left-0.5 text-[6px] font-bold rounded-sm px-px leading-[10px] ${teamBadge}`}>
                  {a.team_code}
                </span>
              )}

              {/* Override badge */}
              {a.is_override && (
                <Star size={6} className={`absolute ${idx === 0 ? 'top-px' : 'bottom-px'} right-0.5 text-yellow-500 fill-yellow-400`} />
              )}
            </div>
          );
        })}
      </div>
    </td>
  );
}

export default ShiftCell;