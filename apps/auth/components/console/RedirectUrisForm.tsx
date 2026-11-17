"use client";

import { useActionState } from "react";

import { updateRedirectUris, type ActionState } from "@/actions/services";
import { Button, Card, FormFeedback, FormRow, Textarea } from "./ui";

/** 로그인이 끝나면 돌아갈 주소와 로그아웃 뒤 돌아갈 주소. 연동 화면에서 예시 코드 바로 위에 둔다 */
export function RedirectUrisForm({
  serviceId,
  redirectUris,
  postLogoutRedirectUris,
}: {
  serviceId: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateRedirectUris.bind(null, serviceId), null);

  return (
    <div className="flex flex-col gap-4">
      <FormFeedback error={state?.error} message={state?.message} />
      <form key={JSON.stringify(state?.fields ?? {})} action={action} className="flex flex-col gap-4">
        <Card>
          <FormRow
            label="Redirect URI"
            htmlFor="redirectUris"
            hint="한 줄에 하나씩. 웹은 https 주소, 앱은 com.example.app:/oauth/callback 같은 앱 스킴. 요청한 redirect_uri가 여기 있는 값과 글자 하나까지 같아야 해요."
          >
            <Textarea
              id="redirectUris"
              name="redirectUris"
              rows={Math.max(3, redirectUris.length + 1)}
              defaultValue={state?.fields?.redirectUris ?? redirectUris.join("\n")}
              placeholder="https://example.com/auth/callback"
            />
          </FormRow>
          <FormRow
            label="로그아웃 후 이동 주소"
            htmlFor="postLogoutRedirectUris"
            hint="post_logout_redirect_uri로 보낼 주소. 여기 있는 값과 같아야 앱으로 돌아가고, 아니면 Seogaemo 로그아웃 화면에 머물러요."
          >
            <Textarea
              id="postLogoutRedirectUris"
              name="postLogoutRedirectUris"
              rows={Math.max(2, postLogoutRedirectUris.length + 1)}
              defaultValue={state?.fields?.postLogoutRedirectUris ?? postLogoutRedirectUris.join("\n")}
              placeholder="https://example.com"
            />
          </FormRow>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "저장 중" : "저장"}
          </Button>
        </div>
      </form>
    </div>
  );
}
