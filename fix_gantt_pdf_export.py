#!/usr/bin/env python3
"""
============================================================================
PATCH v3: Thêm biểu đồ Gantt vào Status Report PDF
FILE: src/utils/exportProjectPDF.ts
============================================================================
V3 fix: generateGanttHTML() trả về HTML string.
        Gọi TRƯỚC template literal: const ganttHtml = generateGanttHTML(...)
        Dùng ${ganttHtml} trong template (không backslash).

Cách dùng:
  python fix_gantt_pdf_export.py src/utils/exportProjectPDF.ts

Rollback:
  cp src/utils/exportProjectPDF.ts.bak_ganttv3 src/utils/exportProjectPDF.ts
============================================================================
"""
import sys, os, shutil

def patch(fp):
    if not os.path.isfile(fp):
        print(f"❌ Not found: {fp}"); return False
    with open(fp,'r',encoding='utf-8') as f: content=f.read()
    shutil.copy2(fp, fp+'.bak_ganttv3')
    print(f"📦 Backup: {fp}.bak_ganttv3")

    # === RESTORE from oldest backup if exists ===
    for bak in [fp+'.bak_gantt', fp+'.bak_gantt2']:
        if os.path.isfile(bak):
            with open(bak,'r',encoding='utf-8') as f: content=f.read()
            print(f"  🔄 Restored from {os.path.basename(bak)}")
            break

    orig = content
    n = 0

    # --- PATCH 1: Add actual fields to type ---
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
        content=content.replace(OLD1,NEW1,1); n+=1
        print("  ✅ P1: type thêm actual_start/end")

    # --- PATCH 2: Add generateGanttHTML function ---
    # Uses ONLY string concatenation (no backticks inside)
    FN = '''
// ============================================================================
// GANTT CHART HTML GENERATOR
// ============================================================================
function generateGanttHTML(phases: PDFReportData['phases'], pjStart?: string, pjEnd?: string): string {
  if (!phases.length) return '';
  var allD: number[] = [];
  phases.forEach(function(ph) {
    if (ph.planned_start) allD.push(new Date(ph.planned_start).getTime());
    if (ph.planned_end) allD.push(new Date(ph.planned_end).getTime());
  });
  if (pjStart) allD.push(new Date(pjStart).getTime());
  if (pjEnd) allD.push(new Date(pjEnd).getTime());
  if (allD.length < 2) return '';
  var minT = Math.min.apply(null, allD), maxT = Math.max.apply(null, allD);
  var minDate = new Date(minT), maxDate = new Date(maxT);
  var totalD = Math.max(1, Math.ceil((maxT - minT) / 86400000));
  // months
  var mons: string[] = [], mhH = '', glH = '';
  var c = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (c <= maxDate) {
    var ms = Math.max(0, Math.ceil((c.getTime() - minT) / 86400000));
    var nm = new Date(c.getFullYear(), c.getMonth() + 1, 1);
    var me = Math.min(totalD, Math.ceil((nm.getTime() - minT) / 86400000));
    var sp = (ms / totalD * 100).toFixed(2);
    var wp = ((me - ms) / totalD * 100).toFixed(2);
    var lb = c.toLocaleDateString('vi-VN', { month: 'short', year: '2-digit' });
    mhH += '<div style="position:absolute;left:' + sp + '%;width:' + wp + '%;text-align:center;font-size:7px;color:#9CA3AF;border-left:1px solid #E5E7EB;box-sizing:border-box">' + lb + '</div>';
    glH += '<div style="position:absolute;left:' + sp + '%;top:0;bottom:0;border-left:1px dashed #F0F0F0"></div>';
    c.setMonth(c.getMonth() + 1);
  }
  // today
  var now = new Date(), tp = (Math.ceil((now.getTime() - minT) / 86400000) / totalD * 100);
  var tlH = '';
  if (tp >= 0 && tp <= 100) {
    tlH = '<div style="position:absolute;left:' + tp.toFixed(2) + '%;top:0;bottom:0;border-left:2px solid #DC2626;z-index:2">' +
      '<div style="position:absolute;top:-10px;left:-14px;font-size:6px;color:#DC2626;font-weight:700;background:#fff;padding:0 2px">H\\u00F4m nay</div></div>';
  }
  // bars
  var SC: Record<string,string> = {completed:'#16A34A',in_progress:'#2563EB',pending:'#9CA3AF',skipped:'#D1D5DB'};
  var bH = '';
  phases.forEach(function(ph) {
    var ps = ph.planned_start ? new Date(ph.planned_start).getTime() : minT;
    var pe = ph.planned_end ? new Date(ph.planned_end).getTime() : maxT;
    var lp = (Math.ceil((ps - minT) / 86400000) / totalD * 100);
    var wp = (Math.max(1, Math.ceil((pe - ps) / 86400000)) / totalD * 100);
    var bc = ph.color || SC[ph.status] || '#6B7280';
    var pw = (ph.progress_pct / 100) * wp;
    var rd = ph.progress_pct >= 100 ? '3px' : '3px 0 0 3px';
    bH += '<div style="display:flex;align-items:center;margin-bottom:3px;height:20px">';
    bH += '<div style="width:130px;font-size:9px;font-weight:500;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:8px">' + ph.name + '</div>';
    bH += '<div style="flex:1;position:relative;height:14px">';
    bH += '<div style="position:absolute;top:2px;left:' + lp.toFixed(2) + '%;width:' + wp.toFixed(2) + '%;height:10px;background:#E5E7EB;border-radius:3px;border:1px solid #D1D5DB"></div>';
    bH += '<div style="position:absolute;top:2px;left:' + lp.toFixed(2) + '%;width:' + pw.toFixed(2) + '%;height:10px;background:' + bc + ';border-radius:' + rd + ';opacity:0.85"></div>';
    bH += '<div style="position:absolute;top:1px;left:' + (lp + wp + 0.5).toFixed(2) + '%;font-size:8px;font-weight:700;color:#374151;font-family:monospace;white-space:nowrap">' + ph.progress_pct + '%</div>';
    bH += '</div></div>';
  });
  // legend
  var lg = '<div style="display:flex;gap:12px;margin-top:5px;padding-left:130px">';
  lg += '<div style="display:flex;align-items:center;gap:3px"><div style="width:14px;height:5px;background:#2563EB;border-radius:2px;opacity:0.85"></div><span style="font-size:7px;color:#9CA3AF">Ti\\u1EBFn \\u0111\\u1ED9</span></div>';
  lg += '<div style="display:flex;align-items:center;gap:3px"><div style="width:14px;height:5px;background:#E5E7EB;border:1px solid #D1D5DB;border-radius:2px"></div><span style="font-size:7px;color:#9CA3AF">K\\u1EBF ho\\u1EA1ch</span></div>';
  if (tp >= 0 && tp <= 100) {
    lg += '<div style="display:flex;align-items:center;gap:3px"><div style="width:0;height:8px;border-left:2px solid #DC2626"></div><span style="font-size:7px;color:#9CA3AF">H\\u00F4m nay</span></div>';
  }
  lg += '</div>';
  // assemble
  var r = '<div style="margin-top:2px">';
  r += '<div style="display:flex;align-items:center;margin-bottom:3px"><div style="width:130px"></div><div style="flex:1;position:relative;height:14px">' + mhH + '</div></div>';
  r += '<div style="position:relative"><div style="position:absolute;left:130px;right:30px;top:0;bottom:0">' + glH + tlH + '</div>' + bH + '</div>';
  r += lg + '</div>';
  return r;
}

'''
    MARKER2 = '// ============================================================================\n// MAIN EXPORT FUNCTION'
    if MARKER2 in content and 'generateGanttHTML' not in content:
        content = content.replace(MARKER2, FN + MARKER2, 1); n+=1
        print("  ✅ P2: thêm generateGanttHTML()")

    # --- PATCH 3: Compute ganttHtml before template, insert section ---
    # 3a: Add variable before `const html = \``
    # We need to find the FIRST `const html = \`` in exportStatusReportPDF
    TARGET_3A = '  const html = `\n<!DOCTYPE html>'
    REPLACE_3A = '  const ganttHtml = generateGanttHTML(data.phases, data.project.planned_start, data.project.planned_end)\n\n  const html = `\n<!DOCTYPE html>'
    if TARGET_3A in content and 'const ganttHtml' not in content:
        content = content.replace(TARGET_3A, REPLACE_3A, 1); n+=1
        print("  ✅ P3a: const ganttHtml = ... trước template")

    # 3b: Insert Gantt section. 
    # KEY: We use raw dollar-brace which Python writes as literal ${ganttHtml}
    # In the JS file this will be inside a backtick template literal → gets interpolated
    TARGET_3B = '<div class="two-col">\n\n<!-- ===== SECTION 3: MILESTONES ===== -->'
    REPLACE_3B = '<!-- ===== SECTION 2b: GANTT CHART ===== -->\n<div class="section">\n  <div class="section-title">Biểu đồ Gantt</div>\n  ${ganttHtml}\n</div>\n\n<div class="two-col">\n\n<!-- ===== SECTION 3: MILESTONES ===== -->'
    if TARGET_3B in content and 'GANTT CHART' not in content:
        content = content.replace(TARGET_3B, REPLACE_3B, 1); n+=1
        print("  ✅ P3b: ${ganttHtml} trong HTML template")

    if content != orig:
        with open(fp,'w',encoding='utf-8') as f: f.write(content)
        print(f"\n✅ {n} patches → exportProjectPDF.ts")
        return True
    print("ℹ️  No changes"); return False

if __name__=='__main__':
    if len(sys.argv)<2: print("Usage: python fix_gantt_pdf_export.py src/utils/exportProjectPDF.ts"); sys.exit(1)
    patch(sys.argv[1])
