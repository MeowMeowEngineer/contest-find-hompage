/* 공모전 참가 자격 판별. 브라우저에서는 window.ContestElig, 시험·빌드에서는 module.exports로 쓴다.
 * contest.elig 규칙과 사용자가 넣은 profile을 비교해 가능 / 조건부 / 불가를 돌려준다.
 * 규칙 키와 프로필 필드는 docs/data_standard.md에 적혀 있다. */
(function (root) {
  "use strict";

  var ALL_LEVELS = ["초등", "중등", "고등", "학부", "석사", "박사", "박사후", "일반"];
  var LEVEL_LABEL = {
    "초등": "초등학생", "중등": "중학생", "고등": "고등학생", "학부": "대학생", "석사": "석사과정",
    "박사": "박사과정", "박사후": "박사후연구원", "일반": "학생이 아닌 성인"
  };
  var ROLES = ["초등학생", "중학생", "고등학생", "대학생", "대학원생", "취업준비생", "직장인", "자영업·프리랜서", "은퇴·무직"];
  var EMPLOYED_ROLES = ["직장인", "자영업·프리랜서"];

  var DEFAULT_PROFILE = {
    role: "대학생",
    gradLevel: "석사",
    status: "재학",
    fullTime: true,
    university: "",
    uniCountry: "국내",
    uniRegion: "",
    field: "공학",
    entry: "",
    memberships: [],
    employed: false,
    residence: "",
    nationality: "KR",
    birth: ""
  };

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseYmd(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var p = s.split("-");
    return { y: +p[0], m: +p[1], d: +p[2] };
  }
  /* '2025-3', '2025.03', '2025/03' 모두 받아 'YYYY-MM'으로 바꾼다. */
  function normYm(s) {
    var m = typeof s === "string" && s.trim().match(/^(\d{4})\s*[-./년]\s*(\d{1,2})/);
    if (!m || +m[2] < 1 || +m[2] > 12) return "";
    return m[1] + "-" + pad(+m[2]);
  }

  /* 만 나이: 기준일에 생일이 지났으면 연도 차, 아니면 하나 뺀다. */
  function ageOn(birth, ref) {
    var b = parseYmd(birth), r = parseYmd(ref);
    if (!b || !r) return null;
    var a = r.y - b.y;
    if (r.m < b.m || (r.m === b.m && r.d < b.d)) a -= 1;
    return a;
  }

  /* 나이 기준일: 규칙의 ref → 남아 있는 공고 마감일 → 보통 마감하는 달의 다음 차례 말일 → 오늘. */
  function refDate(contest, e, todayStr) {
    if (e.age && e.age.ref) return e.age.ref;
    if (contest.nextDeadline && contest.nextDeadline >= todayStr) return contest.nextDeadline;
    var t = parseYmd(todayStr);
    var best = null;
    (contest.typicalMonths || []).forEach(function (m) {
      var y = t.y;
      var end = new Date(y, m, 0);
      if (ymd(end) < todayStr) { y += 1; end = new Date(y, m, 0); }
      if (contest.nextDeadline && contest.nextDeadline < todayStr) {
        var dl = parseYmd(contest.nextDeadline);
        if (dl.y === y && dl.m === m) end = new Date(y + 1, m, 0);
      }
      if (!best || end < best) best = end;
    });
    return best ? ymd(best) : todayStr;
  }

  /* 예전(v1) 프로필(level 기반)을 지금 형태로 바꾼다. */
  function migrate(src) {
    if (!src || src.role || !src.level) return src;
    var p = Object.assign({}, src);
    if (src.level === "학부") p.role = "대학생";
    else if (["석사", "박사", "석박통합", "박사후"].indexOf(src.level) >= 0) { p.role = "대학원생"; p.gradLevel = src.level; }
    else p.role = src.employed ? "직장인" : "취업준비생";
    if (src.status === "졸업" && (p.role === "대학생" || p.role === "대학원생")) {
      p.role = src.employed ? "직장인" : "취업준비생";
      p.status = "재학";
    }
    delete p.level;
    return p;
  }

  function normalize(profile) {
    var src = migrate(profile || {}) || {};
    var p = {};
    for (var k in DEFAULT_PROFILE) p[k] = src[k] !== undefined && src[k] !== null ? src[k] : DEFAULT_PROFILE[k];
    if (ROLES.indexOf(p.role) < 0) p.role = DEFAULT_PROFILE.role;
    if (!Array.isArray(p.memberships)) p.memberships = [];
    p.entry = normYm(p.entry);
    return p;
  }

  function levelsOf(p) {
    switch (p.role) {
      case "초등학생": return ["초등"];
      case "중학생": return ["중등"];
      case "고등학생": return ["고등"];
      case "대학생": return ["학부"];
      case "대학원생":
        if (p.gradLevel === "석박통합") return ["석사", "박사"];
        if (p.gradLevel === "박사후") return ["박사후"];
        return [p.gradLevel === "박사" ? "박사" : "석사"];
      default: return ["일반"];
    }
  }
  /* 학적·전일제·대학 조건을 따지는 대학(원) 재학 계열인가. */
  function isUniStudent(p) {
    return p.role === "대학생" || (p.role === "대학원생" && p.gradLevel !== "박사후");
  }
  function isEmployed(p) {
    if (EMPLOYED_ROLES.indexOf(p.role) >= 0) return true;
    if (p.role === "대학원생" && p.gradLevel === "박사후") return true;
    if (isUniStudent(p)) return !!p.employed;
    return false;
  }
  function whoText(who) {
    return who.map(function (l) { return LEVEL_LABEL[l] || l; }).join("·");
  }

  function judge(contest, profile, today) {
    var e = (contest && contest.elig) || {};
    var p = normalize(profile);
    var todayStr = today || ymd(new Date());
    var fail = [], cond = [], ok = [];
    var who = e.who || ALL_LEVELS;
    var mine = levelsOf(p);
    var uni = isUniStudent(p);
    var openToAdults = who.indexOf("일반") >= 0;

    if (e.unknown) cond.push(e.unknown);

    var levelOk = mine.some(function (l) { return who.indexOf(l) >= 0; });
    if (!levelOk) fail.push(whoText(who) + "만 참가할 수 있습니다");
    else if (who.length < ALL_LEVELS.length) ok.push(whoText(mine.filter(function (l) { return who.indexOf(l) >= 0; })) + " 참가 가능");

    if (levelOk && e.limitedFor && e.limitedFor["일반"] && !uni) cond.push(e.limitedFor["일반"]);

    if (levelOk && uni && !openToAdults && e.status) {
      var st = p.status === "졸업예정" && e.status.indexOf("졸업예정") < 0 ? "재학" : p.status;
      if (e.status.indexOf(st) < 0) {
        if (st === "휴학") cond.push("휴학생도 참가할 수 있는지 공고에서 확인해야 합니다");
        else if (st === "입학예정") fail.push("입학한 뒤에 참가할 수 있습니다");
        else fail.push(e.status.join("·") + " 학생만 참가할 수 있습니다");
      }
    }

    if (uni) {
      if (e.fullTime && p.fullTime === false) fail.push("전일제 학생만 참가할 수 있습니다");
      if (e.uni === "국내" && p.uniCountry === "해외") fail.push("국내 대학(원) 소속만 참가할 수 있습니다");
      if (e.regions && e.regions.length) {
        var rl = e.regions.join("·");
        if (p.uniCountry === "해외") fail.push(rl + " 소재 대학만 참가할 수 있습니다");
        else if (!p.uniRegion) cond.push(rl + " 소재 대학만 참가할 수 있습니다. 대학 소재지를 넣으면 판별합니다");
        else if (e.regions.indexOf(p.uniRegion) < 0) fail.push(rl + " 소재 대학만 참가할 수 있습니다(입력: " + p.uniRegion + ")");
        else ok.push(p.uniRegion + " 소재 대학");
      }
      if (e.fieldReq && p.field && e.fieldReq.indexOf(p.field) < 0) fail.push(e.fieldReq.join("·") + " 계열만 지원할 수 있습니다");
      if (e.newStudent && levelOk && p.status !== "입학예정") {
        var en = parseYmd(p.entry ? p.entry + "-01" : ""), rf = parseYmd(e.newStudent.ref);
        if (!en) cond.push("신입생 또는 입학 후 2학기 이내만 지원할 수 있습니다. 입학 연월을 넣으면 판별합니다");
        else if ((rf.y - en.y) * 12 + (rf.m - en.m) > e.newStudent.maxMonths) fail.push("신입생 또는 입학 후 2학기 이내만 지원할 수 있습니다(입학 " + p.entry + ")");
      }
    }

    if (levelOk) {
      (e.members || []).forEach(function (m) {
        if (p.memberships.indexOf(m) < 0) cond.push(m + " 회원이어야 합니다. 가입하면 참가할 수 있습니다");
        else ok.push(m + " 회원");
      });
    }

    if (e.residence && e.residence.length) {
      var rs = e.residence.join("·");
      if (!p.residence) cond.push(rs + " 거주자만 참가할 수 있습니다. 거주 지역을 넣으면 판별합니다");
      else if (e.residence.indexOf(p.residence) < 0) fail.push(rs + " 거주자만 참가할 수 있습니다(입력: " + p.residence + ")");
      else ok.push(p.residence + " 거주");
    }

    if (e.nationality === "KR" && p.nationality !== "KR") fail.push("대한민국 국적자만 참가할 수 있습니다");
    if (e.nationality === "KR_IF_ABROAD" && uni && p.uniCountry === "해외" && p.nationality !== "KR") {
      fail.push("해외 대학 재학생은 한국 국적자만 응모할 수 있습니다");
    }
    if (e.foreignNote && p.nationality !== "KR") cond.push(e.foreignNote);

    if (e.age) {
      var ref = refDate(contest, e, todayStr);
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

    var employed = isEmployed(p);
    if (e.unemployed && employed) fail.push("미취업자만 참가할 수 있습니다");
    if (e.generalUnemployed && !uni && employed) fail.push("학생이 아니면 취업준비생만 참가할 수 있습니다");
    if (e.employed && employed && uni) fail.push(e.employed);
    if (e.employedOnly && !employed) fail.push("재직 중인 사람만 참가할 수 있습니다");

    (e.manual || []).forEach(function (m) { cond.push(m); });

    var verdict = fail.length ? "불가" : (cond.length ? "조건부" : "가능");
    return { verdict: verdict, fail: fail, cond: cond, ok: ok, needs: e.needs || [] };
  }

  function describeProfile(profile, today) {
    var p = normalize(profile);
    var parts = [];
    if (p.role === "대학원생") parts.push(p.gradLevel === "박사후" ? "박사후연구원" : "대학원생(" + (p.gradLevel === "석박통합" ? "석박통합" : p.gradLevel) + ")");
    else parts.push(p.role);
    if (isUniStudent(p)) {
      parts[0] += " " + p.status;
      if (p.university) parts.push(p.university);
    }
    var a = ageOn(p.birth, today || ymd(new Date()));
    if (a !== null) parts.push("만 " + a + "세");
    if (p.residence) parts.push(p.residence + " 거주");
    if (p.nationality !== "KR") parts.push("외국 국적");
    return parts.join(" · ");
  }

  var api = {
    judge: judge, ageOn: ageOn, normalize: normalize, describeProfile: describeProfile, normYm: normYm,
    DEFAULT_PROFILE: DEFAULT_PROFILE, ROLES: ROLES, ALL_LEVELS: ALL_LEVELS
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ContestElig = api;
})(this);
