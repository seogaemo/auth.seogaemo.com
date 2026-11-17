import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { LoginTransaction } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { getIssuer, type Provider } from "./config";
import { randomToken } from "./crypto";

/**
 * 패스키 (WebAuthn).
 *
 * 패스키는 서비스가 아니라 이메일 하나에 붙는다 (PasskeyOwner). RP는 이 서버 하나라서
 * 한 번 저장하면 모든 Seogaemo 서비스에서 쓸 수 있다. 패스키로 로그인하면 "이 이메일의 주인"이
 * 확인된 것으로 보고, 이메일 코드와 똑같이 그 서비스의 사용자를 찾거나 만든다 (actions/login.ts).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 이메일, 비밀번호, 이메일 코드 중 하나라도 켜진 서비스에서는 패스키도 켜진다 (콘솔에서 따로 고르지 않는다) */
export function passkeyAvailable(providers: Provider[]) {
  return providers.includes("email") || providers.includes("password");
}

function relyingParty() {
  const issuer = new URL(getIssuer());
  return { rpName: "Seogaemo", rpID: issuer.hostname, origin: issuer.origin };
}

function fromBase64url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function toBase64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseTransports(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : undefined;
  } catch {
    return undefined;
  }
}

/** 이메일의 패스키 목록 (오래된 순) */
export async function listPasskeys(email: string | null | undefined) {
  if (!email) return [];
  return getPrisma().passkey.findMany({
    where: { owner: { email: email.toLowerCase() } },
    orderBy: { createdAt: "asc" },
  });
}

/** 이메일의 패스키 하나 지우기. 그 이메일 소유가 아니면 아무것도 지우지 않는다. */
export async function deletePasskey(email: string, passkeyId: string) {
  const { count } = await getPrisma().passkey.deleteMany({
    where: { id: passkeyId, owner: { email: email.toLowerCase() } },
  });
  return count > 0;
}

async function ownerForEmail(email: string) {
  return getPrisma().passkeyOwner.upsert({
    where: { email },
    create: { id: randomToken(16), email },
    update: {},
  });
}

async function saveChallenge(transactionId: string, challenge: string) {
  await getPrisma().loginTransaction.update({ where: { id: transactionId }, data: { webauthnChallenge: challenge } });
}

/** challenge는 한 번만 쓴다. 꺼내면서 지우고, 이미 지워졌으면(동시에 두 번) null */
async function takeChallenge(transaction: Pick<LoginTransaction, "id">) {
  const prisma = getPrisma();
  const fresh = await prisma.loginTransaction.findUnique({
    where: { id: transaction.id },
    select: { webauthnChallenge: true },
  });
  const challenge = fresh?.webauthnChallenge;
  if (!challenge) return null;
  const { count } = await prisma.loginTransaction.updateMany({
    where: { id: transaction.id, webauthnChallenge: challenge },
    data: { webauthnChallenge: null },
  });
  return count === 1 ? challenge : null;
}

/** 패스키 저장을 위한 옵션. 이 이메일에 이미 있는 패스키는 제외해서 같은 기기에 중복으로 만들지 않는다. */
export async function createRegistrationOptions(
  transaction: Pick<LoginTransaction, "id">,
  email: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpName, rpID } = relyingParty();
  const owner = await ownerForEmail(email);
  const existing = await getPrisma().passkey.findMany({ where: { ownerId: owner.id } });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: email,
    userDisplayName: email,
    userID: Uint8Array.from(encoder.encode(owner.id)),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: parseTransports(p.transports) })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await saveChallenge(transaction.id, options.challenge);
  return options;
}

export async function verifyRegistration(
  transaction: Pick<LoginTransaction, "id">,
  email: string,
  response: RegistrationResponseJSON,
) {
  const challenge = await takeChallenge(transaction);
  if (!challenge) return { ok: false as const };
  const { rpID, origin } = relyingParty();

  let verified;
  try {
    verified = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (error) {
    console.error("passkey registration failed", error);
    return { ok: false as const };
  }
  if (!verified.verified) return { ok: false as const };

  const { credential, aaguid, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
  const owner = await ownerForEmail(email);
  const prisma = getPrisma();

  // 같은 credential이 다른 이메일 것으로 이미 있으면 덮어쓰지 않는다
  const taken = await prisma.passkey.findUnique({ where: { id: credential.id } });
  if (taken && taken.ownerId !== owner.id) return { ok: false as const };

  const data = {
    publicKey: toBase64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ? JSON.stringify(credential.transports) : null,
    aaguid,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  };
  await prisma.passkey.upsert({
    where: { id: credential.id },
    create: { id: credential.id, ownerId: owner.id, ...data },
    update: data,
  });
  return { ok: true as const };
}

/** 로그인 옵션. allowCredentials를 비워 두어 브라우저가 이 사이트의 패스키를 보여준다 (Conditional UI) */
export async function createAuthenticationOptions(
  transaction: Pick<LoginTransaction, "id">,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: relyingParty().rpID,
    userVerification: "preferred",
  });
  await saveChallenge(transaction.id, options.challenge);
  return options;
}

export type PasskeyAssertion =
  | { ok: true; email: string }
  | { ok: false; reason: "no_challenge" | "unknown_credential" | "invalid"; credentialId: string };

/** 패스키로 로그인한 사람의 이메일. 서버에 없는 credential이면 unknown_credential */
export async function verifyAssertion(
  transaction: Pick<LoginTransaction, "id">,
  response: AuthenticationResponseJSON,
): Promise<PasskeyAssertion> {
  const credentialId = response.id;
  const challenge = await takeChallenge(transaction);
  if (!challenge) return { ok: false, reason: "no_challenge", credentialId };

  const prisma = getPrisma();
  const passkey = await prisma.passkey.findUnique({ where: { id: credentialId }, include: { owner: true } });
  if (!passkey) return { ok: false, reason: "unknown_credential", credentialId };

  // 패스키를 만든 사람(userHandle)이 이 credential의 소유자와 같아야 한다
  const handle = response.response.userHandle;
  let handleOwner: string | null = null;
  try {
    handleOwner = handle ? decoder.decode(fromBase64url(handle)) : null;
  } catch {
    handleOwner = null;
  }
  if (handleOwner !== passkey.ownerId) return { ok: false, reason: "invalid", credentialId };

  const { rpID, origin } = relyingParty();
  try {
    const verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: passkey.id,
        publicKey: fromBase64url(passkey.publicKey),
        counter: passkey.counter,
        transports: parseTransports(passkey.transports),
      },
    });
    if (!verified.verified) return { ok: false, reason: "invalid", credentialId };

    await prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: verified.authenticationInfo.newCounter,
        backedUp: verified.authenticationInfo.credentialBackedUp,
        lastUsedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("passkey assertion failed", error);
    return { ok: false, reason: "invalid", credentialId };
  }
  return { ok: true, email: passkey.owner.email };
}
