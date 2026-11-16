import { redirect } from "next/navigation";

/** 이메일 코드 로그인은 첫 화면(/login)에서 이메일을 넣으면 이어진다. 옛 주소는 그리로 보낸다. */
export default function EmailLoginPage() {
  redirect("/login");
}
