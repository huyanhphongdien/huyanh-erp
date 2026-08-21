# =============================================================================
# Chạy 3 migration của app Cân mủ lẻ lên Supabase (qua RPC public.agent_sql).
# Mỗi file chạy trong MỘT transaction → lỗi giữa chừng là rollback sạch cả file.
# Cả 3 file idempotent: chạy lại được.
#
# Chạy:  powershell -File docs/retail_scale_run_migrations.ps1
# =============================================================================
$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '..\.env.local'
$cfg = @{}
foreach ($line in Get-Content $envPath -Encoding UTF8) {
  if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
  $k, $v = $line -split '=', 2
  $cfg[$k.Trim()] = $v.Trim()
}
$url = $cfg['SUPABASE_URL']
$key = $cfg['SUPABASE_SERVICE_ROLE_KEY']
if (-not $url -or -not $key) { throw 'Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong .env.local' }

function Invoke-Sql([string]$sql) {
  $bodyJson = @{ q = $sql } | ConvertTo-Json -Compress -Depth 3
  # Ép UTF-8: PS 5.1 mặc định gửi body string bằng ISO-8859-1 → hỏng dấu tiếng Việt
  # trong comment SQL, và COMMENT ON ... sẽ lưu ra chuỗi rác.
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)
  $headers = @{ apikey = $key; Authorization = "Bearer $key" }
  return Invoke-RestMethod -Method Post -Uri "$url/rest/v1/rpc/agent_sql" `
    -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
}

$files = @(
  'retail_scale_p1_ticket_type.sql',
  'retail_scale_p2_lot_columns.sql',
  'retail_scale_p3_daily_price_anon.sql'
)

foreach ($f in $files) {
  $path = Join-Path $PSScriptRoot "migrations\$f"
  if (-not (Test-Path $path)) { throw "Không tìm thấy $path" }
  Write-Output "===== CHAY: $f ====="
  $sql = Get-Content $path -Raw -Encoding UTF8
  try {
    $r = Invoke-Sql $sql
    Write-Output ("  OK  " + ($r | ConvertTo-Json -Compress -Depth 4))
  } catch {
    $msg = $_.Exception.Message
    # Lấy body lỗi thật của PostgREST (chứa message của Postgres)
    if ($_.Exception.Response) {
      try {
        $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $msg = $sr.ReadToEnd()
      } catch { }
    }
    Write-Output "  LỖI: $msg"
    Write-Output "  → DỪNG. File này đã rollback nguyên vẹn, các file trước vẫn giữ."
    exit 1
  }
}

Write-Output ''
Write-Output 'Đã chạy xong 3 migration. Chạy docs/retail_scale_preflight.ps1 để kiểm lại.'
