# DESIGN.md

Seogaemo SSO (auth.seogaemo.com) 디자인 가이드.

Figma 파일(`idaas.seogaemo.com`)은 아주 초기 초안이다. 이 문서는 시안을 그대로 옮긴 것이 아니라, 시안에서 **방향과 규칙**을 뽑아 정리한 것이다. 시안과 이 문서가 다르면 이 문서를 따른다. 화면을 새로 만들다가 규칙이 부족하면 이 문서를 먼저 고친다.

---

## 1. 제품 구조: 두 개의 표면

이 제품에는 성격이 전혀 다른 화면 묶음이 두 개 있다. 둘을 같은 스타일로 맞추려고 하지 않는다.

| | Hosted Login | Console |
|---|---|---|
| 누가 보나 | 각 서비스의 엔드유저 | 서비스를 등록하고 운영하는 사람 |
| 경로 (예정) | `/login/[service]` | `/console/**` |
| 성격 | 브랜드 표면. 첫인상, 신뢰, 개성 | 도구 표면. 정보 밀도, 빠른 조작 |
| 스타일 | Seogaemo 고유 스타일 (모노 폰트, 그리드 배경, 굵은 테두리) | `@seogaemo/ds-tailwind` 그대로 |
| 서비스 브랜딩 | 서비스 로고, 이름, (추후) 색상이 들어감 | 서비스 로고, 이름만 표시 |

콘솔 로그인 화면("Seogaemo로 로그인")은 Hosted Login 쪽 스타일을 따른다. 콘솔도 결국 자기 SSO로 로그인하기 때문이다.

누구나 auth.seogaemo.com에 가입해서 자기 서비스를 등록하고 SSO로 쓸 수 있다 (Google Cloud Console에서 OAuth 클라이언트를 만드는 것과 같은 셀프 서비스). 콘솔에는 별도 관리자나 권한 등급이 없고, 가입한 개발자는 자기가 만든 서비스만 본다.

---

## 2. 원칙

1. **DS 먼저.** 색, 글자 크기, 굵기는 `@seogaemo/ds-tailwind` 토큰을 쓴다. `text-[#101016]` 같은 임의 값은 쓰지 않는다. DS에 없는 값이 필요하면 3.3절의 확장 토큰으로 정의하고 나서 쓴다.
2. **로그인은 짧게.** 로그인 화면에는 서비스 로고, 제목, 인증 수단, 워터마크 말고는 아무것도 두지 않는다.
3. **인증 수단은 늘 같은 순서, 같은 모양.** 목록, 테이블, 설정, 로그인 버튼 어디서든 5절의 순서와 아이콘을 지킨다.
4. **설정은 바로 보여준다.** 콘솔에서 로그인 화면에 영향을 주는 설정은 옆에 미리보기를 붙인다.
5. **한국어 우선.** UI 문구는 한국어로 쓴다. 콘솔 사이드바 메뉴처럼 개발자에게 익숙한 용어는 영문을 허용한다 (7.1절).

---

## 3. 토큰

### 3.1 DS 토큰 (그대로 사용)

`tailwind.config.ts`의 `presets: [seogaemoPresets]`로 들어온다.

**텍스트 색**

| 클래스 | 용도 |
|---|---|
| `text-primary` | 본문, 제목 |
| `text-secondary` | 보조 본문 |
| `text-tertiary` | 날짜, 뒤로가기 링크 같은 메타 정보 |
| `text-quaternary` | 폼 라벨, 선택 안 된 메뉴 |
| `text-unselected` | 비활성 아이콘 |
| `text-unable` | disabled |
| `text-content-accent` | 텍스트 액션 ("수정 완료", "사진 변경하기") |
| `text-content-negative` | 파괴적 액션 ("삭제") |

**배경 색**

| 클래스 | 용도 |
|---|---|
| `bg-base` | 페이지 바탕 (gray-100) |
| `bg-base-elevated` | 카드, 콘텐츠 영역 (white) |
| `bg-base-pressed`, `bg-base-elevated-pressed` | hover, pressed |
| `bg-accent`, `bg-accent-pressed` | primary 버튼 |
| `bg-negative-elevated` | 위험 영역 배경 |

**테두리**: `border-base` (gray-200)가 기본이다.

**주의: 글자색과 폰트는 상속되지 않는다.** DS가 base 스타일로 모든 요소(`*`)에 `color: var(--content-primary)`와 `font-family: Pretendard`를 직접 건다. 그래서 부모에 `text-quaternary`나 `font-mono`를 줘도 자식 요소(`<th>`, `<span>` 등)는 primary 색, Pretendard가 된다. 글자색과 폰트는 글자를 가진 요소에 직접 준다.

**주의: Tailwind 기본 스케일이 없다.** DS preset이 `fontSize`, `fontWeight`, `fontFamily`, `colors`를 통째로 바꾼다. `text-lg`, `font-medium`, `text-gray-500` 같은 기본 클래스는 생성되지 않으니 DS 이름(`text-title`, `font-strong`, `text-tertiary`)을 쓴다. 로그인 화면처럼 DS 밖의 값이 필요하면 `text-[18px]`, `font-[500]`처럼 임의 값을 쓴다.

**다크모드**: DS는 `:root[data-theme='dark']`로 토큰을 바꾼다. 위 토큰만 쓰면 다크모드가 자동으로 따라온다. `prefers-color-scheme`에 따라 `data-theme`을 넣어주는 코드는 따로 만들어야 한다.

### 3.2 타이포 (DS 스케일)

콘솔은 이 스케일만 쓴다. Figma 콘솔 시안의 텍스트 스타일이 이 스케일과 정확히 같다.

| 클래스 | 크기 / 행간 | 주 용도 |
|---|---|---|
| `text-caption` | 12 / 16 | 보조 설명 |
| `text-label` | 13 / 18 | 텍스트 액션, 업로드 안내 |
| `text-footnote` | 14 / 20 | 폼 라벨, 사이드바 메뉴, 날짜 |
| `text-body` | 15 / 22 | 입력값, 기본 본문 |
| `text-title` | 16 / 24 | 리스트 항목 |
| `text-heading` | 17 / 26 | 서비스 이름 (리스트) |
| `text-headline` | 20 / 28 | 섹션 제목 |
| `text-display` | 28 / 40 | 페이지 제목 |

굵기는 `font-default`(500)와 `font-strong`(600) 두 가지만 쓴다. 긴 문단에는 `-paragraph` 변형(행간 +4px)을 쓴다.

> Page 1 시안의 콘솔 페이지 제목은 40px인데, DS 최대치는 `display`(28px)다. Wireframe 시안처럼 `text-display font-strong`으로 통일한다.

### 3.3 확장 토큰 (DS에 없음, 이 프로젝트에서 정의)

Hosted Login에만 쓴다. `tailwind.config.ts`의 `theme.extend`나 `globals.css`의 CSS 변수로 정의한다.

| 토큰 (제안) | 값 | 출처 |
|---|---|---|
| `--login-brand` | `#2C73F4` | 로그인 배경, primary 버튼 |
| `--login-brand-strong` | `#235CC3` | 카드 테두리 |
| `--login-stroke` | `rgba(0,0,0,0.1)` | 입력창, 보조 버튼 테두리 |
| `--login-stroke-strong` | `rgba(0,0,0,0.2)` | primary 버튼 테두리 |
| `--kakao` | `#FEE500` | 카카오 버튼 (시안의 `#F4ED2C`는 카카오 공식 색이 아님) |

- `--login-brand`는 DS `blue-500`(`#007AFF`)과 다른 색이다. 콘솔에서는 DS accent를 쓰고, 로그인 화면에서만 이 색을 쓴다.
- **Branding 기능이 들어오면 `--login-brand`, `--login-brand-strong`은 서비스마다 바뀌는 값이 된다.** 그래서 처음부터 하드코딩하지 말고 CSS 변수로 둔다.

### 3.4 폰트

| 폰트 | 용도 | 상태 |
|---|---|---|
| Pretendard | 전체 기본 (DS가 자동 적용) | 준비됨 |
| SUITE | `font-special`. 쓸 곳이 정해지지 않음 | 준비됨 |
| SeogaemoMono (Monoplex KR 서브셋) | Hosted Login의 제목, 버튼, 라벨. Tailwind `font-mono` | 준비됨 (아래) |

- `app/layout.tsx`의 Geist 폰트는 지운다.
- **Monoplex KR**: https://github.com/y-kim/monoplex (IBM Plex Mono + IBM Plex Sans KR). SIL OFL 1.1이라 웹에 넣어 써도 된다.
  - 릴리스 `monoplex-kr-1.3.0`의 `MonoplexKR_v1.3.0.zip`을 쓴다. Nerd Font, CJK 변형은 필요 없다.
  - 시안에서 쓰는 굵기는 Text, Medium, SemiBold 세 가지뿐이다. 나머지는 넣지 않는다.
  - 한글 전체 글리프라 용량이 크다. woff2로 변환하고 서브셋(KS X 1001 2350자 + 라틴)을 만들거나 `unicode-range`로 쪼갠다.
  - OFL상 서브셋, 포맷 변환은 수정본에 해당하고 "Monoplex"가 예약 이름이라, 변환한 파일은 다른 family 이름(예: `SeogaemoMono`)으로 등록한다. `public/fonts/`에 넣을 때 `LICENSE.md`도 같이 둔다.
- 자간은 시안 값을 따른다: 제목(32px) `-0.04em`, 버튼(18px) `-0.06em`. 고정폭 한글은 글자 폭이 넓어서 좁혀야 단어로 읽힌다. 시안의 버튼 값(`-0.1em`)은 영문(Google)이 붙어 보여서 조금 풀었다.

### 3.5 간격, 반경, 크기

4px 그리드를 쓴다. 자주 쓰는 값은 `4, 8, 12, 16, 24, 32, 64`.

| 항목 | Hosted Login | Console |
|---|---|---|
| 모서리 반경 | 0 (로그인 버튼, 카드), 4px (콘솔 로그인 버튼) | 8px (`rounded-lg`) |
| 입력창, 버튼 높이 | 48px | 40px |
| 테두리 두께 | 2px (카드 6px) | 1px (primary 버튼 2px) |
| 아이콘 | 20px | 20px (리스트, 사이드바), 18px (버튼 안) |
| 글자 | 제목 24px, 버튼 15px (모노) | 본문 14px, 페이지 제목 20px |

**크기는 Figma 수치를 그대로 쓰지 않는다.** 시안 프레임이 1440 ~ 1920px 기준이라 그대로 옮기면 실제 화면에서 한 단계씩 커 보인다. 스타일(모노 폰트, 패턴 배경, 굵은 테두리, 아래로 깔린 단단한 그림자)은 시안을 따르고, 크기는 이 표를 따른다.

**입체감은 단단한 그림자로 낸다.** 흐린 그림자 대신 아래(버튼 3px) 또는 오른쪽 아래(카드 8px)로 어긋난 단색 그림자를 쓰고, 버튼은 누르면 그만큼 내려앉는다.

---

## 4. 레이아웃

### 4.1 Hosted Login

```
┌──────────────── 브랜드 색 + 그리드 패턴 배경 ────────────────┐
│                                                               │
│            ┌─ 카드 (max-w 400, p-28, 테두리 6px) ─┐           │
│            │ [서비스 로고 64]                      │           │
│            │ {서비스명}에                          │           │
│            │ 로그인하기               (32px, Mono) │           │
│            │                                       │  gap 32   │
│            │ [인증 수단 영역]                      │           │
│            │                                       │           │
│            │        Seogaemo 워드마크 (흐리게)     │           │
│            └───────────────────────────────────────┘           │
└───────────────────────────────────────────────────────────────┘
```

- 카드는 화면 정중앙에 둔다. 모바일(~480px 미만)에서는 좌우 여백 16px를 두고 카드가 꽉 차게 한다.
- 인증 수단 영역은 활성화된 수단 개수에 따라 두 가지로 나뉜다.
  - **비밀번호나 이메일 코드 켜짐**: 이메일 입력 하나와 "계속하기" 버튼만 둔다 (이메일 먼저 받기). 그 아래 "또는" 구분선과 소셜 수단을 48px 정사각 아이콘 버튼으로 가운데 가로 나열한다 (간격 12px, 이름은 `aria-label`과 `title`).
  - **소셜만 켜짐**: 수단별 전체 폭 버튼(48px 높이)을 세로로 쌓는다. 간격은 10px.
- "계속하기" 다음 화면은 서버가 계정에 맞춰 고른다.
  - 비밀번호가 있는 계정: `/login/password` (비밀번호 입력, "비밀번호를 잊으셨나요?", 이메일 코드가 켜져 있으면 "이메일 코드로 로그인" 보조 버튼, "다른 이메일로 로그인")
  - 비밀번호가 없거나 처음인 이메일: 이메일 코드를 보내고 `/login/verify`로 간다. 처음이면 코드 확인 후 바로 가입된다.
  - 이메일 코드가 꺼져 있고 처음인 이메일: `/login/signup` (이메일 미리 채움)
  - 입력한 이메일은 `sg_login_email` 쿠키(경로 `/login`, 10분)로 다음 화면에 넘긴다.
  - 이 방식은 그 이메일에 비밀번호가 있는지를 화면으로 드러낸다. Google, Microsoft와 같은 선택이고, 비밀번호 단계에는 잠금(5회 15분)이 걸려 있다.
- 서비스 로고가 없으면 서비스 이름 첫 글자를 넣은 64px 정사각을 보여준다.

### 4.2 Console

**Wireframe 시안(검은 사이드바)을 기준으로 한다.** Page 1(회색 사이드바)은 폐기한다.

```
┌─ Sidebar 256 (bg black) ─┬──────── Content (bg-base-elevated) ────────┐
│ Seogaemo SSO       [⇤]   │        ← Application        (text-tertiary) │
│                          │                                             │
│ ▣ Application (선택)     │        서비스 목록     (text-display strong) │
│ ◇ Branding               │        ┌ max-w 640, 가운데 정렬 ┐           │
│ 👥 User Management       │        │ 리스트 / 폼 / 테이블   │           │
│                          │        └────────────────────────┘           │
│ user@email.com     [↦]   │                                             │
└──────────────────────────┴─────────────────────────────────────────────┘
```

- 사이드바: 폭 256px, 접으면 52px (아이콘만). 메뉴 항목은 `p-2 rounded-lg`, 선택 상태는 `bg-white/10`. 글자는 `text-footnote` 흰색.
- 콘텐츠: 최대 폭 640px, 가운데 정렬. 상단에 뒤로가기 링크, 64px 아래에 페이지 제목이 온다.
- 사용자 테이블처럼 넓은 화면이 필요한 페이지는 640px 제한을 풀고 좌우 24px 여백만 둔다.
- 사이드바는 DS 토큰이 아니라 고정 검정이다. 다크모드에서도 그대로 둔다.
- **로그인 설정 화면은 2단**으로 나눈다. 왼쪽은 설정 폼, 오른쪽은 4.1의 로그인 카드를 실시간 미리보기로 보여준다.

---

## 5. 인증 수단

### 5.1 순서와 표기

어디서든 이 순서를 지킨다.

| 순서 | 수단 | 아이콘 | 버튼 문구 |
|---|---|---|---|
| 1 | 이메일/비밀번호 | 자물쇠 | 로그인 (폼) |
| 1-1 | 이메일 코드 | 편지 봉투 | 이메일 코드로 로그인 |
| 2 | Google | Google G 로고 | Google로 로그인 |
| 3 | Apple | Apple 로고 | Apple로 로그인 |
| 4 | 카카오 | 말풍선 | 카카오로 로그인 |
| 5 | 패스키 | 사람+열쇠 | 패스키로 로그인 |

### 5.2 로그인 버튼 스타일

| 수단 | 배경 | 글자 | 테두리 |
|---|---|---|---|
| 기본 (비밀번호) | `--login-brand` | white | 3px `--login-stroke-strong` |
| Google | white | primary | 2px `--login-stroke` |
| Apple | black | white | 없음 |
| 카카오 | `--kakao` | black 85% | 없음 |
| 패스키 | gray-100 | primary | 2px `--login-stroke` |

- **각 제공자의 브랜드 가이드를 우선한다.** 특히 카카오(색, 말풍선 심볼 비율)와 Apple(검정/흰색 버튼만 허용)은 가이드 위반 시 앱 심사나 제휴에서 문제가 된다. 아이콘은 공식 배포 에셋만 쓴다.
- 아이콘은 버튼 문구 왼쪽, 간격 8px.

### 5.3 콘솔에서의 상태 표시

서비스 리스트, 사용자 테이블, 설정 화면에서는 5개 아이콘을 항상 전부 보여주고, 상태는 색으로 구분한다.

- **켜짐**: 원래 색 (Google 컬러 로고, 카카오 노랑, 비밀번호는 accent 파랑)
- **꺼짐**: 전부 `text-unable` 단색

아이콘마다 `aria-label`(예: "Google 사용 중", "Apple 꺼짐")을 단다. 색만으로 상태를 전달하지 않기 위해서다.

---

## 6. 컴포넌트

시안에서 반복되는 것만 뽑았다. 처음부터 다 만들지 말고 화면을 만들면서 필요할 때 추가한다.

### Hosted Login

| 컴포넌트 | 규칙 |
|---|---|
| `LoginCard` | 4.1 구조. 서비스 정보(로고, 이름, 활성 수단)를 props로 받는다. 콘솔 미리보기에서도 같은 컴포넌트를 쓴다. |
| `LoginInput` | 높이 64, 2px `--login-stroke`, 반경 4. 라벨은 위에 14px, 투명도 30%가 아니라 `text-quaternary`로 쓴다. |
| `ProviderButton` | `provider`, `variant: "full" \| "icon"` props. 5.2 스타일. |

### Console

| 컴포넌트 | 규칙 |
|---|---|
| `Sidebar` | 4.2 구조. `collapsed` 상태. |
| `PageHeader` | 뒤로가기 링크(선택) + 제목 + 오른쪽 액션 버튼(선택). |
| `Button` | primary는 `bg-accent text-white`, 높이 48, 반경 8. 보조 버튼은 `bg-base`. |
| `TextAction` | `text-label font-strong text-content-accent`. 뒤에 `>` 아이콘(16px)을 붙일 수 있다. 파괴적이면 `text-content-negative`. |
| `FormRow` | 왼쪽 라벨 56px 고정 (`text-footnote text-quaternary`), 오른쪽 입력. 행 간격 32px. |
| `Input` | 높이 48, 1px `border-base`, 반경 8, 좌우 12px, `text-body`. |
| `ServiceRow` | 로고 24 (반경 2) + 이름(`text-heading`) + 생성일(`text-footnote text-tertiary`) + 오른쪽에 인증 수단 아이콘. 세로 패딩 12px. |
| `ProviderIcons` | 5.3 규칙. 크기 20 / 24. |
| `DataTable` | 헤더 32px(`text-footnote text-quaternary`), 행 40px, 행 사이 1px `border-base`. |
| `Modal` | 폭 640, 하단 오른쪽에 "취소"(`text-quaternary`) / 확인(`text-primary font-strong`) 텍스트 버튼. |
| `ImageUpload` | 미리보기 56px + "사진 변경하기" `TextAction` + 안내문(`text-label text-quaternary`). JPG, GIF, PNG / 권장 128px / 최대 250KB. |

### 상태 규칙 (공통)

- hover와 pressed는 DS의 `-pressed` 토큰을 쓴다.
- focus는 키보드 포커스일 때만 보이게 `focus-visible:ring-2 ring-accent`(로그인은 `--login-brand`)로 처리한다. `outline: none`만 두고 끝내지 않는다.
- disabled는 `text-unable`, 배경은 그대로 두고 `cursor-not-allowed`.
- 로딩 중인 버튼은 폭을 유지한 채 문구 대신 스피너를 보여준다.

---

## 7. 문구

### 7.1 용어

| 쓰는 말 | 쓰지 않는 말 |
|---|---|
| 서비스 | 앱, 애플리케이션, 클라이언트 (화면 문구 기준) |
| 인증 방식 | 로그인 방법, 프로바이더 |
| 사용자 | 유저, 회원 |
| 개발자 | 운영자, 관리자, 어드민 (Seogaemo에 가입해서 자기 서비스를 등록한 사람) |

콘솔 사이드바 메뉴는 예외적으로 영문(Application, Branding, User Management)을 쓴다. 메뉴 이름과 페이지 제목이 다를 수 있다 (메뉴 "Application", 페이지 제목 "서비스 목록").

### 7.2 톤

- 존댓말, 짧게. "~해주세요"보다 "~하세요"를 기본으로 한다.
- 시안에 있는 장난스러운 말투("비밀번호를 잊으셨다구요?")는 쓰지 않는다. 엔드유저가 보는 화면이고 각 서비스의 얼굴이기 때문이다. "비밀번호를 잊으셨나요?"로 쓴다.
- placeholder 끝에 `..`을 붙이지 않는다. "이메일을 입력하세요".
- 에러 문구는 무엇이 잘못됐는지와 무엇을 하면 되는지를 같이 쓴다. "이메일 형식이 올바르지 않아요" 보다 "이메일 형식을 확인하세요 (예: name@example.com)".

---

## 8. 접근성

- 텍스트 대비 4.5:1 이상. `--login-brand` 위의 흰 글자는 이 기준을 넘는다. 카카오 노랑 위에는 검정 글자만 쓴다.
- 아이콘만 있는 버튼(소셜 아이콘 버튼, 로그아웃, 사이드바 접기)에는 `aria-label`을 단다.
- 로그인 폼은 `<form>`과 `<label>`을 제대로 쓰고, `autocomplete="email"`, `autocomplete="current-password"`, 패스키용 `autocomplete="webauthn"`을 지정한다.
- 터치 영역은 최소 44px. 콘솔의 20px 아이콘 버튼은 패딩으로 영역을 넓힌다.

---

## 9. 아직 정하지 않은 것

- [x] Monoplex KR 출처와 라이선스 확인 (OFL 1.1)
- [x] Monoplex KR woff2 서브셋 (`public/fonts/SeogaemoMono-*.woff2`, `scripts/build-font.py`)
- [x] 로그인 배경 그리드: PNG 대신 CSS 그라디언트로 그림 (`.login-grid`)
- [x] Branding 범위: 브랜드 색(`--login-brand`, `--login-brand-strong`)과 배경까지. 폰트는 고정
- [x] Group: 만들지 않음
- [x] 사용자 엑셀 내보내기: MVP에서 뺌
- [ ] 다크모드: 지원할 예정이지만 MVP에서는 뺌. 그래도 처음부터 DS 토큰과 CSS 변수만 써서 나중에 켜기만 하면 되게 만든다
- [ ] 회원가입, 비밀번호 재설정, 에러(잘못된 redirect_uri, 비활성 서비스) 화면
- [ ] 콘솔의 서비스 설정, Branding 화면 (시안 없음)
- [ ] Seogaemo 로고, 워드마크 SVG 정리 (`public/Tile.svg`는 PNG를 감싼 파일이라 교체 필요)

---

## 참고: Figma 노드

파일: `idaas.seogaemo.com` (`D5SHmodbXz74lPg2wDwKUz`)

| 화면 | 노드 |
|---|---|
| 로그인 (비밀번호 + 아이콘) | Page 1 / `0:632` |
| 로그인 모바일 | Page 1 / `0:733` |
| 콘솔 로그인 | Page 1 / `0:1531` |
| 로그인 설정 + 미리보기 | Page 1 / `0:1072` |
| 사용자 관리 | Page 1 / `0:1194` |
| 콘솔 서비스 목록 (기준 레이아웃) | Wireframe / `13:195` |
| 서비스 상세 | Wireframe / `28:927` |
| 사이드바 컴포넌트 | Wireframe / `15:223` |
| Auth0 참고 캡처 | Reference 페이지 |
