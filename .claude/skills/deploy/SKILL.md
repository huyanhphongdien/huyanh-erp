# Deploy Skill

## Trigger
User says: "deploy", "đẩy lên", "push lên production", "deploy ERP"

## Pre-flight Checks
1. **Identify target** — ask user which site:
   - `huyanhrubber.vn` → ERP (Vercel, auto-deploy from GitHub `main`)
   - `b2b.huyanhrubber.vn` → B2B Portal (Vercel, separate repo `huyanh-b2b-portal`)
   - `huyanhrubber.com.vn` → **NEVER deploy ERP here** — this is the company website on Netlify

2. **Check for uncommitted changes:**
   ```bash
   git status --short -- src/ docs/
   ```

3. **Build first:**
   ```bash
   npx vite build
   ```
   If build fails, fix errors before proceeding.

4. **Commit changes** (if any unstaged):
   - Stage only relevant files: `git add src/ docs/`
   - Write descriptive commit message in English
   - Add `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

5. **Push to GitHub:**
   ```bash
   git push origin main
   ```
   Vercel auto-deploys from `main`. No manual deploy needed.

6. **Verify deployment:**
   ```bash
   curl -s "https://api.github.com/repos/huyanhphongdien/huyanh-erp/commits/HEAD/check-runs" | python -c "
   import sys, json; d = json.load(sys.stdin)
   for r in d.get('check_runs', []):
       print(f'{r[\"name\"]}: {r[\"status\"]} {r[\"conclusion\"]}')"
   ```

## Safety Rules
- **NEVER** run `netlify deploy` for this project
- **NEVER** use `--site=c1c91099-6c9f-4618-a4af-b6d966065998` (that's huyanhrubber.com.vn)
- ERP deploys ONLY via `git push origin main` → Vercel webhook
- If user says "deploy trang công ty" → refuse, wrong project
