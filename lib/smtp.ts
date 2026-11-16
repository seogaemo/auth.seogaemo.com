/**
 * 최소 SMTP 클라이언트 (STARTTLS + AUTH PLAIN). Cloudflare Workers TCP 소켓을 쓴다.
 *
 * cloudflare:sockets는 Workers 런타임에만 있어서 번들러가 건드리지 않게 동적으로 불러온다.
 */

interface WorkerSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  startTls(): WorkerSocket;
  close(): Promise<void>;
}

type Connect = (
  address: { hostname: string; port: number },
  options: { secureTransport: "off" | "on" | "starttls" },
) => WorkerSocket;

async function loadConnect(): Promise<Connect> {
  // webpackIgnore: webpack이 번들하지 않고 그대로 둔다.
  // .catch: OpenNext의 esbuild가 못 찾는 모듈을 빌드 오류 대신 실행 시점 문제로 넘긴다.
  // 마지막 wrangler 번들은 cloudflare:* 를 런타임 모듈로 알아서 남겨 둔다.
  const mod = (await import(/* webpackIgnore: true */ "cloudflare:sockets").catch((error: unknown) => {
    throw new Error(`cloudflare:sockets is not available: ${String(error)}`);
  })) as unknown as { connect: Connect };
  return mod.connect;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class SmtpConnection {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = "";

  constructor(private socket: WorkerSocket) {
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  /** 응답 하나 (여러 줄이면 마지막 "250 " 줄까지)를 읽고 코드를 확인한다 */
  async expect(code: number, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const lines = this.buffer.split("\r\n");
      const done = lines.slice(0, -1).findIndex((line) => /^\d{3} /.test(line));
      if (done >= 0) {
        const response = lines.slice(0, done + 1);
        this.buffer = lines.slice(done + 1).join("\r\n");
        const got = Number(response[done].slice(0, 3));
        if (got !== code) throw new Error(`SMTP expected ${code}, got: ${response.join(" | ")}`);
        return response;
      }
      if (Date.now() > deadline) throw new Error("SMTP response timeout");
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SMTP response timeout")), Math.max(0, deadline - Date.now())),
      );
      const { value, done: closed } = await Promise.race([this.reader.read(), timer]);
      if (closed) throw new Error("SMTP connection closed");
      this.buffer += decoder.decode(value, { stream: true });
    }
  }

  async send(line: string) {
    await this.writer.write(encoder.encode(`${line}\r\n`));
  }

  async command(line: string, code: number) {
    await this.send(line);
    return this.expect(code);
  }

  /** STARTTLS 뒤에는 TLS 소켓으로 갈아탄다 */
  upgrade() {
    this.reader.releaseLock();
    this.writer.releaseLock();
    this.socket = this.socket.startTls();
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
    this.buffer = "";
  }

  async close() {
    try {
      await this.writer.close();
    } catch {}
    await this.socket.close().catch(() => {});
  }
}

function base64Utf8(value: string) {
  let binary = "";
  for (const byte of encoder.encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** RFC 2047: 한글 제목, 이름 */
function encodeWord(value: string) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${base64Utf8(value)}?=`;
}

function wrap76(value: string) {
  return value.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

export interface MailAddress {
  name?: string;
  email: string;
}

export interface SmtpOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  /** EHLO에 쓰는 이름 */
  clientName: string;
}

export function buildMessage(params: {
  from: MailAddress;
  to: string;
  subject: string;
  text: string;
  html: string;
  messageIdDomain: string;
}) {
  const boundary = `sg-${crypto.randomUUID()}`;
  const from = params.from.name
    ? `${encodeWord(params.from.name)} <${params.from.email}>`
    : params.from.email;

  return [
    `From: ${from}`,
    `To: <${params.to}>`,
    `Subject: ${encodeWord(params.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${params.messageIdDomain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(base64Utf8(params.text)),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(base64Utf8(params.html)),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** 메일 한 통을 보낸다. 실패하면 예외를 던진다. */
export async function smtpSend(options: SmtpOptions, envelope: { from: string; to: string }, message: string) {
  const connect = await loadConnect();
  const smtp = new SmtpConnection(
    connect({ hostname: options.host, port: options.port }, { secureTransport: "starttls" }),
  );

  try {
    await smtp.expect(220);
    await smtp.command(`EHLO ${options.clientName}`, 250);
    await smtp.command("STARTTLS", 220);
    smtp.upgrade();
    await smtp.command(`EHLO ${options.clientName}`, 250);
    await smtp.command(`AUTH PLAIN ${base64Utf8(`\0${options.username}\0${options.password}`)}`, 235);
    await smtp.command(`MAIL FROM:<${envelope.from}>`, 250);
    await smtp.command(`RCPT TO:<${envelope.to}>`, 250);
    await smtp.command("DATA", 354);
    // 줄 맨 앞의 "."은 하나 더 붙인다 (dot-stuffing)
    const body = message.replace(/\r\n\./g, "\r\n..");
    await smtp.send(`${body}\r\n.`);
    await smtp.expect(250, 30_000);
    await smtp.send("QUIT");
  } finally {
    await smtp.close();
  }
}
