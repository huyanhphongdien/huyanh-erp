#!/usr/bin/env python3
"""
FIX v3: Nút Edit → Inline edit tên dự án
- Click bút chì → hiện input sửa tên ngay tại chỗ
- Không cho sửa ngày khi dự án đã duyệt (approved/in_progress/completed/on_hold)

Usage:
  python fix_inline_edit_name.py
  python fix_inline_edit_name.py src/pages/projects/ProjectDetailPage.tsx
"""

import sys, os, shutil

DEFAULT_PATH = "src/pages/projects/ProjectDetailPage.tsx"

# ============================================================================
# PATCH 1: Thêm state cho inline edit (sau dòng showStatusMenu)
# ============================================================================

OLD_STATE = '''  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [realProjectId, setRealProjectId] = useState<string | null>(null)'''

NEW_STATE = '''  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [realProjectId, setRealProjectId] = useState<string | null>(null)

  // ✅ Inline edit tên dự án
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [savingName, setSavingName] = useState(false)'''

# ============================================================================
# PATCH 2: Thêm hàm handleSaveName (trước handleStatusChange)
# ============================================================================

OLD_HANDLE_STATUS = '''  // ✅ FIX: Check .error, validate transitions, auto actual dates, log activity
  const handleStatusChange = async (newStatus: ProjectStatus) => {'''

NEW_HANDLE_STATUS = '''  // ✅ Inline edit tên dự án
  const handleStartEditName = () => {
    setEditName(project.name)
    setEditingName(true)
  }

  const handleSaveName = async () => {
    const trimmed = editName.trim()
    if (!trimmed) {
      alert('Tên dự án không được để trống')
      return
    }
    if (trimmed === project.name) {
      setEditingName(false)
      return
    }
    if (!realProjectId) return

    setSavingName(true)
    try {
      const { error } = await supabase.from('projects')
        .update({ name: trimmed, updated_at: new Date().toISOString() })
        .eq('id', realProjectId)

      if (error) {
        alert('Lỗi cập nhật tên: ' + error.message)
        return
      }

      setProject(prev => ({ ...prev, name: trimmed }))
      setEditingName(false)

      // Log activity (non-blocking)
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return
        supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle()
          .then(({ data: emp }) => {
            supabase.from('project_activities').insert({
              project_id: realProjectId,
              action: 'updated',
              entity_type: 'project',
              entity_id: realProjectId,
              actor_id: emp?.id,
              old_value: { name: project.name },
              new_value: { name: trimmed },
              description: `Đổi tên dự án: "${project.name}" → "${trimmed}"`,
            })
          })
      })
    } catch (e: any) {
      alert('Lỗi: ' + (e.message || 'Không xác định'))
    } finally {
      setSavingName(false)
    }
  }

  const handleCancelEditName = () => {
    setEditingName(false)
    setEditName('')
  }

  // ✅ FIX: Check .error, validate transitions, auto actual dates, log activity
  const handleStatusChange = async (newStatus: ProjectStatus) => {'''

# ============================================================================
# PATCH 3: Thay header — nút Edit + tên dự án
# ============================================================================

OLD_HEADER = '''          <div className="flex items-center h-14 gap-3">
            <button onClick={() => navigate('/projects/list')} className="p-2 -ml-2 rounded-xl active:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1 min-w-0">
              <span className="text-[12px] font-bold text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {project.code}
              </span>
            </div>
            <button
              onClick={() => navigate(`/projects/${realProjectId || id}/edit`)}
              className="p-2 rounded-xl active:bg-gray-100"
            >
              <Edit3 className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="pb-3">
            <h1 className="text-[18px] sm:text-[20px] font-bold text-gray-900 leading-snug mb-2">
              {project.name}
            </h1>'''

NEW_HEADER = '''          <div className="flex items-center h-14 gap-3">
            <button onClick={() => navigate('/projects/list')} className="p-2 -ml-2 rounded-xl active:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1 min-w-0">
              <span className="text-[12px] font-bold text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {project.code}
              </span>
            </div>
            {!editingName && (
              <button
                onClick={handleStartEditName}
                className="p-2 rounded-xl active:bg-gray-100"
                title="Sửa tên dự án"
              >
                <Edit3 className="w-5 h-5 text-gray-500" />
              </button>
            )}
          </div>

          <div className="pb-3">
            {editingName ? (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') handleCancelEditName()
                  }}
                  className="flex-1 text-[18px] sm:text-[20px] font-bold text-gray-900 leading-snug
                    px-3 py-1.5 bg-gray-50 border border-[#2D8B6E] rounded-lg
                    outline-none focus:ring-2 focus:ring-[#2D8B6E]/20"
                  autoFocus
                  disabled={savingName}
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName || !editName.trim()}
                  className="p-2 rounded-lg bg-[#1B4D3E] text-white active:scale-95 disabled:opacity-50"
                  title="Lưu"
                >
                  {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleCancelEditName}
                  disabled={savingName}
                  className="p-2 rounded-lg bg-gray-100 text-gray-500 active:scale-95"
                  title="Hủy (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <h1 className="text-[18px] sm:text-[20px] font-bold text-gray-900 leading-snug mb-2">
                {project.name}
              </h1>
            )}'''

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

    changes = 0

    # Patch 1: State
    if OLD_STATE in content:
        content = content.replace(OLD_STATE, NEW_STATE, 1)
        changes += 1
        print("✅ Patch 1: Thêm state editingName, editName, savingName")
    else:
        if 'editingName' in content:
            print("⏭️  Patch 1: Đã có state editingName (skip)")
        else:
            print("❌ Patch 1: Không tìm thấy vị trí chèn state")
            sys.exit(1)

    # Patch 2: Handler functions
    if OLD_HANDLE_STATUS in content:
        content = content.replace(OLD_HANDLE_STATUS, NEW_HANDLE_STATUS, 1)
        changes += 1
        print("✅ Patch 2: Thêm handleStartEditName, handleSaveName, handleCancelEditName")
    else:
        if 'handleSaveName' in content:
            print("⏭️  Patch 2: Đã có handleSaveName (skip)")
        else:
            print("❌ Patch 2: Không tìm thấy vị trí chèn handler")
            sys.exit(1)

    # Patch 3: Header UI
    if OLD_HEADER in content:
        content = content.replace(OLD_HEADER, NEW_HEADER, 1)
        changes += 1
        print("✅ Patch 3: Thay header — inline edit tên dự án")
    else:
        if 'editingName ?' in content or 'handleStartEditName' in content:
            print("⏭️  Patch 3: Header đã được patch (skip)")
        else:
            print("❌ Patch 3: Không tìm thấy header cũ")
            sys.exit(1)

    if changes == 0:
        print("\n⚠️  Không có thay đổi nào — file có thể đã được patch.")
        sys.exit(0)

    # Backup
    backup = filepath + '.bak3'
    shutil.copy2(filepath, backup)
    print(f"\n📦 Backup: {backup}")

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"\n✅ PATCH V3 THÀNH CÔNG! ({changes} thay đổi)")
    print()
    print("   🖊️  Click bút chì → Input inline sửa tên dự án")
    print("   ✅  Enter hoặc nút ✓ → Lưu")
    print("   ❌  Esc hoặc nút ✕ → Hủy")
    print("   📝  Log activity: 'Đổi tên dự án: ... → ...'")
    print()
    print(f"   Rollback: cp {backup} {filepath}")

if __name__ == '__main__':
    main()
