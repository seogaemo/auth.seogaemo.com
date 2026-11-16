import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/console/Sidebar";
import { requireDeveloper } from "@/lib/console/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "콘솔", template: "%s | Seogaemo SSO" } };

export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const developer = await requireDeveloper();

  return (
    <div className="flex min-h-dvh flex-col bg-base-elevated md:flex-row">
      <Sidebar email={developer.email} name={developer.name} />
      <main className="flex flex-1 justify-center px-4 py-4 md:px-16">
        <div className="w-full max-w-[640px]">{children}</div>
      </main>
    </div>
  );
}
