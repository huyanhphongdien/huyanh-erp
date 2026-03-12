// ============================================================================
// Edge Function: send-teams-report
// Gửi báo cáo tổng hợp vào Group Chat Teams
// Chat: "Hướng dẫn sử dụng và báo lỗi ERP Huy Anh Phong Điền"
// Chat ID: 19:7a1cdec777734455ad6e318cbd4d2205@thread.v2
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TENANT_ID     = Deno.env.get("AZURE_TENANT_ID")!;
const CLIENT_ID     = Deno.env.get("AZURE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
const CHAT_ID       = "19:7a1cdec777734455ad6e318cbd4d2205@thread.v2";
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// AUTH
// ============================================================================
async function getAccessToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope:         "https://graph.microsoft.com/.default",
        grant_type:    "client_credentials",
      }),
    }
  );
  if (!res.ok) throw new Error(`Auth failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// ============================================================================
// FETCH DATA
// ============================================================================
async function fetchReportData(supabase: any) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  // Điểm danh hôm nay
  const { data: attendance } = await supabase
    .from("attendance")
    .select("status, employee:employees(full_name)")
    .eq("date", todayStr);

  const presentCount = attendance?.filter((a: any) => a.status === "present").length || 0;
  const absentCount  = attendance?.filter((a: any) => a.status === "absent").length  || 0;
  const lateCount    = attendance?.filter((a: any) => a.status === "late").length    || 0;
  const absentNames  = (attendance || [])
    .filter((a: any) => a.status === "absent")
    .map((a: any) => {
      const emp = Array.isArray(a.employee) ? a.employee[0] : a.employee;
      return emp?.full_name || "N/A";
    })
    .slice(0, 5);

  // Công việc
  const { data: tasks } = await supabase
    .from("tasks")
    .select("status, evaluation_status, updated_at");

  const inProgress      = tasks?.filter((t: any) => t.status === "in_progress").length || 0;
  const overdueCount    = tasks?.filter((t: any) => t.status === "overdue").length || 0;
  const pendingApproval = tasks?.filter((t: any) => t.evaluation_status === "pending_approval").length || 0;
  const weekCompleted   = tasks?.filter((t: any) =>
    t.status === "finished" && t.updated_at?.startsWith && t.updated_at >= weekStartStr
  ).length || 0;

  // Dự án
  const { data: projects } = await supabase
    .from("projects")
    .select("name, progress, health_status, status")
    .not("status", "in", '("completed","cancelled")');

  const activeProjects = projects?.length || 0;
  const atRisk = (projects || []).filter((p: any) =>
    p.health_status === "red" || p.health_status === "yellow"
  );

  return {
    dateLabel: today.toLocaleDateString("vi-VN", {
      weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    }),
    attendance: { presentCount, absentCount, lateCount, absentNames },
    tasks: { inProgress, overdueCount, pendingApproval, weekCompleted },
    projects: { activeProjects, atRisk },
  };
}

// ============================================================================
// BUILD ADAPTIVE CARD
// ============================================================================
function buildCard(d: any): string {
  const noAbsent  = d.attendance.absentCount === 0;
  const noOverdue = d.tasks.overdueCount === 0;
  const noRisk    = d.projects.atRisk.length === 0;

  const absentText = d.attendance.absentNames.length > 0
    ? d.attendance.absentNames.join(", ") +
      (d.attendance.absentCount > 5 ? ` (+${d.attendance.absentCount - 5} người)` : "")
    : "Không có";

  const atRiskText = d.projects.atRisk.length > 0
    ? d.projects.atRisk.map((p: any) => `${p.name} (${p.progress}%)`).join(", ")
    : "Tất cả bình thường";

  // Gửi dạng HTML đơn giản — hoạt động với mọi loại chat Teams
  const html = `
<h2>📊 BÁO CÁO TỔNG HỢP — HUY ANH ERP</h2>
<p><em>${d.dateLabel}</em></p>
<hr/>
<h3>${noAbsent ? "✅" : "⚠️"} ĐIỂM DANH HÔM NAY</h3>
<table>
<tr><td>✅ Có mặt</td><td><b>${d.attendance.presentCount} người</b></td></tr>
<tr><td>❌ Vắng mặt</td><td><b>${d.attendance.absentCount} người</b></td></tr>
<tr><td>⏰ Đi trễ</td><td><b>${d.attendance.lateCount} người</b></td></tr>
${d.attendance.absentCount > 0 ? `<tr><td>👤 Vắng</td><td>${absentText}</td></tr>` : ""}
</table>
<hr/>
<h3>${noOverdue ? "✅" : "🔴"} CÔNG VIỆC</h3>
<table>
<tr><td>🔄 Đang làm</td><td><b>${d.tasks.inProgress}</b></td></tr>
<tr><td>🔴 Quá hạn</td><td><b>${d.tasks.overdueCount}</b></td></tr>
<tr><td>⏳ Chờ duyệt</td><td><b>${d.tasks.pendingApproval}</b></td></tr>
<tr><td>📅 Tuần này hoàn thành</td><td><b>${d.tasks.weekCompleted} công việc</b></td></tr>
</table>
<hr/>
<h3>${noRisk ? "✅" : "⚠️"} DỰ ÁN</h3>
<table>
<tr><td>🗂️ Đang triển khai</td><td><b>${d.projects.activeProjects}</b></td></tr>
<tr><td>⚠️ Cần chú ý</td><td><b>${d.projects.atRisk.length}</b></td></tr>
${d.projects.atRisk.length > 0 ? `<tr><td colspan="2">${atRiskText}</td></tr>` : ""}
</table>
<hr/>
<p><a href="https://huyanh-erp.vercel.app">🔗 Mở Huy Anh ERP</a></p>
  `.trim();

  return html;
}

// ============================================================================
// SEND TO GROUP CHAT
// ============================================================================
async function sendToChat(token: string, htmlBody: string): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(CHAT_ID)}/messages`;
  const payload = {
    body: {
      contentType: "html",
      content: htmlBody,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Teams API failed: ${res.status} — ${err}`);
  }
  console.log("✅ Sent to Teams group chat successfully");
}

// ============================================================================
// MAIN
// ============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    console.log("📊 Fetching data...");
    const data = await fetchReportData(supabase);

    console.log("🎨 Building card...");
    const html = buildCard(data);

    console.log("🔐 Getting token...");
    const token = await getAccessToken();

    console.log("📤 Sending to chat...");
    await sendToChat(token, html);

    return new Response(
      JSON.stringify({ success: true, chat_id: CHAT_ID }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("❌ Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});