#!/usr/bin/env python3
"""
FIX: ganttService.ts — Phase dates hiển thị sai trên Gantt

Nguyên nhân: Ưu tiên actual_start > planned_start
  → Nếu actual_start bị set = ngày project bắt đầu TT (trigger auto-set),
    tất cả phases đều hiển thị cùng ngày bắt đầu.

Fix: Ưu tiên planned_start/planned_end cho Gantt (vì là kế hoạch),
     chỉ fallback actual khi planned không có.

Usage:
  python fix_gantt_dates.py
  python fix_gantt_dates.py src/services/project/ganttService.ts
"""

import sys, os, shutil

DEFAULT_PATH = "src/services/project/ganttService.ts"

# ============================================================================
# PATCH 1: getGanttData — Phase dates (single project)
# ============================================================================

OLD_PHASE_DATES = '''      const start = toDateOnly(phase.actual_start) || toDateOnly(phase.planned_start)
      const end = toDateOnly(phase.actual_end) || toDateOnly(phase.planned_end)'''

NEW_PHASE_DATES = '''      // ✅ FIX: Ưu tiên planned dates cho Gantt (kế hoạch), fallback actual
      const start = toDateOnly(phase.planned_start) || toDateOnly(phase.actual_start)
      const end = toDateOnly(phase.planned_end) || toDateOnly(phase.actual_end)'''

# ============================================================================
# PATCH 2: getMultiProjectGantt — Phase dates (multi project)
# ============================================================================

OLD_MULTI_PHASE = '''        const start = toDateOnly(phase.actual_start) || toDateOnly(phase.planned_start)
        const end = toDateOnly(phase.actual_end) || toDateOnly(phase.planned_end)'''

NEW_MULTI_PHASE = '''        // ✅ FIX: Ưu tiên planned dates cho Gantt
        const start = toDateOnly(phase.planned_start) || toDateOnly(phase.actual_start)
        const end = toDateOnly(phase.planned_end) || toDateOnly(phase.actual_end)'''

# ============================================================================
# PATCH 3: Multi-project — Strip code from project name
# ============================================================================

OLD_PROJECT_NAME = '''        name: `${project.code} — ${project.name}`,'''

NEW_PROJECT_NAME = '''        name: project.name,'''

# ============================================================================
# MAIN
# ============================================================================

def main():
    filepath = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH

    if not os.path.exists(filepath):
        print(f"❌ Không tìm thấy: {filepath}")
        sys.exit(1)

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    changes = 0

    # Patch 1
    if OLD_PHASE_DATES in content:
        content = content.replace(OLD_PHASE_DATES, NEW_PHASE_DATES, 1)
        changes += 1
        print("✅ Patch 1: getGanttData — Phase dates: planned > actual")
    else:
        if '// ✅ FIX: Ưu tiên planned' in content:
            print("⏭️  Patch 1: Đã fix (skip)")
        else:
            print("❌ Patch 1: Không tìm thấy phase dates trong getGanttData")

    # Patch 2
    if OLD_MULTI_PHASE in content:
        content = content.replace(OLD_MULTI_PHASE, NEW_MULTI_PHASE, 1)
        changes += 1
        print("✅ Patch 2: getMultiProjectGantt — Phase dates: planned > actual")
    else:
        print("⏭️  Patch 2: Đã fix hoặc không tìm thấy (skip)")

    # Patch 3
    if OLD_PROJECT_NAME in content:
        content = content.replace(OLD_PROJECT_NAME, NEW_PROJECT_NAME, 1)
        changes += 1
        print("✅ Patch 3: Multi-project — Bỏ mã dự án khỏi tên")
    else:
        if 'name: project.name,' in content:
            print("⏭️  Patch 3: Đã fix (skip)")
        else:
            print("❌ Patch 3: Không tìm thấy project name format")

    if changes == 0:
        print("\n⚠️  Không thay đổi gì.")
        sys.exit(0)

    backup = filepath + '.bak'
    shutil.copy2(filepath, backup)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"\n📦 Backup: {backup}")
    print(f"\n✅ PATCH THÀNH CÔNG! ({changes} thay đổi)")
    print()
    print("   🔧 Fix 1+2: Phase dates ưu tiên planned_start/planned_end")
    print('     Trước: actual_start || planned_start  (sai nếu trigger auto-set actual)')
    print('     Sau:   planned_start || actual_start  (đúng kế hoạch)')
    print()
    print('   🔧 Fix 3: Gantt tổng hợp bỏ mã dự án')
    print('     Trước: "DA-2026-001 — Xây dựng Module Quản lý xe"')
    print('     Sau:   "Xây dựng Module Quản lý xe"')
    print()
    print(f"   Rollback: cp {backup} {filepath}")

if __name__ == '__main__':
    main()
