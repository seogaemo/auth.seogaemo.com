import type { Service } from "@prisma/client";

/** 서비스가 등록한 이용약관, 개인정보 처리방침. 둘 다 없으면 아무것도 그리지 않는다. */
export function LegalLinks({ service }: { service: Pick<Service, "termsUrl" | "privacyUrl"> }) {
  const links = [
    service.termsUrl && { href: service.termsUrl, label: "이용약관" },
    service.privacyUrl && { href: service.privacyUrl, label: "개인정보 처리방침" },
  ].filter((l): l is { href: string; label: string } => Boolean(l));
  if (links.length === 0) return null;

  return (
    <p className="text-label text-tertiary">
      계속하면 서비스의{" "}
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 && "과 "}
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm text-secondary underline decoration-1 underline-offset-2 hover:text-primary"
          >
            {link.label}
          </a>
        </span>
      ))}
      에 동의하는 거예요.
    </p>
  );
}
