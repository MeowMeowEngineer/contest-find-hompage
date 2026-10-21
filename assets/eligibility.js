/* 공모전 참가 자격 판별. 브라우저에서는 window.ContestElig, 시험에서는 module.exports로 쓴다.
 * contest.elig 규칙과 사용자가 넣은 profile을 비교해 가능 / 조건부 / 불가를 돌려준다.
 * 규칙 키는 docs/data_standard.md의 'elig' 절에 적혀 있다. */
(function (root) {
  "use strict";

  var STUDENT_LEVELS = ["학부", "석사", "박사", "석박통합"];
  var LEVEL_LABEL = { "학부": "학부생", "석사": "석사과정", "박사": "박사과정", "박사후": "박사후연구원", "일반": "학생이 아닌 사람" };

  var DEFAULT_PROFILE = {
    university: "",
    level: "석사",
    status: "재학",
    fullTime: true,
    uniCountry: "국내",
    uniRegion: "",
    nationality: "KR",
    birth: "",
    employed: false,
    memberships: [],
    field: "공학",
    entry: ""
  };

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseYmd(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var p = s.split("-");
    return { y: +p[0], m: +p[1], d: +p[2] };
  }
  function parseYm(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}$/.test(s)) return null;
    var p = s.split("-");
    return { y: +p[0], m: +p[1] };
  }

  /* 만 나이: 기준일에 생일이 지났으면 연도 차, 아니면 하나 뺀다. */
  function ageOn(birth, ref) {
    var b = parseYmd(birth), r = parseYmd(ref);
    if (!b || !r) return null;
    var a = r.y - b.y;
    if (r.m < b.m || (r.m === b.m && r.d < b.d)) a -= 1;
    return a;
  }

  function normalize(profile) {
    var p = {};
    var src = profile || {};
    for (var k in DEFAULT_PROFILE) p[k] = src[k] !== undefined ? src[k] : DEFAULT_PROFILE[k];
    if (!Array.isArray(p.memberships)) p.memberships = [];
    return p;
  }

  /* 판별에 쓰는 과정. 석박통합은 석사·박사 둘 다로 본다. 졸업했으면 학생이 아니다. */
  function levelsOf(p) {
    if (p.status === "졸업" && STUDENT_LEVELS.indexOf(p.level) >= 0) return ["일반"];
    if (p.level === "석박통합") return ["석사", "박사"];
    return [p.level];
  }
  function isStudent(p) {
    return STUDENT_LEVELS.indexOf(p.level) >= 0 && p.status !== "졸업";
  }
  function whoText(who) {
    var names = who.filter(function (l) { return l !== "일반"; }).map(function (l) { return LEVEL_LABEL[l] || l; });
    return names.join("·");
  }

  function judge(contest, profile, today) {
    var e = (contest && contest.elig) || {};
    var p = normalize(profile);
    var todayStr = today || ymd(new Date());
    var fail = [], cond = [], ok = [];
    var who = e.who || ["학부", "석사", "박사", "박사후", "일반"];
    var mine = levelsOf(p);
    var openToAll = who.indexOf("일반") >= 0;
    var viaStudent = !openToAll && isStudent(p);

    if (e.unknown) cond.push(e.unknown);

    var levelOk = mine.some(function (l) { return who.indexOf(l) >= 0; });
    if (!levelOk) {
      fail.push(whoText(who) + "만 참가할 수 있습니다");
    } else if (!openToAll) {
      ok.push(whoText(who) + " 대상");
    }

    if (levelOk && e.limitedFor) {
      mine.forEach(function (l) {
        if (e.limitedFor[l] && !isStudent(p)) cond.push(e.limitedFor[l]);
      });
    }

    if (levelOk && viaStudent && e.status) {
      var st = p.status === "졸업예정" && e.status.indexOf("졸업예정") < 0 ? "재학" : p.status;
      if (e.status.indexOf(st) < 0) {
        if (st === "휴학") cond.push("휴학생도 참가할 수 있는지 공고에서 확인해야 합니다");
        else if (st === "입학예정") fail.push("입학한 뒤에 참가할 수 있습니다");
        else fail.push(e.status.join("·") + " 학생만 참가할 수 있습니다");
      }
    }

    if (e.fullTime && isStudent(p) && p.fullTime === false) fail.push("전일제 학생만 참가할 수 있습니다");

    if (e.uni === "국내" && p.uniCountry === "해외") fail.push("국내 대학(원) 소속만 참가할 수 있습니다");

    if (e.regions && e.regions.length) {
      if (p.uniCountry === "해외") {
        fail.push(e.regions.join("·") + " 소재 대학만 참가할 수 있습니다");
      } else if (!p.uniRegion) {
        cond.push(e.regions.join("·") + " 소재 대학만 참가할 수 있습니다. 대학 소재지를 넣으면 판별합니다");
      } else if (e.regions.indexOf(p.uniRegion) < 0) {
        fail.push(e.regions.join("·") + " 소재 대학만 참가할 수 있습니다(입력: " + p.uniRegion + ")");
      } else {
        ok.push(p.uniRegion + " 소재 대학");
      }
    }

    if (e.nationality === "KR" && p.nationality !== "KR") fail.push("대한민국 국적자만 참가할 수 있습니다");
    if (e.nationality === "KR_IF_ABROAD" && p.uniCountry === "해외" && p.nationality !== "KR") {
      fail.push("해외 대학 재학생은 한국 국적자만 응모할 수 있습니다");
    }
    if (e.foreignNote && p.nationality !== "KR") cond.push(e.foreignNote);

    if (e.age) {
      var ref = e.age.ref || contest.nextDeadline || todayStr;
      var a = ageOn(p.birth, ref);
      var range = (e.age.min != null ? "만 " + e.age.min + "세 이상" : "") +
        (e.age.min != null && e.age.max != null ? ", " : "") +
        (e.age.max != null ? "만 " + e.age.max + "세 이하" : "");
      if (a === null) {
        if (!e.age.soft) cond.push(range + " 조건이 있습니다. 생년월일을 넣으면 판별합니다");
      } else if ((e.age.min != null && a < e.age.min) || (e.age.max != null && a > e.age.max)) {
        fail.push(range + "만 참가할 수 있습니다(" + ref + " 기준 만 " + a + "세)" + (e.age.note ? ". " + e.age.note : ""));
      } else if (!e.age.soft) {
        ok.push(ref + " 기준 만 " + a + "세");
      }
    }

    if (e.unemployed && p.employed) fail.push("미취업자만 참가할 수 있습니다");
    if (e.generalUnemployed && !isStudent(p) && p.employed) fail.push("학생이 아니면 취업준비생만 참가할 수 있습니다");
    if (e.employed && p.employed) fail.push(e.employed);

    if (e.fieldReq && p.field && e.fieldReq.indexOf(p.field) < 0) {
      fail.push(e.fieldReq.join("·") + " 계열만 지원할 수 있습니다");
    }

    if (e.newStudent && levelOk && p.status !== "입학예정") {
      var en = parseYm(p.entry), rf = parseYmd(e.newStudent.ref);
      if (!en) {
        cond.push("신입생 또는 입학 후 2학기 이내만 지원할 수 있습니다. 입학 연월을 넣으면 판별합니다");
      } else if ((rf.y - en.y) * 12 + (rf.m - en.m) > e.newStudent.maxMonths) {
        fail.push("신입생 또는 입학 후 2학기 이내만 지원할 수 있습니다(입학 " + p.entry + ")");
      }
    }

    (e.members || []).forEach(function (m) {
      if (p.memberships.indexOf(m) < 0) cond.push(m + " 회원이어야 합니다. 가입하면 참가할 수 있습니다");
      else ok.push(m + " 회원");
    });

    (e.manual || []).forEach(function (m) { cond.push(m); });

    var verdict = fail.length ? "불가" : (cond.length ? "조건부" : "가능");
    return { verdict: verdict, fail: fail, cond: cond, ok: ok, needs: e.needs || [] };
  }

  function describeProfile(profile) {
    var p = normalize(profile);
    var lv = p.level === "석박통합" ? "석박통합과정" : (LEVEL_LABEL[p.level] || p.level);
    var parts = [];
    if (p.university) parts.push(p.university);
    parts.push(lv + (isStudent(p) ? " " + p.status : ""));
    if (isStudent(p)) parts.push(p.fullTime ? "전일제" : "비전일제");
    if (p.uniCountry === "해외") parts.push("해외 대학");
    if (p.nationality !== "KR") parts.push("외국 국적");
    return parts.join(" · ");
  }

  var api = { judge: judge, ageOn: ageOn, normalize: normalize, describeProfile: describeProfile, DEFAULT_PROFILE: DEFAULT_PROFILE };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ContestElig = api;
})(this);
