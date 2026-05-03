# Diagnostic v3 - find exact column names + view definitions
$SR = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z3ZlZXRhYXRxbGxoanVzeXp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDY4NSwiZXhwIjoyMDg0MDM2Njg1fQ.bw4dPo4e8pLfbdlhHFFGnCVejp15z4BPANjtOQ3h6bc'
$URL = 'https://dygveetaatqllhjusyzz.supabase.co'

$H = @{
  'apikey' = $SR
  'Authorization' = "Bearer $SR"
  'Accept' = 'application/json'
  'Prefer' = 'count=exact'
}
$HB2B = @{
  'apikey' = $SR
  'Authorization' = "Bearer $SR"
  'Accept' = 'application/json'
  'Prefer' = 'count=exact'
  'Accept-Profile' = 'b2b'
}

function Test-Endpoint {
  param([string]$Name, [string]$Path, [hashtable]$Headers = $H)
  Write-Host ''
  Write-Host "=== $Name ===" -ForegroundColor Cyan
  Write-Host "GET $Path"
  try {
    $r = Invoke-WebRequest -Uri "$URL$Path" -Headers $Headers -Method GET -UseBasicParsing -ErrorAction Stop
    Write-Host "  [HTTP $($r.StatusCode)] count=$($r.Headers['Content-Range'])" -ForegroundColor Green
    $b = $r.Content
    if ($b.Length -gt 700) { Write-Host "  body: $($b.Substring(0,700))..." } else { Write-Host "  body: $b" }
  } catch {
    Write-Host "  [FAIL] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "  body: $($reader.ReadToEnd())"
      } catch {}
    }
  }
}

# 1. Get full row of public.b2b_deals to see what columns view DOES have
Test-Endpoint -Name '1. b2b_deals view ALL columns sample' -Path '/rest/v1/b2b_deals?select=*&limit=1'

# 2. Get full row of base table
Test-Endpoint -Name '2. b2b.deals base ALL columns sample' -Path '/rest/v1/deals?select=*&limit=1' -Headers $HB2B

# 3. weighbridge_ticket_items full sample
Test-Endpoint -Name '3. weighbridge_ticket_items full row' -Path '/rest/v1/weighbridge_ticket_items?select=*&limit=1'

# 4. b2b_daily_price_list via b2b schema header
Test-Endpoint -Name '4. b2b.daily_price_list (b2b schema)' -Path '/rest/v1/daily_price_list?select=*&limit=1' -Headers $HB2B

# 5. Other potentially affected views
Test-Endpoint -Name '5. b2b_partners view (has nationality, national_id?)' -Path '/rest/v1/b2b_partners?select=id,nationality,national_id&limit=1'

# 6. b2b_drc_disputes view sample
Test-Endpoint -Name '6. b2b_drc_disputes view full' -Path '/rest/v1/b2b_drc_disputes?select=*&limit=1'

# 7. Check if there are other b2b views in schema cache
Test-Endpoint -Name '7. Try b2b_settlement_items view' -Path '/rest/v1/b2b_settlement_items?select=*&limit=1'

Write-Host ''
Write-Host '=== DONE ===' -ForegroundColor Magenta
