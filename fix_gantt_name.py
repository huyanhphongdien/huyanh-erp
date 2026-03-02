#!/usr/bin/env python3
"""
FIX: Gantt tổng hợp hiển thị "DA-2026-001 — Xây dựng..." → chỉ hiển thị tên dự án

Sửa trong MultiProjectGanttPage.tsx: strip code prefix khỏi project items

Usage:
  python fix_gantt_name.py
  python fix_gantt_name.py src/pages/projects/MultiProjectGanttPage.tsx
"""

import sys, os, shutil

DEFAULT_PATH = "src/pages/projects/MultiProjectGanttPage.tsx"

# ============================================================================
# Patch: Trong mergedGanttData, strip "DA-XXXX-XXX — " khỏi project item name
# ============================================================================

OLD_CODE = '''    for (const project of projects) {
      allItems.push(...project.items)
    }'''

NEW_CODE = '''    for (const project of projects) {
      // Strip mã dự án khỏi tên — "DA-2026-001 — Xây dựng..." → "Xây dựng..."
      const cleaned = project.items.map(item => {
        if (item.type === 'project' && item.name.includes(' — ')) {
          return { ...item, name: item.name.split(' — ').slice(1).join(' — ') }
        }
        return item
      })
      allItems.push(...cleaned)
    }'''

def main():
    filepath = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH

    if not os.path.exists(filepath):
        print(f"❌ Không tìm thấy: {filepath}")
        sys.exit(1)

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if OLD_CODE not in content:
        if 'split(' in content and "' — '" in content:
            print("⏭️  Đã được patch rồi.")
        else:
            print("❌ Không tìm thấy đoạn code cần patch.")
        sys.exit(1)

    backup = filepath + '.bak'
    shutil.copy2(filepath, backup)

    content = content.replace(OLD_CODE, NEW_CODE, 1)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"📦 Backup: {backup}")
    print()
    print("✅ PATCH THÀNH CÔNG!")
    print()
    print('   Trước: "DA-2026-001 — Xây dựng Module Quản lý xe"')
    print('   Sau:   "Xây dựng Module Quản lý xe"')
    print()
    print(f"   Rollback: cp {backup} {filepath}")

if __name__ == '__main__':
    main()
