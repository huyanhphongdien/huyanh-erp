#!/usr/bin/env python3
"""
FIX v2: handlePhaseDelete — thêm unlink tasks.phase_id
Lỗi: "tasks_phase_id_fkey" violates foreign key constraint on table "tasks"

Usage:
  python fix_phase_delete_v2.py
  python fix_phase_delete_v2.py src/pages/projects/ProjectDetailPage.tsx
"""

import sys, os, shutil

DEFAULT_PATH = "src/pages/projects/ProjectDetailPage.tsx"

# ============================================================================
# OLD CODE — đoạn handlePhaseDelete hiện tại (sau patch v1)
# ============================================================================

OLD_CODE = '''  // ✅ FIX: Xử lý FK milestones trước khi xóa, reindex, recalc progress
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
        .eq('id', phaseId)'''

# ============================================================================
# NEW CODE — thêm unlink tasks trước khi xóa
# ============================================================================

NEW_CODE = '''  // ✅ FIX v2: Xử lý FK milestones + tasks trước khi xóa, reindex, recalc progress
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
        .eq('id', phaseId)'''

# ============================================================================
# MAIN
# ============================================================================

def main():
    filepath = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH

    if not os.path.exists(filepath):
        print(f"❌ Không tìm thấy: {filepath}")
        print(f"   python fix_phase_delete_v2.py đường/dẫn/ProjectDetailPage.tsx")
        sys.exit(1)

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if OLD_CODE not in content:
        # Thử tìm version gốc (chưa patch v1)
        original = '''  const handlePhaseDelete = async (phaseId: string) => {
    if (!confirm('Xóa giai đoạn này?')) return
    try {
      await supabase.from('project_phases').delete().eq('id', phaseId)
      await loadPhases()
    } catch (e) {
      console.error('Phase delete failed:', e)
    }
  }'''
        
        if original in content:
            print("⚠️  File chưa patch v1. Đang patch từ bản gốc...")
            # Thay toàn bộ hàm gốc bằng version đầy đủ
            full_new = NEW_CODE + '''

      if (error) {
        console.error('Phase delete failed:', error)
        alert('Xóa giai đoạn thất bại: ' + error.message)
        return
      }

      // 4. Recalculate project progress + reindex
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
            content = content.replace(original, full_new, 1)
        else:
            print("❌ Không tìm thấy đoạn code handlePhaseDelete cần patch.")
            print("   Kiểm tra file có đúng không.")
            sys.exit(1)
    else:
        content = content.replace(OLD_CODE, NEW_CODE, 1)

    # Backup
    backup = filepath + '.bak2'
    shutil.copy2(filepath, backup)
    print(f"📦 Backup: {backup}")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print()
    print("✅ PATCH V2 THÀNH CÔNG!")
    print()
    print("   Thêm bước unlink tasks trước khi xóa phase:")
    print("   tasks.phase_id = null WHERE phase_id = <phaseId>")
    print()
    print("   Thứ tự xóa phase giờ là:")
    print("   1. Unlink milestones (set phase_id = null)")
    print("   2. Unlink tasks      (set phase_id = null)  ← MỚI")
    print("   3. Xóa phase")
    print("   4. Reindex order_index")
    print("   5. Recalculate project progress")
    print()
    print(f"   Rollback: cp {backup} {filepath}")

if __name__ == '__main__':
    main()
