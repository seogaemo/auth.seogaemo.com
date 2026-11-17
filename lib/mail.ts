import { getCloudflareContext } from "@opennextjs/cloudflare";

import { buildMessage, smtpSend } from "./smtp";

/**
 * SMTP 메일 발송 (smtp2go). Workers TCP 소켓으로 직접 보낸다 (lib/smtp.ts).
 * next dev(Node)에서는 cloudflare:sockets가 없어서 보낼 수 없다. wrangler dev나 배포 환경에서 확인한다.
 */
export function isMailConfigured() {
  const env = getCloudflareContext().env;
  return Boolean(env.SMTP_HOST && env.SMTP_USERNAME && env.SMTP_PASSWORD && env.MAIL_FROM);
}

function parseFrom(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { name: match[1] || undefined, email: match[2] } : { email: value.trim() };
}

export async function sendMail(message: { to: string; subject: string; text: string; html: string }) {
  const env = getCloudflareContext().env;
  if (!isMailConfigured()) throw new Error("mail is not configured");

  // 로컬 개발: 실제로 보내지 않고 로그로만 남긴다. localhost issuer에서만 동작한다.
  if (env.MAIL_DEV_LOG === "1" && env.ISSUER?.startsWith("http://localhost")) {
    console.log(`[mail:dev] to=${message.to} subject=${message.subject}`);
    return;
  }

  const from = parseFrom(env.MAIL_FROM!);
  const raw = buildMessage({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    messageIdDomain: from.email.split("@")[1] ?? "seogaemo.com",
  });
  await smtpSend(
    {
      host: env.SMTP_HOST!,
      port: Number(env.SMTP_PORT ?? 2525),
      username: env.SMTP_USERNAME!,
      password: env.SMTP_PASSWORD!,
      clientName: new URL(env.ISSUER).hostname,
    },
    { from: from.email, to: message.to },
    raw,
  );
}

const PURPOSE_TEXT = {
  signup: { title: "회원가입", lead: "회원가입을 마치려면 아래 코드를 입력하세요." },
  login: { title: "로그인", lead: "로그인하려면 아래 코드를 입력하세요." },
  reset: { title: "비밀번호 재설정", lead: "비밀번호를 다시 설정하려면 아래 코드를 입력하세요." },
} as const;

export type EmailCodePurpose = keyof typeof PURPOSE_TEXT;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function emailCodeMessage(purpose: EmailCodePurpose, serviceName: string, code: string) {
  const { title, lead } = PURPOSE_TEXT[purpose];
  const minutes = 10;
  const subject = `[${serviceName}] ${title} 인증 코드 ${code}`;
  const text = [
    `${serviceName} ${title}`,
    "",
    lead,
    "",
    code,
    "",
    `코드는 ${minutes}분 동안 쓸 수 있어요. 직접 요청하지 않았다면 이 메일은 무시하세요.`,
    "",
    "Seogaemo SSO",
  ].join("\n");

  const name = escapeHtml(serviceName);
  const html = `<!doctype html><html lang="ko"><body style="margin:0;padding:32px 16px;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard',sans-serif;color:#101016">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:6px solid #235cc3">
<tr><td style="padding:28px">
<p style="margin:0 0 4px;font-size:13px;color:#777783">${name}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.35">${title} 인증 코드</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#5a5a66">${lead}</p>
<p style="margin:0 0 20px;padding:16px;background:#f4f4f6;text-align:center;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:32px;font-weight:600;letter-spacing:8px">${code}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#9797a0">코드는 ${minutes}분 동안 쓸 수 있어요. 직접 요청하지 않았다면 이 메일은 무시하세요.</p>
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#9797a0">Seogaemo SSO</p>
</td></tr></table></body></html>`;

  return { subject, text, html };
}

/** 서비스 관리자로 추가됐다는 알림 */
export function memberAddedMessage(serviceName: string, inviter: string, consoleUrl: string) {
  const subject = `[Seogaemo SSO] ${serviceName} 관리자로 추가됐어요`;
  const lead = `${inviter}님이 ${serviceName} 앱의 관리자로 추가했어요. 이 이메일로 콘솔에 로그인하면 바로 관리할 수 있어요.`;
  const text = [subject, "", lead, "", consoleUrl, "", "Seogaemo SSO"].join("\n");

  const html = `<!doctype html><html lang="ko"><body style="margin:0;padding:32px 16px;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard',sans-serif;color:#101016">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:6px solid #235cc3">
<tr><td style="padding:28px">
<p style="margin:0 0 4px;font-size:13px;color:#777783">Seogaemo SSO</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.35">${escapeHtml(serviceName)} 관리자로 추가됐어요</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#5a5a66">${escapeHtml(lead)}</p>
<a href="${escapeHtml(consoleUrl)}" style="display:inline-block;padding:12px 20px;background:#2c73f4;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">콘솔 열기</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#9797a0">Seogaemo SSO</p>
</td></tr></table></body></html>`;

  return { subject, text, html };
}
