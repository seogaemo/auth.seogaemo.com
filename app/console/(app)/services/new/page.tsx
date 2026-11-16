import { NewServiceForm } from "@/components/console/NewServiceForm";
import { BackLink, Page, PageTitle } from "@/components/console/ui";

export const metadata = { title: "서비스 추가" };

export default function NewServicePage() {
  return (
    <Page>
      <BackLink href="/console" label="서비스 목록" />
      <div className="flex flex-col gap-5">
        <PageTitle>서비스 추가</PageTitle>
        <NewServiceForm />
      </div>
    </Page>
  );
}
