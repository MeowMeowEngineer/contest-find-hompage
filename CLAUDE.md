# 대학원 공모전 레이더 — 작업 규칙

이 저장소는 대학원생이 참가할 수 있는 공모전·논문상·펠로우십을 모은 정적 사이트다. `data/contests/*.json`을 `pipeline/build.py`가 `public/`으로 빌드하고, Vercel이 `main`의 `public/`을 그대로 배포한다. 군산각·인천각 인수인계(2026-10-21)의 방식을 따른다.

## 1. 목적
- 대학원생이 "내가 낼 수 있는 공모전이 뭐가 있고 언제 마감인가"를 한 번에 찾게 한다.
- 검색엔진과 AI 답변이 공모전 질문에 이 사이트를 인용하게 한다. 값은 화면에 먼저 쓰고, 구조화 데이터는 화면과 같게 둔다.
- 사용자가 과정·소속·국적·나이를 넣으면 공모전마다 참가 가능 / 조건부 / 불가를 이유와 함께 보여 준다(`/check/`).

## 2. 운영자 결정 (받은 날 적는다, KST)
| 날짜 | 결정 |
|---|---|
| 2026-10-21 | 군산각처럼 GitHub + Vercel 정적 사이트로 만든다. 저장소 `MeowMeowEngineer/contest-find-hompage` |
| 2026-10-21 | webforai.kr는 다른 사람 도메인이라 쓰지 않는다. 운영자가 가질 수 있는 Vercel 기본 주소 `gongmo-radar.vercel.app`으로 한다(이미 쓰이면 `grad-contest-radar.vercel.app`). 주소는 `site.json` `site_url` 한 곳에만 둔다 |
| 2026-10-21 | 소속·정보를 넣으면 참가 가능 여부를 판별한다. 입력값은 브라우저 localStorage에만 두고 서버로 보내지 않는다 |
| 2026-10-21 | 지금은 미리보기(noindex). 공개 전환은 운영자가 정한다 |

## 3. 데이터 규칙
- 원본은 `data/contests/<id>.json` 한 파일에 공모전 하나다. id는 영문 소문자·숫자·하이픈. 공개 뒤에는 id(=주소)를 바꾸지 않는다.
- 필드와 `elig`(자격 판별 규칙) 키는 `docs/data_standard.md`를 따른다. 새 키를 만들면 `pipeline/common.py` `ELIG_KEYS`, `assets/eligibility.js`, 이 문서를 같이 고친다.
- 날짜는 주최 측 공고에서 가져온다. 공고 전 회차는 `nextDeadline`을 비우고 `typicalMonths`·`typicalDeadline`에 지난 회차 기준 값을 적는다. 추정이면 `nextDeadlineNote`에 '전년도 기준 추정'이라고 쓴다. 날짜·상금·URL을 지어내지 않는다.
- 모든 공모전에 `url`(공식 페이지)이나 `sourceUrl`(근거 출처) 중 하나는 있어야 한다.
- `verifiedAt`(확인일)은 데이터와 구조화 데이터(`dateModified`)·sitemap `lastmod`에만 쓰고 화면에는 보이지 않는다. sitemap에 빌드 날짜를 쓰지 않는다.
- 화면에 면책 문구('공식 페이지를 꼭 확인하세요' 같은 문장)를 붙이지 않는다. 확인할 것이 있으면 판별 결과의 '조건부' 이유나 `nextDeadlineNote`에 구체적으로 쓴다.
- Artifact(관리용 페이지, 운영자 전용)에서 고친 내용은 ArtifactData로 내려받아 이 저장소 JSON에 반영한다. 원본은 이 저장소다.

## 4. 화면 규칙
- 흰 면 + 바다 파랑(`--blue`) 하나 + 둥근 덩어리(UI4 언어). 'AI 티'(같은 공식의 히어로, 숫자 띠, 장식 번호, 칩 더미, 형광펜)를 쓰지 않는다.
- 홈 제목은 목적을 바로 말한다. 정보가 첫 화면에 바로 보이게 하고, 첫 화면을 모션으로 숨기지 않는다.
- 모든 `<title>`은 `… | 대학원 공모전 레이더`로 끝난다(AI 인용 칩 이름). description은 80자 이하의 완결된 문장.
- 글꼴은 Pretendard 400·700 동적 서브셋을 `assets/fonts/`에서 자체 호스팅한다. 다른 굵기를 늘리지 않는다.
- 캡처는 390·1440 폭을 보고 고친다.

## 5. 명령
```bash
python3 -m pipeline.build                 # public/ 빌드(site.json mode)
python3 -m pipeline.validate              # 오류 0이어야 커밋
python3 -m unittest discover -s tests     # 빌드·검증 시험
node --test tests/*.test.cjs              # 자격 판별 시험
python3 -m http.server 8851 --directory public   # 로컬 미리보기
```

## 6. 배포
1. `python3 -m pipeline.build && python3 -m pipeline.validate`가 오류 0인지 본다.
2. 시험 두 가지를 돌린다.
3. `git add -A` → 커밋 → `git push origin main`. Vercel이 `public/`을 배포한다.
4. 실사이트 `curl -s <site_url>/ | md5sum`이 `md5sum public/index.html`과 같은지 본다. push 성공은 배포 성공이 아니다.

## 7. 공개 전환 (운영자가 정한 뒤)
1. `site.json` `mode`를 `production`으로 바꾼다.
2. `vercel.json`에서 `X-Robots-Tag` noindex 헤더 블록을 지운다(validate가 남은 헤더를 오류로 잡는다).
3. 빌드·검증·배포. 구글 Search Console·네이버 서치어드바이저·Bing에 사이트맵(`/sitemap.xml`)을 제출한다. IndexNow는 그때 키 파일을 만든다.
4. 도메인을 바꾸면 `site_url`을 바꾸고 다시 빌드하고, 옛 주소는 vercel.json 308로 옮긴다.

## 8. 남은 일
- 마감일 주기 재확인(예약 작업)은 운영자에게 물어본 뒤 만든다.
- og:image(공유 미리보기 그림)가 없다.
- 한국전자파학회 동계, KCC 논문 마감 월은 근거를 찾지 못해 비어 있다.
