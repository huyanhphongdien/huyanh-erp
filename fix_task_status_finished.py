#!/usr/bin/env python3
"""
FIX: ProjectTasksPage.tsx — Thêm status 'finished' vào STATUS_CONFIG + KANBAN_COLUMNS

Vấn đề: Tasks có status='finished' trong DB nhưng UI không có key 'finished'
         → fallback STATUS_CONFIG.todo → hiển thị "Chờ làm" (sai)

Fix:
  1. Thêm 'finished' vào STATUS_CONFIG (label: 'Hoàn thành', icon: CheckCircle2)
  2. Thêm 'finished' vào KANBAN_COLUMNS cột "Hoàn thành"
  3. Thêm 'finished' vào điều kiện isOverdue (không tính quá hạn khi đã finished)
  4. Thêm 'finished' vào điều kiện ẩn nút Quick Complete

Usage:
  python fix_task_status_finished.py
  python fix_task_status_finished.py src/pages/projects/ProjectTasksPage.tsx
"""

import sys, os, shutil

DEFAULT_PATH = "src/pages/projects/ProjectTasksPage.tsx"

PATCHES = [
    # ── PATCH 1: Thêm 'finished' vào STATUS_CONFIG ──
    {
        'name': 'STATUS_CONFIG: thêm finished',
        'old': "  completed:  { label: 'Hoàn thành', color: 'text-emerald-600',bgColor: 'bg-emerald-50',icon: <CheckCircle2 className=\"w-3.5 h-3.5\" /> },",
        'new': "  completed:  { label: 'Hoàn thành', color: 'text-emerald-600',bgColor: 'bg-emerald-50',icon: <CheckCircle2 className=\"w-3.5 h-3.5\" /> },\n  finished:   { label: 'Hoàn thành', color: 'text-emerald-600',bgColor: 'bg-emerald-50',icon: <CheckCircle2 className=\"w-3.5 h-3.5\" /> },",
    },
    # ── PATCH 2: KANBAN_COLUMNS thêm 'finished' vào cột Hoàn thành ──
    {
        'name': 'KANBAN_COLUMNS: thêm finished',
        'old': "  { key: ['completed'],        label: 'Hoàn thành', headerColor: 'border-emerald-500' },",
        'new': "  { key: ['completed', 'finished'], label: 'Hoàn thành', headerColor: 'border-emerald-500' },",
    },
    # ── PATCH 3: TaskCard isOverdue — thêm 'finished' ──
    {
        'name': 'TaskCard: isOverdue thêm finished',
        'old': "const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !['completed', 'cancelled'].includes(task.status)\n\n    return (\n      <div\n        className={`bg-white rounded-lg border transition-all",
        'new': "const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !['completed', 'finished', 'cancelled'].includes(task.status)\n\n    return (\n      <div\n        className={`bg-white rounded-lg border transition-all",
    },
    # ── PATCH 4: TaskCard Quick Complete — ẩn khi finished ──
    {
        'name': 'TaskCard: ẩn Quick Complete khi finished',
        'old': "          {task.status !== 'completed' && task.status !== 'cancelled' && (\n            <button\n              onClick={(e) => { e.stopPropagation(); handleQuickStatusChange(task.id, 'completed') }}\n              className=\"mt-0.5 p-1 rounded-full text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors\"\n              title=\"Đánh dấu hoàn thành\"\n            >\n              <CheckCircle2 className=\"w-4 h-4\" />\n            </button>\n          )}",
        'new': "          {!['completed', 'finished', 'cancelled'].includes(task.status) && (\n            <button\n              onClick={(e) => { e.stopPropagation(); handleQuickStatusChange(task.id, 'completed') }}\n              className=\"mt-0.5 p-1 rounded-full text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 transition-colors\"\n              title=\"Đánh dấu hoàn thành\"\n            >\n              <CheckCircle2 className=\"w-4 h-4\" />\n            </button>\n          )}",
    },
    # ── PATCH 5: ListView isOverdue — thêm 'finished' ──
    {
        'name': 'ListView: isOverdue thêm finished',
        'old': "              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !['completed', 'cancelled'].includes(task.status)",
        'new': "              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !['completed', 'finished', 'cancelled'].includes(task.status)",
    },
    # ── PATCH 6: ByPhaseView completedCount — đếm cả finished ──
    {
        'name': 'ByPhaseView: đếm finished vào completedCount',
        'old': "const completedCount = phaseTasks.filter(t => t.status === 'completed').length",
        'new': "const completedCount = phaseTasks.filter(t => t.status === 'completed' || t.status === 'finished').length",
    },
]


def main():
    filepath = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH

    if not os.path.exists(filepath):
        print(f"❌ Không tìm thấy: {filepath}")
        sys.exit(1)

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Check already patched
    if "finished:   { label: 'Hoàn thành'" in content:
        print("⏭️  Đã được patch rồi.")
        sys.exit(0)

    # Backup
    backup = filepath + '.bak_finished'
    shutil.copy2(filepath, backup)

    applied = 0
    skipped = 0

    for patch in PATCHES:
        if patch['old'] in content:
            content = content.replace(patch['old'], patch['new'], 1)
            applied += 1
            print(f"  ✅ {patch['name']}")
        else:
            skipped += 1
            print(f"  ⚠️  SKIP: {patch['name']} (không tìm thấy exact match)")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print()
    print(f"📦 Backup: {backup}")
    print(f"✅ PATCH: {applied} applied, {skipped} skipped")
    print()
    print("   Fix:")
    print("   • Tasks status='finished' hiển thị đúng 'Hoàn thành' (xanh)")
    print("   • Kanban: finished nằm cột 'Hoàn thành'")
    print("   • Không hiện nút Quick Complete cho finished tasks")
    print("   • Đếm finished vào completedCount trong By Phase view")
    print("   • Không tính overdue cho finished tasks")
    print()
    print(f"   Rollback: cp {backup} {filepath}")


if __name__ == '__main__':
    main()
