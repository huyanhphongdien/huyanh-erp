# =============================================================================
# PREFLIGHT — App Cân mủ lẻ (apps/retail-scale)
# Kiểm tra DB đã sẵn sàng chưa TRƯỚC khi deploy / trước khi go-live.
# CHỈ CHẠY SELECT (read-only). Không sửa gì.
#
# Chạy:  powershell -File docs/retail_scale_preflight.ps1
# Cần:   .env.local có SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, và RPC public.agent_sql
#        (xem docs/migrations/admin_test_rpc_helper.sql)
# =============================================================================
$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '..\.env.local'
if (-not (Test-Path $envPath)) { throw "Không tìm thấy $envPath" }
$cfg = @{}
foreach ($line in Get-Content $envPath -Encoding UTF8) {
  if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
  $k, $v = $line -split '=', 2
  $cfg[$k.Trim()] = $v.Trim()
}
$url = $cfg['SUPABASE_URL']
$key = $cfg['SUPABASE_SERVICE_ROLE_KEY']
if (-not $url -or -not $key) { throw 'Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local' }

function Invoke-Sql([string]$sql) {
  $body = @{ q = $sql } | ConvertTo-Json -Compress
  $headers = @{ apikey = $key; Authorization = "Bearer $key"; 'Content-Type' = 'application/json' }
  return Invoke-RestMethod -Method Post -Uri "$url/rest/v1/rpc/agent_sql" -Headers $headers -Body $body
}

function Check([string]$name, [string]$sql, [scriptblock]$ok) {
  Write-Output "----- $name -----"
  try {
    $r = Invoke-Sql $sql
    $json = if ($null -eq $r) { '[]' } else { ($r | ConvertTo-Json -Depth 6 -Compress) }
    $verdict = & $ok $r
    Write-Output ("  {0}  {1}" -f $verdict, $json)
  } catch {
    Write-Output ("  LỖI: " + $_.Exception.Message)
  }
}

Check 'M1 · ticket_type nhận retail' `
  "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.weighbridge_tickets'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%ticket_type%'" `
  { param($r) if ($r -and ($r | ConvertTo-Json) -match 'retail') { 'OK' } else { 'THIẾU → chạy retail_scale_p1_ticket_type.sql' } }

Check 'M1 · source_type nhận retail' `
  "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.weighbridge_tickets'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%source_type%'" `
  { param($r) if ($r -and ($r | ConvertTo-Json) -match 'retail') { 'OK' } else { 'THIẾU → chạy retail_scale_p1_ticket_type.sql' } }

Check 'M2 · cột bì trên weighbridge_ticket_lots' `
  "SELECT column_name FROM information_schema.columns WHERE table_name='weighbridge_ticket_lots' AND column_name IN ('gross_kg','tare_kg','container_count','container_type')" `
  { param($r) if ($r -and $r.Count -eq 4) { 'OK' } else { 'THIẾU → chạy retail_scale_p2_lot_columns.sql' } }

Check 'M3 · anon đọc được bảng giá ngày' `
  "SELECT policyname FROM pg_policies WHERE schemaname='b2b' AND tablename='daily_price_list' AND roles::text LIKE '%anon%'" `
  { param($r) if ($r -and $r.Count -ge 1) { 'OK' } else { 'THIẾU → chạy retail_scale_p3_daily_price_anon.sql' } }

Check 'RLS · anon ghi được weighbridge_tickets' `
  "SELECT policyname, cmd FROM pg_policies WHERE tablename='weighbridge_tickets' AND roles::text LIKE '%anon%'" `
  { param($r) if ($r -and $r.Count -ge 1) { 'OK' } else { 'THIẾU policy anon' } }

Check 'RLS · anon ghi được weighbridge_ticket_lots' `
  "SELECT policyname, cmd FROM pg_policies WHERE tablename='weighbridge_ticket_lots' AND roles::text LIKE '%anon%'" `
  { param($r) if ($r -and $r.Count -ge 1) { 'OK' } else { 'THIẾU policy anon' } }

Check 'Danh mục · nhà máy' `
  "SELECT code, name FROM public.facilities ORDER BY code" `
  { param($r) if ($r -and $r.Count -ge 1) { 'OK' } else { 'RỖNG' } }

Check 'Danh mục · nhân viên cân (đăng nhập PIN)' `
  "SELECT name, station FROM public.scale_operators WHERE is_active ORDER BY name" `
  { param($r) if ($r -and $r.Count -ge 1) { 'OK' } else { 'RỖNG → không đăng nhập được' } }

Check 'Giá ngày mủ tạp (không bắt buộc)' `
  "SELECT product_code, base_price_per_kg FROM b2b.daily_price_list WHERE product_code='mu_tap' AND (effective_to IS NULL OR effective_to > now()) ORDER BY effective_from DESC LIMIT 1" `
  { param($r) if ($r -and $r.Count -ge 1) { 'OK' } else { 'Chưa đặt — thao tác viên sẽ tự gõ giá (chấp nhận được)' } }

Check 'Số phiếu mủ lẻ hiện có' `
  "SELECT count(*) AS n FROM public.weighbridge_tickets WHERE ticket_type='retail'" `
  { param($r) 'INFO' }

Write-Output ''
Write-Output 'Xong. Mọi dòng phải là OK (trừ "Giá ngày" và "Số phiếu" là INFO).'
