/* D-day, 목록 필터, 내 자격 판별. 정적 HTML이 먼저 보이고 이 스크립트가 날짜와 판별 결과를 덧붙인다. */
(function () {
  "use strict";
  var KEY = "gongmo-radar:profile";
  var E = window.ContestElig;
  var DAY = 86400000;
  var WD = ["일", "월", "화", "수", "목", "금", "토"];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function today0() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseDate(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var p = s.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function md(d) { return pad(d.getMonth() + 1) + "." + pad(d.getDate()) + " (" + WD[d.getDay()] + ")"; }
  function daysUntil(s) { var d = parseDate(s); return d ? Math.round((d - today0()) / DAY) : null; }
  function dLabel(n) { return n === 0 ? "D-DAY" : "D-" + n; }
  function sev(n) { return n <= 7 ? "sev-crit" : n <= 30 ? "sev-warn" : "sev-ok"; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function loadProfile() { try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 저장소를 쓸 수 없는 브라우저 */ } }
  function clearProfile() { try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ } }

  var dataPromise = null;
  function contests() {
    if (!dataPromise) dataPromise = fetch("/data/contests.json").then(function (r) { return r.json(); });
    return dataPromise;
  }

  /* pipeline/common.py의 timing()과 같은 규칙. */
  function timing(c) {
    var t0 = today0();
    var dl = parseDate(c.nextDeadline);
    var passed = !!dl && dl < t0;
    if (dl && !passed) { var days = Math.round((dl - t0) / DAY); return { kind: "set", days: days, date: dl, sort: days }; }
    var ms = (c.typicalMonths || []).filter(function (m) { return m >= 1 && m <= 12; });
    if (ms.length) {
      var best = null;
      ms.forEach(function (m) {
        var y = t0.getFullYear();
        if (new Date(y, m, 0) < t0) y += 1;
        if (passed && dl.getFullYear() === y && dl.getMonth() === m - 1) y += 1;
        var end = new Date(y, m, 0);
        if (!best || end < best.end) best = { end: end, m: m, y: y };
      });
      return { kind: "est", month: best.m, year: best.y, sort: Math.round((best.end - t0) / DAY) + 0.5 };
    }
    return { kind: "none", sort: 1e6 };
  }

  /* ---------- D-day ---------- */
  function paintDdays() {
    $all("[data-dday]").forEach(function (node) {
      var n = daysUntil(node.getAttribute("data-dday"));
      if (n === null) return;
      node.classList.remove("sev-crit", "sev-warn", "sev-ok");
      if (n < 0) { node.textContent = "마감"; node.classList.add("sev-past"); var li = node.closest(".upcoming li"); if (li) li.hidden = true; return; }
      node.textContent = dLabel(n);
      node.classList.add(sev(n));
    });
  }

  /* ---------- 판별 배지 ---------- */
  var VCLS = { "가능": "v-ok", "조건부": "v-cond", "불가": "v-no" };
  function badge(result) {
    var b = el("span", "vbadge " + VCLS[result.verdict], result.verdict === "가능" ? "참가 가능" : result.verdict);
    var why = result.fail.concat(result.cond);
    if (why.length) b.title = why.join("\n");
    return b;
  }
  function paintVerdicts(profile, list) {
    var byId = {};
    list.forEach(function (c) { byId[c.id] = c; });
    $all("[data-verdict-for]").forEach(function (node) {
      var c = byId[node.getAttribute("data-verdict-for")];
      node.textContent = "";
      if (!c || !profile) { node.removeAttribute("data-v"); return; }
      var r = E.judge(c, profile);
      node.setAttribute("data-v", r.verdict);
      node.appendChild(badge(r));
    });
  }

  function paintProfileBars(profile) {
    $all("[data-profile-bar]").forEach(function (bar) {
      if (!profile) return;
      bar.textContent = "";
      bar.appendChild(el("span", "pb-text", E.describeProfile(profile) + " 기준으로 참가 가능 여부를 표시합니다."));
      var a = el("a", "btn ghost", "내 정보 바꾸기");
      a.href = "/check/";
      bar.appendChild(a);
    });
  }

  /* ---------- 상세 페이지의 내 자격 ---------- */
  function reasonList(items, cls) {
    var ul = el("ul", "reasons " + cls);
    items.forEach(function (t) { ul.appendChild(el("li", null, t)); });
    return ul;
  }
  function paintMyElig(profile, list) {
    var box = $("[data-my-elig]");
    if (!box || !profile) return;
    var c = list.filter(function (x) { return x.id === box.getAttribute("data-my-elig"); })[0];
    if (!c) return;
    var r = E.judge(c, profile);
    box.textContent = "";
    box.setAttribute("data-v", r.verdict);
    box.appendChild(el("p", "my-title", "내 자격"));
    var head = el("p", "my-verdict");
    head.appendChild(badge(r));
    head.appendChild(el("span", "my-who", E.describeProfile(profile)));
    box.appendChild(head);
    if (r.fail.length) box.appendChild(reasonList(r.fail, "r-no"));
    if (r.cond.length) box.appendChild(reasonList(r.cond, "r-cond"));
    if (!r.fail.length && !r.cond.length) box.appendChild(el("p", "my-body", "공고의 참가 자격을 모두 채웁니다. 아래 '준비할 것'을 확인하세요."));
    var a = el("a", "btn ghost", "내 정보 바꾸기");
    a.href = "/check/";
    box.appendChild(a);
  }

  /* ---------- 목록 필터 ---------- */
  function setupFilters(profile) {
    var form = $("[data-filters]");
    var ul = $("[data-rows]");
    if (!form || !ul) return null;
    var rows = $all(".row", ul);
    var count = $("[data-count]"), empty = $("[data-empty]");
    var sortKey = {};
    rows.forEach(function (r) {
      sortKey[r.getAttribute("data-id")] = timing({
        nextDeadline: r.getAttribute("data-deadline"),
        typicalMonths: (r.getAttribute("data-months") || "").split(",").filter(Boolean).map(Number)
      }).sort;
    });
    if (profile) { var vf = $("[data-needs-profile]"); if (vf) vf.hidden = false; }
    var params = new URLSearchParams(location.search);
    ["type", "field", "aud"].forEach(function (k) { if (params.get(k) && $("#f-" + k)) $("#f-" + k).value = params.get(k); });

    function apply() {
      var q = $("#f-q").value.trim().toLowerCase();
      var type = $("#f-type").value, field = $("#f-field").value;
      var aud = $("#f-aud") ? $("#f-aud").value : "";
      var vsel = $("#f-verdict") ? $("#f-verdict").value : "";
      var shown = 0;
      rows.forEach(function (r) {
        var vn = r.querySelector("[data-verdict-for]");
        var v = vn ? vn.getAttribute("data-v") : null;
        var ok = (!q || r.getAttribute("data-q").indexOf(q) >= 0) &&
          (!type || r.getAttribute("data-type") === type) &&
          (!field || r.getAttribute("data-fields").split("|").indexOf(field) >= 0) &&
          (!aud || (r.getAttribute("data-aud") || "").split(" ").indexOf(aud) >= 0) &&
          (!vsel || !v || (vsel === "ok" ? v === "가능" : v !== "불가"));
        r.hidden = !ok;
        if (ok) shown += 1;
      });
      var sorted = rows.slice().sort(function (a, b) {
        if ($("#f-sort").value === "name") return a.getAttribute("data-name").localeCompare(b.getAttribute("data-name"), "ko");
        return sortKey[a.getAttribute("data-id")] - sortKey[b.getAttribute("data-id")] ||
          a.getAttribute("data-name").localeCompare(b.getAttribute("data-name"), "ko");
      });
      sorted.forEach(function (r) { ul.appendChild(r); });
      count.textContent = shown === rows.length ? rows.length + "건" : shown + "건 표시 · 전체 " + rows.length + "건";
      empty.hidden = shown > 0;
    }
    form.addEventListener("input", apply);
    form.addEventListener("change", apply);
    apply();
    return apply;
  }

  /* ---------- 판별 페이지 ---------- */
  var FIELDS = ["role", "gradLevel", "university", "status", "uniCountry", "uniRegion", "field", "residence", "nationality", "birth", "entry"];
  function readForm(form) {
    var p = {};
    FIELDS.forEach(function (k) { p[k] = $("#p-" + k, form).value; });
    p.entry = E.normYm(p.entry);
    p.fullTime = $("#p-fullTime", form).checked;
    p.employed = $("#p-employed", form).checked;
    p.memberships = $all('input[name="member"]:checked', form).map(function (i) { return i.value; });
    return p;
  }
  function fillForm(form, p) {
    FIELDS.forEach(function (k) { $("#p-" + k, form).value = p[k] || ""; });
    $("#p-fullTime", form).checked = !!p.fullTime;
    $("#p-employed", form).checked = !!p.employed;
    $all('input[name="member"]', form).forEach(function (i) { i.checked = p.memberships.indexOf(i.value) >= 0; });
    showStudentFields(form, p.role);
  }
  function showStudentFields(form, role) {
    $("[data-uni]", form).hidden = role !== "대학생" && role !== "대학원생";
    $("[data-grad]", form).hidden = role !== "대학원생";
  }
  function whenText(c) {
    var t = timing(c);
    if (t.kind === "set") return { text: dLabel(t.days) + " · " + md(t.date), cls: sev(t.days) };
    if (t.kind === "est") return { text: "보통 " + t.month + "월", cls: "sev-est" };
    return { text: c.cycle === "상시" ? "상시" : "일정 미공지", cls: "sev-est" };
  }
  function setupCheck(list) {
    var form = $("[data-check-form]");
    if (!form) return;
    var saved = loadProfile();
    var profile = E.normalize(saved || E.DEFAULT_PROFILE);
    fillForm(form, profile);
    var note = $("[data-default-note]");
    note.hidden = !!saved;

    function render() {
      var groups = { "가능": [], "조건부": [], "불가": [] };
      list.forEach(function (c) { groups[E.judge(c, profile).verdict].push(c); });
      Object.keys(groups).forEach(function (k) { groups[k].sort(function (a, b) { return timing(a).sort - timing(b).sort; }); });
      var tally = $("[data-tally]");
      tally.textContent = "";
      [["가능", "참가 가능", "v-ok"], ["조건부", "조건부", "v-cond"], ["불가", "불가", "v-no"]].forEach(function (g) {
        var a = el("a", "tally-item " + g[2]);
        a.href = "#g-" + g[0];
        a.appendChild(el("b", null, String(groups[g[0]].length)));
        a.appendChild(el("span", null, g[1]));
        tally.appendChild(a);
      });
      var root = $("[data-results]");
      root.textContent = "";
      [["가능", "참가할 수 있는 공모전", "공고의 참가 자격을 모두 채웁니다."],
       ["조건부", "확인이 필요한 공모전", "생년월일 입력, 학교 추천, 학회 가입처럼 한 가지를 더 확인하면 참가할 수 있습니다."],
       ["불가", "지금은 참가할 수 없는 공모전", "신분, 나이, 거주 지역, 국적 같은 조건이 맞지 않습니다."]].forEach(function (g) {
        var sec = el("section", "group");
        sec.id = "g-" + g[0];
        sec.appendChild(el("h2", null, g[1] + " " + groups[g[0]].length + "건"));
        sec.appendChild(el("p", "hint", g[2]));
        var ul = el("ul", "results");
        groups[g[0]].forEach(function (c) {
          var r = E.judge(c, profile);
          var li = el("li", "res");
          var top = el("div", "res-top");
          var a = el("a", "res-name", c.name);
          a.href = "/contests/" + c.id + "/";
          top.appendChild(a);
          var w = whenText(c);
          top.appendChild(el("span", "res-when " + w.cls, w.text));
          li.appendChild(top);
          var meta = el("p", "res-meta", c.organizer + " · " + c.type + " ");
          var href = c.url || c.sourceUrl;
          if (href) {
            var out = el("a", "out", c.url ? "공식 페이지 ↗" : "공고 보기 ↗");
            out.href = href;
            out.target = "_blank";
            out.rel = "noopener";
            meta.appendChild(out);
          }
          li.appendChild(meta);
          if (r.fail.length) li.appendChild(reasonList(r.fail, "r-no"));
          if (r.cond.length) li.appendChild(reasonList(r.cond, "r-cond"));
          if (g[0] === "가능" && r.needs.length) li.appendChild(el("p", "res-needs", "준비할 것: " + r.needs.join(", ")));
          ul.appendChild(li);
        });
        sec.appendChild(ul);
        root.appendChild(sec);
      });
    }
    function onChange() {
      profile = E.normalize(readForm(form));
      showStudentFields(form, profile.role);
      saveProfile(profile);
      note.hidden = true;
      render();
    }
    form.addEventListener("input", onChange);
    form.addEventListener("change", onChange);
    $("[data-reset-profile]").addEventListener("click", function () {
      clearProfile();
      profile = E.normalize(E.DEFAULT_PROFILE);
      fillForm(form, profile);
      note.hidden = false;
      render();
    });
    render();
  }

  function setupCalendarFilter() {
    var sel = $("#c-aud");
    if (!sel) return;
    sel.addEventListener("change", function () {
      $all(".cal tbody tr").forEach(function (tr) {
        tr.hidden = !!sel.value && (tr.getAttribute("data-aud") || "").split(" ").indexOf(sel.value) < 0;
      });
    });
  }

  function start() {
    paintDdays();
    setupCalendarFilter();
    var profile = loadProfile();
    var needData = profile || $("[data-check-form]");
    var listPromise = needData ? contests() : Promise.resolve(null);
    var applyFilters = setupFilters(profile);
    paintProfileBars(profile);
    listPromise.then(function (list) {
      if (!list) return;
      if (profile) { paintVerdicts(profile, list); paintMyElig(profile, list); }
      if (applyFilters) applyFilters();
      setupCheck(list);
    }).catch(function () {
      var res = $("[data-results]");
      if (res) res.textContent = "공모전 목록을 불러오지 못했습니다. 페이지를 새로 고쳐 보세요.";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
