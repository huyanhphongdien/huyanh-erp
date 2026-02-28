// supabase/functions/send-email/index.ts
// Edge Function để gửi email qua Microsoft Graph API
// Dự án: Huy Anh ERP System

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Lấy environment variables
const TENANT_ID = Deno.env.get("AZURE_TENANT_ID");
const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM");

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  isHtml?: boolean;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function getAccessToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Token error:", error);
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data: TokenResponse = await response.json();
  return data.access_token;
}

function formatRecipients(emails: string | string[]): Array<{ emailAddress: { address: string } }> {
  const emailList = Array.isArray(emails) ? emails : [emails];
  return emailList.map((email) => ({
    emailAddress: { address: email.trim() },
  }));
}

async function sendEmail(accessToken: string, request: EmailRequest): Promise<boolean> {
  const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${EMAIL_FROM}/sendMail`;

  const message: Record<string, unknown> = {
    subject: request.subject,
    body: {
      contentType: request.isHtml !== false ? "HTML" : "Text",
      content: request.body,
    },
    toRecipients: formatRecipients(request.to),
  };

  if (request.cc) {
    message.ccRecipients = formatRecipients(request.cc);
  }

  if (request.bcc) {
    message.bccRecipients = formatRecipients(request.bcc);
  }

  const response = await fetch(sendMailUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Send email error:", error);
    throw new Error(`Failed to send email: ${response.status} - ${error}`);
  }

  return true;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !EMAIL_FROM) {
      throw new Error("Missing required environment variables");
    }

    const emailRequest: EmailRequest = await req.json();

    if (!emailRequest.to || !emailRequest.subject || !emailRequest.body) {
      throw new Error("Missing required fields: to, subject, body");
    }

    console.log(`Sending email to: ${emailRequest.to}`);

    const accessToken = await getAccessToken();
    await sendEmail(accessToken, emailRequest);

    console.log("Email sent successfully!");

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});