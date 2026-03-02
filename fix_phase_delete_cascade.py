#!/usr/bin/env python3
"""
FIX v4: handlePhaseDelete — Xóa Phase kèm xóa luôn tasks (cascade)

Thứ tự xóa (tôn trọng FK):
  1. Unlink milestones.phase_id = null
  2. Xóa task_assignments (FK → task_approvals, tasks)
  3. Xóa task_approvals (FK → task_self_evaluations, tasks)
  4. Xóa task_self_evaluations (FK → tasks)
  5. Xóa task_comments (FK → tasks)
  6. Xóa task_attachments (FK → tasks)
  7. Xóa task_activities (FK → tasks)
  8. Xóa tasks (FK → project_phases)
  9. Xóa project_phases
  10. Reindex + recalc progress

Usage:
  python fix_phase_delete_cascade.py
  python fix_phase_delete_cascade.py src/pages/projects/ProjectDetailPage.tsx
"""

import sys, os, shutil

DEFAULT_PATH = "src/pages/projects/ProjectDetailPage.tsx"

# ============================================================================
# OLD CODE — handlePhaseDelete v2 (unlink tasks)
# ============================================================================

OLD_CODE = '''  // ✅ FIX v2: Xử lý FK milestones + tasks trước khi xóa, reindex, recalc progress
  const handlePhaseDelete = async (phaseId: string) => {
    if (!confirm('Xóa giai đoạn này?\\n- Milestones sẽ được chuyển về cấp dự án\\n- Tasks sẽ được gỡ liên kết phase')) return
    try {
      // 1. Unlink milestones → set phase_id = null
      const { count: msCount } = await supabase
        .from('project_milestones')
        .select('id', { count: 'exact', head: true })
        .eq('phase_id', phaseId)

      if (msCount && msCount > 0) {
        const { error: msError } = await supabase
          .from('project_milestones')
          .update({ phase_id: null })
          .eq('phase_id', phaseId)

        if (msError) {
          console.error('Unlink milestones failed:', msError)
          alert('Không thể gỡ milestones khỏi giai đoạn: ' + msError.message)
          return
        }
      }

      // 2. Unlink tasks → set phase_id = null (fix tasks_phase_id_fkey)
      const { count: taskCount } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('phase_id', phaseId)

      if (taskCount && taskCount > 0) {
        const { error: taskError } = await supabase
          .from('tasks')
          .update({ phase_id: null })
          .eq('phase_id', phaseId)

        if (taskError) {
          console.error('Unlink tasks failed:', taskError)
          alert('Không thể gỡ tasks khỏi giai đoạn: ' + taskError.message)
          return
        }
        console.log(`✅ Unlinked ${taskCount} tasks from phase ${phaseId}`)
      }

      // 3. Xóa phase
      const { error } = await supabase
        .from('project_phases')
        .delete()
        .eq('id', phaseId)

      if (error) {
        console.error('Phase delete failed:', error)
        alert('Xóa giai đoạn thất bại: ' + error.message)
        return
      }

      // 3. Recalculate project progress + reindex
      if (realProjectId) {
        const { data: remaining } = await supabase
          .from('project_phases')
          .select('id, progress_pct, status, order_index')
          .eq('project_id', realProjectId)
          .order('order_index', { ascending: true })

        if (remaining && remaining.length > 0) {
          // Reindex order
          for (let i = 0; i < remaining.length; i++) {
            if (remaining[i].order_index !== i) {
              await supabase.from('project_phases')
                .update({ order_index: i })
                .eq('id', remaining[i].id)
            }
          }

          // Recalc progress (excluding skipped)
          const active = remaining.filter((p: any) => p.status !== 'skipped')
          const avg = active.length > 0
            ? Math.round(active.reduce((s: number, p: any) => s + (Number(p.progress_pct) || 0), 0) / active.length * 100) / 100
            : 0

          await supabase.from('projects')
            .update({ progress_pct: avg, updated_at: new Date().toISOString() })
            .eq('id', realProjectId)

          setProject(prev => ({ ...prev, progress_pct: avg }))
        } else {
          await supabase.from('projects')
            .update({ progress_pct: 0, updated_at: new Date().toISOString() })
            .eq('id', realProjectId)

          setProject(prev => ({ ...prev, progress_pct: 0 }))
        }
      }

      await loadPhases()
    } catch (e: any) {
      console.error('Phase delete failed:', e)
      alert('Lỗi xóa giai đoạn: ' + (e.message || 'Lỗi không xác định'))
    }
  }'''

# ============================================================================
# NEW CODE — cascade delete tasks + all FK children
# ============================================================================

NEW_CODE = '''  // ✅ FIX v4: Xóa Phase cascade — xóa luôn tasks + tất cả FK liên quan
  const handlePhaseDelete = async (phaseId: string) => {
    // Đếm tasks để hiển thị cảnh báo
    const { count: taskCount } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('phase_id', phaseId)

    const phaseName = phases.find(p => p.id === phaseId)?.name || 'này'
    const taskWarning = taskCount && taskCount > 0
      ? `\\n⚠️ ${taskCount} công việc trong giai đoạn sẽ bị XÓA VĨNH VIỄN!`
      : ''

    if (!confirm(`Xóa giai đoạn "${phaseName}"?${taskWarning}\\n\\nMilestones sẽ được chuyển về cấp dự án.`)) return

    try {
      // ── 1. Unlink milestones → set phase_id = null ──
      const { error: msError } = await supabase
        .from('project_milestones')
        .update({ phase_id: null })
        .eq('phase_id', phaseId)

      if (msError) {
        console.error('Unlink milestones failed:', msError)
        alert('Không thể gỡ milestones: ' + msError.message)
        return
      }

      // ── 2. Cascade delete tasks + tất cả FK children ──
      if (taskCount && taskCount > 0) {
        // Lấy danh sách task IDs thuộc phase
        const { data: tasksInPhase } = await supabase
          .from('tasks')
          .select('id')
          .eq('phase_id', phaseId)

        const taskIds = (tasksInPhase || []).map(t => t.id)

        if (taskIds.length > 0) {
          // Xóa theo đúng thứ tự FK dependency:

          // 2a. task_assignments.approval_id = null (FK → task_approvals)
          await supabase.from('task_assignments')
            .update({ approval_id: null })
            .in('task_id', taskIds)

          // 2b. task_assignments (FK → tasks)
          const { error: e1 } = await supabase
            .from('task_assignments')
            .delete()
            .in('task_id', taskIds)
          if (e1) console.warn('Delete task_assignments:', e1.message)

          // 2c. task_approvals (FK → tasks, task_self_evaluations)
          const { error: e2 } = await supabase
            .from('task_approvals')
            .delete()
            .in('task_id', taskIds)
          if (e2) console.warn('Delete task_approvals:', e2.message)

          // 2d. task_self_evaluations (FK → tasks)
          const { error: e3 } = await supabase
            .from('task_self_evaluations')
            .delete()
            .in('task_id', taskIds)
          if (e3) console.warn('Delete task_self_evaluations:', e3.message)

          // 2e. task_comments (FK → tasks)
          const { error: e4 } = await supabase
            .from('task_comments')
            .delete()
            .in('task_id', taskIds)
          if (e4) console.warn('Delete task_comments:', e4.message)

          // 2f. task_attachments (FK → tasks)
          const { error: e5 } = await supabase
            .from('task_attachments')
            .delete()
            .in('task_id', taskIds)
          if (e5) console.warn('Delete task_attachments:', e5.message)

          // 2g. task_activities (FK → tasks)
          const { error: e6 } = await supabase
            .from('task_activities')
            .delete()
            .in('task_id', taskIds)
          if (e6) console.warn('Delete task_activities:', e6.message)

          // 2h. Xóa subtasks trước (parent_task_id → tasks)
          const { error: e7 } = await supabase
            .from('tasks')
            .delete()
            .in('parent_task_id', taskIds)
          if (e7) console.warn('Delete subtasks:', e7.message)

          // 2i. Xóa tasks chính
          const { error: taskError } = await supabase
            .from('tasks')
            .delete()
            .in('id', taskIds)

          if (taskError) {
            console.error('Delete tasks failed:', taskError)
            alert('Xóa công việc thất bại: ' + taskError.message)
            return
          }

          console.log(`✅ Deleted ${taskIds.length} tasks from phase "${phaseName}"`)
        }
      }

      // ── 3. Xóa phase ──
      const { error } = await supabase
        .from('project_phases')
        .delete()
        .eq('id', phaseId)

      if (error) {
        console.error('Phase delete failed:', error)
        alert('Xóa giai đoạn thất bại: ' + error.message)
        return
      }

      // ── 4. Recalculate project progress + reindex ──
      if (realProjectId) {
        const { data: remaining } = await supabase
          .from('project_phases')
          .select('id, progress_pct, status, order_index')
          .eq('project_id', realProjectId)
          .order('order_index', { ascending: true })

        if (remaining && remaining.length > 0) {
          for (let i = 0; i < remaining.length; i++) {
            if (remaining[i].order_index !== i) {
              await supabase.from('project_phases')
                .update({ order_index: i })
                .eq('id', remaining[i].id)
            }
          }

          const active = remaining.filter((p: any) => p.status !== 'skipped')
          const avg = active.length > 0
            ? Math.round(active.reduce((s: number, p: any) => s + (Number(p.progress_pct) || 0), 0) / active.length * 100) / 100
            : 0

          await supabase.from('projects')
            .update({ progress_pct: avg, updated_at: new Date().toISOString() })
            .eq('id', realProjectId)

          setProject(prev => ({ ...prev, progress_pct: avg }))
        } else {
          await supabase.from('projects')
            .update({ progress_pct: 0, updated_at: new Date().toISOString() })
            .eq('id', realProjectId)

          setProject(prev => ({ ...prev, progress_pct: 0 }))
        }
      }

      await loadPhases()
    } catch (e: any) {
      console.error('Phase delete failed:', e)
      alert('Lỗi xóa giai đoạn: ' + (e.message || 'Lỗi không xác định'))
    }
  }'''

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

    if OLD_CODE not in content:
        print("❌ Không tìm thấy handlePhaseDelete v2.")
        if '// ✅ FIX v4:' in content:
            print("   → File đã được patch v4 rồi.")
        else:
            print("   → Kiểm tra lại file.")
        sys.exit(1)

    content = content.replace(OLD_CODE, NEW_CODE, 1)

    backup = filepath + '.bak4'
    shutil.copy2(filepath, backup)
    print(f"📦 Backup: {backup}")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print()
    print("✅ PATCH V4 THÀNH CÔNG!")
    print()
    print("   Xóa Phase giờ cascade theo thứ tự FK:")
    print()
    print("   1.  Unlink milestones.phase_id = null")
    print("   2a. task_assignments.approval_id = null")
    print("   2b. DELETE task_assignments")
    print("   2c. DELETE task_approvals")
    print("   2d. DELETE task_self_evaluations")
    print("   2e. DELETE task_comments")
    print("   2f. DELETE task_attachments")
    print("   2g. DELETE task_activities")
    print("   2h. DELETE subtasks (parent_task_id)")
    print("   2i. DELETE tasks")
    print("   3.  DELETE project_phases")
    print("   4.  Reindex + Recalc progress")
    print()
    print("   ⚠️  Confirm dialog hiển thị số tasks sẽ bị xóa")
    print()
    print(f"   Rollback: cp {backup} {filepath}")

if __name__ == '__main__':
    main()
