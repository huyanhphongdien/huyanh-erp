#!/usr/bin/env python3
"""
FIX ProjectDetailPage.tsx — Patch 3 hàm lỗi:
1. handleStatusChange    → check .error, validate transitions, log activity
2. handlePhaseStatusUpdate → check .error, recalc project progress
3. handlePhaseDelete     → xử lý FK milestones trước khi xóa, recalc progress

Usage:
  python fix_project_detail.py
  
Hoặc chỉ định path:
  python fix_project_detail.py /path/to/ProjectDetailPage.tsx
"""

import sys
import os
import shutil

# ============================================================================
# CONFIG
# ============================================================================

DEFAULT_PATH = "src/pages/projects/ProjectDetailPage.tsx"

# ============================================================================
# OLD CODE (exact match)
# ============================================================================

OLD_CODE = r'''  const handleStatusChange = async (newStatus: ProjectStatus) => {
    setShowStatusMenu(false)
    try {
      if (realProjectId) {
        await supabase.from('projects')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', realProjectId)
      }
      setProject(prev => ({ ...prev, status: newStatus }))
    } catch (e) {
      console.error('Status update failed:', e)
    }
  }

  const handlePhaseStatusUpdate = async (phaseId: string, status: PhaseStatus) => {
    try {
      const progress = status === 'completed' ? 100 : undefined
      await supabase.from('project_phases')
        .update({
          status,
          ...(progress !== undefined ? { progress_pct: progress } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', phaseId)
      await loadPhases()
    } catch (e) {
      console.error('Phase status update failed:', e)
    }
  }

  const handlePhaseDelete = async (phaseId: string) => {
    if (!confirm('Xóa giai đoạn này?')) return
    try {
      await supabase.from('project_phases').delete().eq('id', phaseId)
      await loadPhases()
    } catch (e) {
      console.error('Phase delete failed:', e)
    }
  }'''

# ============================================================================
# NEW CODE (replacement)
# ============================================================================

NEW_CODE = r'''  // ✅ FIX: Check .error, validate transitions, auto actual dates, log activity
  const handleStatusChange = async (newStatus: ProjectStatus) => {
    setShowStatusMenu(false)
    try {
      if (realProjectId) {
        // Validate transition
        const allowed = VALID_TRANSITIONS[project.status] || []
        if (!allowed.includes(newStatus)) {
          alert(`Không thể chuyển từ "${project.status}" sang "${newStatus}"`)
          return
        }

        const updateData: Record<string, unknown> = {
          status: newStatus,
          updated_at: new Date().toISOString(),
        }

        // Auto-set actual_start khi chuyển sang in_progress
        if (newStatus === 'in_progress' && !project.actual_start) {
          updateData.actual_start = new Date().toISOString().split('T')[0]
        }

        // Auto-set actual_end khi completed
        if (newStatus === 'completed') {
          updateData.actual_end = new Date().toISOString().split('T')[0]
        }

        const { error } = await supabase.from('projects')
          .update(updateData)
          .eq('id', realProjectId)

        if (error) {
          console.error('Status update failed:', error)
          alert('Cập nhật trạng thái thất bại: ' + error.message)
          return
        }

        // Log activity (non-blocking)
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) return
          supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle()
            .then(({ data: emp }) => {
              supabase.from('project_activities').insert({
                project_id: realProjectId,
                action: 'status_changed',
                entity_type: 'project',
                entity_id: realProjectId,
                actor_id: emp?.id,
                old_value: { status: project.status },
                new_value: { status: newStatus },
                description: `Chuyển trạng thái: ${project.status} → ${newStatus}`,
              })
            })
        })
      }
      setProject(prev => ({ ...prev, status: newStatus }))
    } catch (e: any) {
      console.error('Status update failed:', e)
      alert('Lỗi cập nhật trạng thái: ' + (e.message || 'Lỗi không xác định'))
    }
  }

  // ✅ FIX: Check .error, auto actual dates, recalculate project progress
  const handlePhaseStatusUpdate = async (phaseId: string, status: PhaseStatus) => {
    try {
      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      }

      if (status === 'completed') {
        updateData.progress_pct = 100
        updateData.actual_end = new Date().toISOString().split('T')[0]
      }

      if (status === 'in_progress') {
        const phase = phases.find(p => p.id === phaseId)
        if (phase && !(phase as any).actual_start) {
          updateData.actual_start = new Date().toISOString().split('T')[0]
        }
      }

      const { error } = await supabase.from('project_phases')
        .update(updateData)
        .eq('id', phaseId)

      if (error) {
        console.error('Phase status update failed:', error)
        alert('Cập nhật trạng thái giai đoạn thất bại: ' + error.message)
        return
      }

      // Recalculate project progress = AVG(phases) excluding skipped
      if (realProjectId) {
        const { data: allPhases } = await supabase
          .from('project_phases')
          .select('progress_pct, status')
          .eq('project_id', realProjectId)
          .neq('status', 'skipped')

        if (allPhases && allPhases.length > 0) {
          const total = allPhases.reduce((sum: number, p: any) => sum + (Number(p.progress_pct) || 0), 0)
          const avg = Math.round((total / allPhases.length) * 100) / 100

          await supabase.from('projects')
            .update({ progress_pct: avg, updated_at: new Date().toISOString() })
            .eq('id', realProjectId)

          setProject(prev => ({ ...prev, progress_pct: avg }))
        }
      }

      await loadPhases()
    } catch (e: any) {
      console.error('Phase status update failed:', e)
      alert('Lỗi: ' + (e.message || 'Lỗi không xác định'))
    }
  }

  // ✅ FIX: Xử lý FK milestones trước khi xóa, reindex, recalc progress
  const handlePhaseDelete = async (phaseId: string) => {
    if (!confirm('Xóa giai đoạn này? Milestones thuộc giai đoạn sẽ được chuyển về cấp dự án.')) return
    try {
      // 1. Kiểm tra milestones liên kết → set phase_id = null
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

      // 2. Xóa phase
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
# MAIN
# ============================================================================

def main():
    # Xác định file path
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
    else:
        filepath = DEFAULT_PATH

    # Kiểm tra file tồn tại
    if not os.path.exists(filepath):
        print(f"❌ Không tìm thấy file: {filepath}")
        print(f"   Hãy chạy từ thư mục gốc project, hoặc chỉ định đường dẫn:")
        print(f"   python fix_project_detail.py đường/dẫn/tới/ProjectDetailPage.tsx")
        sys.exit(1)

    # Đọc file
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Kiểm tra đoạn code cũ có tồn tại
    if OLD_CODE not in content:
        print(f"❌ Không tìm thấy đoạn code cần thay thế trong file.")
        print(f"   Có thể file đã được patch trước đó hoặc code đã thay đổi.")
        
        # Kiểm tra từng hàm riêng lẻ
        checks = [
            ("handleStatusChange", "const handleStatusChange = async (newStatus: ProjectStatus)"),
            ("handlePhaseStatusUpdate", "const handlePhaseStatusUpdate = async (phaseId: string, status: PhaseStatus)"),
            ("handlePhaseDelete", "const handlePhaseDelete = async (phaseId: string)"),
        ]
        for name, sig in checks:
            if sig in content:
                # Kiểm tra đã fix chưa
                if f"// ✅ FIX:" in content and name in content:
                    print(f"   ✅ {name} — đã được fix")
                else:
                    print(f"   ⚠️  {name} — tìm thấy nhưng code khác với expected")
            else:
                print(f"   ❌ {name} — không tìm thấy")
        sys.exit(1)

    # Backup file gốc
    backup_path = filepath + '.backup'
    shutil.copy2(filepath, backup_path)
    print(f"📦 Backup: {backup_path}")

    # Thay thế
    new_content = content.replace(OLD_CODE, NEW_CODE, 1)

    # Kiểm tra thay thế thành công
    if new_content == content:
        print("❌ Thay thế thất bại — không có thay đổi nào")
        sys.exit(1)

    # Ghi file
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

    # Thống kê
    old_lines = OLD_CODE.count('\n') + 1
    new_lines = NEW_CODE.count('\n') + 1

    print(f"")
    print(f"✅ PATCH THÀNH CÔNG!")
    print(f"")
    print(f"   File: {filepath}")
    print(f"   Thay thế: {old_lines} dòng → {new_lines} dòng")
    print(f"")
    print(f"   🔧 Fix #1: handleStatusChange")
    print(f"      + Check .error từ Supabase response")
    print(f"      + Validate status transitions")
    print(f"      + Auto-set actual_start/actual_end")
    print(f"      + Log activity vào project_activities")
    print(f"")
    print(f"   🔧 Fix #2: handlePhaseStatusUpdate")
    print(f"      + Check .error từ response")
    print(f"      + Auto-set actual_start/actual_end cho phase")
    print(f"      + Recalculate project progress = AVG(phases)")
    print(f"")
    print(f"   🔧 Fix #3: handlePhaseDelete")
    print(f"      + Set milestones.phase_id = null trước khi xóa (fix FK 400/409)")
    print(f"      + Reindex order_index cho phases còn lại")
    print(f"      + Recalculate project progress")
    print(f"")
    print(f"   Rollback: cp {backup_path} {filepath}")


if __name__ == '__main__':
    main()
