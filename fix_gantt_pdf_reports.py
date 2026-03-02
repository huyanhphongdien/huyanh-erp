#!/usr/bin/env python3
"""
============================================================================
PATCH v3: Thêm biểu đồ Gantt vào Detailed Report PDF
FILE: src/components/project/ProjectReportsTab.tsx
============================================================================
V3: Tạo function buildGanttForPdf() và biến ganttDetailHtml ĐÚNG scope.
    Restore từ backup gốc trước khi patch.

Cách dùng:
  python fix_gantt_pdf_reports.py src/components/project/ProjectReportsTab.tsx

Rollback:
  cp src/components/project/ProjectReportsTab.tsx.bak_ganttv3 src/components/project/ProjectReportsTab.tsx
============================================================================
"""
import sys, os, shutil

def patch(fp):
    if not os.path.isfile(fp):
        print(f"❌ Not found: {fp}"); return False
    with open(fp,'r',encoding='utf-8') as f: content=f.read()
    shutil.copy2(fp, fp+'.bak_ganttv3')
    print(f"📦 Backup: {fp}.bak_ganttv3")

    # === RESTORE from oldest backup ===
    for bak in [fp+'.bak_gantt', fp+'.bak_gantt2']:
        if os.path.isfile(bak):
            with open(bak,'r',encoding='utf-8') as f: content=f.read()
            print(f"  🔄 Restored from {os.path.basename(bak)}")
            break

    orig = content
    n = 0

    # --- PATCH 4: pass actual dates in handleExportPDF ---
    OLD4 = """phases: phases.map(p => ({
          name: p.name, status: p.status, progress_pct: p.progress_pct,
          planned_start: p.planned_start, planned_end: p.planned_end, color: p.color,
        })),"""
    NEW4 = """phases: phases.map(p => ({
          name: p.name, status: p.status, progress_pct: p.progress_pct,
          planned_start: p.planned_start, planned_end: p.planned_end,
          actual_start: (p as any).actual_start, actual_end: (p as any).actual_end,
          color: p.color,
        })),"""
    if OLD4 in content:
        content=content.replace(OLD4,NEW4,1); n+=1
        print("  ✅ P4: pass actual dates")

    # --- PATCH 5: Add Gantt to Detail Report ---
    # Strategy: We add the gantt builder function AND compute the variable
    # right before `const html = \`<!DOCTYPE html>` inside handleExportDetailPDF.
    #
    # The key insight: the detail report template starts with a UNIQUE string:
    #   const html = `<!DOCTYPE html>\n<html lang="vi"><head>...\n<title>Báo cáo chi tiết
    # We insert our code BEFORE this line.

    # 5a: Build gantt function + variable before template
    GANTT_BUILDER = r'''      // ── GANTT CHART for detail PDF ──
      const _buildGantt = (phs: any[], pjS?: string, pjE?: string): string => {
        if (!phs.length) return '';
        var aD: number[] = [];
        phs.forEach((p: any) => { if (p.planned_start) aD.push(new Date(p.planned_start).getTime()); if (p.planned_end) aD.push(new Date(p.planned_end).getTime()); });
        if (pjS) aD.push(new Date(pjS).getTime()); if (pjE) aD.push(new Date(pjE).getTime());
        if (aD.length < 2) return '';
        var mn = Math.min.apply(null,aD), mx = Math.max.apply(null,aD), tD = Math.max(1,Math.ceil((mx-mn)/864e5));
        var mhH='',glH='',c=new Date(new Date(mn).getFullYear(),new Date(mn).getMonth(),1);
        while(c.getTime()<=mx){var ms=Math.max(0,Math.ceil((c.getTime()-mn)/864e5));var nm=new Date(c.getFullYear(),c.getMonth()+1,1);var me=Math.min(tD,Math.ceil((nm.getTime()-mn)/864e5));var sp=(ms/tD*100).toFixed(2);var wp=((me-ms)/tD*100).toFixed(2);var lb=c.toLocaleDateString('vi-VN',{month:'short',year:'2-digit'});mhH+='<div style="position:absolute;left:'+sp+'%;width:'+wp+'%;text-align:center;font-size:7px;color:#9CA3AF;border-left:1px solid #E5E7EB;box-sizing:border-box">'+lb+'</div>';glH+='<div style="position:absolute;left:'+sp+'%;top:0;bottom:0;border-left:1px dashed #F0F0F0"></div>';c.setMonth(c.getMonth()+1);}
        var nw=new Date(),tp=(Math.ceil((nw.getTime()-mn)/864e5)/tD*100),tlH='';
        if(tp>=0&&tp<=100){tlH='<div style="position:absolute;left:'+tp.toFixed(2)+'%;top:0;bottom:0;border-left:2px solid #DC2626;z-index:2"><div style="position:absolute;top:-10px;left:-14px;font-size:6px;color:#DC2626;font-weight:700;background:#fff;padding:0 2px">H\u00F4m nay</div></div>';}
        var SC:Record<string,string>={completed:'#16A34A',in_progress:'#2563EB',pending:'#9CA3AF',skipped:'#D1D5DB'};
        var bH='';phs.sort((a:any,b:any)=>(a.order_index||0)-(b.order_index||0)).forEach((ph:any)=>{var ps=ph.planned_start?new Date(ph.planned_start).getTime():mn;var pe=ph.planned_end?new Date(ph.planned_end).getTime():mx;var lp=(Math.ceil((ps-mn)/864e5)/tD*100);var wp=(Math.max(1,Math.ceil((pe-ps)/864e5))/tD*100);var bc=ph.color||SC[ph.status]||'#6B7280';var pw=(ph.progress_pct/100)*wp;var rd=ph.progress_pct>=100?'3px':'3px 0 0 3px';bH+='<div style="display:flex;align-items:center;margin-bottom:3px;height:20px"><div style="width:130px;font-size:9px;font-weight:500;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:8px">'+ph.name+'</div><div style="flex:1;position:relative;height:14px"><div style="position:absolute;top:2px;left:'+lp.toFixed(2)+'%;width:'+wp.toFixed(2)+'%;height:10px;background:#E5E7EB;border-radius:3px;border:1px solid #D1D5DB"></div><div style="position:absolute;top:2px;left:'+lp.toFixed(2)+'%;width:'+pw.toFixed(2)+'%;height:10px;background:'+bc+';border-radius:'+rd+';opacity:0.85"></div><div style="position:absolute;top:1px;left:'+(lp+wp+0.5).toFixed(2)+'%;font-size:8px;font-weight:700;color:#374151;font-family:monospace;white-space:nowrap">'+ph.progress_pct+'%</div></div></div>';});
        var lg='<div style="display:flex;gap:12px;margin-top:5px;padding-left:130px">';
        lg+='<div style="display:flex;align-items:center;gap:3px"><div style="width:14px;height:5px;background:#2563EB;border-radius:2px;opacity:0.85"></div><span style="font-size:7px;color:#9CA3AF">Ti\u1EBFn \u0111\u1ED9</span></div>';
        lg+='<div style="display:flex;align-items:center;gap:3px"><div style="width:14px;height:5px;background:#E5E7EB;border:1px solid #D1D5DB;border-radius:2px"></div><span style="font-size:7px;color:#9CA3AF">K\u1EBF ho\u1EA1ch</span></div>';
        if(tp>=0&&tp<=100){lg+='<div style="display:flex;align-items:center;gap:3px"><div style="width:0;height:8px;border-left:2px solid #DC2626"></div><span style="font-size:7px;color:#9CA3AF">H\u00F4m nay</span></div>';}
        lg+='</div>';
        var r='<div style="margin-top:2px"><div style="display:flex;align-items:center;margin-bottom:3px"><div style="width:130px"></div><div style="flex:1;position:relative;height:14px">'+mhH+'</div></div><div style="position:relative"><div style="position:absolute;left:130px;right:30px;top:0;bottom:0">'+glH+tlH+'</div>'+bH+'</div>'+lg+'</div>';
        return r;
      }
      const ganttDetailHtml = _buildGantt(phases, project.planned_start, project.planned_end)

'''

    DETAIL_MARKER = """      const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8">
<title>Báo cáo chi tiết"""

    if DETAIL_MARKER in content and '_buildGantt' not in content:
        content = content.replace(DETAIL_MARKER, GANTT_BUILDER + DETAIL_MARKER, 1); n+=1
        print("  ✅ P5a: _buildGantt + ganttDetailHtml trước template")
    elif '_buildGantt' in content:
        print("  ⏭️  P5a: Already patched")

    # 5b: Insert ${ganttDetailHtml} section
    OLD5B = """<!-- 3. MILESTONES (FULL) -->
<div class="section">
  <div class="section-title">3. Milestones"""

    # NOTE: We write ${ganttDetailHtml} directly — no backslash!
    # In Python string, $ has no special meaning, so it writes $ literally to the file.
    # In the TS file, this sits inside a backtick template literal → JS interpolates it.
    NEW5B = """<!-- 2b. BIỂU ĐỒ GANTT -->
<div class="section">
  <div class="section-title">Biểu đồ Gantt</div>
  ${ganttDetailHtml}
</div>

<!-- 3. MILESTONES (FULL) -->
<div class="section">
  <div class="section-title">3. Milestones"""

    if OLD5B in content and 'GANTT' not in content:
        content = content.replace(OLD5B, NEW5B, 1); n+=1
        print("  ✅ P5b: ${ganttDetailHtml} trong HTML template")
    elif 'GANTT' in content:
        print("  ⏭️  P5b: Already patched")

    if content != orig:
        with open(fp,'w',encoding='utf-8') as f: f.write(content)
        print(f"\n✅ {n} patches → ProjectReportsTab.tsx")
        return True
    print("ℹ️  No changes"); return False

if __name__=='__main__':
    if len(sys.argv)<2: print("Usage: python fix_gantt_pdf_reports.py src/components/project/ProjectReportsTab.tsx"); sys.exit(1)
    patch(sys.argv[1])
