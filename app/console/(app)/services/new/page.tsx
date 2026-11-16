import { NewServiceForm } from "@/components/console/NewServiceForm";
import { PageHeader } from "@/components/console/ui";

export const metadata = { title: "서비스 추가" };

export default function NewServicePage() {
  return (
    <>
      <PageHeader title="서비스 추가" back={{ href: "/console", label: "서비스 목록" }} />
      <NewServiceForm />
    </>
  );
}
