# B2B PRE-FLIGHT v2 - READ-ONLY tests via Supabase REST
# Run: powershell -ExecutionPolicy Bypass -File docs/b2b_preflight_test.ps1

$SR = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z3ZlZXRhYXRxbGxoanVzeXp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDY4NSwiZXhwIjoyMDg0MDM2Njg1fQ.bw4dPo4e8pLfbdlhHFFGnCVejp15z4BPANjtOQ3h6bc'
$URL = 'https://dygveetaatqllhjusyzz.supabase.co'

$H = @{
  'apikey' = $SR
  'Authorization' = "Bearer $SR"
  'Accept' = 'application/json'
  'Prefer' = 'count=exact'
}

# For schema=b2b queries (target base tables, bypass public views)
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
    $count = $r.Headers['Content-Range']
    Write-Host "  [HTTP $($r.StatusCode)] count=$count" -ForegroundColor Green
    $body = $r.Content
    if ($body.Length -gt 500) {
      Write-Host "  body (first 500 chars): $($body.Substring(0,500))..."
    } else {
      Write-Host "  body: $body"
    }
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

Write-Host 'B2B PRE-FLIGHT v2 - View vs Base table comparison' -ForegroundColor Magenta

# A. Test purchase_type on PUBLIC view (what most code uses)
Test-Endpoint -Name 'A. purchase_type on public.b2b_deals view' -Path '/rest/v1/b2b_deals?select=id,purchase_type&limit=1'

# B. Test purchase_type on BASE table b2b.deals via Accept-Profile header
Test-Endpoint -Name 'B. purchase_type on b2b.deals base table' -Path '/rest/v1/deals?select=id,purchase_type&limit=1' -Headers $HB2B

# C. Test all 11 Intake v4 cols on view
Test-Endpoint -Name 'C. All 11 Intake v4 cols on public view' -Path '/rest/v1/b2b_deals?select=id,purchase_type,buyer_user_id,qc_user_id,sample_drc,finished_product_kg,production_mode,production_pool_id,production_sla_days,production_started_at,production_reject_reason,reject_loss_amount&limit=1'

# D. Same on base
Test-Endpoint -Name 'D. All 11 Intake v4 cols on b2b.deals base' -Path '/rest/v1/deals?select=id,purchase_type,buyer_user_id,qc_user_id,sample_drc,finished_product_kg,production_mode,production_pool_id,production_sla_days,production_started_at,production_reject_reason,reject_loss_amount&limit=1' -Headers $HB2B

# E. Settlement Sprint E cols (paid_at, paid_by) on view + base
Test-Endpoint -Name 'E1. Sprint E cols on b2b_settlements view' -Path '/rest/v1/b2b_settlements?select=id,paid_at,paid_by&limit=1'
Test-Endpoint -Name 'E2. Sprint E cols on b2b.settlements base' -Path '/rest/v1/settlements?select=id,paid_at,paid_by&limit=1' -Headers $HB2B

# F. weighbridge_tickets actual columns
Test-Endpoint -Name 'F1. weighbridge_tickets minimal' -Path '/rest/v1/weighbridge_tickets?select=id,code&limit=1'
Test-Endpoint -Name 'F2. weighbridge_tickets has_items + allocation_mode' -Path '/rest/v1/weighbridge_tickets?select=id,code,has_items,allocation_mode&limit=1'
Test-Endpoint -Name 'F3. weighbridge_tickets weight cols' -Path '/rest/v1/weighbridge_tickets?select=id,code,gross_weight,tare_weight,actual_net_weight&limit=1'

# G. weighbridge_ticket_items
Test-Endpoint -Name 'G. weighbridge_ticket_items table' -Path '/rest/v1/weighbridge_ticket_items?select=id,ticket_id,deal_id,declared_qty_kg,actual_qty_kg&limit=1'

# H. b2b_daily_price_list table
Test-Endpoint -Name 'H. b2b_daily_price_list table' -Path '/rest/v1/b2b_daily_price_list?select=id,product_code,base_price_per_kg,effective_from&limit=1'

# I. partner_ledger entry_type new values
Test-Endpoint -Name 'I. ledger entries with new entry_type' -Path '/rest/v1/b2b_partner_ledger?select=entry_type,running_balance&entry_type=in.(settlement_receivable,advance_paid,payment_paid,adjustment_debit,adjustment_credit)&limit=10'

# J. Auto-raised disputes
Test-Endpoint -Name 'J. Auto-raised disputes' -Path '/rest/v1/b2b_drc_disputes?select=dispute_number,reason&reason=ilike.Auto-raised*&limit=5'

# K. Sample existing data counts
Test-Endpoint -Name 'K1. Verified partners count' -Path '/rest/v1/b2b_partners?select=id&status=eq.verified'
Test-Endpoint -Name 'K2. Settled deals count' -Path '/rest/v1/b2b_deals?select=id&status=eq.settled'
Test-Endpoint -Name 'K3. Paid settlements count' -Path '/rest/v1/b2b_settlements?select=id&status=eq.paid'

Write-Host ''
Write-Host '=== DONE - Paste FULL output back ===' -ForegroundColor Magenta
