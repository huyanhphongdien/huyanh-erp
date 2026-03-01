#!/usr/bin/env python3
"""
Patch ProjectDetailPage.tsx — Tích hợp ProjectActivityTab (PM10)
Chạy: python3 patch_activity_tab.py

Tự động:
1. Thêm import ProjectActivityTab
2. Xóa component ActivityTab cũ  
3. Thay render ActivityTab → ProjectActivityTab
"""

import os, re, sys

FILE = "src/pages/projects/ProjectDetailPage.tsx"

if not os.path.exists(FILE):
    print(f"❌ Không tìm thấy {FILE}")
    print("Hãy chạy script từ thư mục gốc project!")
    sys.exit(1)

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ── 1. Add import ──
if 'ProjectActivityTab' not in content:
    # After exportStatusReportPDF import
    marker = "import { exportStatusReportPDF"
    if marker in content:
        idx = content.index(marker)
        line_end = content.index('\n', idx)
        content = (content[:line_end + 1] + 
                   "\n// PM10 — Activity tab (rich timeline)\n"
                   "import ProjectActivityTab from '../../components/project/ProjectActivityTab'\n" +
                   content[line_end + 1:])
        changes += 1
        print("✅ 1/3 — Import ProjectActivityTab added")
    else:
        # Fallback: after ProjectDocsTab import
        marker2 = "import ProjectDocsTab from"
        if marker2 in content:
            idx = content.index(marker2)
            line_end = content.index('\n', idx)
            content = (content[:line_end + 1] + 
                       "\n// PM10 — Activity tab (rich timeline)\n"
                       "import ProjectActivityTab from '../../components/project/ProjectActivityTab'\n" +
                       content[line_end + 1:])
            changes += 1
            print("✅ 1/3 — Import ProjectActivityTab added (after ProjectDocsTab)")
        else:
            print("⚠️  1/3 — Could not find import insertion point")
else:
    print("ℹ️  1/3 — Import already exists, skipping")

# ── 2. Remove old ActivityTab component ──
# Pattern: the section between "TAB: ACTIVITY" and "MAIN COMPONENT"
old_tab_pattern = (
    r'\n// =+\n// TAB: ACTIVITY\n// =+\n+'
    r'const ActivityTab: React\.FC<\{ activities: ActivityItem\[\] \}>'
    r'.*?\n\)\n'
)
match = re.search(old_tab_pattern, content, re.DOTALL)
if match:
    content = content[:match.start()] + '\n' + content[match.end():]
    changes += 1
    print("✅ 2/3 — Old ActivityTab component removed")
else:
    # Try simpler pattern
    simple_pattern = r'const ActivityTab: React\.FC<\{ activities: ActivityItem\[\] \}>.*?\n\)\n'
    match2 = re.search(simple_pattern, content, re.DOTALL)
    if match2:
        # Also remove preceding comments
        start = match2.start()
        # Look back for comment block
        preceding = content[max(0, start-200):start]
        comment_match = re.search(r'// =+\n// TAB: ACTIVITY\n// =+\n+$', preceding)
        if comment_match:
            start = start - (len(preceding) - comment_match.start())
        content = content[:start] + '\n' + content[match2.end():]
        changes += 1
        print("✅ 2/3 — Old ActivityTab component removed")
    elif 'const ActivityTab:' not in content:
        print("ℹ️  2/3 — Old ActivityTab already removed, skipping")
    else:
        print("⚠️  2/3 — Could not find ActivityTab to remove")

# ── 3. Replace render ──
old_render = "{activeTab === 'activity' && (\n          <ActivityTab activities={activities} />\n        )}"
new_render = """{/* ✅ PM10: Activity tab (rich timeline with filters, icons, load more) */}
        {activeTab === 'activity' && realProjectId && (
          <ProjectActivityTab projectId={realProjectId} />
        )}"""

if old_render in content:
    content = content.replace(old_render, new_render)
    changes += 1
    print("✅ 3/3 — Render updated to ProjectActivityTab")
else:
    # Try with different whitespace
    alt_render = "<ActivityTab activities={activities} />"
    if alt_render in content:
        content = content.replace(alt_render, "<ProjectActivityTab projectId={realProjectId} />")
        content = content.replace(
            "{activeTab === 'activity' && (",
            "{/* ✅ PM10: Activity tab */}\n        {activeTab === 'activity' && realProjectId && ("
        )
        changes += 1
        print("✅ 3/3 — Render updated (alt pattern)")
    elif 'ProjectActivityTab projectId' in content:
        print("ℹ️  3/3 — Render already updated, skipping")
    else:
        print("⚠️  3/3 — Could not find render to replace")

# ── 4. Update header comments ──
if 'PM10 (Activity)' not in content:
    content = content.replace('+ PM9 (Reports)', '+ PM9 (Reports) + PM10 (Activity)')
if 'Tab Hoạt động: Rich activity timeline' not in content:
    content = content.replace(
        '// Các tab khác: Placeholder cho PM10-PM11',
        '// Tab Hoạt động: Rich activity timeline — PM10 integrated\n// Các tab khác: Placeholder cho PM11'
    )

# ── Save ──
if changes > 0:
    with open(FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"\n🎉 Done! {changes} change(s) applied to {FILE}")
else:
    print(f"\nℹ️  No changes needed — file already up to date")

# Verify
print("\n📋 Verification:")
for keyword, desc in [
    ("import ProjectActivityTab", "Import exists"),
    ("const ActivityTab:", "Old component (should NOT exist)"),
    ("<ProjectActivityTab", "New component in render"),
]:
    found = keyword in content
    status = "✅" if (found and "should NOT" not in desc) or (not found and "should NOT" in desc) else "❌"
    print(f"  {status} {desc}: {'found' if found else 'not found'}")
