import { isLoginErrorCode, LOGIN_ERRORS } from "@/lib/oauth/errors";

export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const message = isLoginErrorCode(code) ? LOGIN_ERRORS[code] : "로그인 중 문제가 생겼어요.";

  return (
    <main>
      <h1>로그인할 수 없어요</h1>
      <p>{message}</p>
    </main>
  );
}
