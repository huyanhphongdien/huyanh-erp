#!/usr/bin/env python3
"""
============================================================================
PATCH v4: Thêm Gantt Chart vào PDF Reports
============================================================================
Hướng mới: KHÔNG dùng function riêng.
Build Gantt HTML inline trong template literal bằng CÙNG pattern
mà file gốc đã dùng thành công: ${data.phases.map(...).join('')}

Chạy trên CẢ 2 file:
  python fix_gantt_pdf_v4.py src/utils/exportProjectPDF.ts
  python fix_gantt_pdf_v4.py src/components/project/ProjectReportsTab.tsx
============================================================================
"""
import sys, os, shutil

# The Gantt section HTML that goes into the template literal.
# Uses ONLY ${} expressions that reference variables already in scope.
# Pattern: same as the existing phases.map(...).join('') that already works.
#
# For Status Report (exportProjectPDF.ts):
#   - data.phases, data.project.planned_start/end are in scope
#
# For Detail Report (ProjectReportsTab.tsx):
#   - phases, project.planned_start/end are in scope

def make_gantt_section(phases_var, start_var, end_var):
    """Generate the Gantt section HTML template that goes INSIDE backtick literal.
    Uses ${...} expressions referencing the given variable names."""
    
    # This is pure HTML with CSS - the Gantt bars are built using
    # a self-executing function inside ${} that computes everything
    # and returns an HTML string using ONLY single quotes (no backticks).
    
    return f"""<!-- ===== GANTT CHART ===== -->
<div class="section">
  <div class="section-title">Biểu đồ Gantt</div>
  ${{{phases_var}.length > 0 && {start_var} && {end_var} ? (function() {{
    var mn = new Date({start_var}).getTime();
    var mx = new Date({end_var}).getTime();
    var tD = Math.max(1, Math.ceil((mx - mn) / 864e5));
    var now = new Date();
    var tp = ((now.getTime() - mn) / (mx - mn) * 100);
    var showTd = tp >= 0 && tp <= 100;
    var SC = {{completed:'#16A34A',in_progress:'#2563EB',pending:'#9CA3AF',skipped:'#D1D5DB'}};
    var mhH = '';
    var glH = '';
    var c = new Date(new Date(mn).getFullYear(), new Date(mn).getMonth(), 1);
    while (c.getTime() <= mx) {{
      var ms = Math.max(0, Math.ceil((c.getTime() - mn) / 864e5));
      var nm = new Date(c.getFullYear(), c.getMonth() + 1, 1);
      var me = Math.min(tD, Math.ceil((nm.getTime() - mn) / 864e5));
      var sp = (ms / tD * 100).toFixed(1);
      var wp = ((me - ms) / tD * 100).toFixed(1);
      var lb = c.toLocaleDateString('vi-VN', {{month:'short',year:'2-digit'}});
      mhH += '<div style=\"position:absolute;left:' + sp + '%;width:' + wp + '%;text-align:center;font-size:7px;color:#9CA3AF;border-left:1px solid #E5E7EB;box-sizing:border-box\">' + lb + '</div>';
      glH += '<div style=\"position:absolute;left:' + sp + '%;top:0;bottom:0;border-left:1px dashed #F0F0F0\"></div>';
      c.setMonth(c.getMonth() + 1);
    }}
    var bH = '';
    {phases_var}.forEach(function(ph) {{
      var ps = ph.planned_start ? new Date(ph.planned_start).getTime() : mn;
      var pe = ph.planned_end ? new Date(ph.planned_end).getTime() : mx;
      var lp = ((ps - mn) / (mx - mn) * 100).toFixed(1);
      var wp = (Math.max(1, Math.ceil((pe - ps) / 864e5)) / tD * 100).toFixed(1);
      var bc = ph.color || SC[ph.status] || '#6B7280';
      var pw = (ph.progress_pct / 100 * parseFloat(wp)).toFixed(1);
      var rd = ph.progress_pct >= 100 ? '3px' : '3px 0 0 3px';
      bH += '<div style=\"display:flex;align-items:center;margin-bottom:3px;height:20px\">';
      bH += '<div style=\"width:130px;font-size:9px;font-weight:500;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:8px\">' + ph.name + '</div>';
      bH += '<div style=\"flex:1;position:relative;height:14px\">';
      bH += '<div style=\"position:absolute;top:2px;left:' + lp + '%;width:' + wp + '%;height:10px;background:#E5E7EB;border-radius:3px;border:1px solid #D1D5DB\"></div>';
      bH += '<div style=\"position:absolute;top:2px;left:' + lp + '%;width:' + pw + '%;height:10px;background:' + bc + ';border-radius:' + rd + ';opacity:0.85\"></div>';
      bH += '<div style=\"position:absolute;top:1px;left:' + (parseFloat(lp) + parseFloat(wp) + 0.5).toFixed(1) + '%;font-size:8px;font-weight:700;color:#374151;font-family:monospace;white-space:nowrap\">' + ph.progress_pct + '%</div>';
      bH += '</div></div>';
    }});
    var tlH = '';
    if (showTd) {{
      tlH = '<div style=\"position:absolute;left:' + tp.toFixed(1) + '%;top:0;bottom:0;border-left:2px solid #DC2626;z-index:2\"><div style=\"position:absolute;top:-10px;left:-14px;font-size:6px;color:#DC2626;font-weight:700;background:#fff;padding:0 2px\">H\\u00F4m nay</div></div>';
    }}
    var lg = '<div style=\"display:flex;gap:12px;margin-top:5px;padding-left:130px\">';
    lg += '<div style=\"display:flex;align-items:center;gap:3px\"><div style=\"width:14px;height:5px;background:#2563EB;border-radius:2px;opacity:0.85\"></div><span style=\"font-size:7px;color:#9CA3AF\">Ti\\u1EBFn \\u0111\\u1ED9</span></div>';
    lg += '<div style=\"display:flex;align-items:center;gap:3px\"><div style=\"width:14px;height:5px;background:#E5E7EB;border:1px solid #D1D5DB;border-radius:2px\"></div><span style=\"font-size:7px;color:#9CA3AF\">K\\u1EBF ho\\u1EA1ch</span></div>';
    if (showTd) {{ lg += '<div style=\"display:flex;align-items:center;gap:3px\"><div style=\"width:0;height:8px;border-left:2px solid #DC2626\"></div><span style=\"font-size:7px;color:#9CA3AF\">H\\u00F4m nay</span></div>'; }}
    lg += '</div>';
    return '<div style=\"margin-top:2px\">' +
      '<div style=\"display:flex;align-items:center;margin-bottom:3px\"><div style=\"width:130px\"></div><div style=\"flex:1;position:relative;height:14px\">' + mhH + '</div></div>' +
      '<div style=\"position:relative\"><div style=\"position:absolute;left:130px;right:30px;top:0;bottom:0\">' + glH + tlH + '</div>' + bH + '</div>' +
      lg + '</div>';
  }})() : '<div style=\"color:#9CA3AF;font-size:9px;padding:4px 0\">Chưa có dữ liệu timeline</div>'}}
</div>

"""
    

def patch(fp):
    if not os.path.isfile(fp):
        print(f"❌ Not found: {fp}"); return False
    
    fname = os.path.basename(fp)
    
    # Always restore from OLDEST backup
    with open(fp, 'r', encoding='utf-8') as f: content = f.read()
    shutil.copy2(fp, fp + '.bak_ganttv4')
    print(f"📦 Backup: {fp}.bak_ganttv4")
    
    for bak_suffix in ['.bak_gantt', '.bak_gantt2', '.bak_ganttv3']:
        bak = fp + bak_suffix
        if os.path.isfile(bak):
            with open(bak, 'r', encoding='utf-8') as f: content = f.read()
            print(f"  🔄 Restored from {os.path.basename(bak)}")
            break
    
    orig = content
    n = 0

    # ================================================================
    # exportProjectPDF.ts
    # ================================================================
    if fname == 'exportProjectPDF.ts':
        
        # P1: Add actual fields to type
        OLD1 = """  phases: Array<{
    name: string
    status: string
    progress_pct: number
    planned_start?: string
    planned_end?: string
    color?: string
  }>"""
        NEW1 = """  phases: Array<{
    name: string
    status: string
    progress_pct: number
    planned_start?: string
    planned_end?: string
    actual_start?: string
    actual_end?: string
    color?: string
  }>"""
        if OLD1 in content:
            content = content.replace(OLD1, NEW1, 1); n += 1
            print("  ✅ P1: type thêm actual fields")
        
        # P2: Insert Gantt section into Status Report HTML
        gantt = make_gantt_section('data.phases', 'data.project.planned_start', 'data.project.planned_end')
        
        OLD2 = '<div class="two-col">\n\n<!-- ===== SECTION 3: MILESTONES ===== -->'
        NEW2 = gantt + '<div class="two-col">\n\n<!-- ===== SECTION 3: MILESTONES ===== -->'
        
        if OLD2 in content and 'GANTT CHART' not in content:
            content = content.replace(OLD2, NEW2, 1); n += 1
            print("  ✅ P2: Gantt section trong Status Report")
    
    # ================================================================
    # ProjectReportsTab.tsx
    # ================================================================
    elif fname == 'ProjectReportsTab.tsx':
        
        # P3: Pass actual dates
        OLD3 = """phases: phases.map(p => ({
          name: p.name, status: p.status, progress_pct: p.progress_pct,
          planned_start: p.planned_start, planned_end: p.planned_end, color: p.color,
        })),"""
        NEW3 = """phases: phases.map(p => ({
          name: p.name, status: p.status, progress_pct: p.progress_pct,
          planned_start: p.planned_start, planned_end: p.planned_end,
          actual_start: (p as any).actual_start, actual_end: (p as any).actual_end,
          color: p.color,
        })),"""
        if OLD3 in content:
            content = content.replace(OLD3, NEW3, 1); n += 1
            print("  ✅ P3: pass actual dates")
        
        # P4: Insert Gantt into Detail Report HTML
        gantt = make_gantt_section('phases', 'project.planned_start', 'project.planned_end')
        
        OLD4 = '<!-- 3. MILESTONES (FULL) -->\n<div class="section">\n  <div class="section-title">3. Milestones'
        NEW4 = gantt + '<!-- 3. MILESTONES (FULL) -->\n<div class="section">\n  <div class="section-title">3. Milestones'
        
        if OLD4 in content and 'GANTT' not in content:
            content = content.replace(OLD4, NEW4, 1); n += 1
            print("  ✅ P4: Gantt section trong Detail Report")
    
    else:
        print(f"⚠️  Unknown file: {fname}"); return False
    
    if content != orig:
        with open(fp, 'w', encoding='utf-8') as f: f.write(content)
        print(f"\n✅ {n} patches → {fname}")
        return True
    print("ℹ️  No changes"); return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python fix_gantt_pdf_v4.py src/utils/exportProjectPDF.ts")
        print("  python fix_gantt_pdf_v4.py src/components/project/ProjectReportsTab.tsx")
        sys.exit(1)
    patch(sys.argv[1])
