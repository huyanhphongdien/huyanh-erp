# Release Skill

## Trigger
User says: "release", "phát hành", "push hết lên", "/release"

## Process

### 1. Audit uncommitted changes
```bash
git status --short -- src/ docs/
git diff --stat
```
If no changes → inform user "nothing to release".

### 2. Build
```bash
npx vite build
```
Must succeed. If fails → fix first, do not proceed.

### 3. TypeScript check (optional but recommended)
```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | tail -20
```
Report any errors in `src/` files. Pre-existing errors in unrelated files can be ignored.

### 4. Commit
- Stage only src/ and docs/ files (avoid dist/, .env, node_modules)
- Write a release summary commit message:
  ```
  Release: [brief description of all changes]

  - Feature 1
  - Fix 1
  - ...

  Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
  ```

### 5. Push
```bash
git push origin main
```

### 6. Verify Vercel deployment
Wait 15s, then check:
```bash
curl -s "https://api.github.com/repos/huyanhphongdien/huyanh-erp/commits/HEAD/check-runs" | \
  python -c "import sys,json;[print(f'{r[\"name\"]}: {r[\"conclusion\"]}') for r in json.load(sys.stdin).get('check_runs',[])]"
```
Expected: `build: success`, `Vercel – huyanh-erp: success`

### 7. Report
```
## Release Summary

**Commit:** [hash]
**Deploy:** huyanhrubber.vn ✅
**Changes:**
- [list of changes included]

**Verify:** Ctrl+Shift+R on https://huyanhrubber.vn
```

## Multi-project release
If changes span both ERP and B2B Portal:
1. Push ERP first: `cd d:/Projects/huyanh-erp-8 && git push origin main`
2. Push Portal: `cd d:/Projects/huyanh-b2b-portal && git push origin main`
3. Verify both Vercel deployments
