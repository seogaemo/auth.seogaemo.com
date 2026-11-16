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
      <Sidebar
        email={developer.email}
        name={developer.name}
        services={services.map((s) => ({ id: s.id, name: s.name, hasLogo: !!s.logoKey }))}
      />
      <main className="flex-1 px-5 py-6 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
