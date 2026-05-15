// ============================================================================
// SALES CONTRACT EMAIL SERVICE
// File: src/services/sales/salesContractEmailService.ts
//
// Email tự động ở 6 stage của workflow HĐ bán:
//   1. SUBMITTED        — Sale → Phú LV + Minh (HĐ mới cần kiểm tra)
//   2. RESUBMITTED      — Sale → Phú LV + Minh (sửa xong, trình lại)
//   3. REJECTED         — Phú LV → Sale (trả lại với lý do)
//   4. APPROVED_SIGN    — Phú LV → Trung/Huy (chờ ký + đóng dấu)
//   5. APPROVED_INFO    — Phú LV → Sale (thông báo đã duyệt)
//   6. SIGNED           — Trung/Huy → Sale + Phú LV (HĐ pháp lý sẵn sàng)
//
// Templates ưu tiên đọc trên ĐIỆN THOẠI:
//   - Max width 600px (responsive)
//   - Font 16px body, 22-28px heading
//   - CTA buttons ≥44px tap target
//   - Inline CSS only (mail clients strip <style>)
//   - System fonts (-apple-system, Segoe UI)
//   - Brand color #1B4D3E
// ============================================================================

import { supabase } from '../../lib/supabase'

const APP_URL = 'https://huyanhrubber.vn'
const PRIMARY = '#1B4D3E'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type ContractEmailEvent =
  | 'contract_submitted'
  | 'contract_resubmitted'
  | 'contract_rejected'
  | 'contract_approved_sign'
  | 'contract_approved_info'
  | 'contract_signed'

export interface ContractEmailContext {
  contract_no: string
  revision_no: number
  buyer_name?: string
  grade?: string
  quantity?: string
  unit_price?: string
  amount?: string
  incoterm?: string
  sender_name: string          // Người trigger event (Sale/Phú LV/Trung/Huy)
  rejection_reason?: string    // Cho event 'rejected'
  bank_summary?: string        // Cho event 'approved' (preview bank đã chốt)
  signer_name?: string         // Cho event 'signed'
  sales_order_id: string       // Để tạo URL deep-link
}

// ----------------------------------------------------------------------------
// Mobile-first HTML helpers
// ----------------------------------------------------------------------------

/** Wrap toàn bộ email trong container responsive */
function _wrap(opts: {
  headerBg: string
  headerIcon: string
  headerTitle: string
  bodyHtml: string
  ctaText: string
  ctaUrl: string
  ctaColor?: string
  footerNote?: string
}): string {
  const ctaColor = opts.ctaColor || PRIMARY
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.headerTitle}</title>
</head>
<body style="margin:0;padding:16px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

        <!-- HEADER -->
        <tr>
          <td style="background:${opts.headerBg};padding:24px 20px;text-align:center;">
            <div style="font-size:40px;line-height:1;margin-bottom:8px;">${opts.headerIcon}</div>
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;line-height:1.3;">
              ${opts.headerTitle}
            </h1>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:24px 20px;">
            ${opts.bodyHtml}

            <!-- CTA Button — ≥44px tap target -->
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0 12px;">
              <tr><td align="center">
                <a href="${opts.ctaUrl}"
                   style="display:inline-block;background:${ctaColor};color:#ffffff;
                          padding:16px 32px;border-radius:10px;text-decoration:none;
                          font-size:16px;font-weight:600;line-height:1.2;
                          min-width:200px;text-align:center;">
                  ${opts.ctaText} →
                </a>
              </td></tr>
            </table>

            <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.5;">
              Hoặc copy link sau vào trình duyệt:<br>
              <span style="color:${PRIMARY};word-break:break-all;font-size:11px;">${opts.ctaUrl}</span>
            </p>

            ${opts.footerNote ? `
            <p style="margin:20px 0 0;padding:12px;background:#f9fafb;border-radius:6px;color:#6b7280;font-size:12px;line-height:1.5;text-align:center;">
              ${opts.footerNote}
            </p>` : ''}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f9fafb;padding:16px 20px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
              <strong style="color:#6b7280;">HUY ANH RUBBER COMPANY LIMITED</strong><br>
              Tự động từ Huy Anh ERP • <a href="${APP_URL}" style="color:${PRIMARY};text-decoration:none;">huyanhrubber.vn</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Card thông tin tóm tắt HĐ (responsive — stack vertical trên mobile) */
function _summaryCard(ctx: ContractEmailContext): string {
  const rows: { label: string; value: string }[] = []
  rows.push({ label: '📄 Số HĐ', value: `<strong>${ctx.contract_no}</strong>${ctx.revision_no > 1 ? ` <span style="color:#6b7280;">rev #${ctx.revision_no}</span>` : ''}` })
  if (ctx.buyer_name) rows.push({ label: '🏢 Khách hàng', value: ctx.buyer_name })
  if (ctx.grade) rows.push({ label: '🏷 Grade', value: ctx.grade })
  if (ctx.quantity) rows.push({ label: '⚖ Số lượng', value: `${ctx.quantity} MT` })
  if (ctx.unit_price) rows.push({ label: '💵 Đơn giá', value: `$${ctx.unit_price}/MT` })
  if (ctx.amount) rows.push({ label: '💰 Tổng', value: `<strong style="color:${PRIMARY};">$${ctx.amount}</strong>` })
  if (ctx.incoterm) rows.push({ label: '🚢 Incoterm', value: ctx.incoterm })

  return `
  <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-bottom:16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      ${rows.map((r) => `
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#6b7280;width:130px;vertical-align:top;">${r.label}</td>
          <td style="padding:6px 0;font-size:14px;color:#1f2937;line-height:1.5;">${r.value}</td>
        </tr>`).join('')}
    </table>
  </div>`
}

/** Box ghi chú (warning / info / danger) */
function _noticeBox(opts: { type: 'danger' | 'warning' | 'success' | 'info'; title: string; body: string }): string {
  const colors = {
    danger:  { bg: '#fef2f2', border: '#dc2626', text: '#7f1d1d' },
    warning: { bg: '#fffbeb', border: '#d97706', text: '#78350f' },
    success: { bg: '#f0fdf4', border: '#16a34a', text: '#14532d' },
    info:    { bg: '#eff6ff', border: '#1d4ed8', text: '#1e3a8a' },
  }
  const c = colors[opts.type]
  return `
  <div style="margin:16px 0;padding:14px 16px;background:${c.bg};border-left:4px solid ${c.border};border-radius:6px;">
    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:${c.text};">${opts.title}</p>
    <p style="margin:0;font-size:14px;color:${c.text};line-height:1.6;">${opts.body}</p>
  </div>`
}

// ----------------------------------------------------------------------------
// 6 TEMPLATES
// ----------------------------------------------------------------------------

function buildEmail(event: ContractEmailEvent, ctx: ContractEmailContext): { subject: string; html: string } {
  const detailUrl = `${APP_URL}/sales/orders/${ctx.sales_order_id}?tab=contract`
  const reviewUrl = `${APP_URL}/sales/contracts/review`
  const signUrl = `${APP_URL}/sales/contracts/sign`

  switch (event) {
    // ─── 1. SUBMITTED — Sale → Phú LV + Minh ────────────────────────────────
    case 'contract_submitted': {
      return {
        subject: `📤 HĐ mới ${ctx.contract_no} cần kiểm tra + nhập bank`,
        html: _wrap({
          headerBg: PRIMARY,
          headerIcon: '📤',
          headerTitle: 'HĐ mới cần kiểm tra',
          bodyHtml: `
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              <strong>${ctx.sender_name}</strong> vừa trình HĐ mới — bạn cần kiểm tra
              các trường + <strong>nhập bank info</strong> để chuyển sang Trung/Huy ký.
            </p>
            ${_summaryCard(ctx)}
            ${_noticeBox({
              type: 'info',
              title: '⚡ Bước tiếp theo của bạn',
              body: 'Mở queue Kiểm tra → chọn quick-pick ngân hàng (7 banks có sẵn) → bấm "Duyệt + Trình ký".',
            })}
          `,
          ctaText: 'Mở queue Kiểm tra HĐ',
          ctaUrl: reviewUrl,
          footerNote: 'Email tự động khi Sale trình HĐ. Nếu HĐ không thuộc về bạn, có thể bỏ qua — Phú LV hoặc Minh LD sẽ xử lý.',
        }),
      }
    }

    // ─── 2. RESUBMITTED — Sale → Phú LV + Minh (sửa xong) ───────────────────
    case 'contract_resubmitted': {
      return {
        subject: `🔄 HĐ ${ctx.contract_no} rev #${ctx.revision_no} đã sửa — trình lại`,
        html: _wrap({
          headerBg: '#0ea5e9',
          headerIcon: '🔄',
          headerTitle: 'HĐ đã sửa — trình lại',
          bodyHtml: `
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              <strong>${ctx.sender_name}</strong> đã sửa HĐ theo lý do bạn trả lại trước đó
              và trình lại <strong>revision #${ctx.revision_no}</strong>. Mở queue để kiểm tra lại.
            </p>
            ${_summaryCard(ctx)}
            ${_noticeBox({
              type: 'info',
              title: 'Lưu ý',
              body: 'Đây là revision mới — bank info đã reset, bạn cần chọn lại nếu khác lần trước.',
            })}
          `,
          ctaText: 'Mở queue Kiểm tra',
          ctaUrl: reviewUrl,
          ctaColor: '#0ea5e9',
        }),
      }
    }

    // ─── 3. REJECTED — Phú LV → Sale (trả lại) ──────────────────────────────
    case 'contract_rejected': {
      return {
        subject: `❌ HĐ ${ctx.contract_no} bị trả lại — cần sửa`,
        html: _wrap({
          headerBg: '#dc2626',
          headerIcon: '❌',
          headerTitle: 'HĐ bị trả lại',
          bodyHtml: `
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              <strong>${ctx.sender_name}</strong> đã trả lại HĐ. Vui lòng đọc lý do bên dưới,
              sửa các trường được report, rồi bấm <strong>"Sửa & Trình lại"</strong> trong ERP.
            </p>
            ${_summaryCard(ctx)}
            ${_noticeBox({
              type: 'danger',
              title: '📋 Lý do trả lại',
              body: ctx.rejection_reason || '(không có ghi chú)',
            })}
            ${_noticeBox({
              type: 'info',
              title: '⚡ Bước tiếp theo của bạn',
              body: 'Mở HĐ trong ERP → bấm nút "Sửa & Trình lại" → cập nhật các field được report → submit revision mới.',
            })}
          `,
          ctaText: 'Mở HĐ để sửa',
          ctaUrl: detailUrl,
          ctaColor: '#dc2626',
        }),
      }
    }

    // ─── 4. APPROVED_SIGN — Phú LV → Trung/Huy (chờ ký) ─────────────────────
    case 'contract_approved_sign': {
      return {
        subject: `✍️ HĐ ${ctx.contract_no} chờ ký + đóng dấu`,
        html: _wrap({
          headerBg: '#d97706',
          headerIcon: '✍️',
          headerTitle: 'HĐ chờ ký + đóng dấu',
          bodyHtml: `
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              <strong>${ctx.sender_name}</strong> đã duyệt HĐ + nhập bank info xong.
              HĐ đang chờ bạn ký + đóng dấu để chuyển trạng thái pháp lý.
            </p>
            ${_summaryCard(ctx)}
            ${ctx.bank_summary ? _noticeBox({
              type: 'info',
              title: '🏦 Bank info đã chốt',
              body: ctx.bank_summary,
            }) : ''}
            ${_noticeBox({
              type: 'warning',
              title: '⚡ Bước tiếp theo của bạn',
              body: 'Mở queue Ký HĐ → tải SC/PI .docx → in giấy → ký + đóng dấu → upload PDF FINAL trở lại ERP.',
            })}
          `,
          ctaText: 'Mở queue Ký HĐ',
          ctaUrl: signUrl,
          ctaColor: '#d97706',
        }),
      }
    }

    // ─── 5. APPROVED_INFO — Phú LV → Sale (thông báo) ───────────────────────
    case 'contract_approved_info': {
      return {
        subject: `✅ HĐ ${ctx.contract_no} đã được duyệt`,
        html: _wrap({
          headerBg: '#16a34a',
          headerIcon: '✅',
          headerTitle: 'HĐ đã được duyệt',
          bodyHtml: `
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              <strong>${ctx.sender_name}</strong> đã duyệt HĐ và nhập bank info xong.
              HĐ đang chờ Trung/Huy ký + đóng dấu. Bạn sẽ nhận email lần nữa khi HĐ ký xong.
            </p>
            ${_summaryCard(ctx)}
            ${ctx.bank_summary ? _noticeBox({
              type: 'success',
              title: '🏦 Bank info đã chốt',
              body: ctx.bank_summary,
            }) : ''}
            ${_noticeBox({
              type: 'info',
              title: 'Lưu ý',
              body: 'KHÔNG gửi bản này cho khách. Đợi đến khi HĐ có chữ ký + đóng dấu (FINAL) mới gửi KH.',
            })}
          `,
          ctaText: 'Mở chi tiết HĐ',
          ctaUrl: detailUrl,
          ctaColor: '#16a34a',
        }),
      }
    }

    // ─── 6. SIGNED — Trung/Huy → Sale + Phú LV ──────────────────────────────
    case 'contract_signed': {
      return {
        subject: `🎉 HĐ ${ctx.contract_no} đã ký + đóng dấu — sẵn sàng gửi KH`,
        html: _wrap({
          headerBg: PRIMARY,
          headerIcon: '🎉',
          headerTitle: 'HĐ pháp lý sẵn sàng',
          bodyHtml: `
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              <strong>${ctx.signer_name || ctx.sender_name}</strong> đã ký + đóng dấu HĐ.
              Bản pháp lý đã được upload lên ERP. Sale có thể tải về và gửi cho khách.
            </p>
            ${_summaryCard(ctx)}
            ${_noticeBox({
              type: 'success',
              title: '✅ HĐ FINAL đã upload',
              body: 'Bản scan PDF (ký + đóng dấu 2 bên) đã có trong folder "HĐ FINAL". Đây là bản pháp lý — Sale gửi cho KH.',
            })}
            ${_noticeBox({
              type: 'info',
              title: '⚡ Bước tiếp theo',
              body: 'Mở HĐ → tab Tài liệu → folder "✅ HĐ FINAL" → tải PDF → gửi mail khách hàng + lưu hồ sơ.',
            })}
          `,
          ctaText: 'Tải HĐ FINAL gửi KH',
          ctaUrl: detailUrl,
        }),
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Send helpers
// ----------------------------------------------------------------------------

/** Lookup email của employee theo ID. */
async function _getEmployeeEmails(employeeIds: (string | null | undefined)[]): Promise<{ id: string; email: string; full_name: string }[]> {
  const ids = employeeIds.filter((x): x is string => !!x)
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('employees')
    .select('id, email, full_name')
    .in('id', ids)
  if (error || !data) {
    console.error('[salesContractEmailService] getEmployeeEmails fail:', error)
    return []
  }
  return data.filter((e) => !!e.email)
}

/** Lookup email theo danh sách email string (dùng cho Trung/Huy whitelist). */
async function _getEmployeesByEmails(emails: string[]): Promise<{ id: string; email: string; full_name: string }[]> {
  if (emails.length === 0) return []
  const lowercaseEmails = emails.map((e) => e.toLowerCase())
  const { data, error } = await supabase
    .from('employees')
    .select('id, email, full_name')
    .in('email', lowercaseEmails)
  if (error || !data) return []
  return data
}

/** Gọi Edge Function `send-email` — pure HTML body, no template parse. */
async function _sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: { to, subject, body: html },
    })
    if (error) {
      console.error('[salesContractEmailService] sendEmail error:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('[salesContractEmailService] sendEmail exception:', e)
    return false
  }
}

/** Log email vào DB (best-effort, không block nếu fail) */
async function _logEmail(to: string, event: ContractEmailEvent, subject: string, status: 'sent' | 'failed') {
  try {
    await supabase.from('email_notifications').insert({
      recipient_email: to,
      notification_type: event,
      subject,
      status,
      sent_at: new Date().toISOString(),
    })
  } catch (e) {
    // silent — log not critical
  }
}

// ----------------------------------------------------------------------------
// Public triggers
// ----------------------------------------------------------------------------

export const salesContractEmailService = {
  /** Notify reviewers (Phú LV + Minh LD) khi Sale submit/resubmit HĐ. */
  async notifySubmitted(params: {
    reviewerEmails: string[]    // ALLOWED_REVIEWER_EMAILS
    ctx: ContractEmailContext
    isResubmit?: boolean
  }): Promise<void> {
    const recipients = await _getEmployeesByEmails(params.reviewerEmails)
    if (recipients.length === 0) return

    const event: ContractEmailEvent = params.isResubmit
      ? 'contract_resubmitted'
      : 'contract_submitted'
    const { subject, html } = buildEmail(event, params.ctx)

    await Promise.all(
      recipients.map(async (r) => {
        const ok = await _sendEmail(r.email, subject, html)
        await _logEmail(r.email, event, subject, ok ? 'sent' : 'failed')
      }),
    )
  },

  /** Notify Sale khi Phú LV trả lại. */
  async notifyRejected(params: {
    saleEmployeeId: string | null | undefined
    ctx: ContractEmailContext
  }): Promise<void> {
    const recipients = await _getEmployeeEmails([params.saleEmployeeId])
    if (recipients.length === 0) return

    const { subject, html } = buildEmail('contract_rejected', params.ctx)
    const r = recipients[0]
    const ok = await _sendEmail(r.email, subject, html)
    await _logEmail(r.email, 'contract_rejected', subject, ok ? 'sent' : 'failed')
  },

  /** Notify Trung/Huy (signers) + Sale (info) khi Phú LV approve. */
  async notifyApproved(params: {
    signerEmails: string[]            // ALLOWED_SIGNER_EMAILS
    saleEmployeeId: string | null | undefined
    ctx: ContractEmailContext
  }): Promise<void> {
    const [signers, sales] = await Promise.all([
      _getEmployeesByEmails(params.signerEmails),
      _getEmployeeEmails([params.saleEmployeeId]),
    ])

    // To Trung/Huy: urgent — chờ ký
    const signMail = buildEmail('contract_approved_sign', params.ctx)
    await Promise.all(
      signers.map(async (r) => {
        const ok = await _sendEmail(r.email, signMail.subject, signMail.html)
        await _logEmail(r.email, 'contract_approved_sign', signMail.subject, ok ? 'sent' : 'failed')
      }),
    )

    // To Sale: thông báo đã duyệt
    if (sales.length > 0) {
      const infoMail = buildEmail('contract_approved_info', params.ctx)
      const r = sales[0]
      const ok = await _sendEmail(r.email, infoMail.subject, infoMail.html)
      await _logEmail(r.email, 'contract_approved_info', infoMail.subject, ok ? 'sent' : 'failed')
    }
  },

  /** Notify Sale + Phú LV khi Trung/Huy ký xong. */
  async notifySigned(params: {
    saleEmployeeId: string | null | undefined
    reviewerEmployeeId: string | null | undefined
    ctx: ContractEmailContext
  }): Promise<void> {
    const recipients = await _getEmployeeEmails([
      params.saleEmployeeId,
      params.reviewerEmployeeId,
    ])
    if (recipients.length === 0) return

    const { subject, html } = buildEmail('contract_signed', params.ctx)
    await Promise.all(
      recipients.map(async (r) => {
        const ok = await _sendEmail(r.email, subject, html)
        await _logEmail(r.email, 'contract_signed', subject, ok ? 'sent' : 'failed')
      }),
    )
  },
}
