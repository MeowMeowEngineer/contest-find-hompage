// node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const E = require("../assets/eligibility.js");

const DATA = path.join(__dirname, "..", "data", "contests");
function contest(id) {
  return Object.assign({ id }, JSON.parse(fs.readFileSync(path.join(DATA, id + ".json"), "utf8")));
}
const MASTER = { level: "석사", status: "재학", fullTime: true, uniCountry: "국내", uniRegion: "경기", nationality: "KR", field: "공학", memberships: [] };
const v = (id, p) => E.judge(contest(id), Object.assign({}, MASTER, p || {}), "2026-10-21").verdict;

test("만 나이는 기준일에 생일이 지났는지로 센다", () => {
  assert.equal(E.ageOn("2000-10-21", "2026-10-21"), 26);
  assert.equal(E.ageOn("2000-10-22", "2026-10-21"), 25);
  assert.equal(E.ageOn("", "2026-10-21"), null);
});

test("과정 조건", () => {
  assert.equal(v("nrf-masters-research-grant-stem"), "가능");
  assert.equal(v("nrf-phd-research-grant-stem"), "불가");
  assert.equal(v("nrf-phd-research-grant-stem", { level: "석박통합" }), "가능");
  assert.equal(v("google-phd-fellowship"), "불가");
  assert.equal(v("ims-student-paper-competition", { level: "박사후" }), "불가");
  assert.equal(v("kcs-best-paper", { level: "일반", status: "졸업" }), "가능");
});

test("학적·전일제", () => {
  assert.equal(v("qualcomm-innovation-fellowship-korea", { status: "휴학" }), "조건부");
  assert.equal(v("ieie-summer-best-student-paper", { status: "졸업", memberships: ["대한전자공학회"] }), "불가");
  assert.equal(v("ims-student-paper-competition", { fullTime: false }), "불가");
  assert.equal(v("ims-student-paper-competition", { status: "졸업예정" }), "가능");
  assert.equal(v("presidential-science-scholarship-graduate", { status: "입학예정" }), "조건부");
  assert.equal(v("nrf-masters-research-grant-stem", { status: "입학예정" }), "불가");
});

test("대학 소재지", () => {
  assert.equal(v("bitgaram-ai-ict-contest", { uniRegion: "" }), "조건부");
  assert.equal(v("bitgaram-ai-ict-contest"), "불가");
  assert.equal(v("bitgaram-ai-ict-contest", { uniRegion: "광주" }), "가능");
});

test("나이와 미취업", () => {
  assert.equal(v("lg-aimers"), "조건부");
  assert.equal(v("lg-aimers", { birth: "1990-01-01" }), "불가");
  assert.equal(v("lg-aimers", { birth: "2000-05-01", employed: true }), "불가");
  assert.equal(v("lg-aimers", { birth: "2000-05-01" }), "가능");
  assert.equal(v("eumw-young-engineer-prize", { birth: "1996-06-01" }), "불가");
  assert.equal(v("eumw-young-engineer-prize", { birth: "1998-01-01" }), "가능");
  assert.equal(v("liner-scholar-research-contest"), "가능");
});

test("학회 회원", () => {
  assert.equal(v("ieie-summer-best-student-paper"), "조건부");
  assert.equal(v("ieie-summer-best-student-paper", { memberships: ["대한전자공학회"] }), "가능");
});

test("국적·해외 대학·재직", () => {
  assert.equal(v("presidential-science-scholarship-graduate", { nationality: "other" }), "불가");
  assert.equal(v("samsung-humantech-paper-award", { uniCountry: "해외", nationality: "other" }), "불가");
  assert.equal(v("samsung-humantech-paper-award", { uniCountry: "해외" }), "가능");
  assert.equal(v("samsung-humantech-paper-award", { nationality: "other" }), "가능");
  assert.equal(v("samsung-humantech-paper-award", { employed: true }), "불가");
  assert.equal(v("qualcomm-innovation-fellowship-korea", { uniCountry: "해외" }), "불가");
});

test("신입생 조건(관정)", () => {
  assert.equal(v("kwanjeong-domestic-grad-scholarship", { entry: "2025-03" }), "불가");
  assert.equal(v("kwanjeong-domestic-grad-scholarship", { entry: "2026-09" }), "조건부");
});

test("모든 공모전이 기본 프로필로 판별된다", () => {
  for (const f of fs.readdirSync(DATA)) {
    const r = E.judge(contest(f.replace(/\.json$/, "")), E.DEFAULT_PROFILE, "2026-10-21");
    assert.ok(["가능", "조건부", "불가"].includes(r.verdict), f);
    if (r.verdict === "불가") assert.ok(r.fail.length > 0, f);
  }
});

test("모든 연령·신분 프로필", () => {
  const P = (x) => Object.assign({ nationality: "KR", residence: "" }, x);
  const w = (id, p) => E.judge(contest(id), P(p), "2026-10-21").verdict;
  assert.equal(w("liner-scholar-research-contest", { role: "고등학생", birth: "2009-05-01" }), "가능");
  assert.equal(w("liner-scholar-research-contest", { role: "초등학생", birth: "2015-05-01" }), "불가");
  assert.equal(w("open-source-developer-contest", { role: "중학생" }), "가능");
  assert.equal(w("kcs-best-paper", { role: "고등학생" }), "불가");
  assert.equal(w("kcs-best-paper", { role: "은퇴·무직", birth: "1958-01-01" }), "가능");
  assert.equal(w("lg-aimers", { role: "취업준비생", birth: "2000-05-01" }), "가능");
  assert.equal(w("lg-aimers", { role: "직장인", birth: "2000-05-01" }), "불가");
  assert.equal(w("baram-wind-power-forecast", { role: "취업준비생" }), "가능");
  assert.equal(w("baram-wind-power-forecast", { role: "직장인" }), "불가");
});

test("국방 AI 나이는 다음 회차 예상 마감일 기준", () => {
  assert.equal(v("mnd-defense-ai-competition", { birth: "1992-03-01" }), "불가");
  assert.equal(v("mnd-defense-ai-competition", { birth: "2008-03-01" }), "가능");
});

test("학생이 아니면 대학 조건을 보지 않는다(전파분야 논문공모)", () => {
  assert.equal(v("kca-kiees-radio-paper-contest", { level: "박사후" }), "조건부");
  assert.equal(v("kca-kiees-radio-paper-contest", { level: "박사후", uniCountry: "해외" }), "조건부");
});

test("거주 지역 조건", () => {
  const c = { id: "t", elig: { who: E.ALL_LEVELS, residence: ["서울"] } };
  assert.equal(E.judge(c, { role: "직장인" }, "2026-10-21").verdict, "조건부");
  assert.equal(E.judge(c, { role: "직장인", residence: "서울" }, "2026-10-21").verdict, "가능");
  assert.equal(E.judge(c, { role: "직장인", residence: "경기" }, "2026-10-21").verdict, "불가");
});

test("입학 연월 표기", () => {
  assert.equal(E.normYm("2025.3"), "2025-03");
  assert.equal(E.normYm("2025/03"), "2025-03");
  assert.equal(E.normYm("2025년 9월"), "2025-09");
  assert.equal(E.normYm("2025-13"), "");
  assert.equal(v("kwanjeong-domestic-grad-scholarship", { entry: "2025.03" }), "불가");
});

test("예전 프로필(level 기반)을 읽는다", () => {
  const p = E.normalize({ level: "석사", status: "졸업", employed: false });
  assert.equal(p.role, "취업준비생");
  assert.equal(E.normalize({ level: "박사" }).role, "대학원생");
});
