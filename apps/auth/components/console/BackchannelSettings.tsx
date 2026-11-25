"use client";

import type { BackchannelDelivery } from "@prisma/client";
import { useActionState, useTransition, useState } from "react";

import { retryBackchannelDelivery, updateBackchannel, type ActionState } from "@/actions/services";
import { Button, FormFeedback, FormRow, Input, TextAction } from "./ui";

const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

/** 서버 알림 (OIDC Back-Channel Logout) 주소와 최근 전달 내역 */
export function BackchannelSettings({
  serviceId,
  uri,
  deliveries,
}: {
  serviceId: string;
  uri: string | null;
  deliveries: BackchannelDelivery[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateBackchannel.bind(null, serviceId), null);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <FormFeedback error={state?.error} message={state?.message} />
        <FormRow
          label="알림 주소"
          htmlFor="backchannelLogoutUri"
          hint="사용자가 로그아웃하거나 계정을 지우면 서명한 logout_token을 이 주소로 POST해요. 비우면 보내지 않아요. 앱 서버가 사용자 데이터를 갖고 있다면 등록하세요."
        >
          <Input
            id="backchannelLogoutUri"
            name="backchannelLogoutUri"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            defaultValue={state?.fields?.backchannelLogoutUri ?? uri ?? ""}
            placeholder="https://api.example.com/auth/backchannel-logout"
          />
        </FormRow>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "저장 중" : "알림 주소 저장"}
          </Button>
        </div>
      </form>
      {(uri || deliveries.length > 0) && <DeliveryList serviceId={serviceId} deliveries={deliveries} />}
    </div>
  );
}

function kind(delivery: BackchannelDelivery) {
  if (delivery.purged) return "계정 삭제";
  return delivery.sid ? "로그아웃 (기기 하나)" : "로그아웃 (모든 기기)";
}

function status(delivery: BackchannelDelivery) {
  if (delivery.deliveredAt) return { label: "전달됨", tone: "text-secondary" };
  if (delivery.failedAt) return { label: "포기함", tone: "text-content-negative" };
  if (delivery.attempts === 0) return { label: "보내는 중", tone: "text-tertiary" };
  return { label: `다시 보내는 중 (${delivery.attempts}번 실패)`, tone: "text-secondary" };
}

function DeliveryList({ serviceId, deliveries }: { serviceId: string; deliveries: BackchannelDelivery[] }) {
  if (deliveries.length === 0) {
    return <p className="text-footnote text-tertiary">아직 보낸 알림이 없어요. 사용자가 로그아웃하면 여기에 남아요.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-footnote font-strong text-primary">최근 알림</h3>
      <ol className="flex flex-col rounded-lg border border-base bg-base-elevated">
        {deliveries.map((delivery) => (
          <DeliveryRow key={delivery.id} serviceId={serviceId} delivery={delivery} />
        ))}
      </ol>
      <p className="text-label text-tertiary">
        실패하면 1분, 5분, 30분, 2시간, 6시간, 12시간 간격으로 다시 보내요. 로그아웃은 하루, 계정 삭제는 7일 동안 실패가 이어지면 그만둬요.
      </p>
    </div>
  );
}

function DeliveryRow({ serviceId, delivery }: { serviceId: string; delivery: BackchannelDelivery }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState>(null);
  const { label, tone } = status(delivery);
  const canRetry = !delivery.deliveredAt;

  return (
    <li className="flex flex-col gap-1 border-b border-base px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-footnote font-strong text-primary">{kind(delivery)}</span>
        <span className={`text-label font-strong ${tone}`}>{label}</span>
        <span className="ml-auto text-label text-tertiary">{dateTime.format(delivery.createdAt)}</span>
      </div>
      <span className="font-mono text-label text-secondary [overflow-wrap:anywhere]">
        sub {delivery.sub}
        {delivery.sid ? ` / sid ${delivery.sid}` : ""}
      </span>
      {delivery.lastResult && !delivery.deliveredAt && (
        <span className="text-label text-tertiary [overflow-wrap:anywhere]">마지막 결과: {delivery.lastResult}</span>
      )}
      {canRetry && (
        <div className="flex items-center gap-3">
          <TextAction
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setResult(await retryBackchannelDelivery(serviceId, delivery.id));
              })
            }
          >
            {pending ? "보내는 중" : "지금 다시 보내기"}
          </TextAction>
          <span role="status" className="text-label text-tertiary">
            {result?.message ?? result?.error ?? ""}
          </span>
        </div>
      )}
    </li>
  );
}
