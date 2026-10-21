// 대상별 대표 프로필(site.json audiences.personas)로 모든 공모전을 판별한다. pipeline/build.py가 부른다.
//   node tools/verdicts.cjs 2026-10-21   → {"<id>": {"<slug>": "가능|조건부|불가", ...}, ...}
const fs = require("node:fs");
const path = require("node:path");
const E = require("../assets/eligibility.js");

const root = path.join(__dirname, "..");
const today = process.argv[2];
const site = JSON.parse(fs.readFileSync(path.join(root, "site.json"), "utf8"));
const dir = path.join(root, "data", "contests");
const rank = { "가능": 0, "조건부": 1, "불가": 2 };
const out = {};
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
  const c = Object.assign({ id: f.slice(0, -5) }, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  out[c.id] = {};
  for (const a of site.audiences) {
    let best = "불가";
    for (const per of a.personas) {
      const y = +today.slice(0, 4) - per.age;
      const profile = Object.assign({}, E.DEFAULT_PROFILE, per, { birth: `${y}-07-01` });
      const v = E.judge(c, profile, today).verdict;
      if (rank[v] < rank[best]) best = v;
    }
    out[c.id][a.slug] = best;
  }
}
process.stdout.write(JSON.stringify(out));
