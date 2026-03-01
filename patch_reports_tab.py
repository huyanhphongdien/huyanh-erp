#!/usr/bin/env python3
"""
Patch ProjectDetailPage.tsx:
1. Add import for ProjectReportsTab
2. Remove inline ReportsQuickTab component (lines ~1760-2025)
3. Replace <ReportsQuickTab .../> with <ProjectReportsTab .../>
"""
import re
import sys
import os

FILE = 'src/pages/projects/ProjectDetailPage.tsx'

if not os.path.exists(FILE):
    print(f'ERROR: File not found: {FILE}')
    print('Run this script from the project root (e.g., D:\\Projects\\huyanh-erp-7\\)')
    sys.exit(1)

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

original = content
changes = 0

# ── Step 1: Add import after ProjectDocsTab import ──
if 'ProjectReportsTab' not in content:
    marker = "import ProjectDocsTab from '../../components/project/ProjectDocsTab'"
    if marker in content:
        content = content.replace(
            marker,
            marker + "\n\n// PM9 — Reports Tab (hoàn chỉnh)\nimport ProjectReportsTab from '../../components/project/ProjectReportsTab'"
        )
        changes += 1
        print('✅ Step 1: Added import ProjectReportsTab')
    else:
        print('⚠️  Step 1: Could not find ProjectDocsTab import marker. Adding at top imports area...')
        # Fallback: add after the last import
        idx = content.rfind("import {")
        if idx == -1:
            idx = content.rfind("import ")
        end_of_line = content.index('\n', idx)
        content = content[:end_of_line+1] + "\nimport ProjectReportsTab from '../../components/project/ProjectReportsTab'\n" + content[end_of_line+1:]
        changes += 1
        print('✅ Step 1: Added import (fallback location)')
else:
    print('ℹ️  Step 1: Import already exists, skipping')

# ── Step 2: Remove inline ReportsQuickTab component ──
# Pattern: from "const ReportsQuickTab" to the closing "}" before PlaceholderTab
start_marker = '// ============================================================================\n// TAB: REPORTS (PM9'
if start_marker not in content:
    # Try without exact match
    start_marker = 'const ReportsQuickTab: React.FC<{'
    
if start_marker in content:
    start_idx = content.index(start_marker)
    
    # Find the section separator before PlaceholderTab
    end_marker = '// ============================================================================\n// TAB: PLACEHOLDER'
    if end_marker in content:
        end_idx = content.index(end_marker)
        # Remove everything between start and end
        content = content[:start_idx] + content[end_idx:]
        changes += 1
        print('✅ Step 2: Removed inline ReportsQuickTab component')
    else:
        print('⚠️  Step 2: Could not find PLACEHOLDER marker. Trying manual removal...')
        # Manual: find closing } of the component
        # Count braces from start_marker
        brace_count = 0
        pos = start_idx
        found_first = False
        while pos < len(content):
            if content[pos] == '{':
                brace_count += 1
                found_first = True
            elif content[pos] == '}':
                brace_count -= 1
                if found_first and brace_count == 0:
                    # This is the closing brace
                    end_idx = pos + 1
                    content = content[:start_idx] + '\n' + content[end_idx:]
                    changes += 1
                    print('✅ Step 2: Removed inline ReportsQuickTab (manual brace matching)')
                    break
            pos += 1
else:
    print('ℹ️  Step 2: ReportsQuickTab not found inline, may already be removed')

# ── Step 3: Replace usage ──
old_usage = '<ReportsQuickTab'
new_usage = '<ProjectReportsTab'
if old_usage in content:
    content = content.replace(old_usage, new_usage)
    changes += 1
    print('✅ Step 3: Replaced <ReportsQuickTab> with <ProjectReportsTab>')
elif new_usage in content:
    print('ℹ️  Step 3: Already using ProjectReportsTab')
else:
    print('⚠️  Step 3: Could not find ReportsQuickTab usage')

# ── Step 4: Clean up unused imports from removed component ──
# The ReportsQuickTab used: useAuthStore, projectHealthService, HealthResult, exportStatusReportPDF, PDFReportData
# These are now in the separate component, but might still be used elsewhere in the file
# We'll keep them to be safe - the separate component imports its own

# ── Write ──
if changes > 0:
    with open(FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'\n🎉 Done! {changes} changes applied to {FILE}')
    
    # Verify
    lines = content.split('\n')
    print(f'   File: {len(lines)} lines')
    
    if 'ProjectReportsTab' in content:
        print('   ✅ ProjectReportsTab import present')
    if '<ProjectReportsTab' in content:
        print('   ✅ <ProjectReportsTab /> usage present')
    if 'ReportsQuickTab' not in content:
        print('   ✅ ReportsQuickTab fully removed')
    else:
        print('   ⚠️  ReportsQuickTab still referenced somewhere')
else:
    print('\nNo changes needed.')
