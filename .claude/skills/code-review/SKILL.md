# Code Review Skill

## Trigger
User says: "review code", "kiểm tra code", "xem lại", "/code-review"

## Process

### 1. Identify scope
```bash
git diff --stat HEAD~1   # Last commit
git diff --stat          # Uncommitted changes
```

### 2. Review checklist
For each changed file, check:

**Correctness**
- [ ] Logic matches the stated intent (commit message / user request)
- [ ] Edge cases handled (null, empty array, missing FK, timezone)
- [ ] Supabase queries use correct FK join syntax (`!fk_name`)
- [ ] Date/time operations use `Asia/Ho_Chi_Minh` timezone

**Security**
- [ ] No secrets in code (API keys, passwords)
- [ ] Supabase RLS not bypassed without reason
- [ ] User input validated before DB writes
- [ ] No SQL injection via raw queries

**Performance**
- [ ] No N+1 queries in loops (batch fetch instead)
- [ ] TanStack Query keys are specific enough (avoid over-fetching)
- [ ] Heavy components wrapped in `memo()` or `useMemo()`
- [ ] Lazy imports for route-level pages

**UX / Vietnamese context**
- [ ] Labels in Vietnamese where user-facing
- [ ] Number formatting: `toLocaleString('vi-VN')`
- [ ] Date formatting: `dd/MM/yyyy` or relative ("3 ngày trước")
- [ ] Shift symbols match: HC/S/C2/Đ/CT/P/X/2ca

**Conventions**
- [ ] Service layer: queries in `*Service.ts`, not in components
- [ ] State: TanStack Query for server state, `useState` for local UI
- [ ] No unused imports or variables
- [ ] Commit message is English, imperative, descriptive

### 3. Report format
```
## Code Review: [scope]

### ✅ Looks good
- [list of things that are correct]

### ⚠️ Suggestions
- [non-blocking improvements]

### ❌ Must fix
- [blocking issues that should be addressed before merge]
```
