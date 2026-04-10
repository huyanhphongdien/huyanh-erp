# Refactor Skill

## Trigger
User says: "refactor", "tối ưu", "clean up", "dọn code", "/refactor"

## Principles
1. **Preserve behavior** — refactor must not change what the code does
2. **One thing at a time** — don't mix refactoring with feature changes
3. **Verify with build** — `npx vite build` must pass after every refactor
4. **Small commits** — each refactor step is one commit

## Common Refactors

### Extract service method
When: component has inline Supabase queries
```
// Before: query inside component
const { data } = await supabase.from('employees').select('*').eq('status', 'active')

// After: move to service
// src/services/employeeService.ts
export const employeeService = {
  getActive: async () => {
    const { data } = await supabase.from('employees').select('*').eq('status', 'active')
    return data || []
  }
}
```

### Deduplicate symbol/shift mapping
When: HC/S/C2/Đ/CT/P/X/2ca logic duplicated across files
→ Extract to `src/constants/shiftSymbols.ts`

### Replace inline styles with Tailwind
When: legacy pages use `style={{ ... }}`
→ Convert to Tailwind utility classes where possible

### Split large page component
When: page file > 500 lines
→ Extract sub-components to same directory:
```
features/attendance/
  MonthlyTimesheetPage.tsx      # Main page
  TimesheetDetailPanel.tsx      # Extracted slide-in panel
  TimesheetDayCell.tsx          # Extracted day cell renderer
```

## Safety
- Always run `npx vite build` after refactoring
- Check TypeScript errors: `npx tsc --noEmit`
- If refactor touches service layer, verify TanStack Query keys still match
- Do NOT refactor and add features in the same commit
