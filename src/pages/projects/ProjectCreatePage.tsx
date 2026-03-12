// ============================================================================
// FILE: src/pages/projects/ProjectCreatePage.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM3 — Bước 3.5 (Updated: Real data from Supabase)
// ============================================================================
// Design: Industrial Rubber Theme — Step Wizard 4 bước
// Mobile-first, touch ≥ 48px, brand #1B4D3E
// ✅ UPDATED: All mock data replaced with real Supabase queries
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Save,
  Send,
  FileText,
  Calendar,
  Users,
  ClipboardCheck,
  Loader2,
  X,
  Plus,
  Building2,
  Crown,
  UserPlus,
  Tag,
  AlertCircle,
  DollarSign,
  FolderKanban,
  Briefcase,
  ChevronDown,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

// ============================================================================
// TYPES
// ============================================================================

type ProjectPriority = 'critical' | 'high' | 'medium' | 'low'

interface CategoryOption {
  id: string
  name: string
  color: string
  icon?: string
}

interface DepartmentOption {
  id: string
  name: string
}

interface EmployeeOption {
  id: string
  full_name: string
  department?: { name: string }
}

interface FormData {
  // Step 1
  name: string
  description: string
  category_id: string
  priority: ProjectPriority
  department_id: string
  tags: string[]
  // Step 2
  planned_start: string
  planned_end: string
  budget_planned: string
  budget_source: string
  // Step 3
  owner_id: string
  sponsor_id: string
  initial_members: string[] // employee_ids
}

interface FormErrors {
  [key: string]: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STEPS = [
  { id: 1, title: 'Thông tin',     subtitle: 'Cơ bản',          icon: FileText },
  { id: 2, title: 'Thời gian',     subtitle: 'Ngân sách',       icon: Calendar },
  { id: 3, title: 'Nhân sự',       subtitle: 'Phân công',       icon: Users },
  { id: 4, title: 'Xác nhận',      subtitle: 'Hoàn tất',        icon: ClipboardCheck },
]

const PRIORITY_OPTIONS: { value: ProjectPriority; label: string; color: string; dotColor: string }[] = [
  { value: 'low',      label: 'Thấp',       color: 'border-gray-200 bg-gray-50 text-gray-700',     dotColor: 'bg-gray-400' },
  { value: 'medium',   label: 'Trung bình',  color: 'border-blue-200 bg-blue-50 text-blue-700',     dotColor: 'bg-blue-500' },
  { value: 'high',     label: 'Cao',         color: 'border-orange-200 bg-orange-50 text-orange-700', dotColor: 'bg-orange-500' },
  { value: 'critical', label: 'Khẩn cấp',    color: 'border-red-200 bg-red-50 text-red-700',        dotColor: 'bg-red-500' },
]

const INITIAL_FORM: FormData = {
  name: '',
  description: '',
  category_id: '',
  priority: 'medium',
  department_id: '',
  tags: [],
  planned_start: '',
  planned_end: '',
  budget_planned: '',
  budget_source: '',
  owner_id: '',
  sponsor_id: '',
  initial_members: [],
}

// ============================================================================
// HELPERS
// ============================================================================

function formatBudget(value: string): string {
  const num = parseInt(value.replace(/\D/g, ''), 10)
  if (isNaN(num)) return ''
  return num.toLocaleString('vi-VN')
}

function parseBudget(formatted: string): number {
  return parseInt(formatted.replace(/\D/g, ''), 10) || 0
}

// ============================================================================
// STEP INDICATOR
// ============================================================================

const StepIndicator: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <div className="flex items-center justify-center gap-1 py-4 px-4">
    {STEPS.map((step, idx) => {
      const isCompleted = idx + 1 < current
      const isCurrent = idx + 1 === current
      const Icon = step.icon

      return (
        <React.Fragment key={step.id}>
          {idx > 0 && (
            <div className={`flex-1 h-0.5 max-w-[40px] rounded-full ${
              isCompleted ? 'bg-[#1B4D3E]' : 'bg-gray-200'
            }`} />
          )}
          <div className="flex flex-col items-center gap-1">
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center
              transition-all duration-300
              ${isCompleted
                ? 'bg-[#1B4D3E] text-white'
                : isCurrent
                  ? 'bg-[#1B4D3E] text-white ring-4 ring-[#1B4D3E]/20'
                  : 'bg-gray-100 text-gray-400'
              }
            `}>
              {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-4.5 h-4.5" />}
            </div>
            <div className="text-center">
              <p className={`text-[11px] font-semibold leading-tight ${
                isCurrent ? 'text-[#1B4D3E]' : isCompleted ? 'text-gray-700' : 'text-gray-400'
              }`}>
                {step.title}
              </p>
              <p className="text-[9px] text-gray-400 hidden sm:block">{step.subtitle}</p>
            </div>
          </div>
        </React.Fragment>
      )
    })}
  </div>
)

// ============================================================================
// FORM FIELD WRAPPER
// ============================================================================

const FormField: React.FC<{
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}> = ({ label, required, error, children }) => (
  <div className="space-y-1.5">
    <label className="block text-[13px] font-semibold text-gray-700">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && (
      <p className="text-[12px] text-red-500 flex items-center gap-1">
        <AlertCircle className="w-3 h-3" /> {error}
      </p>
    )}
  </div>
)

// ============================================================================
// TAG INPUT
// ============================================================================

const TagInput: React.FC<{
  tags: string[]
  onChange: (tags: string[]) => void
}> = ({ tags, onChange }) => {
  const [input, setInput] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      const newTag = input.trim()
      if (!tags.includes(newTag)) {
        onChange([...tags, newTag])
      }
      setInput('')
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="
      flex flex-wrap gap-1.5 p-2.5
      bg-white border border-gray-200 rounded-xl
      focus-within:border-[#2D8B6E] focus-within:ring-1 focus-within:ring-[#2D8B6E]/20
      min-h-[44px]
    ">
      {tags.map((tag, i) => (
        <span
          key={i}
          className="
            inline-flex items-center gap-1
            px-2.5 py-1 rounded-lg
            bg-[#1B4D3E]/10 text-[#1B4D3E] text-[12px] font-medium
          "
        >
          <Tag className="w-3 h-3" />
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((_, j) => j !== i))}
            className="ml-0.5 p-0.5 rounded-full hover:bg-[#1B4D3E]/10"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? 'Nhập tag, Enter để thêm...' : 'Thêm tag...'}
        className="
          flex-1 min-w-[100px] py-1
          text-[14px] outline-none bg-transparent
          placeholder:text-gray-400
        "
      />
    </div>
  )
}

// ============================================================================
// EMPLOYEE SELECT (searchable) — uses real data via props
// ============================================================================

const EmployeeSelect: React.FC<{
  value: string
  onChange: (id: string) => void
  placeholder?: string
  exclude?: string[]
  employees: EmployeeOption[]
}> = ({ value, onChange, placeholder = 'Chọn nhân viên...', exclude = [], employees }) => {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    let list = employees.filter(e => !exclude.includes(e.id))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.full_name.toLowerCase().includes(q) ||
        e.department?.name?.toLowerCase().includes(q)
      )
    }
    return list
  }, [search, exclude, employees])

  const selected = employees.find(e => e.id === value)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="
          w-full flex items-center justify-between gap-2
          px-3.5 py-3 bg-white border border-gray-200 rounded-xl
          text-[15px] text-left
          focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
          transition-colors
        "
      >
        {selected ? (
          <span className="text-gray-900">{selected.full_name}
            <span className="text-[12px] text-gray-500 ml-1.5">({selected.department?.name})</span>
          </span>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="
          absolute z-50 mt-1 w-full
          bg-white border border-gray-200 rounded-xl
          shadow-lg max-h-[240px] overflow-hidden
        ">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm nhân viên..."
              className="w-full px-3 py-2 text-[14px] bg-gray-50 rounded-lg outline-none"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-[180px]">
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); setSearch('') }}
                className="w-full px-3 py-2.5 text-left text-[13px] text-gray-400 hover:bg-gray-50"
              >
                — Bỏ chọn —
              </button>
            )}
            {filtered.map(emp => (
              <button
                key={emp.id}
                type="button"
                onClick={() => { onChange(emp.id); setOpen(false); setSearch('') }}
                className={`
                  w-full flex items-center justify-between
                  px-3 py-2.5 text-left
                  text-[14px] transition-colors
                  ${emp.id === value ? 'bg-[#1B4D3E]/5 text-[#1B4D3E] font-medium' : 'hover:bg-gray-50 text-gray-800'}
                `}
              >
                <span>{emp.full_name}</span>
                <span className="text-[11px] text-gray-500">{emp.department?.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-[13px] text-gray-400">Không tìm thấy</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MULTI-EMPLOYEE SELECT (for initial members) — uses real data via props
// ============================================================================

const MultiEmployeeSelect: React.FC<{
  value: string[]
  onChange: (ids: string[]) => void
  exclude?: string[]
  employees: EmployeeOption[]
}> = ({ value, onChange, exclude = [], employees }) => {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const combinedExclude = [...exclude, ...value]
  const filtered = useMemo(() => {
    let list = employees.filter(e => !combinedExclude.includes(e.id))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e => e.full_name.toLowerCase().includes(q))
    }
    return list
  }, [search, combinedExclude, employees])

  const selectedEmps = employees.filter(e => value.includes(e.id))

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {selectedEmps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedEmps.map(emp => (
            <span
              key={emp.id}
              className="
                inline-flex items-center gap-1.5
                px-2.5 py-1.5 rounded-lg
                bg-[#1B4D3E]/10 text-[#1B4D3E] text-[12px] font-medium
              "
            >
              <Users className="w-3 h-3" />
              {emp.full_name}
              <button
                type="button"
                onClick={() => onChange(value.filter(id => id !== emp.id))}
                className="p-0.5 rounded-full hover:bg-[#1B4D3E]/20"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="
            inline-flex items-center gap-2
            px-3.5 py-2.5 rounded-xl
            border border-dashed border-gray-300 text-gray-500
            text-[13px] font-medium
            hover:border-[#2D8B6E] hover:text-[#2D8B6E]
            transition-colors
          "
        >
          <UserPlus className="w-4 h-4" />
          Thêm thành viên
        </button>

        {open && (
          <div className="
            absolute z-50 mt-1 w-[280px]
            bg-white border border-gray-200 rounded-xl
            shadow-lg max-h-[240px] overflow-hidden
          ">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm nhân viên..."
                className="w-full px-3 py-2 text-[14px] bg-gray-50 rounded-lg outline-none"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-[180px]">
              {filtered.map(emp => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => {
                    onChange([...value, emp.id])
                    setSearch('')
                  }}
                  className="
                    w-full flex items-center justify-between
                    px-3 py-2.5 text-left text-[14px]
                    hover:bg-gray-50 text-gray-800 transition-colors
                  "
                >
                  <span>{emp.full_name}</span>
                  <span className="text-[11px] text-gray-500">{emp.department?.name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-[13px] text-gray-400">Không tìm thấy</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ProjectCreatePage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [currentStep, setCurrentStep] = useState(1)
  const [form, setForm] = useState<FormData>({ ...INITIAL_FORM })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [previewCode, setPreviewCode] = useState('DA-2026-???')

  // ✅ Real data state — loaded from Supabase
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // ========================================================================
  // LOAD REAL DATA FROM SUPABASE
  // ========================================================================

  useEffect(() => {
    const loadOptions = async () => {
      setLoadingData(true)
      try {
        // Note: departments and employees do NOT have is_active column
        const [catRes, deptRes, empRes] = await Promise.all([
          // 1. Project Categories (may or may not have is_active)
          supabase
            .from('project_categories')
            .select('id, name, color')
            .order('name'),
          // 2. Departments
          supabase
            .from('departments')
            .select('id, name')
            .order('name'),
          // 3. Employees with department name (simple join without FK hint)
          supabase
            .from('employees')
            .select('id, full_name, department_id')
            .order('full_name'),
        ])

        if (catRes.data) {
          setCategories(catRes.data.map((c: any) => ({
            id: c.id,
            name: c.name,
            color: c.color || '#6B7280',
          })))
        }

        // Build department lookup map
        const deptMap = new Map<string, string>()
        if (deptRes.data) {
          const depts = deptRes.data.map((d: any) => ({ id: d.id, name: d.name }))
          depts.forEach((d: any) => deptMap.set(d.id, d.name))
          setDepartments(depts)
        }

        if (empRes.data) {
          setEmployees(empRes.data.map((e: any) => ({
            id: e.id,
            full_name: e.full_name,
            department: e.department_id && deptMap.has(e.department_id)
              ? { name: deptMap.get(e.department_id)! }
              : undefined,
          })))
        }
      } catch (err) {
        console.error('[ProjectCreate] Failed to load options:', err)
      } finally {
        setLoadingData(false)
      }
    }
    loadOptions()
  }, [])

  // Generate next project code
  useEffect(() => {
    const loadNextCode = async () => {
      try {
        const year = new Date().getFullYear()
        const prefix = `DA-${year}-`

        const { data, error } = await supabase
          .from('projects')
          .select('code')
          .ilike('code', `${prefix}%`)
          .order('code', { ascending: false })
          .limit(1)

        if (!error && data && data.length > 0) {
          const lastCode = data[0].code
          const lastNum = parseInt(lastCode.replace(prefix, ''), 10) || 0
          setPreviewCode(`${prefix}${String(lastNum + 1).padStart(3, '0')}`)
        } else {
          setPreviewCode(`${prefix}001`)
        }
      } catch {
        setPreviewCode(`DA-${new Date().getFullYear()}-???`)
      }
    }
    loadNextCode()
  }, [])

  // ---- Form update helper ----
  const updateForm = (field: keyof FormData, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // ---- Validation per step ----
  const validateStep = (step: number): boolean => {
    const newErrors: FormErrors = {}

    if (step === 1) {
      if (!form.name.trim()) newErrors.name = 'Tên dự án là bắt buộc'
      else if (form.name.trim().length < 5) newErrors.name = 'Tên dự án quá ngắn (tối thiểu 5 ký tự)'
    }

    if (step === 2) {
      if (form.planned_start && form.planned_end) {
        if (new Date(form.planned_end) <= new Date(form.planned_start)) {
          newErrors.planned_end = 'Ngày kết thúc phải sau ngày bắt đầu'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ---- Navigation ----
  const goNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length))
    }
  }

  const goPrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  // ---- Submit — REAL Supabase insert ----
  const handleSubmit = async (asDraft: boolean) => {
    if (!validateStep(currentStep)) return

    setSubmitting(true)
    try {
      // 1. Insert project
      const { data: newProject, error: insertError } = await supabase
        .from('projects')
        .insert({
          code: previewCode,
          name: form.name.trim(),
          description: form.description.trim() || null,
          category_id: form.category_id || null,
          priority: form.priority,
          department_id: form.department_id || null,
          tags: form.tags.length > 0 ? form.tags : null,
          planned_start: form.planned_start || null,
          planned_end: form.planned_end || null,
          budget_planned: parseBudget(form.budget_planned) || 0,
          budget_currency: 'VND',
          owner_id: form.owner_id || null,
          sponsor_id: form.sponsor_id || null,
          status: asDraft ? 'draft' : 'planning',
          progress_pct: 0,
          created_by: user?.employee_id || null,
        })
        .select('id, code')
        .single()

      if (insertError) throw insertError

      // 2. Add owner as project_member (role: 'owner')
      if (form.owner_id && newProject) {
        await supabase.from('project_members').insert({
          project_id: newProject.id,
          employee_id: form.owner_id,
          role: 'owner',
          allocation_pct: 100,
          is_active: true,
        })
      }

      // 3. Add sponsor as project_member (role: 'observer')
      if (form.sponsor_id && newProject) {
        await supabase.from('project_members').insert({
          project_id: newProject.id,
          employee_id: form.sponsor_id,
          role: 'observer',
          allocation_pct: 0,
          is_active: true,
        })
      }

      // 4. Add initial members
      if (form.initial_members.length > 0 && newProject) {
        const memberRows = form.initial_members.map(empId => ({
          project_id: newProject.id,
          employee_id: empId,
          role: 'member',
          allocation_pct: 100,
          is_active: true,
        }))
        await supabase.from('project_members').insert(memberRows)
      }

      // 5. Log activity
      if (newProject) {
        await supabase.from('project_activities').insert({
          project_id: newProject.id,
          action: 'project_created',
          entity_type: 'project',
          entity_id: newProject.id,
          description: `Dự án "${form.name.trim()}" được tạo${asDraft ? ' (nháp)' : ''}`,
          actor_id: user?.employee_id || null,
        })
      }

      // 6. Navigate to project detail
      navigate(`/projects/${newProject?.id || 'list'}`)

    } catch (err: any) {
      console.error('Create project failed:', err)
      setErrors({ submit: err.message || 'Có lỗi xảy ra khi tạo dự án' })
    } finally {
      setSubmitting(false)
    }
  }

  // ---- Lookup helpers — from real data ----
  const selectedCategory = categories.find(c => c.id === form.category_id)
  const selectedDept = departments.find(d => d.id === form.department_id)
  const selectedOwner = employees.find(e => e.id === form.owner_id)
  const selectedSponsor = employees.find(e => e.id === form.sponsor_id)
  const selectedMembers = employees.filter(e => form.initial_members.includes(e.id))
  const priorityConf = PRIORITY_OPTIONS.find(p => p.value === form.priority)

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#F7F5F2]">

      {/* ===== HEADER ===== */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center h-14 gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-xl active:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1">
              <h1 className="text-[16px] font-bold text-gray-900">Tạo dự án mới</h1>
              <p className="text-[11px] text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {previewCode}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== STEP INDICATOR ===== */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto">
          <StepIndicator current={currentStep} total={STEPS.length} />
        </div>
      </div>

      {/* ===== FORM CONTENT ===== */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">

          {/* Loading data indicator */}
          {loadingData && currentStep === 1 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E]" />
              <span className="ml-2 text-[13px] text-gray-500">Đang tải dữ liệu...</span>
            </div>
          )}

          {/* ================================================ */}
          {/* STEP 1: Thông tin cơ bản */}
          {/* ================================================ */}
          {currentStep === 1 && !loadingData && (
            <div className="space-y-5">
              <div className="mb-1">
                <h2 className="text-[17px] font-bold text-gray-900">Thông tin cơ bản</h2>
                <p className="text-[13px] text-gray-500 mt-0.5">Nhập thông tin chung về dự án</p>
              </div>

              {/* Tên dự án */}
              <FormField label="Tên dự án" required error={errors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="VD: Triển khai ERP Huy Anh Rubber"
                  className={`
                    w-full px-3.5 py-3 text-[15px]
                    bg-white border rounded-xl outline-none
                    transition-colors
                    ${errors.name
                      ? 'border-red-300 focus:border-red-400 focus:ring-1 focus:ring-red-200'
                      : 'border-gray-200 focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20'
                    }
                  `}
                />
              </FormField>

              {/* Mô tả */}
              <FormField label="Mô tả">
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm('description', e.target.value)}
                  placeholder="Mô tả ngắn gọn về dự án, mục tiêu, phạm vi..."
                  rows={3}
                  className="
                    w-full px-3.5 py-3 text-[15px]
                    bg-white border border-gray-200 rounded-xl outline-none
                    focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
                    resize-none
                  "
                />
              </FormField>

              {/* Loại dự án — REAL DATA from Supabase */}
              <FormField label="Loại dự án">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => updateForm('category_id', cat.id === form.category_id ? '' : cat.id)}
                      className={`
                        flex items-center gap-2
                        px-3 py-2.5 rounded-xl border text-[13px] font-medium
                        transition-all
                        ${form.category_id === cat.id
                          ? 'border-[#1B4D3E] bg-[#1B4D3E]/5 text-[#1B4D3E] ring-1 ring-[#1B4D3E]/20'
                          : 'border-gray-200 bg-white text-gray-700 active:scale-[0.97]'
                        }
                      `}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.name}
                    </button>
                  ))}
                </div>
                {categories.length === 0 && (
                  <p className="text-[12px] text-gray-400 mt-1">Chưa có loại dự án nào. Vui lòng thêm trong phần Danh mục.</p>
                )}
              </FormField>

              {/* Ưu tiên */}
              <FormField label="Mức độ ưu tiên">
                <div className="flex gap-2 flex-wrap">
                  {PRIORITY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateForm('priority', opt.value)}
                      className={`
                        inline-flex items-center gap-2
                        px-4 py-2.5 rounded-xl border
                        text-[13px] font-semibold
                        transition-all
                        ${form.priority === opt.value
                          ? `${opt.color} ring-1 ring-current/20`
                          : 'border-gray-200 bg-white text-gray-500 active:scale-[0.97]'
                        }
                      `}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${opt.dotColor}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FormField>

              {/* Phòng ban chủ trì — REAL DATA from Supabase */}
              <FormField label="Phòng ban chủ trì">
                <select
                  value={form.department_id}
                  onChange={(e) => updateForm('department_id', e.target.value)}
                  className="
                    w-full px-3.5 py-3 text-[15px]
                    bg-white border border-gray-200 rounded-xl outline-none
                    focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
                  "
                >
                  <option value="">— Chọn phòng ban —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </FormField>

              {/* Tags */}
              <FormField label="Tags">
                <TagInput
                  tags={form.tags}
                  onChange={(tags) => updateForm('tags', tags)}
                />
              </FormField>
            </div>
          )}

          {/* ================================================ */}
          {/* STEP 2: Thời gian & Ngân sách */}
          {/* ================================================ */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div className="mb-1">
                <h2 className="text-[17px] font-bold text-gray-900">Thời gian & Ngân sách</h2>
                <p className="text-[13px] text-gray-500 mt-0.5">Kế hoạch thời gian và nguồn lực tài chính</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Ngày bắt đầu dự kiến">
                  <input
                    type="date"
                    value={form.planned_start}
                    onChange={(e) => updateForm('planned_start', e.target.value)}
                    className="
                      w-full px-3.5 py-3 text-[15px]
                      bg-white border border-gray-200 rounded-xl outline-none
                      focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
                    "
                  />
                </FormField>

                <FormField label="Ngày kết thúc dự kiến" error={errors.planned_end}>
                  <input
                    type="date"
                    value={form.planned_end}
                    onChange={(e) => updateForm('planned_end', e.target.value)}
                    min={form.planned_start || undefined}
                    className={`
                      w-full px-3.5 py-3 text-[15px]
                      bg-white border rounded-xl outline-none
                      ${errors.planned_end
                        ? 'border-red-300 focus:border-red-400 focus:ring-1 focus:ring-red-200'
                        : 'border-gray-200 focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20'
                      }
                    `}
                  />
                </FormField>
              </div>

              {form.planned_start && form.planned_end && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 rounded-xl">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span className="text-[13px] text-blue-700 font-medium">
                    {Math.ceil(
                      (new Date(form.planned_end).getTime() - new Date(form.planned_start).getTime()) / (1000 * 60 * 60 * 24)
                    )} ngày
                  </span>
                </div>
              )}

              <FormField label="Ngân sách dự kiến (VND)">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={form.budget_planned ? formatBudget(form.budget_planned) : ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '')
                      updateForm('budget_planned', raw)
                    }}
                    placeholder="0"
                    className="
                      w-full pl-10 pr-16 py-3 text-[15px]
                      bg-white border border-gray-200 rounded-xl outline-none
                      focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
                    "
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-gray-400">
                    VND
                  </span>
                </div>
                {parseBudget(form.budget_planned) > 0 && (
                  <p className="text-[12px] text-gray-500 mt-1">
                    ≈ {parseBudget(form.budget_planned) >= 1e9
                      ? `${(parseBudget(form.budget_planned) / 1e9).toFixed(1)} tỷ đồng`
                      : `${(parseBudget(form.budget_planned) / 1e6).toFixed(0)} triệu đồng`
                    }
                  </p>
                )}
              </FormField>

              <FormField label="Nguồn ngân sách">
                <input
                  type="text"
                  value={form.budget_source}
                  onChange={(e) => updateForm('budget_source', e.target.value)}
                  placeholder="VD: Vốn tự có, Vay ngân hàng, Quỹ đầu tư..."
                  className="
                    w-full px-3.5 py-3 text-[15px]
                    bg-white border border-gray-200 rounded-xl outline-none
                    focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
                  "
                />
              </FormField>
            </div>
          )}

          {/* ================================================ */}
          {/* STEP 3: Nhân sự chính — REAL DATA */}
          {/* ================================================ */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div className="mb-1">
                <h2 className="text-[17px] font-bold text-gray-900">Nhân sự chính</h2>
                <p className="text-[13px] text-gray-500 mt-0.5">Phân công người phụ trách và thành viên</p>
              </div>

              <FormField label="Chủ dự án (PM)">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1B4D3E]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Crown className="w-5 h-5 text-[#1B4D3E]" />
                  </div>
                  <div className="flex-1">
                    <EmployeeSelect
                      value={form.owner_id}
                      onChange={(id) => updateForm('owner_id', id)}
                      placeholder="Chọn chủ dự án (PM)..."
                      exclude={[form.sponsor_id].filter(Boolean)}
                      employees={employees}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Người chịu trách nhiệm chính, quản lý toàn bộ dự án
                    </p>
                  </div>
                </div>
              </FormField>

              <FormField label="Người bảo trợ (Sponsor)">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Briefcase className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <EmployeeSelect
                      value={form.sponsor_id}
                      onChange={(id) => updateForm('sponsor_id', id)}
                      placeholder="Chọn người bảo trợ..."
                      exclude={[form.owner_id].filter(Boolean)}
                      employees={employees}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Thường là BGĐ — người duyệt dự án và hỗ trợ nguồn lực
                    </p>
                  </div>
                </div>
              </FormField>

              <FormField label="Thành viên ban đầu (tùy chọn)">
                <MultiEmployeeSelect
                  value={form.initial_members}
                  onChange={(ids) => updateForm('initial_members', ids)}
                  exclude={[form.owner_id, form.sponsor_id].filter(Boolean)}
                  employees={employees}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Có thể thêm thành viên sau khi tạo dự án
                </p>
              </FormField>
            </div>
          )}

          {/* ================================================ */}
          {/* STEP 4: Review & Submit */}
          {/* ================================================ */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="mb-1">
                <h2 className="text-[17px] font-bold text-gray-900">Xác nhận thông tin</h2>
                <p className="text-[13px] text-gray-500 mt-0.5">Kiểm tra lại trước khi tạo dự án</p>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 bg-[#1B4D3E]/5 rounded-xl">
                <FolderKanban className="w-5 h-5 text-[#1B4D3E]" />
                <div>
                  <p className="text-[11px] text-gray-500 uppercase font-semibold">Mã dự án</p>
                  <p className="text-[16px] font-bold text-[#1B4D3E]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {previewCode}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Basic info */}
                <div className="border border-gray-100 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-gray-500 uppercase">Thông tin cơ bản</h3>
                    <button type="button" onClick={() => setCurrentStep(1)} className="text-[12px] text-[#1B4D3E] font-medium">Sửa</button>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[15px] font-semibold text-gray-900">{form.name || '(chưa nhập)'}</p>
                    {form.description && (
                      <p className="text-[13px] text-gray-600 line-clamp-2">{form.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedCategory && (
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-md"
                          style={{ backgroundColor: selectedCategory.color + '20', color: selectedCategory.color }}>
                          {selectedCategory.name}
                        </span>
                      )}
                      {priorityConf && (
                        <span className={`px-2 py-0.5 text-[11px] font-medium rounded-md border ${priorityConf.color}`}>
                          {priorityConf.label}
                        </span>
                      )}
                      {selectedDept && (
                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-gray-100 text-gray-600">
                          {selectedDept.name}
                        </span>
                      )}
                    </div>
                    {form.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {form.tags.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Timeline & Budget */}
                <div className="border border-gray-100 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-gray-500 uppercase">Thời gian & Ngân sách</h3>
                    <button type="button" onClick={() => setCurrentStep(2)} className="text-[12px] text-[#1B4D3E] font-medium">Sửa</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] text-gray-400">Bắt đầu</p>
                      <p className="text-[14px] font-medium text-gray-800">
                        {form.planned_start ? new Date(form.planned_start).toLocaleDateString('vi-VN') : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400">Kết thúc</p>
                      <p className="text-[14px] font-medium text-gray-800">
                        {form.planned_end ? new Date(form.planned_end).toLocaleDateString('vi-VN') : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400">Ngân sách</p>
                      <p className="text-[14px] font-semibold text-gray-800" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {parseBudget(form.budget_planned) > 0 ? formatBudget(form.budget_planned) + ' VND' : '—'}
                      </p>
                    </div>
                    {form.budget_source && (
                      <div>
                        <p className="text-[11px] text-gray-400">Nguồn NS</p>
                        <p className="text-[14px] font-medium text-gray-800">{form.budget_source}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Team */}
                <div className="border border-gray-100 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-gray-500 uppercase">Nhân sự</h3>
                    <button type="button" onClick={() => setCurrentStep(3)} className="text-[12px] text-[#1B4D3E] font-medium">Sửa</button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4 text-[#1B4D3E]" />
                      <span className="text-[12px] text-gray-500 w-16">PM:</span>
                      <span className="text-[14px] font-medium text-gray-800">{selectedOwner?.full_name || '(chưa chọn)'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-amber-600" />
                      <span className="text-[12px] text-gray-500 w-16">Sponsor:</span>
                      <span className="text-[14px] font-medium text-gray-800">{selectedSponsor?.full_name || '(chưa chọn)'}</span>
                    </div>
                    {selectedMembers.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Users className="w-4 h-4 text-gray-400 mt-0.5" />
                        <span className="text-[12px] text-gray-500 w-16 mt-0.5">Thành viên:</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedMembers.map(m => (
                            <span key={m.id} className="px-2 py-0.5 text-[12px] bg-gray-100 text-gray-700 rounded-md">
                              {m.full_name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {errors.submit && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 rounded-xl text-red-600">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-[13px]">{errors.submit}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== BOTTOM ACTION BAR ===== */}
      <div className="sticky bottom-0 z-30 bg-white border-t border-gray-100 safe-area-pb">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {currentStep > 1 ? (
            <button type="button" onClick={goPrev}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] font-medium text-gray-700 active:scale-[0.97] transition-transform">
              <ArrowLeft className="w-4 h-4" />
              Quay lại
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {currentStep < STEPS.length ? (
              <button type="button" onClick={goNext}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1B4D3E] text-white text-[14px] font-semibold active:scale-[0.97] transition-transform shadow-sm">
                Tiếp theo
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button type="button" onClick={() => handleSubmit(true)} disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[14px] font-medium text-gray-700 active:scale-[0.97] transition-transform disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  Lưu nháp
                </button>
                <button type="button" onClick={() => handleSubmit(false)} disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1B4D3E] text-white text-[14px] font-semibold active:scale-[0.97] transition-transform shadow-sm disabled:opacity-50">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Tạo dự án
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectCreatePage