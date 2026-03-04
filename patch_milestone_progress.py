#!/usr/bin/env python3
"""
==========================================================================
MILESTONE PROGRESS UX — Auto-Patch Script
Chạy: cd D:/Projects/huyanh-erp-6 && python patch_milestone_progress.py
==========================================================================
"""
import os, sys, shutil
from datetime import datetime

FILE = os.path.join('src', 'pages', 'projects', 'ProjectDetailPage.tsx')

def main():
    if not os.path.exists(FILE):
        print(f"❌ Không tìm thấy: {FILE}")
        print("   Chạy từ thư mục gốc dự án!")
        sys.exit(1)

    bak = FILE + f'.bak-{datetime.now().strftime("%Y%m%d_%H%M%S")}'
    shutil.copy2(FILE, bak)
    print(f"✅ Backup: {bak}")

    with open(FILE, 'r', encoding='utf-8') as f:
        c = f.read()

    n = 0

    # P1: MilestoneItem interface
    o = "  phase?: { id: string; name: string }\n}"
    r = "  phase?: { id: string; name: string }\n  // ✅ MILESTONE PROGRESS\n  total_tasks?: number\n  completed_tasks?: number\n  progress_pct?: number\n}"
    # Only replace inside MilestoneItem block
    marker = "interface MilestoneItem {\n"
    idx = c.find(marker)
    if idx >= 0:
        end_idx = c.find(o, idx)
        if end_idx >= 0:
            c = c[:end_idx] + r + c[end_idx+len(o):]
            n += 1
            print("✅ P1: MilestoneItem interface +3 fields")
        else:
            print("❌ P1: closing brace not found")
    else:
        print("❌ P1: interface not found")

    # P2: Helper loadMilestoneTaskProgress after getProgressColor
    anchor = "function getProgressColor(pct: number): string {\n  if (pct >= 75) return 'bg-emerald-500'\n  if (pct >= 40) return 'bg-blue-500'\n  if (pct >= 10) return 'bg-amber-500'\n  return 'bg-gray-300'\n}"
    helper = """

// ✅ MILESTONE PROGRESS: Load task counts for milestones
async function loadMilestoneTaskProgress(msIds: string[]): Promise<Map<string, { total: number; completed: number; pct: number }>> {
  const map = new Map<string, { total: number; completed: number; pct: number }>()
  if (msIds.length === 0) return map
  const { data } = await supabase.from('tasks').select('milestone_id, status').in('milestone_id', msIds).neq('status', 'cancelled')
  if (!data) return map
  const grouped = new Map<string, { total: number; completed: number }>()
  data.forEach((t: any) => {
    const cur = grouped.get(t.milestone_id) || { total: 0, completed: 0 }
    cur.total++
    if (['completed', 'finished'].includes(t.status)) cur.completed++
    grouped.set(t.milestone_id, cur)
  })
  grouped.forEach((v, k) => map.set(k, { total: v.total, completed: v.completed, pct: v.total > 0 ? Math.round(v.completed / v.total * 1000) / 10 : 0 }))
  return map
}"""
    if 'loadMilestoneTaskProgress' not in c and anchor in c:
        c = c.replace(anchor, anchor + helper, 1)
        n += 1
        print("✅ P2: Helper loadMilestoneTaskProgress added")
    elif 'loadMilestoneTaskProgress' in c:
        print("⚠️  P2: already exists")
    else:
        print("❌ P2: anchor not found")

    # P3: loadMilestones task progress
    o3 = """      const milestones: MilestoneItem[] = (data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        due_date: m.due_date,
        completed_date: m.completed_date || undefined,
        status: m.status || 'pending',
        assignee: m.assignee_id ? empMap.get(m.assignee_id) : undefined,
        phase: { id: phaseId, name: phases.find(p => p.id === phaseId)?.name || '' },
      }))

      setMilestonesMap(prev => new Map(prev).set(phaseId, milestones))"""
    r3 = """      // ✅ MILESTONE PROGRESS
      const msProgress = await loadMilestoneTaskProgress((data || []).map((m: any) => m.id))
      const milestones: MilestoneItem[] = (data || []).map((m: any) => {
        const tp = msProgress.get(m.id)
        return {
          id: m.id, name: m.name, due_date: m.due_date,
          completed_date: m.completed_date || undefined,
          status: m.status || 'pending',
          assignee: m.assignee_id ? empMap.get(m.assignee_id) : undefined,
          phase: { id: phaseId, name: phases.find(p => p.id === phaseId)?.name || '' },
          total_tasks: tp?.total || 0, completed_tasks: tp?.completed || 0, progress_pct: tp?.pct || 0,
        }
      })
      setMilestonesMap(prev => new Map(prev).set(phaseId, milestones))"""
    if o3 in c:
        c = c.replace(o3, r3, 1); n += 1; print("✅ P3: loadMilestones task progress")
    else: print("❌ P3: NOT FOUND")

    # P4: loadProjectMilestones
    o4 = """      setProjectMilestones((data || []).map((m: any) => ({
        id: m.id, name: m.name, due_date: m.due_date,
        completed_date: m.completed_date || undefined,
        status: m.status || 'pending',
        assignee: m.assignee_id ? empMap.get(m.assignee_id) : undefined,
      })))"""
    r4 = """      // ✅ MILESTONE PROGRESS
      const msProgress = await loadMilestoneTaskProgress((data || []).map((m: any) => m.id))
      setProjectMilestones((data || []).map((m: any) => {
        const tp = msProgress.get(m.id)
        return {
          id: m.id, name: m.name, due_date: m.due_date,
          completed_date: m.completed_date || undefined,
          status: m.status || 'pending',
          assignee: m.assignee_id ? empMap.get(m.assignee_id) : undefined,
          total_tasks: tp?.total || 0, completed_tasks: tp?.completed || 0, progress_pct: tp?.pct || 0,
        }
      }))"""
    if o4 in c:
        c = c.replace(o4, r4, 1); n += 1; print("✅ P4: loadProjectMilestones task progress")
    else: print("❌ P4: NOT FOUND")

    # P5: handleToggleMilestoneStatus → handleUpdateMilestoneStatus + handleRecalcMilestones
    o5 = """  const handleToggleMilestoneStatus = async (msId: string, currentStatus: MilestoneStatus, phaseId: string | null) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    const completedDate = newStatus === 'completed' ? new Date().toISOString().split('T')[0] : null
    try {
      await supabase.from('project_milestones')
        .update({ status: newStatus, completed_date: completedDate })
        .eq('id', msId)
      if (phaseId) await loadMilestones(phaseId)
      else await loadProjectMilestones()
    } catch (err) {
      console.error('Toggle milestone failed:', err)
    }
  }"""
    r5 = """  // ✅ MILESTONE PROGRESS: Update to specific status (dropdown)
  const handleUpdateMilestoneStatus = async (msId: string, newStatus: MilestoneStatus, phaseId: string | null) => {
    const completedDate = newStatus === 'completed' ? new Date().toISOString().split('T')[0] : null
    try {
      const { error } = await supabase.from('project_milestones')
        .update({ status: newStatus, completed_date: completedDate, updated_at: new Date().toISOString() })
        .eq('id', msId)
      if (error) { alert('Lỗi: ' + error.message); return }
      if (phaseId) await loadMilestones(phaseId)
      else await loadProjectMilestones()
    } catch (err) {
      console.error('Update milestone status failed:', err)
    }
  }

  // ✅ MILESTONE PROGRESS: Batch recalc
  const handleRecalcMilestones = async () => {
    try {
      const { error } = await supabase.rpc('fn_recalc_project_milestones', { p_project_id: projectId })
      if (error) console.warn('Recalc RPC:', error.message)
      for (const phId of Array.from(milestonesMap.keys())) { await loadMilestones(phId) }
      await loadProjectMilestones()
    } catch (err) { console.error('Recalc failed:', err) }
  }"""
    if o5 in c:
        c = c.replace(o5, r5, 1); n += 1; print("✅ P5: handleUpdateMilestoneStatus + handleRecalcMilestones")
    else: print("❌ P5: NOT FOUND")

    # P6a: MilestoneList state + options
    o6a = """  /** Milestone list within a phase */
  const MilestoneList: React.FC<{ milestones: MilestoneItem[]; phaseId: string | null; isLoading?: boolean }> = ({ milestones, phaseId, isLoading }) => {
    const isAddingHere = phaseId === null ? addProjectMs : addMsPhaseId === phaseId

    const handleClickAdd = () => {"""
    r6a = """  /** Milestone list — ✅ Enhanced with progress + status dropdown */
  const MilestoneList: React.FC<{ milestones: MilestoneItem[]; phaseId: string | null; isLoading?: boolean }> = ({ milestones, phaseId, isLoading }) => {
    const isAddingHere = phaseId === null ? addProjectMs : addMsPhaseId === phaseId
    const [statusMenuId, setStatusMenuId] = useState<string | null>(null)
    const MS_STATUS_OPTIONS: { value: MilestoneStatus; label: string; icon: string; color: string }[] = [
      { value: 'pending', label: 'Chờ', icon: '⬜', color: 'text-gray-600' },
      { value: 'approaching', label: 'Sắp đến', icon: '🔵', color: 'text-blue-600' },
      { value: 'completed', label: 'Hoàn thành', icon: '✅', color: 'text-green-600' },
      { value: 'overdue', label: 'Quá hạn', icon: '🔴', color: 'text-red-600' },
      { value: 'cancelled', label: 'Đã hủy', icon: '⚫', color: 'text-gray-400' },
    ]

    const handleClickAdd = () => {"""
    if o6a in c:
        c = c.replace(o6a, r6a, 1); n += 1; print("✅ P6a: MilestoneList state + options")
    else: print("❌ P6a: NOT FOUND")

    # P6b: Refresh button in header
    o6b = """          {!isAddingHere && (
            <button
              onClick={handleClickAdd}
              className="text-[11px] text-[#1B4D3E] font-medium flex items-center gap-0.5 hover:underline"
            >
              <Plus className="w-3 h-3" /> Thêm
            </button>
          )}
        </div>"""
    r6b = """          <div className="flex items-center gap-2">
            {milestones.length > 0 && (
              <button onClick={handleRecalcMilestones}
                className="text-[11px] text-gray-400 hover:text-[#1B4D3E] flex items-center gap-0.5"
                title="Cập nhật trạng thái từ tasks">
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
            {!isAddingHere && (
              <button onClick={handleClickAdd}
                className="text-[11px] text-[#1B4D3E] font-medium flex items-center gap-0.5 hover:underline">
                <Plus className="w-3 h-3" /> Thêm
              </button>
            )}
          </div>
        </div>"""
    if o6b in c:
        c = c.replace(o6b, r6b, 1); n += 1; print("✅ P6b: Refresh button")
    else: print("❌ P6b: NOT FOUND")

    # P6c: Milestone rows
    o6c = """        {milestones.map(ms => {
          const msConf = MS_STATUS_ICON[ms.status]
          const isOverdue = ms.status !== 'completed' && ms.due_date && new Date(ms.due_date) < new Date()
          return (
            <div key={ms.id} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${isOverdue ? 'bg-red-50' : 'hover:bg-gray-50'} group`}>
              <button
                onClick={() => handleToggleMilestoneStatus(ms.id, ms.status, phaseId)}
                className="text-[14px] shrink-0"
                title={ms.status === 'completed' ? 'Đánh dấu chưa xong' : 'Đánh dấu hoàn thành'}
              >
                {msConf.icon}
              </button>
              <div className="flex-1 min-w-0">
                <span className={`text-[12px] font-medium ${ms.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {ms.name}
                </span>
              </div>
              <span className={`text-[11px] shrink-0 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {formatDate(ms.due_date)}
              </span>
              {ms.assignee && (
                <span className="text-[10px] text-gray-400 shrink-0 hidden sm:block">{ms.assignee.full_name}</span>
              )}
              <button
                onClick={() => handleDeleteMilestone(ms.id, phaseId)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 transition-opacity shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )
        })}"""
    r6c = """        {milestones.map(ms => {
          const msConf = MS_STATUS_ICON[ms.status]
          const isOverdue = ms.status !== 'completed' && ms.due_date && new Date(ms.due_date) < new Date()
          const hasTasks = (ms.total_tasks || 0) > 0
          const taskPct = ms.progress_pct || 0
          return (
            <div key={ms.id} className={`rounded-lg border ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'} p-2.5 group`}>
              <div className="flex items-center gap-2">
                <div className="relative shrink-0">
                  <button onClick={() => setStatusMenuId(statusMenuId === ms.id ? null : ms.id)}
                    className="text-[14px] p-0.5 rounded hover:bg-gray-100 active:scale-95" title="Thay đổi trạng thái">
                    {msConf.icon}
                  </button>
                  {statusMenuId === ms.id && (<>
                    <div className="fixed inset-0 z-40" onClick={() => setStatusMenuId(null)} />
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                      {MS_STATUS_OPTIONS.map(opt => (
                        <button key={opt.value}
                          onClick={() => { handleUpdateMilestoneStatus(ms.id, opt.value, phaseId); setStatusMenuId(null) }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-gray-50 ${ms.status === opt.value ? 'bg-gray-50 font-semibold' : ''} ${opt.color}`}>
                          <span className="text-[13px]">{opt.icon}</span>{opt.label}
                        </button>
                      ))}
                    </div>
                  </>)}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-[12px] font-medium ${ms.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{ms.name}</span>
                </div>
                <span className={`text-[11px] shrink-0 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{formatDate(ms.due_date)}</span>
                {ms.assignee && (<span className="text-[10px] text-gray-400 shrink-0 hidden sm:block">{ms.assignee.full_name}</span>)}
                <button onClick={() => handleDeleteMilestone(ms.id, phaseId)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 transition-opacity shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              {hasTasks && (
                <div className="flex items-center gap-2 mt-1.5 ml-7">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${taskPct >= 100 ? 'bg-green-500' : taskPct > 0 ? 'bg-blue-500' : 'bg-gray-200'}`}
                      style={{ width: `${Math.min(taskPct, 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500 shrink-0 font-mono">{ms.completed_tasks}/{ms.total_tasks}</span>
                </div>
              )}
              {!hasTasks && ms.status !== 'completed' && ms.status !== 'cancelled' && (
                <div className="mt-1 ml-7"><span className="text-[10px] text-gray-400 italic">Chưa gán task</span></div>
              )}
            </div>
          )
        })}"""
    if o6c in c:
        c = c.replace(o6c, r6c, 1); n += 1; print("✅ P6c: Milestone rows enhanced")
    else: print("❌ P6c: NOT FOUND")

    # P7: Main setMilestones
    o7 = """        // Set milestones (client-side join)
        setMilestones(msData.map((m: any) => ({
          id: m.id,
          name: m.name,
          due_date: m.due_date,
          completed_date: m.completed_date || undefined,
          status: m.status || 'pending',
          assignee: m.assignee_id ? empMap.get(m.assignee_id) : undefined,
          phase: m.phase_id ? phaseMap.get(m.phase_id) : undefined,
        })))"""
    r7 = """        // ✅ MILESTONE PROGRESS: Load task counts for overview
        const msProgress = await loadMilestoneTaskProgress(msData.map((m: any) => m.id))

        // Set milestones (client-side join + task progress)
        setMilestones(msData.map((m: any) => {
          const tp = msProgress.get(m.id)
          return {
            id: m.id, name: m.name, due_date: m.due_date,
            completed_date: m.completed_date || undefined,
            status: m.status || 'pending',
            assignee: m.assignee_id ? empMap.get(m.assignee_id) : undefined,
            phase: m.phase_id ? phaseMap.get(m.phase_id) : undefined,
            total_tasks: tp?.total || 0, completed_tasks: tp?.completed || 0, progress_pct: tp?.pct || 0,
          }
        }))"""
    if o7 in c:
        c = c.replace(o7, r7, 1); n += 1; print("✅ P7: Main setMilestones + task progress")
    else: print("❌ P7: NOT FOUND")

    # P8: OverviewTab milestones
    o8 = """              <div key={ms.id} className="flex items-center gap-3">
                <span className="text-[16px] shrink-0">{msConf.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium truncate ${ms.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {ms.name}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {formatDate(ms.due_date)}
                    {ms.phase && <span className="ml-1.5">• {ms.phase.name}</span>}
                  </p>
                </div>
                {ms.assignee && (
                  <span className="text-[11px] text-gray-400 shrink-0">{ms.assignee.full_name}</span>
                )}
              </div>"""
    r8 = """              <div key={ms.id} className="flex items-center gap-3">
                <span className="text-[16px] shrink-0">{msConf.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-[13px] font-medium truncate ${ms.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                      {ms.name}
                    </p>
                    {(ms.total_tasks || 0) > 0 && (
                      <span className="text-[10px] text-gray-400 font-mono shrink-0">{ms.completed_tasks}/{ms.total_tasks}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-gray-500">
                      {formatDate(ms.due_date)}
                      {ms.phase && <span className="ml-1.5">• {ms.phase.name}</span>}
                    </p>
                    {(ms.total_tasks || 0) > 0 && (
                      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden max-w-[60px]">
                        <div className={`h-full rounded-full ${(ms.progress_pct || 0) >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(ms.progress_pct || 0, 100)}%` }} />
                      </div>
                    )}
                  </div>
                </div>
                {ms.assignee && (
                  <span className="text-[11px] text-gray-400 shrink-0">{ms.assignee.full_name}</span>
                )}
              </div>"""
    if o8 in c:
        c = c.replace(o8, r8, 1); n += 1; print("✅ P8: OverviewTab milestones progress")
    else: print("❌ P8: NOT FOUND")

    with open(FILE, 'w', encoding='utf-8') as f:
        f.write(c)

    lines = c.count('\n') + 1
    print(f"\n{'='*50}")
    print(f"✅ DONE: {n}/8 patches applied")
    print(f"   File: {FILE} ({lines} lines)")
    print(f"   Backup: {bak}")
    if n < 8:
        print(f"   ⚠️  {8-n} patches failed — check output above")

if __name__ == '__main__':
    main()
