/* The Brief: daily study app for the NIA entrance exam and interview.
   Everything is stored on this device (localStorage). Content lives in content/*.json
   and is refreshed weekly by a scheduled job that commits to this repository. */
(function () {
  'use strict';

  var STORE_KEY = 'thebrief.v1';
  var DAY_MS = 86400000;
  var BOOTCAMP_DAYS = 14;
  var INTERVALS = [0, 1, 2, 4, 7, 14, 30]; // days until a card is due again, by Leitner box

  var C = null;   // content
  var S = null;   // state
  var tab = 'today';

  // ---------- utils ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dkey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); }
  function daysBetween(a, b) { return Math.round((parseKey(b) - parseKey(a)) / DAY_MS); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); }
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function fmtDate(k) {
    if (!k) return '';
    var p = k.split('-');
    if (p.length === 2) return MONTHS[+p[1] - 1] + ' ' + p[0];
    return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0];
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function rint(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function pct(x) { return Math.round(x * 100); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function fmtNum(n) { return Number(n).toLocaleString('en-GB'); }

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2400);
  }

  // ---------- state ----------
  function blankState() {
    return { v: 1, start: null, name: '', examDate: '', days: {}, cards: {}, qlog: {}, answers: [], apt: [], mocks: [], interviews: [], lessons: {}, briefRead: {}, extraCards: [], appraisal: {}, seenIntro: false, reminder: '' };
  }
  function load() {
    try { var raw = localStorage.getItem(STORE_KEY); if (raw) { var s = JSON.parse(raw); return Object.assign(blankState(), s); } } catch (e) {}
    return blankState();
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {} }
  function today() { var k = dkey(); if (!S.days[k]) S.days[k] = { sec: 0, done: {} }; return S.days[k]; }

  // ---------- content ----------
  function fetchJSON(path) { return fetch(path, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(path); return r.json(); }); }
  function loadContent() {
    var files = ['units', 'cards', 'questions', 'english', 'interview', 'brief', 'plan'];
    return Promise.all(files.map(function (f) { return fetchJSON('content/' + f + '.json'); })).then(function (r) {
      C = { units: r[0], cards: r[1].cards, questions: r[2].questions, english: r[3].items, interview: r[4].questions, brief: r[5], plan: r[6], updated: r[0].updated };
      C.unitById = {}; r[0].units.forEach(function (u) { C.unitById[u.id] = u; });
      C.moduleById = {}; r[0].modules.forEach(function (m) { C.moduleById[m.id] = m; });
      C.ivById = {}; C.interview.forEach(function (q) { C.ivById[q.id] = q; });
      C.updated = [r[0].updated, r[1].updated, r[2].updated, r[5].updated].sort().pop();
    });
  }
  function allCards() {
    var list = C.cards.slice();
    C.brief.stories.forEach(function (st) {
      (st.cards || []).forEach(function (c, i) {
        var id = st.id + '-' + i;
        if (S.extraCards.indexOf(id) >= 0) list.push({ id: id, unit: st.unit, front: c.front, back: c.back, brief: true });
      });
    });
    return list;
  }
  function moduleOf(unitId) { var u = C.unitById[unitId]; return u ? u.module : (unitId || '').charAt(0); }

  // ---------- day plan ----------
  function dayNumber() { if (!S.start) return 1; return daysBetween(S.start, dkey()) + 1; }
  function inBootcamp() { return dayNumber() <= BOOTCAMP_DAYS; }

  function planFor() {
    var n = dayNumber();
    if (n <= BOOTCAMP_DAYS) return Object.assign({ mode: 'bootcamp' }, C.plan.days[n - 1]);
    // daily mode: weakest unit with a lesson, a rotating drill, a random interview question
    var isSunday = new Date().getDay() === 0;
    var weakest = weakUnits(1)[0] || pick(C.units.units).id;
    var drills = ['percentages', 'synonyms', 'ratios', 'comprehension', 'series', 'tables', 'interest', 'idioms', 'averages', 'logic', 'fractions', 'correction', 'speed', 'mixed'];
    var iv = C.interview[n % C.interview.length].id;
    if (isSunday) return { mode: 'daily', day: n, title: 'Weekly mock exam', units: [], mock: 40, drill: 'none', interview: iv };
    return { mode: 'daily', day: n, title: 'Review: ' + C.unitById[weakest].title, units: [weakest], drill: drills[n % drills.length], interview: iv };
  }

  function tasksFor(plan) {
    var t = [{ key: 'brief', label: 'Daily Brief', mins: 5 }];
    if (plan.mock) {
      t.push({ key: 'mock', label: 'Mock exam: ' + plan.mock + ' questions', mins: Math.round(plan.mock * 0.6) });
      t.push({ key: 'cards', label: 'Flashcards due', mins: 5 });
    } else {
      plan.units.forEach(function (u) { t.push({ key: 'lesson:' + u, label: 'Lesson: ' + C.unitById[u].title, mins: C.unitById[u].minutes }); });
      t.push({ key: 'cards', label: 'Flashcards', mins: 7 });
      t.push({ key: 'quiz', label: plan.diagnostic ? 'Starting test: 15 questions' : 'Quiz: 10 questions', mins: plan.diagnostic ? 8 : 5 });
      if (plan.drill && plan.drill !== 'none') t.push({ key: 'drill', label: 'Aptitude: ' + drillName(plan.drill), mins: 5 });
    }
    t.push({ key: 'interview', label: plan.interview === 'mock' ? 'Mock interview' : 'Interview rep', mins: plan.interview === 'mock' ? 12 : 4 });
    return t;
  }
  function drillName(d) {
    return ({ mixed: 'mixed English and maths', percentages: 'percentages', synonyms: 'synonyms and antonyms', ratios: 'ratios', comprehension: 'comprehension', series: 'number series', tables: 'reading tables', interest: 'interest and profit', averages: 'averages', speed: 'speed, distance and time', fractions: 'fractions', idioms: 'idioms and concord', logic: 'logical reasoning', correction: 'sentence correction' })[d] || d;
  }

  // ---------- active-time tracking ----------
  var lastActive = Date.now();
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true, capture: true }); });
  setInterval(function () {
    if (!S || document.hidden) return;
    if (Date.now() - lastActive > 120000) return;
    today().sec += 10; save();
    if (tab === 'today') updateRing();
  }, 10000);

  function minutesToday() { return Math.floor((today().sec || 0) / 60); }
  function streak() {
    var n = 0, k = dkey();
    if (!(S.days[k] && S.days[k].sec >= 300)) k = addDays(k, -1); // today still counts once 5 min are done
    while (S.days[k] && S.days[k].sec >= 300) { n++; k = addDays(k, -1); }
    return n;
  }

  // ---------- spaced repetition ----------
  function cardState(id) { return S.cards[id] || null; }
  function rateCard(id, r) {
    var cs = S.cards[id] || { box: 0, due: dkey(), seen: 0, right: 0 };
    cs.seen++;
    if (r === 2) { cs.box = Math.min(cs.box + 1, INTERVALS.length - 1); cs.right++; }
    else if (r === 1) { cs.box = Math.max(1, cs.box); }
    else { cs.box = 0; }
    cs.due = addDays(dkey(), r === 0 ? 1 : INTERVALS[cs.box] || 1);
    cs.last = dkey();
    S.cards[id] = cs; save();
  }
  function dueCards() {
    var k = dkey();
    return allCards().filter(function (c) { var s = S.cards[c.id]; return s && s.due <= k; });
  }
  function newCardsFor(units) {
    return allCards().filter(function (c) { return units.indexOf(c.unit) >= 0 && !S.cards[c.id]; });
  }

  // ---------- mastery & metrics ----------
  function unitMastery(unitId) {
    var qs = C.questions.filter(function (q) { return q.unit === unitId; });
    var cs = C.cards.filter(function (c) { return c.unit === unitId; });
    var total = qs.length + cs.length; if (!total) return 0;
    var got = 0;
    qs.forEach(function (q) { var l = S.qlog[q.id]; if (l && l.last) got += 1; });
    cs.forEach(function (c) { var s = S.cards[c.id]; if (s) got += s.box >= 2 ? 1 : s.box === 1 ? 0.5 : 0; });
    return got / total;
  }
  function aptAccuracy(n) { var a = S.apt.slice(-(n || 40)); if (!a.length) return 0; return a.filter(function (x) { return x.c; }).length / a.length; }
  function interviewAvg() {
    if (!S.interviews.length) return 0;
    var recent = S.interviews.slice(-10), sum = 0;
    recent.forEach(function (r) { sum += (r.clarity + r.structure + r.composure) / 3; });
    return sum / recent.length;
  }
  function moduleMastery(mid) {
    if (mid === 'H') return aptAccuracy(40);
    var units = C.units.units.filter(function (u) { return u.module === mid; });
    var m = units.length ? units.reduce(function (s, u) { return s + unitMastery(u.id); }, 0) / units.length : 0;
    if (mid === 'I') return S.interviews.length ? (m + interviewAvg() / 5) / 2 : m / 2;
    return m;
  }
  function recentAnswers(days) {
    var from = addDays(dkey(), -(days - 1));
    return S.answers.filter(function (a) { return a.d >= from; });
  }
  function quizAccuracy(days) { var a = recentAnswers(days || 7); if (!a.length) return null; return a.filter(function (x) { return x.c; }).length / a.length; }
  function avgSeconds(days) { var a = recentAnswers(days || 7); if (!a.length) return null; return a.reduce(function (s, x) { return s + x.ms; }, 0) / a.length / 1000; }
  function readiness() {
    var mods = C.units.modules.map(function (m) { return moduleMastery(m.id); });
    var mastery = mods.reduce(function (a, b) { return a + b; }, 0) / mods.length;
    var lastMock = S.mocks[S.mocks.length - 1];
    var test = lastMock ? lastMock.score / lastMock.total : (quizAccuracy(14) || 0);
    var iv = interviewAvg() / 5;
    return clamp(0.5 * mastery + 0.3 * test + 0.2 * iv, 0, 1);
  }
  function weakUnits(n) {
    var seenUnits = C.units.units.filter(function (u) { return S.lessons[u.id]; });
    var pool = seenUnits.length ? seenUnits : C.units.units;
    return pool.map(function (u) { return { id: u.id, m: unitMastery(u.id) }; })
      .sort(function (a, b) { return a.m - b.m; }).slice(0, n || 3).map(function (x) { return x.id; });
  }
  function overconfident() {
    var out = {};
    S.answers.slice(-200).forEach(function (a) { if (a.sure && !a.c && a.u) out[a.u] = (out[a.u] || 0) + 1; });
    return Object.keys(out).map(function (u) { return { u: u, n: out[u] }; }).sort(function (a, b) { return b.n - a.n; });
  }

  // ---------- question generators (aptitude) ----------
  function numOptions(ans, spread, fmt) {
    fmt = fmt || function (x) { return fmtNum(x); };
    var set = {}; set[ans] = 1; var opts = [ans]; var guard = 0;
    while (opts.length < 4 && guard++ < 60) {
      var d = ans + (Math.random() < 0.5 ? -1 : 1) * rint(1, spread);
      if (d > 0 && !set[d]) { set[d] = 1; opts.push(d); }
    }
    while (opts.length < 4) { opts.push(ans + opts.length * 7); }
    opts = shuffle(opts);
    return { o: opts.map(fmt), a: opts.indexOf(ans) };
  }
  var GEN = {
    percentages: function () {
      var t = rint(0, 2);
      if (t === 0) { var p = pick([5, 10, 12, 15, 20, 25, 30, 40, 60, 75]), n = pick([80, 120, 240, 360, 480, 600, 1200, 2500]); var ans = p * n / 100; var o = numOptions(ans, Math.max(3, Math.round(ans / 5))); return { q: 'What is ' + p + '% of ' + fmtNum(n) + '?', o: o.o, a: o.a, x: p + '/100 × ' + n + ' = ' + ans }; }
      if (t === 1) { var y = pick([40, 50, 80, 120, 200, 250, 400]), pp = pick([10, 20, 25, 30, 40, 60, 75]), x = y * pp / 100; var o2 = numOptions(pp, 10, function (v) { return v + '%'; }); return { q: fmtNum(x) + ' is what percentage of ' + fmtNum(y) + '?', o: o2.o, a: o2.a, x: x + ' ÷ ' + y + ' × 100 = ' + pp + '%' }; }
      var a = pick([200, 400, 500, 800, 1000, 1500, 2000]), inc = pick([5, 10, 15, 20, 25, 40, 50]), b = a * (100 + inc) / 100; var o3 = numOptions(inc, 8, function (v) { return v + '%'; });
      return { q: 'The price of a bag of rice rose from ₦' + fmtNum(a * 50) + ' to ₦' + fmtNum(b * 50) + '. What is the percentage increase?', o: o3.o, a: o3.a, x: 'Increase ÷ original × 100 = ' + inc + '%' };
    },
    ratios: function () {
      var t = rint(0, 1);
      if (t === 0) { var a = rint(1, 5), b = rint(2, 7); if (a === b) b++; var k = pick([20, 30, 40, 50, 100, 150]); var total = (a + b) * k; var ans = Math.max(a, b) * k; var o = numOptions(ans, k); return { q: '₦' + fmtNum(total) + ' is shared between two officers in the ratio ' + a + ':' + b + '. How much is the larger share (₦)?', o: o.o, a: o.a, x: 'Total parts = ' + (a + b) + '; one part = ' + k + '; larger share = ' + Math.max(a, b) + ' × ' + k + ' = ' + ans }; }
      var m = rint(2, 6), w = rint(2, 6), f = pick([3, 4, 5, 6, 8]); var men = m * f, women = w * f; var o2 = numOptions(women, f);
      return { q: 'The ratio of men to women at a training camp is ' + m + ':' + w + '. If there are ' + men + ' men, how many women are there?', o: o2.o, a: o2.a, x: men + ' ÷ ' + m + ' = ' + f + ' per part; ' + w + ' × ' + f + ' = ' + women };
    },
    series: function () {
      var t = rint(0, 3), s, ans, rule;
      if (t === 0) { var a = rint(2, 20), d = rint(3, 12); s = [a, a + d, a + 2 * d, a + 3 * d, a + 4 * d]; ans = a + 5 * d; rule = 'add ' + d + ' each time'; }
      else if (t === 1) { var g = rint(2, 3), b = rint(1, 5); s = [b, b * g, b * g * g, b * Math.pow(g, 3), b * Math.pow(g, 4)]; ans = b * Math.pow(g, 5); rule = 'multiply by ' + g; }
      else if (t === 2) { var st = rint(1, 4); s = [0, 1, 2, 3, 4].map(function (i) { return (st + i) * (st + i); }); ans = (st + 5) * (st + 5); rule = 'square numbers'; }
      else { var c = rint(1, 6); s = [c]; for (var i = 1; i < 5; i++) s.push(s[i - 1] + i * 2); ans = s[4] + 10; rule = 'the gap grows by 2 each time'; }
      var o = numOptions(ans, Math.max(4, Math.round(ans / 6)));
      return { q: 'What comes next? ' + s.join(', ') + ', …', o: o.o, a: o.a, x: 'Rule: ' + rule + '. Answer ' + ans + '.' };
    },
    interest: function () {
      var t = rint(0, 2);
      if (t === 0) { var P = pick([10000, 20000, 50000, 100000]), R = pick([5, 8, 10, 12, 15]), T = rint(2, 5); var I = P * R * T / 100; var o = numOptions(I, Math.round(I / 4)); return { q: 'Find the simple interest on ₦' + fmtNum(P) + ' at ' + R + '% per year for ' + T + ' years.', o: o.o.map(function (v) { return '₦' + v; }), a: o.a, x: 'I = P × R × T ÷ 100 = ' + fmtNum(I) }; }
      if (t === 1) { var P2 = pick([10000, 20000, 40000]), R2 = pick([10, 20]); var A = Math.round(P2 * Math.pow(1 + R2 / 100, 2)); var o2 = numOptions(A, Math.round(A / 10)); return { q: '₦' + fmtNum(P2) + ' is invested at ' + R2 + '% compound interest per year. What is it worth after 2 years?', o: o2.o.map(function (v) { return '₦' + v; }), a: o2.a, x: P2 + ' × ' + (1 + R2 / 100) + '² = ' + fmtNum(A) }; }
      var cost = pick([2000, 4000, 5000, 8000, 10000]), p = pick([10, 20, 25, 40, 50]), sell = cost * (100 + p) / 100; var o3 = numOptions(p, 10, function (v) { return v + '%'; });
      return { q: 'A trader buys goods for ₦' + fmtNum(cost) + ' and sells them for ₦' + fmtNum(sell) + '. What is the profit percentage?', o: o3.o, a: o3.a, x: 'Profit ' + fmtNum(sell - cost) + ' ÷ cost ' + fmtNum(cost) + ' × 100 = ' + p + '%' };
    },
    averages: function () {
      var n = rint(4, 6), vals = []; for (var i = 0; i < n; i++) vals.push(rint(40, 95));
      var sum = vals.reduce(function (a, b) { return a + b; }, 0), extra = (sum % n) ? n - (sum % n) : 0; vals[0] += extra; sum += extra;
      var ans = sum / n, o = numOptions(ans, 6);
      return { q: 'A candidate scored ' + vals.join(', ') + ' in ' + n + ' tests. What is the average score?', o: o.o, a: o.a, x: 'Total ' + sum + ' ÷ ' + n + ' = ' + ans };
    },
    speed: function () {
      var t = rint(0, 1);
      if (t === 0) { var v = pick([40, 50, 60, 75, 80, 90]), h = pick([2, 3, 4, 5]); var d = v * h; var o = numOptions(d, 30, function (x) { return x + ' km'; }); return { q: 'A convoy travels at ' + v + ' km/h for ' + h + ' hours. How far does it go?', o: o.o, a: o.a, x: 'Distance = speed × time = ' + v + ' × ' + h + ' = ' + d + ' km' }; }
      var v2 = pick([40, 50, 60, 80]), h2 = pick([2, 3, 4, 5, 6]); var d2 = v2 * h2; var o2 = numOptions(h2, 2, function (x) { return x + ' hours'; });
      return { q: 'Abuja to a town is ' + d2 + ' km. At ' + v2 + ' km/h, how long does the journey take?', o: o2.o, a: o2.a, x: 'Time = distance ÷ speed = ' + d2 + ' ÷ ' + v2 + ' = ' + h2 + ' hours' };
    },
    fractions: function () {
      var den = pick([3, 4, 5, 6, 8]), num = rint(1, den - 1), k = pick([2, 3, 4, 5, 6, 10]), total = den * k * pick([1, 2, 3]);
      var ans = total / den * num, o = numOptions(ans, Math.max(3, Math.round(ans / 4)));
      return { q: num + '/' + den + ' of ' + total + ' recruits passed the first test. How many passed?', o: o.o, a: o.a, x: total + ' ÷ ' + den + ' × ' + num + ' = ' + ans };
    },
    tables: function () {
      var states = shuffle(['Zamfara', 'Sokoto', 'Katsina', 'Kaduna', 'Kebbi', 'Niger']).slice(0, 4);
      var months = ['Jul', 'Aug', 'Sep'];
      var data = states.map(function () { return months.map(function () { return rint(4, 30); }); });
      var html = '<table class="data"><tr><th>Incidents (sample)</th>' + months.map(function (m) { return '<th>' + m + '</th>'; }).join('') + '</tr>' +
        states.map(function (s, i) { return '<tr><td>' + s + '</td>' + data[i].map(function (v) { return '<td class="num">' + v + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
      var t = rint(0, 2), ans, q, x;
      var si = rint(0, 3);
      if (t === 0) { ans = data[si][0] + data[si][1] + data[si][2]; q = 'What is the total number of incidents in ' + states[si] + ' over the three months?'; x = data[si].join(' + ') + ' = ' + ans; }
      else if (t === 1) { var mi = rint(0, 2); ans = data.reduce(function (s, r) { return s + r[mi]; }, 0); q = 'What is the total for all four states in ' + months[mi] + '?'; x = data.map(function (r) { return r[mi]; }).join(' + ') + ' = ' + ans; }
      else { ans = Math.abs(data[si][2] - data[si][0]); q = 'By how much did incidents in ' + states[si] + ' change between Jul and Sep?'; x = '|' + data[si][2] + ' − ' + data[si][0] + '| = ' + ans; }
      var o = numOptions(ans, 6);
      return { html: html, q: q, o: o.o, a: o.a, x: x + '. These figures are invented for practice.' };
    }
  };
  var ENGLISH_TYPES = { synonyms: ['synonyms', 'antonyms'], comprehension: ['comprehension'], idioms: ['idioms', 'concord'], correction: ['correction'], logic: ['logic'] };
  function aptitudeSet(drill, n) {
    var out = [];
    var maths = ['percentages', 'ratios', 'series', 'interest', 'tables', 'averages', 'speed', 'fractions'];
    if (GEN[drill]) { for (var i = 0; i < n; i++) out.push(Object.assign({ id: 'gen-' + drill, kind: drill, u: 'H' }, GEN[drill]())); return out; }
    if (ENGLISH_TYPES[drill]) {
      var pool = C.english.filter(function (e) { return ENGLISH_TYPES[drill].indexOf(e.type) >= 0; });
      if (drill === 'comprehension') { // keep a passage's questions together
        var passages = {}; pool.forEach(function (e) { (passages[e.passage] = passages[e.passage] || []).push(e); });
        var keys = shuffle(Object.keys(passages)); pool = []; keys.forEach(function (k) { pool = pool.concat(passages[k]); });
      } else pool = shuffle(pool);
      return pool.slice(0, n).map(function (e) { return { id: e.id, kind: e.type, u: 'H', q: e.q, passage: e.passage, o: e.o, a: e.a, x: e.x }; });
    }
    // mixed
    for (var j = 0; j < n; j++) {
      if (j % 2 === 0) { var g = pick(maths); out.push(Object.assign({ id: 'gen-' + g, kind: g, u: 'H' }, GEN[g]())); }
      else { var e = pick(C.english.filter(function (x) { return x.type !== 'comprehension'; })); out.push({ id: e.id, kind: e.type, u: 'H', q: e.q, o: e.o, a: e.a, x: e.x }); }
    }
    return out;
  }
  function shuffleOptions(item) {
    var idx = shuffle([0, 1, 2, 3].slice(0, item.o.length));
    return Object.assign({}, item, { o: idx.map(function (i) { return item.o[i]; }), a: idx.indexOf(item.a) });
  }

  // ---------- quiz sets ----------
  function quizSet(units, n, opts) {
    opts = opts || {};
    var own = shuffle(C.questions.filter(function (q) { return units.indexOf(q.unit) >= 0; }));
    var take = own.slice(0, Math.min(own.length, n - (opts.review || 0)));
    var used = {}; take.forEach(function (q) { used[q.id] = 1; });
    var review = C.questions.filter(function (q) { return !used[q.id] && S.qlog[q.id] && !S.qlog[q.id].last; });
    var seen = C.questions.filter(function (q) { return !used[q.id] && S.qlog[q.id]; });
    var rest = shuffle(review).concat(shuffle(seen)).concat(shuffle(C.questions.filter(function (q) { return !used[q.id]; })));
    for (var i = 0; take.length < n && i < rest.length; i++) { if (!used[rest[i].id]) { used[rest[i].id] = 1; take.push(rest[i]); } }
    return take.map(function (q) { return shuffleOptions({ id: q.id, u: q.unit, q: q.q, o: q.o, a: q.a, x: q.x }); });
  }
  function diagnosticSet() {
    var out = [];
    C.units.modules.forEach(function (m) {
      if (m.id === 'H') { out = out.concat(aptitudeSet('mixed', 2)); return; }
      var qs = shuffle(C.questions.filter(function (q) { return moduleOf(q.unit) === m.id; })).slice(0, m.id === 'I' ? 1 : 2);
      qs.forEach(function (q) { out.push(shuffleOptions({ id: q.id, u: q.unit, q: q.q, o: q.o, a: q.a, x: q.x })); });
    });
    return shuffle(out).slice(0, 15);
  }
  function mockSet(n) {
    var apt = Math.round(n * 0.25);
    var qs = shuffle(C.questions).slice(0, n - apt).map(function (q) { return shuffleOptions({ id: q.id, u: q.unit, q: q.q, o: q.o, a: q.a, x: q.x }); });
    return shuffle(qs.concat(aptitudeSet('mixed', apt)));
  }

  // ---------- rendering: shell ----------
  function setTab(t) {
    tab = t;
    $all('#tabbar button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    var v = $('#view');
    v.innerHTML = ({ today: viewToday, brief: viewBrief, study: viewStudy, mock: viewMock, progress: viewProgress })[tab]();
    bind(v);
  }
  // a tiny event delegation: elements with data-act="name" call ACT[name](el)
  var ACT = {};
  function bind(root) {
    $all('[data-act]', root).forEach(function (el) {
      if (el._bound) return; el._bound = true;
      el.addEventListener('click', function (e) { e.preventDefault(); var f = ACT[el.dataset.act]; if (f) f(el); });
    });
  }

  function ringSVG(mins, goal, size) {
    size = size || 84; var r = size / 2 - 7, c = 2 * Math.PI * r, f = clamp(mins / goal, 0, 1);
    return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
      '<circle class="bgc" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '"/>' +
      '<circle class="fgc" id="ringfg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - f)).toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '<text x="50%" y="54%" text-anchor="middle" id="ringtxt">' + mins + 'm</text></svg>';
  }
  function updateRing() {
    var fg = $('#ringfg'), tx = $('#ringtxt'), lab = $('#ringlab'); if (!fg) return;
    var m = minutesToday(), goal = C.plan.goalMinutes, r = +fg.getAttribute('r'), c = 2 * Math.PI * r;
    fg.setAttribute('stroke-dashoffset', (c * (1 - clamp(m / goal, 0, 1))).toFixed(1));
    tx.textContent = m + 'm'; if (lab) lab.textContent = m + ' of ' + goal + ' min';
  }

  function isStandalone() { return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

  // ---------- Today ----------
  function viewToday() {
    var plan = planFor(), tasks = tasksFor(plan), done = today().done, n = dayNumber();
    var d = new Date(), goal = C.plan.goalMinutes, mins = minutesToday();
    var allDone = tasks.every(function (t) { return done[t.key]; });
    var next = tasks.filter(function (t) { return !done[t.key]; })[0];
    var weak = weakUnits(1)[0];
    var exam = '';
    if (S.examDate) { var left = daysBetween(dkey(), S.examDate); if (left >= 0) exam = '<span class="pill warn">Exam in ' + left + ' day' + (left === 1 ? '' : 's') + '</span>'; }
    var h = '';
    if (isIOS() && !isStandalone()) h += '<div class="banner"><div><b>Add this to your home screen.</b> Tap the Share button, then “Add to Home Screen”. Always open The Brief from that icon so your progress stays in one place.</div></div>';
    h += '<header class="head"><span class="label">' + WEEKDAYS[d.getDay()] + ' ' + fmtDate(dkey()) + '</span>' +
      '<h1>' + (plan.mode === 'bootcamp' ? 'Day ' + n + ' of ' + BOOTCAMP_DAYS : 'Daily session') + '</h1>' +
      '<p class="muted">' + esc(plan.title) + '</p>' + (exam ? '<div>' + exam + '</div>' : '') + '</header>';
    h += '<div class="card ringrow">' + ringSVG(mins, goal) + '<div class="stack" style="gap:2px"><b id="ringlab">' + mins + ' of ' + goal + ' min</b><span class="muted small">Streak: ' + streak() + ' day' + (streak() === 1 ? '' : 's') + '</span>' +
      (allDone ? '<span class="pill">Session complete</span>' : '') + '</div></div>';
    h += '<div class="list">' + tasks.map(function (t) {
      return '<button class="item" data-act="task" data-key="' + esc(t.key) + '"><span class="chk' + (done[t.key] ? ' done' : '') + '"></span><span class="grow"><span class="t">' + esc(t.label) + '</span></span><span class="mono small muted">' + t.mins + 'm</span></button>';
    }).join('') + '</div>';
    if (!allDone) h += '<button class="btn block" data-act="task" data-key="' + esc(next.key) + '">' + (Object.keys(done).length ? 'Continue session' : 'Start session') + '</button>';
    else h += '<button class="btn block" data-act="extra">Extra round: 15 minutes</button>';
    if (!S.reminder) h += '<button class="card tight row between" data-act="reminder" style="text-align:left;width:100%"><span><b>Set a daily reminder</b><br><span class="small muted">Adds a repeating alert to your iPhone calendar.</span></span><span class="chev">›</span></button>';
    if (plan.interviewNote) h += '<p class="small muted">Interview note: ' + esc(plan.interviewNote) + '</p>';
    if (weak && Object.keys(S.qlog).length > 5) h += '<button class="card tight row between" data-act="unit" data-unit="' + weak + '" style="text-align:left;width:100%"><span>Weak spot: <b>' + esc(C.unitById[weak].title) + '</b></span><span class="pill warn">review</span></button>';
    if (!allDone) h += '<button class="btn quiet" data-act="extra">Extra round: 15 minutes</button>';
    return h;
  }
  ACT.task = function (el) {
    var key = el.dataset.key, plan = planFor();
    if (key === 'brief') return setTab('brief');
    if (key.indexOf('lesson:') === 0) return openLesson(key.slice(7), true);
    if (key === 'cards') return runCards(sessionCards(plan), 'Flashcards', function () { markDone('cards'); });
    if (key === 'quiz') {
      var set = plan.diagnostic ? diagnosticSet() : quizSet(plan.units, 10, { review: 3 });
      return runQuiz(set, plan.diagnostic ? 'Starting test' : 'Quiz', { onDone: function () { markDone('quiz'); } });
    }
    if (key === 'drill') return runQuiz(aptitudeSet(plan.drill, 6), 'Aptitude: ' + drillName(plan.drill), { apt: true, onDone: function () { markDone('drill'); } });
    if (key === 'interview') return plan.interview === 'mock' ? runMockInterview(function () { markDone('interview'); }) : runInterview(C.ivById[plan.interview] || pick(C.interview), function () { markDone('interview'); });
    if (key === 'mock') return runMock(plan.mock, function () { markDone('mock'); });
  };
  function sessionCards(plan) {
    var due = dueCards();
    var fresh = plan.units && plan.units.length ? newCardsFor(plan.units) : [];
    var list = shuffle(due).slice(0, 25).concat(fresh);
    if (!list.length) list = shuffle(allCards().filter(function (c) { return S.cards[c.id]; })).slice(0, 12);
    if (!list.length) list = shuffle(C.cards).slice(0, 12);
    return list.slice(0, 35);
  }
  function markDone(key) { today().done[key] = true; save(); if (!$('#sheet').hidden) return; render(); }
  ACT.extra = function () {
    var weak = weakUnits(2);
    var cards = shuffle(allCards().filter(function (c) { return weak.indexOf(c.unit) >= 0; })).slice(0, 10);
    runCards(cards, 'Extra round: cards', function () {
      runQuiz(quizSet(weak, 10, { review: 4 }), 'Extra round: quiz', { onDone: function () { today().done.extra = true; save(); } });
    });
  };
  ACT.unit = function (el) { openLesson(el.dataset.unit, false); };

  // ---------- Brief ----------
  function viewBrief() {
    var b = C.brief;
    var h = '<header class="head"><span class="label">' + esc(b.week) + '</span><h1>Daily Brief</h1><p class="muted small">Short, dated stories with sources. Updated ' + fmtDate(b.updated) + '.</p></header>';
    h += '<div class="list">' + b.stories.map(function (st) {
      var read = S.briefRead[st.id];
      return '<button class="item story' + (read ? ' read' : '') + '" data-act="story" data-id="' + esc(st.id) + '">' + (read ? '<span class="chk done"></span>' : '<span class="dot"></span>') +
        '<span class="grow stack" style="gap:2px"><span class="tag">' + esc(st.tag) + ' · ' + fmtDate(st.date) + '</span><span class="t">' + esc(st.title) + '</span></span><span class="chev">›</span></button>';
    }).join('') + '</div>';
    return h;
  }
  ACT.story = function (el) {
    var st = C.brief.stories.filter(function (s) { return s.id === el.dataset.id; })[0]; if (!st) return;
    S.briefRead[st.id] = dkey(); checkBriefDone(); save();
    var ids = (st.cards || []).map(function (c, i) { return st.id + '-' + i; });
    var added = ids.length && ids.every(function (id) { return S.extraCards.indexOf(id) >= 0; });
    openSheet(st.tag, function (body) {
      body.innerHTML = '<div class="sheet-inner lesson"><span class="label">' + esc(st.tag) + ' · ' + fmtDate(st.date) + '</span><h2>' + esc(st.title) + '</h2><p>' + esc(st.body) + '</p>' +
        '<div class="card flat"><span class="label">Why it matters to Nigeria</span><p>' + esc(st.why) + '</p></div>' +
        '<p class="small">Source: <a href="' + esc(st.source.url) + '" target="_blank" rel="noopener">' + esc(st.source.name) + '</a></p>' +
        (ids.length ? '<button class="btn ' + (added ? 'ghost' : '') + ' block" id="addc"' + (added ? ' disabled' : '') + '>' + (added ? 'Cards added' : 'Add ' + ids.length + ' flashcard' + (ids.length > 1 ? 's' : '')) + '</button>' : '') +
        (st.unit && C.unitById[st.unit] ? '<button class="btn ghost block" id="openu">Background lesson: ' + esc(C.unitById[st.unit].title) + '</button>' : '') + '</div>';
      var a = $('#addc', body); if (a) a.onclick = function () { ids.forEach(function (id) { if (S.extraCards.indexOf(id) < 0) S.extraCards.push(id); if (!S.cards[id]) S.cards[id] = { box: 0, due: dkey(), seen: 0, right: 0 }; }); save(); a.textContent = 'Cards added'; a.disabled = true; a.classList.add('ghost'); toast('Added to today\'s flashcards'); };
      var o = $('#openu', body); if (o) o.onclick = function () { closeSheet(); openLesson(st.unit, false); };
    });
  };
  function checkBriefDone() {
    var stories = C.brief.stories, todayK = dkey();
    var readToday = stories.filter(function (s) { return S.briefRead[s.id] === todayK; }).length;
    var allRead = stories.every(function (s) { return S.briefRead[s.id]; });
    if (readToday >= 3 || allRead) today().done.brief = true;
  }

  // ---------- Study ----------
  function viewStudy() {
    var h = '<header class="head"><span class="label">Library</span><h1>Study</h1></header>';
    h += '<div class="btns"><button class="btn" data-act="cardsdue">Flashcards (' + dueCards().length + ' due)</button><button class="btn ghost" data-act="ivpractice">Interview practice</button></div>';
    h += '<div class="btns"><button class="btn ghost" data-act="aptpick">English &amp; maths drill</button><button class="btn ghost" data-act="appraisal">Self-appraisal builder</button></div>';
    C.units.modules.forEach(function (m) {
      var units = C.units.units.filter(function (u) { return u.module === m.id; });
      var mm = moduleMastery(m.id);
      h += '<section class="stack" style="gap:8px"><div class="row between"><h3>' + m.id + ' · ' + esc(m.title) + '</h3><span class="mono small muted">' + pct(mm) + '%</span></div>';
      if (units.length) h += '<div class="list">' + units.map(function (u) {
        return '<button class="item" data-act="unit" data-unit="' + u.id + '"><span class="chk' + (S.lessons[u.id] ? ' done' : '') + '"></span><span class="grow stack" style="gap:0"><span class="t">' + esc(u.title) + '</span><span class="s">' + u.minutes + ' min · ' + pct(unitMastery(u.id)) + '% mastered</span></span><span class="chev">›</span></button>';
      }).join('') + '</div>';
      else h += '<p class="small muted">Practised through the aptitude drills.</p>';
      h += '</section>';
    });
    h += '<p class="small muted">Content last updated ' + fmtDate(C.updated) + '.</p>';
    return h;
  }
  ACT.cardsdue = function () { var d = dueCards(); if (!d.length) { toast('No cards due. Here are some to review.'); d = shuffle(allCards()).slice(0, 15); } runCards(d.slice(0, 40), 'Flashcards'); };
  ACT.ivpractice = function () { runInterview(pick(C.interview)); };
  ACT.appraisal = function () { openAppraisal(); };
  ACT.aptpick = function () {
    openSheet('English & maths', function (body) {
      var kinds = ['mixed', 'percentages', 'ratios', 'fractions', 'averages', 'speed', 'series', 'interest', 'tables', 'synonyms', 'idioms', 'correction', 'comprehension', 'logic'];
      body.innerHTML = '<div class="sheet-inner"><p class="muted">Pick a drill. Each round is 8 questions.</p><div class="list">' + kinds.map(function (k) { return '<button class="item" data-k="' + k + '"><span class="grow t">' + esc(drillName(k)) + '</span><span class="chev">›</span></button>'; }).join('') + '</div></div>';
      $all('[data-k]', body).forEach(function (b) { b.onclick = function () { closeSheet(); runQuiz(aptitudeSet(b.dataset.k, 8), 'Aptitude: ' + drillName(b.dataset.k), { apt: true }); }; });
    });
  };

  function openLesson(unitId, fromTask) {
    var u = C.unitById[unitId]; if (!u) return;
    openSheet(C.moduleById[u.module].short, function (body) {
      var h = '<div class="sheet-inner lesson"><span class="label">Module ' + u.module + ' · ' + u.minutes + ' min read</span><h1>' + esc(u.title) + '</h1>';
      u.sections.forEach(function (s) { h += '<div class="sec"><h2>' + esc(s.h) + '</h2>' + s.p.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>'; });
      if (u.sources && u.sources.length) h += '<div class="sources"><span class="label">Sources</span>' + u.sources.map(function (s) { return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>'; }).join('') + '</div>';
      h += '<button class="btn block" id="ldone">' + (fromTask ? 'Done: go to flashcards' : 'Mark as read') + '</button>';
      h += '<button class="btn ghost block" id="lquiz">Quiz me on this</button></div>';
      body.innerHTML = h;
      $('#ldone', body).onclick = function () {
        S.lessons[u.id] = dkey(); today().done['lesson:' + u.id] = true; save(); closeSheet();
        if (fromTask) {
          var plan = planFor(); var rest = plan.units.filter(function (x) { return !today().done['lesson:' + x]; });
          if (rest.length) openLesson(rest[0], true);
          else if (!today().done.cards) runCards(sessionCards(plan), 'Flashcards', function () { markDone('cards'); });
        }
      };
      $('#lquiz', body).onclick = function () { closeSheet(); runQuiz(quizSet([u.id], 8), 'Quiz: ' + u.title, {}); };
    });
  }

  // ---------- sheet ----------
  var sheetClose = null;
  function openSheet(title, fill, onClose) {
    var sh = $('#sheet');
    sh.innerHTML = '<div class="sheet-top"><button class="x" aria-label="Close" id="shx">×</button><div class="ttl">' + esc(title) + '</div><div id="shmeta" class="timer"></div></div><div class="progress-line"><i id="shprog" style="width:0"></i></div><div class="sheet-body" id="shbody"></div>';
    sh.hidden = false; document.body.style.overflow = 'hidden';
    sheetClose = onClose || null;
    $('#shx').onclick = function () { closeSheet(true); };
    fill($('#shbody'));
    $('#shbody').scrollTop = 0;
  }
  function closeSheet(byUser) {
    var sh = $('#sheet'); if (sh.hidden) return;
    sh.hidden = true; sh.innerHTML = ''; document.body.style.overflow = '';
    var f = sheetClose; sheetClose = null;
    if (f) f(byUser);
    render();
  }
  function setProgress(f) { var p = $('#shprog'); if (p) p.style.width = pct(clamp(f, 0, 1)) + '%'; }
  function setMeta(t) { var m = $('#shmeta'); if (m) m.textContent = t; }

  // ---------- flashcard runner ----------
  function runCards(list, title, onDone) {
    if (!list.length) { toast('No cards to review right now'); if (onDone) onDone(); return; }
    var queue = list.slice(), i = 0, missedOnce = {}, results = [0, 0, 0];
    var finished = false;
    openSheet(title, function (body) { show(); function show() {
      if (i >= queue.length) return end();
      var c = queue[i]; setProgress(i / queue.length); setMeta((i + 1) + ' / ' + queue.length);
      var u = C.unitById[c.unit];
      body.innerHTML = '<div class="sheet-inner"><span class="label">' + (u ? 'Module ' + u.module + ' · ' + esc(u.title) : 'Brief') + (S.cards[c.id] ? '' : ' · new') + '</span>' +
        '<button class="flip" id="flip" aria-label="Flip card"><div class="flip-inner"><div class="face"><span class="label">Question</span><div class="q">' + esc(c.front) + '</div><span class="hint">Tap to reveal</span></div>' +
        '<div class="face back"><span class="label">Answer</span><div class="q">' + esc(c.back) + '</div></div></div></button>' +
        '<div class="rate" id="rate" hidden><button class="r0" data-r="0">Missed</button><button class="r1" data-r="1">Unsure</button><button class="r2" data-r="2">Knew it</button></div></div>';
      var f = $('#flip', body);
      f.onclick = function () { f.classList.toggle('on'); $('#rate', body).hidden = false; };
      $all('[data-r]', body).forEach(function (b) { b.onclick = function () {
        var r = +b.dataset.r; results[r]++;
        rateCard(c.id, r);
        if (r === 0 && !missedOnce[c.id]) { missedOnce[c.id] = 1; queue.push(c); }
        i++; show();
      }; });
    }
    function end() {
      finished = true; setProgress(1); setMeta('');
      body.innerHTML = '<div class="sheet-inner"><h1>Cards done</h1><div class="stats card"><div class="stat"><div class="v">' + results[2] + '</div><div class="k">Knew it</div></div><div class="stat"><div class="v">' + results[1] + '</div><div class="k">Unsure</div></div><div class="stat"><div class="v">' + results[0] + '</div><div class="k">Missed (back tomorrow)</div></div></div><button class="btn block" id="cont">Continue</button></div>';
      $('#cont', body).onclick = function () { closeSheet(); };
    } }, function () { if (finished && onDone) onDone(); else if (!finished && i >= list.length * 0.8 && onDone) onDone(); });
  }

  // ---------- quiz runner (also used for aptitude and mock) ----------
  function runQuiz(items, title, opts) {
    opts = opts || {};
    if (!items.length) { toast('No questions available'); return; }
    var i = 0, score = 0, log = [], t0 = Date.now(), finished = false, timerId = null;
    var mock = !!opts.mock, deadline = mock ? Date.now() + items.length * 45000 : 0;
    openSheet(title, function (body) {
      if (mock) timerId = setInterval(function () { var left = Math.max(0, deadline - Date.now()); setMeta(Math.floor(left / 60000) + ':' + pad(Math.floor(left / 1000) % 60)); if (!left) { clearInterval(timerId); end(); } }, 1000);
      show();
      function show() {
        if (i >= items.length) return end();
        var it = items[i], chosen = -1; t0 = Date.now();
        setProgress(i / items.length); if (!mock) setMeta((i + 1) + ' / ' + items.length);
        body.innerHTML = '<div class="sheet-inner"><span class="label">Question ' + (i + 1) + ' of ' + items.length + (it.u && C.unitById[it.u] ? ' · ' + esc(C.moduleById[C.unitById[it.u].module].short) : it.u === 'H' ? ' · English & maths' : '') + '</span>' +
          (it.passage ? '<div class="passage">' + esc(it.passage) + '</div>' : '') + (it.html || '') +
          '<div class="qtext">' + esc(it.q) + '</div><div class="stack" style="gap:8px" id="opts">' +
          it.o.map(function (o, k) { return '<button class="opt" data-k="' + k + '">' + esc(o) + '</button>'; }).join('') + '</div>' +
          '<div id="confbox" hidden><p class="small muted" style="margin-bottom:6px">How sure are you?</p><div class="conf"><button class="btn ghost" data-sure="1">Sure</button><button class="btn ghost" data-sure="0">Guessing</button></div></div>' +
          '<div id="after"></div></div>';
        $all('.opt', body).forEach(function (b) { b.onclick = function () {
          chosen = +b.dataset.k; $all('.opt', body).forEach(function (x) { x.classList.toggle('sel', x === b); });
          $('#confbox', body).hidden = false;
        }; });
        $all('[data-sure]', body).forEach(function (b) { b.onclick = function () { answer(it, chosen, b.dataset.sure === '1'); }; });
      }
      function answer(it, k, sure) {
        var ms = Date.now() - t0, correct = k === it.a;
        if (correct) score++;
        var rec = { id: it.id, u: it.u, c: correct, ms: Math.min(ms, 180000), sure: sure, d: dkey() };
        log.push(rec);
        if (it.u === 'H' || opts.apt) S.apt.push({ k: it.kind, c: correct, d: dkey() });
        else { S.answers.push(rec); var l = S.qlog[it.id] || { n: 0, right: 0 }; l.n++; if (correct) l.right++; l.last = correct; l.d = dkey(); S.qlog[it.id] = l; }
        if (S.answers.length > 3000) S.answers = S.answers.slice(-2000);
        if (S.apt.length > 1500) S.apt = S.apt.slice(-1000);
        save();
        if (mock) { i++; return show(); }
        $all('.opt', body).forEach(function (b) { var bk = +b.dataset.k; b.disabled = true; if (bk === it.a) b.classList.add('right'); else if (bk === k) b.classList.add('wrong'); });
        $('#confbox', body).hidden = true;
        $('#after', body).innerHTML = '<div class="explain"><b>' + (correct ? 'Correct.' : 'Not quite.') + '</b> ' + esc(it.x || '') + (sure && !correct ? '<br><span class="pill warn" style="margin-top:6px">You were sure: flagged for review</span>' : '') + '</div><button class="btn block" id="nextq" style="margin-top:12px">' + (i + 1 < items.length ? 'Next' : 'See results') + '</button>';
        $('#nextq', body).onclick = function () { i++; show(); };
        $('#nextq', body).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      function end() {
        if (finished) return; finished = true; if (timerId) clearInterval(timerId);
        setProgress(1); setMeta('');
        var total = items.length, byMod = {};
        items.forEach(function (it, k) { var m = it.u === 'H' ? 'H' : moduleOf(it.u); byMod[m] = byMod[m] || { r: 0, n: 0 }; byMod[m].n++; if (log[k] && log[k].c) byMod[m].r++; });
        if (mock) S.mocks.push({ d: dkey(), score: score, total: total, by: byMod });
        save();
        var h = '<div class="sheet-inner"><span class="label">' + (mock ? 'Mock exam result' : 'Result') + '</span><div class="big">' + score + ' / ' + total + '</div><p class="muted">' + pct(score / total) + '% correct' + (log.length ? ' · ' + Math.round(log.reduce(function (s, x) { return s + x.ms; }, 0) / log.length / 1000) + 's per question' : '') + '</p>';
        if (mock || Object.keys(byMod).length > 2) {
          h += '<div class="card stack">' + Object.keys(byMod).sort().map(function (m) { var b = byMod[m], f = b.r / b.n; return '<div class="mrow"><span>' + esc(C.moduleById[m] ? C.moduleById[m].short : m) + '</span><span class="mono small">' + b.r + '/' + b.n + '</span><div class="bar ' + (f < 0.4 ? 'b' : f < 0.65 ? 'w' : '') + '"><i style="width:' + pct(f) + '%"></i></div></div>'; }).join('') + '</div>';
        }
        var wrong = items.filter(function (it, k) { return !(log[k] && log[k].c); });
        if (mock && wrong.length) h += '<details class="card"><summary>Review ' + wrong.length + ' missed question' + (wrong.length > 1 ? 's' : '') + '</summary><div class="stack" style="margin-top:10px">' + wrong.map(function (it) { return '<div><b>' + esc(it.q) + '</b><br><span class="small">Answer: ' + esc(it.o[it.a]) + '. ' + esc(it.x || '') + '</span></div>'; }).join('') + '</div></details>';
        h += '<button class="btn block" id="qdone">Continue</button></div>';
        body.innerHTML = h; body.scrollTop = 0;
        $('#qdone', body).onclick = function () { closeSheet(); };
      }
    }, function () { if (timerId) clearInterval(timerId); if (finished && opts.onDone) opts.onDone(); });
  }

  // ---------- Mock ----------
  function runMock(n, onDone) { runQuiz(mockSet(n), 'Mock exam · ' + n + ' questions', { mock: true, onDone: onDone }); }
  function viewMock() {
    var h = '<header class="head"><span class="label">Exam conditions</span><h1>Mock exams</h1><p class="muted small">Mixed questions from every module plus English and maths, 45 seconds per question, no answers shown until the end.</p></header>';
    h += '<div class="btns"><button class="btn" data-act="mock" data-n="40">40 questions · 30 min</button><button class="btn ghost" data-act="mock" data-n="60">60 questions · 45 min</button></div>';
    h += '<button class="btn ghost block" data-act="mockiv">Mock interview · 8 questions</button>';
    if (S.mocks.length) {
      h += '<h3>History</h3><div class="list">' + S.mocks.slice().reverse().map(function (m) { return '<div class="item"><span class="grow"><span class="t">' + fmtDate(m.d) + '</span></span><span class="mono">' + m.score + '/' + m.total + ' · ' + pct(m.score / m.total) + '%</span></div>'; }).join('') + '</div>';
    } else h += '<p class="muted small">Your first scheduled mock is on day 7.</p>';
    return h;
  }
  ACT.mock = function (el) { var n = +el.dataset.n; runMock(n, function () { if (planFor().mock) markDone('mock'); }); };
  ACT.mockiv = function () { runMockInterview(); };

  // ---------- interview runner ----------
  function runInterview(q, onDone, chain) {
    var finished = false, timer = null;
    openSheet(chain ? 'Mock interview · ' + chain.i + ' of ' + chain.n : 'Interview practice', function (body) {
      stage1();
      function stage1() {
        var left = 20;
        body.innerHTML = '<div class="sheet-inner"><span class="label">The panel asks</span><div class="qtext">' + esc(q.q) + '</div><p class="muted small">Think for 20 seconds, then answer out loud as if the panel were in front of you.</p><div class="countdown" id="cd">0:20</div><button class="btn block" id="go">I\'m ready to answer</button></div>';
        timer = setInterval(function () { left--; var cd = $('#cd', body); if (cd) cd.textContent = '0:' + pad(Math.max(0, left)); if (left <= 0) { clearInterval(timer); stage2(); } }, 1000);
        $('#go', body).onclick = function () { clearInterval(timer); stage2(); };
      }
      function stage2() {
        var sec = 0;
        body.innerHTML = '<div class="sheet-inner"><span class="label">Answer out loud</span><div class="qtext">' + esc(q.q) + '</div><div class="countdown" id="cd">0:00</div><p class="muted small center">Aim for 60–90 seconds. Stand or sit up straight and speak clearly.</p><button class="btn block" id="stop">I\'ve finished</button></div>';
        timer = setInterval(function () { sec++; var cd = $('#cd', body); if (cd) cd.textContent = Math.floor(sec / 60) + ':' + pad(sec % 60); }, 1000);
        $('#stop', body).onclick = function () { clearInterval(timer); stage3(sec); };
      }
      function stage3(sec) {
        var sc = { clarity: 0, structure: 0, composure: 0 };
        var script = q.id === 'iv-01' && S.appraisal.script ? S.appraisal.script : q.model;
        body.innerHTML = '<div class="sheet-inner"><span class="label">You spoke for ' + Math.floor(sec / 60) + ':' + pad(sec % 60) + '</span><div class="qtext">' + esc(q.q) + '</div>' +
          '<div class="card flat stack" style="gap:6px"><span class="label">What a strong answer covers</span><p>' + esc(q.tip) + '</p></div>' +
          '<div class="card flat stack" style="gap:6px"><span class="label">' + (script === q.model ? 'Example answer' : 'Your self-appraisal') + '</span><p class="small">' + esc(script) + '</p></div>' +
          ['clarity', 'structure', 'composure'].map(function (k) { return '<div class="stack" style="gap:6px"><span class="small"><b>' + k.charAt(0).toUpperCase() + k.slice(1) + '</b> <span class="muted">' + ({ clarity: 'Was it clear and easy to follow?', structure: 'Point, reason, example, conclusion?', composure: 'Calm, confident, no long pauses?' })[k] + '</span></span><div class="scale" data-k="' + k + '">' + [1, 2, 3, 4, 5].map(function (n) { return '<button data-n="' + n + '">' + n + '</button>'; }).join('') + '</div></div>'; }).join('') +
          '<button class="btn block" id="save" disabled>Save score</button></div>';
        $all('.scale', body).forEach(function (row) { $all('button', row).forEach(function (b) { b.onclick = function () {
          sc[row.dataset.k] = +b.dataset.n; $all('button', row).forEach(function (x) { x.classList.toggle('on', x === b); });
          $('#save', body).disabled = !(sc.clarity && sc.structure && sc.composure);
        }; }); });
        $('#save', body).onclick = function () {
          S.interviews.push({ d: dkey(), q: q.id, sec: sec, clarity: sc.clarity, structure: sc.structure, composure: sc.composure }); save();
          finished = true; closeSheet();
        };
      }
    }, function () { if (timer) clearInterval(timer); if (finished && onDone) onDone(); });
  }
  function runMockInterview(onDone) {
    var qs = [C.ivById['iv-01']].concat(shuffle(C.interview.filter(function (q) { return q.id !== 'iv-01' && q.id !== 'iv-16'; })).slice(0, 6)).concat([C.ivById['iv-16']]).filter(Boolean);
    var i = 0;
    (function next() { if (i >= qs.length) { if (onDone) onDone(); toast('Mock interview complete'); return; } var q = qs[i++]; runInterview(q, next, { i: i, n: qs.length }); })();
  }

  // ---------- self-appraisal builder ----------
  function openAppraisal() {
    var a = S.appraisal || {};
    var fields = [['name', 'Full name'], ['lga', 'Local government area'], ['state', 'State of origin'], ['dob', 'Date of birth'], ['schools', 'Schools attended and qualifications'], ['achievements', 'Achievements or awards'], ['experience', 'Work experience'], ['vision', 'Your vision: what you want to contribute to the Agency']];
    openSheet('Self-appraisal', function (body) {
      body.innerHTML = '<div class="sheet-inner"><p class="muted small">This stays on this phone only. Fill it in, then practise saying the script out loud until it sounds natural.</p>' +
        fields.map(function (f) { var long = ['schools', 'achievements', 'experience', 'vision'].indexOf(f[0]) >= 0; return '<div class="field"><label for="ap-' + f[0] + '">' + f[1] + '</label>' + (long ? '<textarea id="ap-' + f[0] + '">' + esc(a[f[0]] || '') + '</textarea>' : '<input id="ap-' + f[0] + '" value="' + esc(a[f[0]] || '') + '">') + '</div>'; }).join('') +
        '<button class="btn block" id="apgen">Build my script</button><div id="apout"></div></div>';
      function build() {
        var v = {}; fields.forEach(function (f) { v[f[0]] = ($('#ap-' + f[0], body).value || '').trim(); });
        var s = 'Good morning. My name is ' + (v.name || '___') + '. I am from ' + (v.lga || '___') + ' Local Government Area of ' + (v.state || '___') + ' State, and I was born on ' + (v.dob || '___') + '.\n\n' +
          'I attended ' + (v.schools || '___') + '.\n\n' + (v.achievements ? 'Among my achievements, ' + v.achievements + '.\n\n' : '') + (v.experience ? 'In terms of experience, ' + v.experience + '.\n\n' : '') +
          'My vision is ' + (v.vision || 'to serve Nigeria with discretion and integrity, and to grow into an officer the Agency can rely on') + '.\n\nThank you.';
        v.script = s; S.appraisal = v; save();
        $('#apout', body).innerHTML = '<div class="stack"><span class="label">Your script</span><div class="script">' + esc(s) + '</div><button class="btn ghost block" id="appr">Practise it now</button></div>';
        $('#appr', body).onclick = function () { closeSheet(); runInterview(C.ivById['iv-01']); };
      }
      $('#apgen', body).onclick = build;
      if (a.script) build();
    });
  }

  // ---------- Progress ----------
  function minutesChart() {
    var days = 14, w = 320, hgt = 120, pad0 = 18, goal = C.plan.goalMinutes, k0 = addDays(dkey(), -(days - 1));
    var vals = []; for (var i = 0; i < days; i++) { var k = addDays(k0, i); vals.push(Math.round(((S.days[k] && S.days[k].sec) || 0) / 60)); }
    var max = Math.max(goal * 1.4, Math.max.apply(null, vals)), bw = (w - 8) / days;
    var y = function (v) { return hgt - pad0 - (v / max) * (hgt - pad0 - 6); };
    var bars = vals.map(function (v, i) { var h = (hgt - pad0) - y(v); return '<rect class="b' + (v < goal ? ' under' : '') + '" x="' + (4 + i * bw + 2).toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + (bw - 4).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" rx="2"/>'; }).join('');
    var labels = vals.map(function (v, i) { if (i % 2) return ''; var k = addDays(k0, i); return '<text x="' + (4 + i * bw + bw / 2).toFixed(1) + '" y="' + (hgt - 4) + '" text-anchor="middle">' + (+k.split('-')[2]) + '</text>'; }).join('');
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + hgt + '" role="img" aria-label="Minutes studied per day, last 14 days">' + bars +
      '<line class="goal" x1="4" x2="' + (w - 4) + '" y1="' + y(goal).toFixed(1) + '" y2="' + y(goal).toFixed(1) + '"/><text x="' + (w - 4) + '" y="' + (y(goal) - 4).toFixed(1) + '" text-anchor="end">goal ' + goal + 'm</text>' + labels + '</svg>';
  }
  function viewProgress() {
    var r = readiness(), acc = quizAccuracy(7), spd = avgSeconds(7);
    var learned = Object.keys(S.cards).filter(function (id) { return S.cards[id].box >= 2; }).length;
    var week = 0, wdays = 0; for (var i = 0; i < 7; i++) { var dd = S.days[addDays(dkey(), -i)]; if (dd && dd.sec) { week += dd.sec; if (dd.sec >= 300) wdays++; } }
    var h = '<header class="head"><span class="label">' + (inBootcamp() ? 'Day ' + dayNumber() + ' of ' + BOOTCAMP_DAYS : 'Daily mode · day ' + dayNumber()) + '</span><h1>Exam readiness ' + pct(r) + '%</h1><p class="muted small">Half from what you\'ve mastered, a third from your latest mock or quiz scores, the rest from interview practice.</p></header>';
    h += '<div class="card stack">' + C.units.modules.map(function (m) { var f = moduleMastery(m.id); return '<div class="mrow"><span>' + esc(m.short) + '</span><span class="mono small">' + pct(f) + '%</span><div class="bar ' + (f < 0.35 ? 'b' : f < 0.6 ? 'w' : '') + '"><i style="width:' + pct(f) + '%"></i></div></div>'; }).join('') + '</div>';
    h += '<div class="card stats">' +
      stat(acc == null ? '–' : pct(acc) + '%', 'Quiz accuracy, 7 days') + stat(spd == null ? '–' : Math.round(spd) + 's', 'Average per question') +
      stat(streak() + 'd', 'Streak') + stat(Math.round(week / 60) + 'm', 'Minutes this week (' + wdays + ' days)') +
      stat(learned, 'Cards learned') + stat(dueCards().length, 'Cards due now') +
      stat(S.interviews.length ? interviewAvg().toFixed(1) + '/5' : '–', 'Interview self-score') + stat(S.mocks.length ? pct(S.mocks[S.mocks.length - 1].score / S.mocks[S.mocks.length - 1].total) + '%' : '–', 'Latest mock') + '</div>';
    h += '<div class="card stack"><span class="label">Minutes per day</span>' + minutesChart() + '</div>';
    if (S.mocks.length > 1) h += '<div class="card stack"><span class="label">Mock exam trend</span>' + S.mocks.map(function (m) { var f = m.score / m.total; return '<div class="mrow"><span>' + fmtDate(m.d) + '</span><span class="mono small">' + pct(f) + '%</span><div class="bar"><i style="width:' + pct(f) + '%"></i></div></div>'; }).join('') + '</div>';
    var oc = overconfident().slice(0, 4);
    var weak = weakUnits(3);
    h += '<div class="card stack"><span class="label">Focus next</span>' + weak.map(function (u) { return '<button class="item" style="padding:8px 0" data-act="unit" data-unit="' + u + '"><span class="grow">' + esc(C.unitById[u].title) + '</span><span class="mono small muted">' + pct(unitMastery(u)) + '%</span></button>'; }).join('') +
      (oc.length ? '<p class="small"><span class="pill warn">Sure but wrong</span> ' + oc.map(function (o) { return esc(C.unitById[o.u] ? C.unitById[o.u].title : o.u) + ' (' + o.n + ')'; }).join(', ') + '</p>' : '') + '</div>';
    var briefWeek = C.brief.stories.filter(function (s) { return S.briefRead[s.id]; }).length;
    h += '<p class="small muted">Current-affairs freshness: ' + briefWeek + ' of ' + C.brief.stories.length + ' Brief stories read.</p>';
    h += '<button class="btn block" data-act="report">Share progress report</button>';
    h += '<h3>Settings</h3><div class="list">' +
      '<button class="item" data-act="setname"><span class="grow t">Name on report</span><span class="muted small">' + esc(S.name || 'Not set') + '</span></button>' +
      '<button class="item" data-act="reminder"><span class="grow t">Daily reminder</span><span class="muted small">' + (S.reminder ? esc(S.reminder) : 'Not set') + '</span></button>' +
      '<button class="item" data-act="setexam"><span class="grow t">Exam date</span><span class="muted small">' + (S.examDate ? fmtDate(S.examDate) : 'Not announced') + '</span></button>' +
      '<button class="item" data-act="backup"><span class="grow t">Back up or restore progress</span><span class="chev">›</span></button>' +
      '<button class="item" data-act="reset"><span class="grow t" style="color:var(--bad)">Start over</span></button></div>';
    h += '<p class="small muted">Progress is stored on this phone only. Content updated ' + fmtDate(C.updated) + '.</p>';
    return h;
  }
  function stat(v, k) { return '<div class="stat"><div class="v">' + v + '</div><div class="k">' + esc(k) + '</div></div>'; }

  function reportText() {
    var acc = quizAccuracy(7), spd = avgSeconds(7), week = 0, wdays = 0;
    for (var i = 0; i < 7; i++) { var dd = S.days[addDays(dkey(), -i)]; if (dd && dd.sec) { week += dd.sec; if (dd.sec >= 300) wdays++; } }
    var lm = S.mocks[S.mocks.length - 1];
    var lines = [
      'The Brief: progress report' + (S.name ? ' for ' + S.name : ''),
      fmtDate(dkey()) + ' · ' + (inBootcamp() ? 'bootcamp day ' + dayNumber() + ' of ' + BOOTCAMP_DAYS : 'daily mode, day ' + dayNumber()) + ' · streak ' + streak() + ' days',
      '',
      'Exam readiness: ' + pct(readiness()) + '%',
      'Last 7 days: ' + Math.round(week / 60) + ' minutes over ' + wdays + ' days (goal ' + C.plan.goalMinutes + ' min/day)',
      'Quiz accuracy (7 days): ' + (acc == null ? 'no quizzes yet' : pct(acc) + '%, ' + Math.round(spd) + 's per question'),
      'Latest mock: ' + (lm ? lm.score + '/' + lm.total + ' (' + pct(lm.score / lm.total) + '%) on ' + fmtDate(lm.d) : 'none yet'),
      'Interview practice: ' + S.interviews.length + ' reps' + (S.interviews.length ? ', average self-score ' + interviewAvg().toFixed(1) + '/5' : ''),
      '',
      'Mastery by module:'
    ];
    C.units.modules.forEach(function (m) { lines.push('· ' + m.short + ': ' + pct(moduleMastery(m.id)) + '%'); });
    lines.push('', 'Focus next: ' + weakUnits(3).map(function (u) { return C.unitById[u].title; }).join('; '));
    return lines.join('\n');
  }
  ACT.report = function () {
    var text = reportText();
    if (navigator.share) { navigator.share({ title: 'The Brief progress', text: text }).catch(function () {}); return; }
    openSheet('Progress report', function (body) {
      body.innerHTML = '<div class="sheet-inner"><textarea class="script" id="rep" rows="18" style="width:100%" readonly>' + esc(text) + '</textarea><button class="btn block" id="cp">Copy report</button></div>';
      $('#cp', body).onclick = function () {
        var ta = $('#rep', body);
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Copied'); }, function () { ta.select(); toast('Select all and copy'); });
      };
    });
  };
  var REMINDER_TIMES = [['0600', '6:00 am'], ['0700', '7:00 am'], ['1300', '1:00 pm'], ['1800', '6:00 pm'], ['2000', '8:00 pm'], ['2100', '9:00 pm']];
  ACT.reminder = function () {
    openSheet('Daily reminder', function (body) {
      body.innerHTML = '<div class="sheet-inner"><p>Pick a time. Your iPhone will show the calendar event: tap <b>Add to Calendar</b> (or “Add All”). You will then get an alert at that time every day.</p>' +
        '<div class="list">' + REMINDER_TIMES.map(function (t) { return '<a class="item" style="text-decoration:none;color:inherit" href="reminders/brief-' + t[0] + '.ics" data-t="' + t[1] + '"><span class="grow t">' + t[1] + '</span><span class="chev">›</span></a>'; }).join('') + '</div>' +
        '<p class="small muted">To change the time later, delete “The Brief” event from your Calendar app and pick a new time here. If nothing happens when you tap, open the app in Safari and try again there.</p>' +
        (S.reminder ? '<button class="btn ghost block" id="clr">I removed my reminder</button>' : '') + '</div>';
      $all('[data-t]', body).forEach(function (a) { a.addEventListener('click', function () { S.reminder = a.dataset.t; save(); }); });
      var c = $('#clr', body); if (c) c.onclick = function () { S.reminder = ''; save(); closeSheet(); };
    });
  };
  ACT.setname = function () {
    openSheet('Name on report', function (body) {
      body.innerHTML = '<div class="sheet-inner"><div class="field"><label for="nm">First name (shown only on the shared report)</label><input id="nm" value="' + esc(S.name) + '"></div><button class="btn block" id="ok">Save</button></div>';
      $('#ok', body).onclick = function () { S.name = $('#nm', body).value.trim(); save(); closeSheet(); };
    });
  };
  ACT.setexam = function () {
    openSheet('Exam date', function (body) {
      body.innerHTML = '<div class="sheet-inner"><div class="field"><label for="ed">When is the exam? Leave blank if not announced.</label><input type="date" id="ed" value="' + esc(S.examDate) + '"></div><button class="btn block" id="ok">Save</button></div>';
      $('#ok', body).onclick = function () { S.examDate = $('#ed', body).value; save(); closeSheet(); };
    });
  };
  ACT.backup = function () {
    openSheet('Back up or restore', function (body) {
      var code = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
      body.innerHTML = '<div class="sheet-inner"><p class="small">Copy this code and keep it somewhere safe (for example, email it to yourself). Paste it back here to restore your progress on a new phone.</p>' +
        '<div class="field"><label for="bk">Backup code</label><textarea id="bk" rows="6">' + code + '</textarea></div><div class="btns"><button class="btn" id="cp">Copy code</button><button class="btn ghost" id="rs">Restore from code</button></div></div>';
      $('#cp', body).onclick = function () { var ta = $('#bk', body); ta.value = code; (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () { toast('Copied'); }, function () { ta.select(); toast('Select all and copy'); }); };
      $('#rs', body).onclick = function () {
        try { var s = JSON.parse(decodeURIComponent(escape(atob($('#bk', body).value.trim())))); if (!s || !s.days) throw 0; S = Object.assign(blankState(), s); save(); toast('Progress restored'); closeSheet(); }
        catch (e) { toast('That code didn\'t work. Check it was copied in full.'); }
      };
    });
  };
  ACT.reset = function () {
    openSheet('Start over', function (body) {
      body.innerHTML = '<div class="sheet-inner"><p>This deletes all progress on this phone and starts the 14-day bootcamp again from day 1. It cannot be undone.</p><button class="btn block" id="yes" style="background:var(--bad)">Delete progress and start over</button><button class="btn ghost block" id="no">Keep my progress</button></div>';
      $('#yes', body).onclick = function () { S = blankState(); S.start = dkey(); S.seenIntro = true; save(); closeSheet(); setTab('today'); };
      $('#no', body).onclick = function () { closeSheet(); };
    });
  };

  // ---------- intro ----------
  function intro() {
    openSheet('Welcome', function (body) {
      body.innerHTML = '<div class="sheet-inner"><span class="stamp">Restricted · candidate copy</span><h1>The Brief</h1>' +
        '<p>A 14-day bootcamp for the National Intelligence Agency exam and interview, then a daily routine until exam day.</p>' +
        '<div class="card flat stack"><p><b>Every day, about 35 minutes:</b> the Daily Brief, a short lesson, flashcards, a quiz, an English or maths drill, and one interview question.</p><p><b>Mock exams</b> on day 7 and day 14, then every Sunday.</p><p><b>New content every week</b> from news agencies, official sources and research institutes, each with its source.</p></div>' +
        (isIOS() && !isStandalone() ? '<div class="banner"><div><b>First:</b> tap the Share button in Safari, then “Add to Home Screen”. Open The Brief from that icon from now on.</div></div>' : '') +
        '<div class="field"><label for="exd">Exam date, if you know it (you can add it later)</label><input type="date" id="exd"></div>' +
        '<button class="btn block" id="begin">Start day 1</button></div>';
      $('#begin', body).onclick = function () { S.start = dkey(); S.examDate = $('#exd', body).value || ''; S.seenIntro = true; save(); closeSheet(); };
    });
  }

  // ---------- boot ----------
  $all('#tabbar button').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
  S = load();
  loadContent().then(function () {
    if (!S.start) S.start = dkey();
    checkBriefDone(); save();
    render();
    if (!S.seenIntro) intro();
  }).catch(function (e) {
    $('#view').innerHTML = '<div class="card"><h2>Couldn\'t load the study content</h2><p class="muted">Check your internet connection and open the app again. (' + esc(e.message) + ')</p></div>';
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && C && $('#sheet').hidden) render(); });
})();
