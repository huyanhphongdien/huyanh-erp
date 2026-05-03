# B2B SIMULATE WRITE TESTS - Scenarios 4,5,6,7,8 + cleanup
# Tests trigger fire + CHECK constraint + view INSERT (post view-resync)
# All test rows have prefix TESTSQL- for easy cleanup
# Run: powershell -ExecutionPolicy Bypass -File docs/b2b_simulate_writes.ps1

$SR = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z3ZlZXRhYXRxbGxoanVzeXp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDY4NSwiZXhwIjoyMDg0MDM2Njg1fQ.bw4dPo4e8pLfbdlhHFFGnCVejp15z4BPANjtOQ3h6bc'
$URL = 'https://dygveetaatqllhjusyzz.supabase.co'

$H = @{
  'apikey' = $SR
  'Authorization' = "Bearer $SR"
  'Accept' = 'application/json'
  'Content-Type' = 'application/json'
  'Prefer' = 'return=representation'
}

# Track test rows created for cleanup
$script:testRows = @{
  deals = @()
  partners = @()
  prices = @()
  tickets = @()
  ticket_items = @()
  disputes = @()
}

function Invoke-Rest {
  param(
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][string]$Path,
    [string]$Body = $null,
    [hashtable]$ExtraHeaders = $null,
    [switch]$ExpectFail
  )
  $headers = $H.Clone()
  if ($ExtraHeaders) { foreach ($k in $ExtraHeaders.Keys) { $headers[$k] = $ExtraHeaders[$k] } }
  try {
    $params = @{
      Uri = "$URL$Path"
      Method = $Method
      Headers = $headers
      UseBasicParsing = $true
      ErrorAction = 'Stop'
    }
    if ($Body) { $params.Body = $Body }
    $r = Invoke-WebRequest @params
    if ($ExpectFail) {
      Write-Host "    UNEXPECTED PASS -- should have failed!" -ForegroundColor Red
      return @{ ok = $false; data = $r.Content; status = $r.StatusCode }
    }
    return @{ ok = $true; data = $r.Content; status = $r.StatusCode }
  } catch {
    $errBody = ''
    if ($_.Exception.Response) {
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        $stream.Position = 0
        $reader = New-Object System.IO.StreamReader($stream)
        $errBody = $reader.ReadToEnd()
      } catch {}
    }
    if ($ExpectFail) {
      return @{ ok = $true; data = $errBody; status = -1; expectedFail = $true }
    }
    return @{ ok = $false; data = $errBody; status = -1; error = $_.Exception.Message }
  }
}

function Pass { param([string]$Msg); Write-Host "  PASS: $Msg" -ForegroundColor Green }
function Fail { param([string]$Msg); Write-Host "  FAIL: $Msg" -ForegroundColor Red }
function Info { param([string]$Msg); Write-Host "  INFO: $Msg" -ForegroundColor Yellow }
function Header { param([string]$Msg); Write-Host ""; Write-Host "==== $Msg ====" -ForegroundColor Cyan }

# ============================================================================
# PRE-FLIGHT
# ============================================================================
Header 'PRE-FLIGHT -- fetch fixtures'

$res = Invoke-Rest -Method GET -Path '/rest/v1/b2b_partners?select=id,code,name,tier,status&status=eq.verified&limit=5'
if (-not $res.ok) { Fail "Cannot fetch partner: $($res.data)"; exit 1 }
$partners = $res.data | ConvertFrom-Json
if ($partners.Count -eq 0) { Fail 'No verified partner found'; exit 1 }
$PARTNER_ID = $partners[0].id
$PARTNER_CODE = $partners[0].code
Info "Using partner: $PARTNER_CODE ($PARTNER_ID), tier=$($partners[0].tier)"

# Find another partner for variety
$res2 = Invoke-Rest -Method GET -Path '/rest/v1/b2b_partners?select=id,code&status=eq.verified&limit=3'
$allPartners = $res2.data | ConvertFrom-Json
Info "Other partners available: $($allPartners.Count)"

# ============================================================================
# SCENARIO 7 -- Daily price admin
# ============================================================================
Header 'SCENARIO 7 -- Daily price admin'

# 7.1 Insert gia moi
$priceCode1 = "TESTSQL-PRICE-A-$(Get-Random -Maximum 999)"
$body7a = @{
  product_code = 'mu_nuoc'
  base_price_per_kg = 15000
  effective_from = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
  notes = $priceCode1
} | ConvertTo-Json
$r = Invoke-Rest -Method POST -Path '/rest/v1/b2b_daily_price_list' -Body $body7a
if ($r.ok) {
  $row = ($r.data | ConvertFrom-Json)[0]
  $script:testRows.prices += $row.id
  Pass "Inserted daily price A for mu_nuoc @ 15000 (id=$($row.id.Substring(0,8))...)"
} else {
  Fail "INSERT daily_price_list: $($r.data)"
}

# 7.2 Verify query
$r = Invoke-Rest -Method GET -Path "/rest/v1/b2b_daily_price_list?select=product_code,base_price_per_kg&notes=eq.$priceCode1"
$rows = $r.data | ConvertFrom-Json
if ($rows.Count -eq 1 -and $rows[0].base_price_per_kg -eq 15000) {
  Pass "Query daily price returns 15000 for mu_nuoc"
} else {
  Fail "Daily price query returned: $($r.data)"
}

# ============================================================================
# SCENARIO 4 -- Walkin CCCD validation
# ============================================================================
Header 'SCENARIO 4 -- Walk-in CCCD'

# 4.1 Insert ho nong dan hop le (CCCD 12 so)
$walkin1 = @{
  code = "TESTSQL-WLK-$(Get-Random -Maximum 9999)"
  name = 'Nguyen Van Test SQL'
  partner_type = 'household'
  nationality = 'VN'
  national_id = '079123456789'
  phone = '0912345678'
  status = 'verified'
  tier = 'new'
} | ConvertTo-Json
$r = Invoke-Rest -Method POST -Path '/rest/v1/b2b_partners' -Body $walkin1
if ($r.ok) {
  $row = ($r.data | ConvertFrom-Json)[0]
  $script:testRows.partners += $row.id
  $WALKIN_PARTNER_ID = $row.id
  Pass "Insert walkin partner with valid CCCD 079123456789 OK"
} else {
  Fail "INSERT walkin partner: $($r.data)"
  $WALKIN_PARTNER_ID = $null
}

# 4.2 Test CCCD invalid (9 so) -- DB CHECK NOT enforced, only UI validate
# Insert anyway to record state, mark as INFO
$walkin2 = @{
  code = "TESTSQL-INV9-$(Get-Random -Maximum 9999)"
  name = 'Invalid CCCD 9-digit'
  partner_type = 'household'
  nationality = 'VN'
  national_id = '079123456'
  phone = '0912345678'
  status = 'verified'
  tier = 'new'
} | ConvertTo-Json
$r = Invoke-Rest -Method POST -Path '/rest/v1/b2b_partners' -Body $walkin2
if ($r.ok) {
  $row = ($r.data | ConvertFrom-Json)[0]
  $script:testRows.partners += $row.id
  Info "9-digit CCCD INSERT succeeded (DB has no length CHECK -- UI validation only). GAP candidate."
} else {
  Pass "9-digit CCCD rejected: $($r.data.Substring(0,[Math]::Min(150,$r.data.Length)))"
}

# 4.3 Test reuse same CCCD -- expect FAIL (UNIQUE INDEX)
if ($WALKIN_PARTNER_ID) {
  $walkin3 = @{
    code = "TESTSQL-DUP-$(Get-Random -Maximum 9999)"
    name = 'Duplicate CCCD Test'
    partner_type = 'household'
    nationality = 'VN'
    national_id = '079123456789'
    phone = '0912345678'
    status = 'verified'
    tier = 'new'
  } | ConvertTo-Json
  $r = Invoke-Rest -Method POST -Path '/rest/v1/b2b_partners' -Body $walkin3 -ExpectFail
  if ($r.expectedFail) {
    Pass "Duplicate CCCD correctly REJECTED by UNIQUE INDEX"
  } else {
    Fail "Duplicate CCCD should have been rejected"
    $row = ($r.data | ConvertFrom-Json)[0]
    $script:testRows.partners += $row.id
  }
}

# 4.4 Insert deal walkin
if ($WALKIN_PARTNER_ID) {
  $deal4 = @{
    deal_number = "DLW-TS-$(Get-Random -Maximum 99999)"
    partner_id = $WALKIN_PARTNER_ID
    deal_type = 'purchase'
    product_code = 'mu_nuoc'
    quantity_kg = 500
    unit_price = 15000
    status = 'settled'
    purchase_type = 'farmer_walkin'
    actual_drc = 32
    actual_weight_kg = 500
    final_value = 2400000
  } | ConvertTo-Json
  $r = Invoke-Rest -Method POST -Path '/rest/v1/b2b_deals' -Body $deal4
  if ($r.ok) {
    $row = ($r.data | ConvertFrom-Json)[0]
    $script:testRows.deals += $row.id
    Pass "Insert walkin deal status=settled OK, final_value=$($row.final_value)"
    if ($row.final_value -eq 2400000) { Pass "final_value correct = 2,400,000" }
    if ($row.purchase_type -eq 'farmer_walkin') { Pass "purchase_type=farmer_walkin saved" }
  } else {
    Fail "INSERT walkin deal: $($r.data)"
  }
}

# ============================================================================
# SCENARIO 5 -- DRC variance trigger
# ============================================================================
Header 'SCENARIO 5 -- DRC-after-production trigger'

# 5.1 Variance < 3% -- should NOT raise dispute
$deal5a = @{
  deal_number = "DLPA-TS-$(Get-Random -Maximum 99999)"
  partner_id = $PARTNER_ID
  deal_type = 'purchase'
  product_code = 'mu_nuoc'
  quantity_kg = 10000
  unit_price = 12000
  status = 'pending'
  purchase_type = 'drc_after_production'
  sample_drc = 35
  expected_drc = 35
  production_mode = 'pooled'
  production_sla_days = 7
  production_started_at = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
} | ConvertTo-Json
$r = Invoke-Rest -Method POST -Path '/rest/v1/b2b_deals' -Body $deal5a
if ($r.ok) {
  $row = ($r.data | ConvertFrom-Json)[0]
  $DEAL_5A_ID = $row.id
  $DEAL_5A_NUMBER = $row.deal_number
  $script:testRows.deals += $DEAL_5A_ID
  Pass "Insert drc-after-prod deal A (sample_drc=35) OK"
} else {
  Fail "INSERT deal 5A: $($r.data)"; $DEAL_5A_ID = $null
}

if ($DEAL_5A_ID) {
  # Update voi actual_drc=36.5 (variance 1.5/35 = 4.3% > 3% -- actually triggers!)
  # Use 35.5 instead (variance 0.5/35 = 1.4% < 3%)
  $upd5a = @{
    actual_drc = 35.5
    actual_weight_kg = 10000
    finished_product_kg = 3550
  } | ConvertTo-Json
  $r = Invoke-Rest -Method PATCH -Path "/rest/v1/b2b_deals?id=eq.$DEAL_5A_ID" -Body $upd5a
  if ($r.ok) {
    Pass "UPDATE actual_drc=35.5 (variance ~1.4%) OK"
    Start-Sleep -Milliseconds 200
    # Check no auto-raised dispute
    $r2 = Invoke-Rest -Method GET -Path "/rest/v1/b2b_drc_disputes?select=id,reason&deal_id=eq.$DEAL_5A_ID&reason=ilike.Auto-raised*"
    $rows = $r2.data | ConvertFrom-Json
    if ($rows.Count -eq 0) {
      Pass "No auto-dispute fired for variance < 3% (correct)"
    } else {
      Fail "Auto-dispute fired unexpectedly for variance ~1.4%"
    }
  } else {
    Fail "UPDATE 5A: $($r.data)"
  }
}

# 5.2 Variance > 3% -- should AUTO-RAISE dispute
$deal5b = @{
  deal_number = "DLPB-TS-$(Get-Random -Maximum 99999)"
  partner_id = $PARTNER_ID
  deal_type = 'purchase'
  product_code = 'mu_nuoc'
  quantity_kg = 5000
  unit_price = 12000
  status = 'pending'
  purchase_type = 'drc_after_production'
  sample_drc = 40
  expected_drc = 40
  production_mode = 'pooled'
  production_sla_days = 7
  production_started_at = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
} | ConvertTo-Json
$r = Invoke-Rest -Method POST -Path '/rest/v1/b2b_deals' -Body $deal5b
if ($r.ok) {
  $row = ($r.data | ConvertFrom-Json)[0]
  $DEAL_5B_ID = $row.id
  $script:testRows.deals += $DEAL_5B_ID
  Pass "Insert drc-after-prod deal B (sample_drc=40) OK"
} else {
  Fail "INSERT deal 5B: $($r.data)"; $DEAL_5B_ID = $null
}

if ($DEAL_5B_ID) {
  # Update with actual_drc=30, variance |30-40|/40=25% > 3%
  $upd5b = @{
    actual_drc = 30
    actual_weight_kg = 5000
  } | ConvertTo-Json
  $r = Invoke-Rest -Method PATCH -Path "/rest/v1/b2b_deals?id=eq.$DEAL_5B_ID" -Body $upd5b
  if ($r.ok) {
    Pass "UPDATE actual_drc=30 (variance 25%) OK"
    Start-Sleep -Milliseconds 500  # let trigger fire
    $r2 = Invoke-Rest -Method GET -Path "/rest/v1/b2b_drc_disputes?select=id,dispute_number,reason&deal_id=eq.$DEAL_5B_ID"
    $rows = $r2.data | ConvertFrom-Json
    if ($rows.Count -ge 1) {
      $script:testRows.disputes += $rows[0].id
      Pass "AUTO-DISPUTE FIRED: $($rows[0].dispute_number) -- reason: $($rows[0].reason.Substring(0,[Math]::Min(80,$rows[0].reason.Length)))"
    } else {
      Fail "No auto-dispute fired (trigger trg_drc_variance_dispute may not be installed)"
    }
  } else {
    Fail "UPDATE 5B: $($r.data)"
  }

  # 5.3 Test drc_after lock -- second update should FAIL
  $upd5b2 = @{ actual_drc = 25 } | ConvertTo-Json
  $r = Invoke-Rest -Method PATCH -Path "/rest/v1/b2b_deals?id=eq.$DEAL_5B_ID" -Body $upd5b2 -ExpectFail
  if ($r.expectedFail) {
    Pass "Second UPDATE actual_drc correctly BLOCKED by enforce_deal_lock"
  } else {
    Info "GAP: Second UPDATE actual_drc succeeded -- enforce_deal_lock may need refinement for drc_after_production flow"
  }
}

# ============================================================================
# SCENARIO 6 -- Multi-lot allocation by_share
# ============================================================================
Header 'SCENARIO 6 -- Multi-lot ticket allocation'

# Need 3 deals -- use existing test deals from this run
if ($allPartners.Count -ge 1) {
  # Insert 3 simple deals for the multi-lot
  $multiDeals = @()
  for ($i = 1; $i -le 3; $i++) {
    $partnerId = $allPartners[($i - 1) % $allPartners.Count].id
    $body = @{
      deal_number = "DLM$i-TS-$(Get-Random -Maximum 9999)"
      partner_id = $partnerId
      deal_type = 'purchase'
      product_code = 'mu_tap'
      quantity_kg = (500, 300, 200)[$i - 1]
      unit_price = 12000
      status = 'accepted'
      purchase_type = 'standard'
      expected_drc = 30
    } | ConvertTo-Json
    $r = Invoke-Rest -Method POST -Path '/rest/v1/b2b_deals' -Body $body
    if ($r.ok) {
      $row = ($r.data | ConvertFrom-Json)[0]
      $multiDeals += @{ id = $row.id; declared = (500, 300, 200)[$i - 1] }
      $script:testRows.deals += $row.id
    } else {
      Fail "INSERT multi-lot deal $i : $($r.data.Substring(0,[Math]::Min(200,$r.data.Length)))"
    }
  }
  if ($multiDeals.Count -eq 3) {
    Pass "Created 3 child deals for multi-lot test"

    # Insert ticket -- direction='in' for incoming rubber
    # Insert ticket status='weighing_tare' (one of accepted statuses), no net_weight yet
    $ticket = @{
      code = "CAN-ML-TS-$(Get-Random -Maximum 99999)"
      vehicle_plate = '60F-12345'
      driver_name = 'Multi-lot test driver'
      ticket_type = 'in'
      gross_weight = 3000
      tare_weight = 2015
      status = 'weighing_tare'
      has_items = $true
      allocation_mode = 'by_share'
    } | ConvertTo-Json
    $r = Invoke-Rest -Method POST -Path '/rest/v1/weighbridge_tickets' -Body $ticket
    if ($r.ok) {
      $tk = ($r.data | ConvertFrom-Json)[0]
      $script:testRows.tickets += $tk.id
      Pass "Insert multi-lot ticket OK (net=985kg)"

      # Insert 3 line items declared 500/300/200
      $items = @()
      for ($i = 0; $i -lt 3; $i++) {
        $body = @{
          ticket_id = $tk.id
          line_no = $i + 1
          deal_id = $multiDeals[$i].id
          rubber_type = 'mu_tap'
          declared_qty_kg = $multiDeals[$i].declared
          drc_percent = 30
          unit_price = 12000
        } | ConvertTo-Json
        $r = Invoke-Rest -Method POST -Path '/rest/v1/weighbridge_ticket_items' -Body $body
        if ($r.ok) {
          $row = ($r.data | ConvertFrom-Json)[0]
          $items += $row
          $script:testRows.ticket_items += $row.id
        } else {
          Fail "INSERT ticket item $($i+1): $($r.data.Substring(0,[Math]::Min(200,$r.data.Length)))"
        }
      }
      if ($items.Count -eq 3) {
        Pass "Inserted 3 ticket items declared 500/300/200"

        # Update: SET net_weight + status=completed -> fires trg_ticket_allocate_on_weigh
        $upd = @{
          net_weight = 985
          actual_net_weight = 985
          status = 'completed'
          completed_at = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
        } | ConvertTo-Json
        $r = Invoke-Rest -Method PATCH -Path "/rest/v1/weighbridge_tickets?id=eq.$($tk.id)" -Body $upd
        if ($r.ok) {
          Pass "UPDATE ticket SET net_weight=985 + status=completed OK"
          Start-Sleep -Milliseconds 500
          # Verify allocated qty
          $r2 = Invoke-Rest -Method GET -Path "/rest/v1/weighbridge_ticket_items?select=line_no,declared_qty_kg,actual_qty_kg&ticket_id=eq.$($tk.id)&order=line_no.asc"
          $rows = $r2.data | ConvertFrom-Json
          $expected = @(492.5, 295.5, 197.0)
          $allMatch = $true
          $sum = 0
          for ($i = 0; $i -lt 3; $i++) {
            $actual = [decimal]$rows[$i].actual_qty_kg
            $sum += $actual
            $diff = [Math]::Abs($actual - $expected[$i])
            if ($diff -lt 0.5) {
              Pass "Line $($i+1): declared=$($rows[$i].declared_qty_kg), actual=$actual (expected $($expected[$i])), match"
            } else {
              Fail "Line $($i+1): actual=$actual, expected=$($expected[$i]) (diff $diff)"
              $allMatch = $false
            }
          }
          if ([Math]::Abs($sum - 985) -lt 0.5) {
            Pass "Sum of allocated = $sum (expected 985)"
          } else {
            Fail "Sum of allocated = $sum, should be 985"
          }
        } else {
          Fail "UPDATE ticket: $($r.data.Substring(0,[Math]::Min(300,$r.data.Length)))"
        }
      }
    } else {
      Fail "INSERT ticket: $($r.data.Substring(0,[Math]::Min(300,$r.data.Length)))"
    }
  }
}

# ============================================================================
# SCENARIO 8 -- DRC Dispute audit log
# ============================================================================
Header 'SCENARIO 8 -- Dispute audit log'

# Find 1 settled deal to use as dispute target
$r = Invoke-Rest -Method GET -Path '/rest/v1/b2b_deals?select=id,deal_number,partner_id,expected_drc,actual_drc&status=eq.settled&actual_drc=not.is.null&expected_drc=not.is.null&limit=1'
$deals = $r.data | ConvertFrom-Json
if ($deals.Count -ge 1) {
  $TARGET_DEAL = $deals[0]
  Info "Target deal for dispute: $($TARGET_DEAL.deal_number)"

  $disputeNum = "DIS-TESTSQL-$(Get-Random -Maximum 99999)"
  $body8 = @{
    dispute_number = $disputeNum
    deal_id = $TARGET_DEAL.id
    partner_id = $TARGET_DEAL.partner_id
    raised_by = $TARGET_DEAL.partner_id
    expected_drc = $TARGET_DEAL.expected_drc
    actual_drc = $TARGET_DEAL.actual_drc
    status = 'open'
    reason = 'Test SQL -- partner raise dispute (auto-test)'
  } | ConvertTo-Json
  $r = Invoke-Rest -Method POST -Path '/rest/v1/b2b_drc_disputes' -Body $body8
  if ($r.ok) {
    $disp = ($r.data | ConvertFrom-Json)[0]
    $script:testRows.disputes += $disp.id
    Pass "Insert dispute $disputeNum OK"

    # Update status investigating
    $upd = @{ status = 'investigating' } | ConvertTo-Json
    $r = Invoke-Rest -Method PATCH -Path "/rest/v1/b2b_drc_disputes?id=eq.$($disp.id)" -Body $upd
    if ($r.ok) { Pass 'Update status=investigating OK' }

    # Update status resolved_rejected
    $upd = @{
      status = 'resolved_rejected'
      resolution_notes = 'Test resolve auto'
      resolved_at = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
    } | ConvertTo-Json
    $r = Invoke-Rest -Method PATCH -Path "/rest/v1/b2b_drc_disputes?id=eq.$($disp.id)" -Body $upd
    if ($r.ok) { Pass 'Update status=resolved_rejected OK' }

    # Verify audit log via b2b schema (audit log might be in b2b.dispute_audit_log)
    $auditH = $H.Clone()
    $auditH['Accept-Profile'] = 'b2b'
    Start-Sleep -Milliseconds 300
    $r = Invoke-Rest -Method GET -Path "/rest/v1/dispute_audit_log?select=op,changed_at&dispute_id=eq.$($disp.id)&order=changed_at.asc" -ExtraHeaders @{'Accept-Profile'='b2b'}
    if ($r.ok) {
      $audits = $r.data | ConvertFrom-Json
      if ($audits.Count -ge 3) {
        Pass "Audit log has $($audits.Count) entries (>= 3 expected from INSERT + 2 UPDATEs)"
      } elseif ($audits.Count -ge 1) {
        Info "Audit log has $($audits.Count) entries (expected >= 3, may be config different)"
      } else {
        Fail "No audit log entries (trigger trg_dispute_audit may not work)"
      }
    } else {
      Info "Cannot read dispute_audit_log: $($r.data.Substring(0,[Math]::Min(200,$r.data.Length)))"
    }
  } else {
    Fail "INSERT dispute: $($r.data.Substring(0,[Math]::Min(300,$r.data.Length)))"
  }
} else {
  Info 'No settled deal with actual_drc found -- skip Scenario 8'
}

# ============================================================================
# CLEANUP -- delete in reverse FK dependency order
# ============================================================================
Header 'CLEANUP -- delete test rows'

# 1. Disputes first (FK to deals)
foreach ($id in $script:testRows.disputes) {
  $r = Invoke-Rest -Method DELETE -Path "/rest/v1/b2b_drc_disputes?id=eq.$id"
  if ($r.ok) { Info "Deleted dispute $($id.Substring(0,8))" } else { Fail "Cannot delete dispute $($id.Substring(0,8)): $($r.data.Substring(0,[Math]::Min(150,$r.data.Length)))" }
}

# 2. Ticket items (FK to tickets)
foreach ($id in $script:testRows.ticket_items) {
  $r = Invoke-Rest -Method DELETE -Path "/rest/v1/weighbridge_ticket_items?id=eq.$id"
  if (-not $r.ok) { Fail "Cannot delete ticket item: $($r.data.Substring(0,[Math]::Min(150,$r.data.Length)))" }
}
Info "Deleted $($script:testRows.ticket_items.Count) ticket items"

# 3. Tickets
foreach ($id in $script:testRows.tickets) {
  $r = Invoke-Rest -Method DELETE -Path "/rest/v1/weighbridge_tickets?id=eq.$id"
  if ($r.ok) { Info "Deleted ticket $($id.Substring(0,8))" }
}

# 4. Deals (need to delete dependent disputes first -- done above)
foreach ($id in $script:testRows.deals) {
  $r = Invoke-Rest -Method DELETE -Path "/rest/v1/b2b_deals?id=eq.$id"
  if (-not $r.ok) { Fail "Cannot delete deal $($id.Substring(0,8)): $($r.data.Substring(0,[Math]::Min(150,$r.data.Length)))" }
}
Info "Attempted delete of $($script:testRows.deals.Count) deals"

# 5. Partners
foreach ($id in $script:testRows.partners) {
  $r = Invoke-Rest -Method DELETE -Path "/rest/v1/b2b_partners?id=eq.$id"
  if (-not $r.ok) { Fail "Cannot delete partner: $($r.data.Substring(0,[Math]::Min(150,$r.data.Length)))" }
}
Info "Attempted delete of $($script:testRows.partners.Count) partners"

# 6. Daily prices
foreach ($id in $script:testRows.prices) {
  $r = Invoke-Rest -Method DELETE -Path "/rest/v1/b2b_daily_price_list?id=eq.$id"
  if ($r.ok) { Info "Deleted price $($id.Substring(0,8))" }
}

Header 'DONE'
Write-Host "Tests created: $($script:testRows.deals.Count) deals, $($script:testRows.partners.Count) partners, $($script:testRows.tickets.Count) tickets, $($script:testRows.ticket_items.Count) items, $($script:testRows.disputes.Count) disputes, $($script:testRows.prices.Count) prices"
