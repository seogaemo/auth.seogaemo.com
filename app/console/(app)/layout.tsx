import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getPrisma } from "@/cloudflare";
import { Sidebar } from "@/components/console/Sidebar";
import { requireDeveloper } from "@/lib/console/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "콘솔", template: "%s | Seogaemo SSO" } };

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const developer = await requireDeveloper();
  const services = await getPrisma().service.findMany({
    where: { ownerId: developer.id, isSystem: false },
    select: { id: true, name: true, logoKey: true },
  });

  return (
    <div className="flex min-h-dvh flex-col bg-base-elevated md:flex-row">
      <a
        href="#content"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 text-footnote font-strong text-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        본문으로 건너뛰기
      </a>
      <Sidebar
        email={developer.email}
        name={developer.name}
        services={services.map((s) => ({ id: s.id, name: s.name, hasLogo: !!s.logoKey }))}
      />
      <main id="content" tabIndex={-1} className="flex-1 px-5 py-6 outline-none md:px-10 md:py-10">{children}</main>
    </div>
  );
}
