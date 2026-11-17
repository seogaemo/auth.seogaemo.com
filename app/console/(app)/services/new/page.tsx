import { NewServiceForm } from "@/components/console/NewServiceForm";
import { BackLink, Page, PageTitle } from "@/components/console/ui";

export const metadata = { title: "Application 추가" };

export default function NewServicePage() {
  return (
    <Page>
      <BackLink href="/console" label="Applications" />
      <div className="flex flex-col gap-5">
        <PageTitle>Application 추가</PageTitle>
        <NewServiceForm />
      </div>
    </Page>
  );
}
