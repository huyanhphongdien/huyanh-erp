# =============================================================================
# SMOKE TEST — App Cân mủ lẻ, chạy bằng ANON KEY (đúng quyền app thật dùng).
# Mô phỏng CHÍNH XÁC những gì retailTicketService.createRetailTicket() ghi.
#
# Tạo 1 phiếu thử + 2 dòng bao → kiểm tra phiếu lọt vào queue Đề nghị thanh toán
# → XOÁ sạch. Không để lại dữ liệu.
#
# Chạy:  powershell -File docs/retail_scale_smoke_test.ps1
# =============================================================================
$ErrorActionPreference = 'Stop'

# Anon key lấy từ .env của chính app con — test đúng quyền thật, không dùng service key.
$envPath = Join-Path $PSScriptRoot '..\apps\retail-scale\.env'
$cfg = @{}
foreach ($line in Get-Content $envPath -Encoding UTF8) {
  if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
  $k, $v = $line -split '=', 2
  $cfg[$k.Trim()] = $v.Trim()
}
$url = $cfg['VITE_SUPABASE_URL']
$key = $cfg['VITE_SUPABASE_ANON_KEY']
if (-not $url -or -not $key) { throw 'Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong apps/retail-scale/.env' }

$H = @{ apikey = $key; Authorization = "Bearer $key" }

function Rest([string]$method, [string]$path, $body, [string]$prefer) {
  $h = $H.Clone()
  if ($prefer) { $h['Prefer'] = $prefer }
  $args = @{ Method = $method; Uri = "$url/rest/v1/$path"; Headers = $h }
  if ($null -ne $body) {
    $json = $body | ConvertTo-Json -Compress -Depth 6
    $args['Body'] = [System.Text.Encoding]::UTF8.GetBytes($json)
    $args['ContentType'] = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @args
}

function Fail([string]$step, $err) {
  $msg = $err.Exception.Message
  if ($err.Exception.Response) {
    try {
      $sr = New-Object System.IO.StreamReader($err.Exception.Response.GetResponseStream())
      $msg = $sr.ReadToEnd()
    } catch { }
  }
  Write-Output "  THẤT BẠI [$step]: $msg"
  exit 1
}

$ticketId = $null
$code = "ML-SMOKE-" + (Get-Random -Minimum 100000 -Maximum 999999)

try {
  # ---- 0. Lấy facility PD ----
  $fac = Rest GET "facilities?select=id,code&code=eq.PD" $null $null
  if (-not $fac -or $fac.Count -eq 0) { throw 'Không đọc được facilities bằng anon key' }
  $facilityId = $fac[0].id
  Write-Output "1/6 Đọc facility PD bằng anon .......... OK ($facilityId)"

  # ---- 1. Đọc bảng giá ngày (migration p3) ----
  try {
    $null = Rest GET "b2b_daily_price_list?select=product_code,base_price_per_kg&limit=1" $null $null
    Write-Output "2/6 Đọc bảng giá ngày bằng anon ........ OK (không bị RLS chặn)"
  } catch { Fail 'đọc b2b_daily_price_list' $_ }

  # ---- 2. Tạo phiếu retail (giống hệt createRetailTicket) ----
  $now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  $ticket = @{
    code = $code; ticket_type = 'retail'; status = 'completed'; source_type = 'retail'
    facility_id = $facilityId; vehicle_plate = 'XE MÁY'
    driver_name = 'SMOKE TEST'; driver_phone = '0900000000'; supplier_name = 'SMOKE TEST'
    rubber_type = 'mu_tap'; price_unit = 'wet'; unit_price = 12000; qc_actual_drc = $null
    gross_weight = 105.5; tare_weight = 1.0; net_weight = 104.5
    actual_net_weight = 104.5; deduction_kg = 0; estimated_value = 1254000
    has_items = $false; allocation_mode = 'by_share'
    notes = 'PHIEU THU — smoke test, se tu xoa'
    gross_weighed_at = $now; completed_at = $now
  }
  try {
    $res = Rest POST 'weighbridge_tickets' @($ticket) 'return=representation'
    $ticketId = $res[0].id
    Write-Output "3/6 Tạo phiếu ticket_type=retail ....... OK ($code)"
  } catch { Fail 'insert weighbridge_tickets' $_ }

  # ---- 3. Ghi 2 dòng bao (cột mới của migration p2) ----
  $lots = @(
    @{ ticket_id = $ticketId; lot_code = 'Bao 1'; rubber_type = 'mu_tap'
       gross_kg = 60.5; tare_kg = 0.5; net_kg = 60.0; container_count = 1
       container_type = 'Bao'; sort_order = 1; is_derived = $false },
    @{ ticket_id = $ticketId; lot_code = 'Bao 2'; rubber_type = 'mu_tap'
       gross_kg = 45.0; tare_kg = 0.5; net_kg = 44.5; container_count = 1
       container_type = 'Bao'; sort_order = 2; is_derived = $false }
  )
  try {
    $null = Rest POST 'weighbridge_ticket_lots' $lots 'return=representation'
    Write-Output "4/6 Ghi 2 dòng bao (gross/tare/bì) ..... OK"
  } catch { Fail 'insert weighbridge_ticket_lots' $_ }

  # ---- 4. Phiếu có lọt vào queue Đề nghị thanh toán không? ----
  # Đúng bộ lọc của paymentRequestService.listAvailableTickets sau khi sửa.
  $q = "weighbridge_tickets?select=code,net_weight,unit_price,supplier_name,ticket_type" +
       "&status=eq.completed&payment_request_id=is.null&ticket_type=in.(in,retail)" +
       "&facility_id=eq.$facilityId&code=eq.$code"
  $avail = Rest GET $q $null $null
  if (-not $avail -or $avail.Count -ne 1) { throw "Phiếu KHÔNG lọt vào queue chi tiền (trả về $($avail.Count) dòng)" }
  Write-Output "5/6 Phiếu vào queue Đề nghị thanh toán . OK (giá $($avail[0].unit_price)đ/kg, $($avail[0].net_weight)kg)"

  # ---- 5. Phiếu có bị lẫn vào app cân XE không? ----
  $wb = Rest GET "weighbridge_tickets?select=code&code=eq.$code&ticket_type=in.(in,out,gate,fetch)" $null $null
  if ($wb -and $wb.Count -gt 0) { throw 'Phiếu mủ lẻ LỌT vào bộ lọc của app cân xe' }
  Write-Output "6/6 Không lẫn vào app cân xe ........... OK"
}
catch { Write-Output "  THẤT BẠI: $($_.Exception.Message)"; }
finally {
  if ($ticketId) {
    try {
      $null = Rest DELETE "weighbridge_tickets?id=eq.$ticketId" $null $null
      Write-Output ''
      Write-Output "Đã xoá phiếu thử $code (dòng bao tự xoá theo CASCADE)."
    } catch { Write-Output "  ⚠ KHÔNG xoá được phiếu thử $code — xoá tay giúp." }
  }
}
