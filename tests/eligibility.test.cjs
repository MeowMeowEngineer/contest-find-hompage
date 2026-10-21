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
