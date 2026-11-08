// JBC 台中站 1213 即時計分：規則、排名、頒獎與匯出（純函式；瀏覽器、Node 測試、Apps Script 共用）
// 資料狀態 state：{ key: { kind, payload, by, src, time } }
//   cfg                          {mmax, am, pm, gate, lineTries, round, top5Only, items:[{t,p}], open:{am,pm}}   計分台設定
//   basic:<隊號>:<1|2>           {done, at}            基礎變化題 1、2 完成（新秀／進階／高手）
//   mys:<隊號>:<輸入者>.<n>      {s, c:[子項], at, void} 神秘題一次挑戰（輸入者＝崗位代號，例 A05.3；同一隊不同手機不會撞號）
//   task:<隊號>:<題號>           {t:["S"|"F", …]}      啟蒙／探索：每題 2 次機會，S 成功、F 失敗
//   draw:<組>                    {lots:{籤號:隊號}}    相撲抽籤（只給 fixedDraw 不是 true 的組用）；11/5 晚理事長定「不抽籤、籤號＝隊伍編號順序」→ 各組 fixedDraw:true，用 data.js 的 lotTeams
//   sumo:<組>:<輪>:<台>          {r:[每局…]}           相撲預賽一場（11/7 起三回合全打、每贏一回合 1 分）：R 紅勝、B 藍勝、TR/TB 時間到紅/藍較輕、T0 同重、XR/XB 對手缺賽或逾時
//   weight:<隊號>                {g}                   秤重（公克），同分時輕者在前
//   final:<組>:<SF1|SF2|P3|F>    {rounds, red, blue, adminRounds}   決賽：SF1＝1 vs 4、SF2＝2 vs 3、P3＝季殿軍戰、F＝冠亞軍戰
//   lineset                      {laps, sec}           循線現場抽籤：圈數 2–5、每圈 10–30 秒
//   line:<隊號>:<n>              {t:[累計秒…], done}    循線第 n 次（done＝最後停在終點線上）
//   absent:<隊號>                {on, miss:[隊員序]}   on＝整隊缺賽；miss＝哪幾位隊員沒到（不發證書）
(function (root) {
  "use strict";

  // ---------- 設定（計分台可改；沒設定就用這裡的預設）----------
  // 假設（待理事長決定）：神秘題滿分 100；上午 09:30、下午 14:00 開始；開始 30 分鐘後開放神秘題；循線每隊 3 次取最好（11/5 理事長定）；
  //   相撲／循線：前八強（扣掉教育局前五名）＝優勝、之後的名次＝佳作（11/7 理事長；round 設定已不用於相撲循線）；
  //   神秘題「得分 ≥50% 優勝、≥20% 佳作」只給沒拿到前五名的隊伍（top5Only:true＝一隊只拿一張名次獎）
  const DEFAULT_CFG = { mmax: 100, am: "09:30", pm: "14:00", gate: 30, lineTries: 2, round: "ceil", top5Only: true, items: [], open: { am: false, pm: false } };
  const SUMO_PTS = { BOUT: 1, TIE: 0 };       // 11/7 理事長：相撲預賽三回合全打、算總積分：每贏一回合 1 分（時間到判輕者贏也算）、同重平手 0 分；決賽仍三戰兩勝
  const LINE_MAX_SEC = 150;                   // 循線 150 秒上限：超過的圈不算
  const RANK_ZH = ["", "第一名", "第二名", "第三名", "第四名", "第五名"];
  const EDU = "臺中市政府教育局", ALLY = "臺灣機器人教育聯盟", ASIA = "Botball亞洲組委會";
  const FINAL_NAME = { SF1: "準決賽 ①（1 vs 4）", SF2: "準決賽 ②（2 vs 3）", P3: "季殿軍戰", F: "冠亞軍戰" };

  const pay = (st, k) => (st[k] && st[k].payload) || null;
  function cfgOf(st) {
    const c = Object.assign({}, DEFAULT_CFG, pay(st, "cfg") || {});
    c.open = Object.assign({}, DEFAULT_CFG.open, c.open || {});
    c.items = Array.isArray(c.items) ? c.items : [];
    return c;
  }
  const gkOf = (id) => String(id || "").split("-")[0];
  function teamById(D, id) { return (D.teams[gkOf(id)] || []).find((t) => t.id === id) || null; }
  const r2 = (x) => Math.round(Number(x) * 100) / 100;

  // ---------- 缺賽 ----------
  function isAbsent(st, id) { const a = pay(st, "absent:" + id); return !!(a && a.on); }
  function missOf(st, id) { const a = pay(st, "absent:" + id); return a && Array.isArray(a.miss) ? a.miss.map(Number) : []; }

  // ---------- 神秘題開放時間 ----------
  const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  function mysOpenMin(cfg, sess) { const s = toMin(cfg[sess]); return s == null ? null : s + Number(cfg.gate || 0); }
  // now：Date；計分台按「提前開放」或到了開始時刻＋30 分鐘就開放
  function mysOpen(cfg, sess, now) {
    if (cfg.open && cfg.open[sess]) return true;
    const m = mysOpenMin(cfg, sess);
    if (m == null) return true;
    return now.getHours() * 60 + now.getMinutes() >= m;
  }

  // ---------- 基礎題、神秘題 ----------
  function basicDone(st, id) { return [1, 2].filter((k) => (pay(st, "basic:" + id + ":" + k) || {}).done).length; }
  // 依 state 建索引（每份 state 只算一次）
  const IDX = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function index(st) {
    if (IDX && IDX.has(st)) return IDX.get(st);
    const ix = { mys: {}, line: {} };
    Object.keys(st).forEach((k) => {
      if (k.startsWith("mys:")) { const id = k.split(":")[1]; (ix.mys[id] = ix.mys[id] || []).push(k); }
    });
    if (IDX) IDX.set(st, ix);
    return ix;
  }
  // 一隊的神秘題挑戰（含作廢的），依輸入時間排
  function mysAttempts(st, id) {
    return (index(st).mys[id] || []).map((k) => ({ key: k, p: st[k].payload || {}, by: st[k].by, time: st[k].time }))
      .sort((a, b) => String(a.p.at || a.time || "").localeCompare(String(b.p.at || b.time || "")) || a.key.localeCompare(b.key));
  }
  // 有效成績（不含作廢、0 分不算得分），由高到低
  function mysScores(st, id) {
    return mysAttempts(st, id).filter((a) => !a.p.void && Number(a.p.s) > 0).map((a) => r2(a.p.s)).sort((a, b) => b - a);
  }
  // 簡章神秘題比序：先比最高分的次數 → 次高分的次數 → 逐級比；各級次數都一樣才並列。負數＝a 在前
  function mysCmp(a, b) {
    const ca = {}, cb = {};
    a.forEach((x) => { ca[x] = (ca[x] || 0) + 1; });
    b.forEach((x) => { cb[x] = (cb[x] || 0) + 1; });
    const levels = Array.from(new Set(a.concat(b))).sort((x, y) => y - x);
    for (let i = 0; i < levels.length; i++) {
      const d = (cb[levels[i]] || 0) - (ca[levels[i]] || 0);
      if (d) return d;
    }
    return 0;
  }
  // 依比較函式排序並給「並列順延」名次（例 2 隊並列第 1 → 下一隊第 3）
  function rankBy(items, cmp, tieKey) {
    const s = items.slice().sort((a, b) => cmp(a, b) || String(tieKey(a)).localeCompare(String(tieKey(b))));
    s.forEach((x, i) => {
      x.rank = i > 0 && cmp(s[i - 1], x) === 0 ? s[i - 1].rank : i + 1;
    });
    s.forEach((x, i) => { x.tie = (i > 0 && s[i - 1].rank === x.rank) || (i < s.length - 1 && s[i + 1].rank === x.rank); });
    return s;
  }
  function mysRanking(D, st, gk) {
    const all = D.teams[gk].map((team) => {
      const scores = mysScores(st, team.id), b = basicDone(st, team.id), at = mysAttempts(st, team.id);
      return { team, id: team.id, scores, best: scores[0] || 0, basics: b, tries: at.filter((a) => !a.p.void).length, absent: isAbsent(st, team.id), future: b >= 2 };
    });
    const ranked = rankBy(all.filter((r) => r.scores.length && !r.absent), (a, b) => mysCmp(a.scores, b.scores), (x) => x.id);
    const rest = all.filter((r) => !(r.scores.length && !r.absent)).sort((a, b) => a.id.localeCompare(b.id));
    rest.forEach((r) => { r.rank = null; r.tie = false; });
    return { rows: ranked.concat(rest), ranked };
  }

  // ---------- 啟蒙／探索：每題 2 次機會 ----------
  function taskOf(st, id, k) {
    const t = ((pay(st, "task:" + id + ":" + k) || {}).t || []).slice(0, 2);
    return { tries: t, ok: t.indexOf("S") >= 0, used: t.length, closed: t.indexOf("S") >= 0 || t.length >= 2 };
  }
  function taskTable(D, st, gk) {
    const n = D.groups[gk].tasks || 1;
    return D.teams[gk].map((team) => {
      const tasks = [];
      for (let k = 1; k <= n; k++) tasks.push(taskOf(st, team.id, k));
      const okN = tasks.filter((x) => x.ok).length;
      return { team, id: team.id, tasks, okN, future: okN >= n, started: tasks.some((x) => x.used), absent: isAbsent(st, team.id) };
    });
  }

  // ---------- 相撲 ----------
  const RED = { R: 1, TR: 1, XR: 1 }, BLUE = { B: 1, TB: 1, XB: 1 };
  function tally(r) {
    const p = { red: 0, blue: 0, n: 0 };
    (r || []).forEach((x) => { if (!x) return; p.n++; if (RED[x]) p.red++; else if (BLUE[x]) p.blue++; });
    return p;
  }
  // 三戰兩勝：一方先拿 2 局就結束；打滿 3 局（含同重平局）也結束
  function boDone(r) { const p = tally(r); return p.red >= 2 || p.blue >= 2 || p.n >= 3; }
  function boOutcome(r) { if (!boDone(r)) return null; const p = tally(r); return p.red > p.blue ? "R" : p.blue > p.red ? "B" : "D"; }
  // 11/7 理事長：預賽（單循環）三回合全打，打滿 3 回合才算完；這一輪的勝負（給勝-和-敗統計用）看回合數
  function rrDone(r) { return tally(r).n >= 3; }
  function rrOutcome(r) { if (!rrDone(r)) return null; const p = tally(r); return p.red > p.blue ? "R" : p.blue > p.red ? "B" : "D"; }
  const matchKey = (gk, m) => "sumo:" + gk + ":" + m[0] + ":" + m[1];
  // ---------- 相撲抽籤：D.schedule[組] 每筆 [輪, 台, 紅籤號, 藍籤號]（籤號 1..N 整數）----------
  // fixedDraw 的組（11/5 晚：不抽籤）＝籤 k 就是 lotTeams[k-1]（各組第 k 隊）；其他組讀計分台輸入的 draw:<組>
  function drawOf(st, gk, D) {
    const g = D && D.groups[gk];
    if (g && g.fixedDraw && Array.isArray(g.lotTeams)) { const o = {}; g.lotTeams.forEach((id, i) => { o[String(i + 1)] = id; }); return o; }
    const p = pay(st, "draw:" + gk); return (p && p.lots) || {};
  }
  function lotTeam(st, gk, lot, D) { return drawOf(st, gk, D)[String(lot)] || null; }
  // 抽籤是否完整：籤 1..N 都有隊、隊伍不重複、都是本組的隊
  function drawDone(D, st, gk) {
    const lots = drawOf(st, gk, D), n = D.groups[gk].lots || D.teams[gk].length, seen = {};
    for (let i = 1; i <= n; i++) {
      const id = lots[String(i)];
      if (!id || seen[id] || gkOf(id) !== gk || !teamById(D, id)) return false;
      seen[id] = 1;
    }
    return true;
  }
  // 換成隊號的賽程：[輪, 台, 紅隊號, 藍隊號, 紅籤號, 藍籤號]；抽籤沒輸完時隊號是 null（不能開打、不計分）
  function schedule(D, st, gk) {
    const ok = drawDone(D, st, gk), lots = drawOf(st, gk, D);
    return (D.schedule[gk] || []).map((m) => [m[0], m[1], ok ? lots[String(m[2])] : null, ok ? lots[String(m[3])] : null, m[2], m[3]]);
  }
  // 有輸入就用輸入；沒有輸入但有隊伍整隊缺賽 → 判對手 3:0（11/7 三回合全打；雙方都缺賽＝都不得分）
  function matchInfo(st, gk, m) {
    if (!m[2] || !m[3]) return { r: [], done: false, out: null, forfeit: false, undrawn: true };
    const rec = pay(st, matchKey(gk, m));
    const r = rec && Array.isArray(rec.r) ? rec.r.filter(Boolean) : null;
    if (r && r.length) return { r, done: rrDone(r), out: rrOutcome(r), forfeit: false, rec: true };
    const ar = isAbsent(st, m[2]), ab = isAbsent(st, m[3]);
    if (ar && ab) return { r: [], done: true, out: "N", forfeit: true };
    if (ar) return { r: ["XB", "XB", "XB"], done: true, out: "B", forfeit: true };
    if (ab) return { r: ["XR", "XR", "XR"], done: true, out: "R", forfeit: true };
    return { r: r || [], done: false, out: null, forfeit: false };
  }
  function weightOf(st, id) { const w = pay(st, "weight:" + id); return w && Number(w.g) > 0 ? Number(w.g) : null; }

  function sumoStandings(D, st, gk) {
    const sched = schedule(D, st, gk).filter((m) => m[2] && m[3]);
    const row = {};
    D.teams[gk].forEach((t) => { row[t.id] = { id: t.id, team: t, pts: 0, w: 0, d: 0, l: 0, played: 0, total: 0, h2h: null, weight: weightOf(st, t.id), absent: isAbsent(st, t.id) }; });
    const res = [];
    sched.forEach((m) => {
      row[m[2]].total++; row[m[3]].total++;
      const x = matchInfo(st, gk, m);
      if (!x.done || x.out === "N") { if (x.done) { row[m[2]].played++; row[m[3]].played++; } return; }
      const tp = tally(x.r), pr = tp.red * SUMO_PTS.BOUT, pb = tp.blue * SUMO_PTS.BOUT;   // 11/7：積分＝贏的回合數
      row[m[2]].pts += pr; row[m[3]].pts += pb;
      row[m[2]].played++; row[m[3]].played++;
      const wdl = (r, o) => { if (o === "W") r.w++; else if (o === "L") r.l++; else r.d++; };   // 勝-和-敗＝這一輪贏的回合數比較多／一樣／比較少
      wdl(row[m[2]], x.out === "R" ? "W" : x.out === "B" ? "L" : "D"); wdl(row[m[3]], x.out === "B" ? "W" : x.out === "R" ? "L" : "D");
      res.push({ red: m[2], blue: m[3], pr, pb });
    });
    // 同分 → 同分隊伍之間的對戰積分（遞迴：比完還有平手的那幾隊，只拿它們彼此的對戰再比）→ 重量輕者在前 → 仍同分＝待秤重
    const order = [];
    function breakTie(tied, top) {
      if (tied.length === 1) { order.push(tied); return; }
      const set = new Set(tied), h = {};
      tied.forEach((c) => { h[c] = 0; });
      res.forEach((x) => { if (set.has(x.red) && set.has(x.blue)) { h[x.red] += x.pr; h[x.blue] += x.pb; } });
      if (top) tied.forEach((c) => { row[c].h2h = h[c]; });
      const byH = {};
      tied.forEach((c) => { (byH[h[c]] = byH[h[c]] || []).push(c); });
      const keys = Object.keys(byH).map(Number).sort((a, b) => b - a);
      if (keys.length > 1) { keys.forEach((k) => breakTie(byH[k], false)); return; }
      if (!tied.every((c) => row[c].weight != null)) { order.push(tied); return; }
      const byW = {};
      tied.forEach((c) => { (byW[row[c].weight] = byW[row[c].weight] || []).push(c); });
      Object.keys(byW).map(Number).sort((a, b) => a - b).forEach((w) => order.push(byW[w]));
    }
    const byPts = {};
    D.teams[gk].forEach((t) => { (byPts[row[t.id].pts] = byPts[row[t.id].pts] || []).push(t.id); });
    Object.keys(byPts).map(Number).sort((a, b) => b - a).forEach((p) => breakTie(byPts[p], true));
    const rows = [];
    let pos = 1;
    order.forEach((bucket) => {
      bucket.sort();
      bucket.forEach((c) => { row[c].rank = pos; row[c].tie = bucket.length > 1; rows.push(row[c]); });
      pos += bucket.length;
    });
    const all = (D.schedule[gk] || []).length;
    const played = sched.filter((m) => matchInfo(st, gk, m).done).length;
    return { rows, done: sched.length === all && played === all, played, total: all, drawn: sched.length === all };
  }
  function tiesNeedingWeight(D, st, gk) {
    const g = {};
    sumoStandings(D, st, gk).rows.filter((r) => r.tie).forEach((r) => { (g[r.rank] = g[r.rank] || []).push(r.id); });
    return Object.keys(g).map((k) => ({ rank: Number(k), ids: g[k] }));
  }
  // 某一台的進度：現在這一場、下一場
  function arenaQueue(D, st, gk, arena) {
    const ms = schedule(D, st, gk).filter((m) => m[1] === arena).sort((a, b) => a[0] - b[0]);
    const pend = ms.filter((m) => !matchInfo(st, gk, m).done);
    return { all: ms, now: pend[0] || null, next: pend[1] || null, done: ms.length - pend.length, total: ms.length };
  }

  // ---------- 相撲決賽（預賽前 4 名：1 vs 4、2 vs 3 → 冠亞軍戰＋季殿軍戰）----------
  function finals(D, st, gk) {
    const s = sumoStandings(D, st, gk);
    const seed = (i) => (s.done && s.rows[i] && !s.rows[i].absent ? s.rows[i].id : null);
    // 第 4、5 名同分還沒分出來時，不自動配對（避免配錯）
    const cutTie = s.rows.length > 4 && s.rows[3].tie && s.rows[4].rank === s.rows[3].rank;
    const get = (slot) => pay(st, "final:" + gk + ":" + slot) || {};
    const mk = (slot, ar, ab, labels) => {
      const p = get(slot), red = p.red || ar || null, blue = p.blue || ab || null;
      const rounds = Array.isArray(p.rounds) ? p.rounds.filter(Boolean) : [];
      const out = red && blue ? boOutcome(rounds) : null;
      const t = tally(rounds);
      return { slot, red, blue, labels, rounds, r: t.red, b: t.blue, arena: p.arena || D.groups[gk].finalArena,
               winner: out === "R" ? red : out === "B" ? blue : null, loser: out === "R" ? blue : out === "B" ? red : null, draw: out === "D" };
    };
    const ok = s.done && !cutTie;
    const SF1 = mk("SF1", ok && seed(0), ok && seed(3), ["預賽第 1 名", "預賽第 4 名"]);
    const SF2 = mk("SF2", ok && seed(1), ok && seed(2), ["預賽第 2 名", "預賽第 3 名"]);
    const F = mk("F", SF1.winner, SF2.winner, ["準決賽 ① 勝方", "準決賽 ② 勝方"]);
    const P3 = mk("P3", SF1.loser, SF2.loser, ["準決賽 ① 敗方", "準決賽 ② 敗方"]);
    return { gk, prelim: s, cutTie, SF1, SF2, P3, F, done: !!(F.winner && P3.winner) };
  }
  // 總名次：1–4 名看決賽，5 名以後看預賽（同分並列順延）
  function sumoRanking(D, st, gk) {
    const fn = finals(D, st, gk), s = fn.prelim;
    const top = fn.done ? [fn.F.winner, fn.F.loser, fn.P3.winner, fn.P3.loser] : [];
    const finalists = new Set([fn.SF1.red, fn.SF1.blue, fn.SF2.red, fn.SF2.blue].filter(Boolean));
    const rows = [];
    top.forEach((id, i) => rows.push({ id, team: teamById(D, id), rank: i + 1, tie: false, src: "決賽" }));
    const rest = s.rows.filter((r) => !finalists.has(r.id) && !r.absent);
    let prev = null;
    rest.forEach((r, i) => {
      const rank = prev && prev.prelimRank === r.rank ? prev.rank : finalists.size + i + 1;
      const x = { id: r.id, team: r.team, rank, prelimRank: r.rank, tie: r.tie, src: "預賽" };
      rows.push(x); prev = x;
    });
    s.rows.filter((r) => r.absent).forEach((r) => rows.push({ id: r.id, team: r.team, rank: null, tie: false, src: "缺賽" }));
    const n = s.rows.filter((r) => !r.absent).length;
    return { rows, done: fn.done, finals: fn, n };
  }

  // ---------- 循線：最終圈累計秒數最接近目標者勝 → 次終圈 → …；150 秒上限 ----------
  function lineEval(set, p) {
    if (!set || !p || !Array.isArray(p.t)) return null;
    const n = Number(set.laps), sec = Number(set.sec);
    const t = p.t.map(Number).filter((x) => x > 0 && x <= LINE_MAX_SEC);
    const done = !!p.done && t.length >= n;
    const laps = done ? n : Math.min(t.length, n);
    const diffs = [];
    for (let k = laps; k >= 1; k--) diffs.push(r2(Math.abs(t[k - 1] - k * sec)));
    return { laps, done, diffs, final: laps ? t[laps - 1] : null, target: n * sec };
  }
  function lineCmp(a, b) {                     // 負數＝a 比較好；跑完的在前，沒跑完的依完成圈數
    if (!a && !b) return 0; if (!a) return 1; if (!b) return -1;
    if (a.done !== b.done) return a.done ? -1 : 1;
    if (a.laps !== b.laps) return b.laps - a.laps;
    for (let i = 0; i < Math.max(a.diffs.length, b.diffs.length); i++) {
      const x = a.diffs[i] == null ? Infinity : a.diffs[i], y = b.diffs[i] == null ? Infinity : b.diffs[i];
      if (Math.abs(x - y) > 1e-9) return x - y;
    }
    return 0;
  }
  function lineRanking(D, st, gk) {
    const set = pay(st, "lineset"), cfg = cfgOf(st);
    const all = D.teams[gk].map((team) => {
      const tries = [];
      for (let n = 1; n <= cfg.lineTries; n++) tries.push(lineEval(set, pay(st, "line:" + team.id + ":" + n)));
      const best = tries.filter(Boolean).sort(lineCmp)[0] || null;
      return { team, id: team.id, tries, best, absent: isAbsent(st, team.id) };
    });
    const ok = (r) => r.best && r.best.laps > 0 && !r.absent;
    const ranked = rankBy(all.filter(ok), (a, b) => lineCmp(a.best, b.best), (x) => x.id);
    const rest = all.filter((r) => !ok(r));
    rest.forEach((r) => { r.rank = null; r.tie = false; });
    return { set, rows: ranked.concat(rest), ranked, n: all.filter((r) => !r.absent).length };
  }

  // ---------- 頒獎 ----------
  function cut(n, pct, mode) { const x = n * pct; return mode === "floor" ? Math.floor(x + 1e-9) : Math.ceil(x - 1e-9); }
  // 一組的名次獎：教育局 1–5 名（並列順延；不滿 10 隊堅持原組的組別沒有）＋聯盟 優勝／佳作
  function groupAwards(D, st, gk) {
    const g = D.groups[gk], cfg = cfgOf(st), out = [];
    const add = (r, issuer, title, kind, note) => out.push({ gk, id: r.id, team: r.team || teamById(D, r.id), rank: r.rank, issuer, title, kind, note: note || "" });
    const edu = (r) => !g.noEdu && r.rank != null && r.rank <= 5;
    if (g.kind === "mys") {
      mysRanking(D, st, gk).ranked.forEach((r) => {
        const pct = r.best / (Number(cfg.mmax) || 100);
        const isEdu = edu(r);
        if (isEdu) add(r, EDU, RANK_ZH[r.rank], "edu", "神秘題最高 " + r.best);
        if (isEdu && cfg.top5Only) return;
        if (pct >= 0.5 - 1e-9) add(r, ALLY, "優勝", "win", "神秘題最高 " + r.best + "（" + Math.round(pct * 100) + "%）");
        else if (pct >= 0.2 - 1e-9) add(r, ALLY, "佳作", "merit", "神秘題最高 " + r.best + "（" + Math.round(pct * 100) + "%）");
      });
    } else if (g.kind === "sumo" || g.kind === "line") {
      const R_ = g.kind === "sumo" ? sumoRanking(D, st, gk) : lineRanking(D, st, gk);
      const ranked = R_.rows.filter((r) => r.rank != null);
      // 11/7 理事長：相撲、循線 前八強（扣掉教育局前五名）＝優勝，之後的名次＝佳作（取代原本前 50%／80%）
      ranked.forEach((r) => {
        if (edu(r)) add(r, EDU, RANK_ZH[r.rank], "edu");
        else if (g.noEdu && r.rank <= 5) add(r, ALLY, RANK_ZH[r.rank], "rank", "無教育局獎狀：名次由聯盟頒發");   // 11/7 理事長：高中循線第一、二名＝聯盟名次獎狀＋獎盃
        else if (r.rank <= 8) add(r, ALLY, "優勝", "win", "前八強（第 " + r.rank + " 名）");
        else add(r, ALLY, "佳作", "merit", "第 " + r.rank + " 名（前八強以後）");
      });
    }
    return out;
  }
  // 證書：未來工程師／探索工程師（啟蒙、探索、國小＝Botball亞洲組委會國際證書；國中、高中＝聯盟認證證書）；相撲、循線沒有
  function certOf(D, st, id) {
    const gk = gkOf(id), g = D.groups[gk];
    if (g.kind !== "mys" && g.kind !== "task") return "";
    if (isAbsent(st, id)) return "";
    const future = g.kind === "mys" ? basicDone(st, id) >= 2 : taskTable(D, st, gk).find((r) => r.id === id).future;
    const issuer = g.level === "國小" ? ASIA : ALLY;
    return issuer + (future ? " 未來工程師" : " 探索工程師") + (g.level === "國小" ? "國際證書" : "證書");
  }
  // 國小新秀／進階／高手：未來工程師、人數 ≥2、當日有參賽 → 美國世界賽優先邀請資格
  function worldOk(D, st, id) {
    const g = D.groups[gkOf(id)], t = teamById(D, id);
    if (!g || g.kind !== "mys" || g.level !== "國小") return null;
    const attended = t.n - missOf(st, id).length;
    return !isAbsent(st, id) && basicDone(st, id) >= 2 && attended >= 2;
  }

  // ---------- 警示（計分台）----------
  function warnings(D, st) {
    const W = [], cfg = cfgOf(st);
    const w = (gk, level, msg) => W.push({ gk, level, msg });
    D.order.forEach((gk) => {
      const g = D.groups[gk], name = g.name;
      if (g.kind === "mys") {
        const rk = mysRanking(D, st, gk);
        const none = rk.rows.filter((r) => !r.absent && !r.basics && !r.tries);
        if (none.length) w(gk, "warn", name + "：" + none.length + " 隊還沒有任何紀錄（" + none.slice(0, 6).map((r) => r.id).join("、") + (none.length > 6 ? "…" : "") + "）");
        const early = rk.rows.filter((r) => r.tries && r.basics < 2);
        if (early.length) w(gk, "err", name + "：" + early.map((r) => r.id).join("、") + " 有神秘題成績但基礎題沒完成 2 題，請確認");
        const over = rk.rows.filter((r) => r.scores.some((s) => s > cfg.mmax));
        if (over.length) w(gk, "err", name + "：" + over.map((r) => r.id).join("、") + " 神秘題分數超過滿分 " + cfg.mmax);
        const ties = {};
        rk.ranked.filter((r) => r.tie && r.rank <= 5).forEach((r) => { (ties[r.rank] = ties[r.rank] || []).push(r.id); });
        Object.keys(ties).forEach((k) => w(gk, "info", name + "：第 " + k + " 名並列 " + ties[k].join("、") + "（比序全同，名次順延）"));
      } else if (g.kind === "task") {
        const none = taskTable(D, st, gk).filter((r) => !r.absent && !r.started);
        if (none.length) w(gk, "warn", name + "：" + none.length + " 隊還沒挑戰（" + none.slice(0, 6).map((r) => r.id).join("、") + (none.length > 6 ? "…" : "") + "）");
      } else if (g.kind === "sumo") {
        const s = sumoStandings(D, st, gk);
        if (!s.drawn) w(gk, "err", name + "：還沒輸入完抽籤結果（計分台「相撲抽籤」），輸入完才能開打");
        else if (!s.done) w(gk, "warn", name + "：預賽未完成 " + s.played + "/" + s.total + " 場");
        tiesNeedingWeight(D, st, gk).forEach((t) => w(gk, "err", name + "：第 " + t.rank + " 名起 " + t.ids.join("、") + " 同分（積分、對戰都一樣），請秤重"));
        const fn = finals(D, st, gk);
        if (fn.cutTie) w(gk, "err", name + "：預賽第 4、5 名同分未分出，決賽暫不配對");
        if (s.done && !fn.done) w(gk, "warn", name + "：決賽未完成");
        ["SF1", "SF2", "P3", "F"].forEach((k) => { if (fn[k].draw) w(gk, "err", name + "：" + FINAL_NAME[k] + " 平手，請加賽一局"); });
      } else if (g.kind === "line") {
        const lr = lineRanking(D, st, gk);
        if (!lr.set) w(gk, "warn", name + "：還沒抽圈數與每圈秒數");
        const miss = lr.rows.filter((r) => !r.absent && !r.best);
        if (miss.length) w(gk, "warn", name + "：" + miss.length + " 隊沒有成績");
        const ties = {};
        lr.ranked.filter((r) => r.tie).forEach((r) => { (ties[r.rank] = ties[r.rank] || []).push(r.id); });
        Object.keys(ties).forEach((k) => w(gk, "info", name + "：第 " + k + " 名並列 " + ties[k].join("、")));
      }
      const ab = D.teams[gk].filter((t) => isAbsent(st, t.id));
      if (ab.length) w(gk, "info", name + "：缺賽 " + ab.map((t) => t.id).join("、"));
    });
    return W;
  }

  // ---------- 匯出 CSV（計分台、tools/export_results.js、tools/simulate.js 共用）----------
  const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  function summary(D, st, id) {
    const gk = gkOf(id), g = D.groups[gk];
    if (g.kind === "mys") {
      const sc = mysScores(st, id);
      return "基礎題 " + basicDone(st, id) + "/2；神秘題 " + (sc.length ? sc.join("、") : "無");
    }
    if (g.kind === "task") return taskTable(D, st, gk).find((r) => r.id === id).tasks.map((t, i) => "第" + (i + 1) + "題 " + (t.tries.map((x) => (x === "S" ? "成功" : "失敗")).join("→") || "未挑戰")).join("；");
    if (g.kind === "sumo") {
      const s = sumoStandings(D, st, gk).rows.find((r) => r.id === id);
      return "預賽第 " + s.rank + " 名 積分 " + s.pts + "（" + s.w + "勝" + s.d + "和" + s.l + "敗）" + (s.weight ? " 重 " + s.weight + "g" : "");
    }
    const r = lineRanking(D, st, gk).rows.find((x) => x.id === id);
    return r.tries.map((e, i) => "第" + (i + 1) + "次 " + (e ? (e.done ? e.final + " 秒（差 " + e.diffs[0] + "）" : e.laps + " 圈未完成") : "—")).join("；");
  }
  function rankOf(D, st, id) {
    const gk = gkOf(id), g = D.groups[gk];
    const rows = g.kind === "mys" ? mysRanking(D, st, gk).rows : g.kind === "sumo" ? sumoRanking(D, st, gk).rows : g.kind === "line" ? lineRanking(D, st, gk).rows : [];
    const r = rows.find((x) => x.id === id);
    return r && r.rank != null ? r.rank + (r.tie ? "（並列）" : "") : "";
  }
  // names：{隊號: [隊員1, 隊員2, 隊員3]}（11/5：data.js 不放姓名，賽後由 tools/export_results.js 讀本機分組名單 xlsx 補上）；
  //   沒給 names 時姓名欄寫「（第 k 位隊員）」，獲獎名單的隊員欄空白
  function exportCSV(D, st, names) {
    names = names || {};
    const nm = (t, i) => (names[t.id] && names[t.id][i]) || "（第 " + (i + 1) + " 位隊員）";
    const aw = [["組別", "頒發單位", "獎項", "名次", "編號", "隊名", "單位", "人數", "隊員", "說明"]];
    const full = [["組別", "編號", "隊名", "單位", "人數", "名次", "成績", "證書", "世界賽優先邀請資格", "缺賽"]];
    const cert = [["組別", "編號", "隊名", "單位", "姓名", "獎項", "證書種類", "世界賽優先邀請資格"]];
    const awardsOf = {};
    D.order.forEach((gk) => {
      const g = D.groups[gk];
      groupAwards(D, st, gk).forEach((a) => {
        aw.push([g.name, a.issuer, a.title, a.rank, a.id, a.team.name, a.team.unit, a.team.n, (names[a.id] || []).join("、"), a.note]);
        (awardsOf[a.id] = awardsOf[a.id] || []).push(a.issuer + " " + a.title);
      });
      D.teams[gk].forEach((t) => {
        const wo = worldOk(D, st, t.id), miss = missOf(st, t.id);
        full.push([g.name, t.id, t.name, t.unit, t.n, rankOf(D, st, t.id), summary(D, st, t.id), certOf(D, st, t.id), wo == null ? "" : wo ? "有" : "無",
          isAbsent(st, t.id) ? "整隊缺賽" : miss.length ? miss.map((i) => (names[t.id] && names[t.id][i]) || "第 " + (i + 1) + " 位").join("、") + " 未到" : ""]);
        if (isAbsent(st, t.id)) return;
        for (let i = 0; i < t.n; i++) {
          if (miss.indexOf(i) >= 0) continue;
          cert.push([g.name, t.id, t.name, t.unit, nm(t, i), (awardsOf[t.id] || []).join("；"), certOf(D, st, t.id), wo == null ? "" : wo ? "有" : "無"]);
        }
      });
    });
    return { "獲獎名單.csv": csv(aw), "完整成績.csv": csv(full), "證書名冊.csv": csv(cert) };
  }

  const API = { DEFAULT_CFG, SUMO_PTS, LINE_MAX_SEC, RANK_ZH, EDU, ALLY, ASIA, FINAL_NAME, cfgOf, gkOf, teamById, isAbsent, missOf, toMin, mysOpenMin, mysOpen,
    basicDone, mysAttempts, mysScores, mysCmp, rankBy, mysRanking, taskOf, taskTable, tally, boDone, boOutcome, rrDone, rrOutcome, matchKey, matchInfo, weightOf, drawOf, lotTeam, drawDone, schedule,
    sumoStandings, tiesNeedingWeight, arenaQueue, finals, sumoRanking, lineEval, lineCmp, lineRanking, cut, groupAwards, certOf, worldOk,
    warnings, summary, rankOf, exportCSV, csv };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.JBC_RULES = API;
})(typeof window !== "undefined" ? window : globalThis);
