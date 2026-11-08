// JBC 台中站 1213 即時計分：共用畫面元件（即時成績、裁判頁、計分台共用）
window.JBC_UI = (function () {
  "use strict";
  const R = window.JBC_RULES, D = window.JBC_DATA;
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const hhmmss = (d) => pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  const f2 = (x) => (x == null || isNaN(x) ? "" : Number(x).toFixed(2));
  const SESS = { am: "上午", pm: "下午" };
  const KIND = { mys: "新秀／進階／高手", task: "啟蒙／探索", sumo: "遙控相撲", line: "循線競速" };
  const BOUT_OPTS = [["R", "紅勝", "r"], ["B", "藍勝", "b"], ["TR", "時間到・紅較輕", "r"], ["TB", "時間到・藍較輕", "b"], ["T0", "時間到・一樣重", "g"]];
  const BOUT_SHORT = { R: "紅", B: "藍", TR: "紅輕", TB: "藍輕", T0: "同重", XR: "紅(缺)", XB: "藍(缺)" };
  const bcls = (v) => ({ R: "r", TR: "r", XR: "r", B: "b", TB: "b", XB: "b" }[v] || "g");

  // ---------- 隊伍顯示 ----------
  const team = (id) => R.teamById(D, id);
  function teamHTML(id, o) {
    const t = team(id);
    if (!id) return '<span class="mute">（待產生）</span>';
    return '<b class="code">' + esc(id) + "</b> " + (t ? '<span class="tn">' + esc(t.name) + "</span>" + (o && o.unit ? ' <small class="unit">' + esc(t.unit) + "</small>" : "") : "");
  }
  const teamText = (id) => { const t = team(id); return esc(id || "—") + (t ? " " + esc(t.name) : ""); };
  const groupsBy = (pred) => D.order.filter((gk) => pred(D.groups[gk]));
  const rankCell = (r) => (r.rank != null ? r.rank + (r.tie ? '<small class="mute">並列</small>' : "") : '<span class="mute">—</span>');

  // ====================== 顯示：排名表 ======================
  function mysTableHTML(st, gk, o) {
    o = o || {};
    const cfg = R.cfgOf(st), rk = R.mysRanking(D, st, gk);
    const aw = o.admin ? awardMap(st, gk) : {};
    return '<table class="tbl"><thead><tr><th>名次</th><th>隊伍</th><th>基礎題</th><th>神秘題有效成績（高→低）</th>' + (o.admin ? "<th>獎項</th>" : "") + "</tr></thead><tbody>" +
      rk.rows.map((r) => "<tr" + (o.me === r.id ? ' class="me"' : "") + (r.absent ? ' class="mute"' : "") + "><td class='rk'>" + rankCell(r) + "</td><td>" + teamHTML(r.id, { unit: o.unit }) +
        (r.absent ? ' <span class="tag">缺賽</span>' : "") + "</td><td>" + (r.basics >= 2 ? '<span class="tag ok">2/2 未來工程師</span>' : '<span class="tag">' + r.basics + "/2</span>") + "</td><td class='scores'>" +
        (r.scores.length ? r.scores.map((s, i) => (i === 0 ? "<b>" + s + "</b>" : s)).join("、") : '<span class="mute">—</span>') + (r.tries > r.scores.length ? ' <small class="mute">（另 ' + (r.tries - r.scores.length) + " 次 0 分）</small>" : "") + "</td>" +
        (o.admin ? "<td>" + (aw[r.id] || "") + "</td>" : "") + "</tr>").join("") + "</tbody></table>" +
      '<p class="note">滿分 ' + cfg.mmax + " 分。排名只看神秘題：先比最高分的次數，再比次高分的次數，逐級比；全部相同才並列，下一名順延。</p>";
  }
  function taskTableHTML(st, gk, o) {
    o = o || {};
    const n = D.groups[gk].tasks || 1, rows = R.taskTable(D, st, gk);
    const tc = (t) => (t.tries.length ? t.tries.map((x) => '<i class="chip ' + (x === "S" ? "ok" : "g") + '">' + (x === "S" ? "成功" : "失敗") + "</i>").join("") : '<span class="mute">—</span>');
    return '<table class="tbl"><thead><tr><th>隊伍</th>' + Array.from({ length: n }, (_, i) => "<th>第 " + (i + 1) + " 題</th>").join("") + "<th>證書</th></tr></thead><tbody>" +
      rows.map((r) => "<tr" + (o.me === r.id ? ' class="me"' : "") + "><td>" + teamHTML(r.id, { unit: o.unit }) + (r.absent ? ' <span class="tag">缺賽</span>' : "") + "</td>" + r.tasks.map((t) => "<td>" + tc(t) + "</td>").join("") +
        "<td>" + (r.absent ? "" : r.future ? '<span class="tag ok">未來工程師</span>' : r.started ? '<span class="tag">探索工程師</span>' : '<span class="mute">未挑戰</span>') + "</td></tr>").join("") +
      '</tbody></table><p class="note">每題 2 次機會，任一次成功就算完成；完成全部題目＝未來工程師，否則探索工程師。本組不排名。</p>';
  }
  function sumoStandingsHTML(st, gk, o) {
    o = o || {};
    const s = R.sumoStandings(D, st, gk);
    return '<table class="tbl"><thead><tr><th>名次</th><th>隊伍</th><th class="num">積分</th><th class="num">勝-和-敗</th><th class="num">已賽</th>' + (o.admin ? '<th class="num">重量</th>' : "") + "</tr></thead><tbody>" +
      s.rows.map((r) => "<tr" + (o.me === r.id ? ' class="me"' : "") + "><td class='rk'>" + r.rank + "</td><td>" + teamHTML(r.id, { unit: o.unit }) +
        (r.absent ? ' <span class="tag">缺賽</span>' : r.tie ? (o.admin ? ' <span class="tag warn">同分・待秤重</span>' : ' <span class="tag">並列</span>') : "") + "</td><td class='num'><b>" + r.pts + "</b></td><td class='num'>" + r.w + "-" + r.d + "-" + r.l +
        "</td><td class='num mute'>" + r.played + "/" + r.total + "</td>" + (o.admin ? "<td class='num'>" + (r.weight ? r.weight + " g" : "") + "</td>" : "") + "</tr>").join("") + "</tbody></table>" +
      '<p class="note">' + (!s.drawn ? "還沒輸入對戰隊伍" : s.done ? "預賽已完成" : "預賽進行中 " + s.played + " / " + s.total + " 場") + "。預賽每輪三回合全打，每贏一回合 1 分（時間到判重量輕者贏、同重平手 0 分），積分＝贏的回合總數；勝-和-敗＝每輪回合數比較。同分先比同分隊伍之間的對戰積分，再比重量（輕者在前）。前 4 名進決賽（三戰兩勝）。</p>";
  }
  function scheduleHTML(st, gk, o) {
    o = o || {};
    const ms = R.schedule(D, st, gk).filter((m) => !o.me || m[2] === o.me || m[3] === o.me);
    const drawn = R.drawDone(D, st, gk);
    const side = (id, lot) => (id ? teamText(id) : '<span class="mute">籤 ' + lot + "</span>");   // 固定對戰（fixedDraw）一律顯示隊伍
    const rounds = Array.from(new Set(ms.map((m) => m[0]))).sort((a, b) => a - b);
    const html = rounds.map((rd) => '<div class="rblock"><p class="rhead">第 ' + rd + " 輪</p>" + ms.filter((m) => m[0] === rd).map((m) => {
      const x = R.matchInfo(st, gk, m), p = R.tally(x.r);
      const win = x.out === "R" ? "R" : x.out === "B" ? "B" : "";
      return '<div class="mrow' + (x.done ? " done" : "") + '"><div class="mh"><span>' + m[1] + " 號台</span>" + (x.forfeit ? '<span class="tag">缺賽</span>' : x.done ? '<span class="tag ok">已完成</span>' : "") + "</div>" +
        '<div class="mt"><span class="tm r' + (win === "R" ? " win" : "") + '">' + side(m[2], m[4]) + '</span><b class="sc">' + (x.r.length ? p.red + " : " + p.blue : "vs") + '</b><span class="tm b' + (win === "B" ? " win" : "") + '">' + side(m[3], m[5]) + "</span></div></div>";
    }).join("") + "</div>").join("") || '<p class="mute">沒有對戰</p>';
    return (drawn ? "" : '<div class="banner">對戰當天抽籤：抽完籤才知道各籤號是哪一隊（下面先列籤號對戰）</div>') + html;
  }
  // 抽籤結果表（籤號 → 隊伍）
  function drawTableHTML(st, gk) {
    const lots = R.drawOf(st, gk, D), n = D.groups[gk].lots;
    return '<table class="tbl"><thead><tr><th class="rk">籤號</th><th>隊伍</th></tr></thead><tbody>' + Array.from({ length: n }, (_, i) => i + 1).map((k) =>
      "<tr><td class='rk'>" + k + "</td><td>" + (lots[String(k)] ? teamHTML(lots[String(k)], { unit: true }) : '<span class="mute">—</span>') + "</td></tr>").join("") + "</tbody></table>";
  }
  function finalsHTML(st, gk) {
    const F = R.finals(D, st, gk);
    const card = (slot) => {
      const x = F[slot];
      const side = (id, label, cls) => '<div class="fs ' + cls + (x.winner && x.winner === id ? " win" : "") + (x.loser && x.loser === id ? " lose" : "") + '">' + (id ? teamHTML(id) : '<span class="mute">' + esc(label) + "</span>") + "</div>";
      const chips = x.rounds.map((v) => '<i class="chip ' + bcls(v) + '">' + BOUT_SHORT[v] + "</i>").join("");
      return '<div class="final"><div class="fh"><b>' + R.FINAL_NAME[slot] + '</b><span class="mute small">' + x.arena + " 號台</span></div>" + side(x.red, x.labels[0], "red") +
        '<div class="frow"><span class="score">' + x.r + " : " + x.b + "</span>" + chips + (x.draw ? '<span class="tag warn">平手・加賽</span>' : "") + "</div>" + side(x.blue, x.labels[1], "blue") + "</div>";
    };
    return (F.cutTie ? '<div class="banner">預賽第 4、5 名同分還沒分出來（請秤重），決賽暫不配對</div>' : "") +
      '<div class="finals">' + card("SF1") + card("SF2") + card("F") + card("P3") + '</div><p class="note">三戰兩勝；準決賽勝方打冠亞軍戰、敗方打季殿軍戰（第 3、4 名）。</p>';
  }
  function sumoRankHTML(st, gk, o) {
    o = o || {};
    const rk = R.sumoRanking(D, st, gk), aw = o.admin ? awardMap(st, gk) : {};
    return '<table class="tbl"><thead><tr><th>總名次</th><th>隊伍</th><th>依據</th>' + (o.admin ? "<th>獎項</th>" : "") + "</tr></thead><tbody>" +
      (rk.done ? "" : '<tr><td class="rk">1–4</td><td colspan="' + (o.admin ? 3 : 2) + '" class="mute">決賽結束後產生</td></tr>') +
      rk.rows.map((r) => "<tr><td class='rk'>" + rankCell(r) + "</td><td>" + teamHTML(r.id, { unit: o.unit }) + "</td><td class='mute small'>" + r.src + "</td>" + (o.admin ? "<td>" + (aw[r.id] || "") + "</td>" : "") + "</tr>").join("") + "</tbody></table>";
  }
  function lineTry(e) {
    if (!e) return '<span class="mute">—</span>';
    if (e.done) return f2(e.final) + " 秒 <small class='mute'>差 " + f2(e.diffs[0]) + "</small>";
    return e.laps + " 圈 <small class='mute'>未完成</small>";
  }
  function lineTableHTML(st, gk, o) {
    o = o || {};
    const lr = R.lineRanking(D, st, gk), cfg = R.cfgOf(st), aw = o.admin ? awardMap(st, gk) : {};
    return '<table class="tbl"><thead><tr><th>名次</th><th>隊伍</th>' + Array.from({ length: cfg.lineTries }, (_, i) => "<th>第 " + (i + 1) + " 次</th>").join("") + (o.admin ? "<th>獎項</th>" : "") + "</tr></thead><tbody>" +
      lr.rows.map((r) => "<tr" + (o.me === r.id ? ' class="me"' : "") + "><td class='rk'>" + rankCell(r) + "</td><td>" + teamHTML(r.id, { unit: o.unit }) + (r.absent ? ' <span class="tag">缺賽</span>' : "") + "</td>" +
        r.tries.map((e) => "<td>" + lineTry(e) + "</td>").join("") + (o.admin ? "<td>" + (aw[r.id] || "") + "</td>" : "") + "</tr>").join("") + "</tbody></table>";
  }
  function lineTargetHTML(st) {
    const set = (st.lineset || {}).payload;
    return set ? '<p class="target">' + set.laps + " 圈 × " + set.sec + " 秒 ＝ 目標 <b>" + f2(set.laps * set.sec) + "</b> 秒</p>" : '<p class="target mute">現場抽籤後公布圈數與每圈秒數</p>';
  }
  function awardMap(st, gk) {
    const m = {};
    R.groupAwards(D, st, gk).forEach((a) => { m[a.id] = (m[a.id] ? m[a.id] + "<br>" : "") + '<span class="tag ' + (a.kind === "edu" || a.kind === "rank" ? "ok" : a.kind === "win" ? "warn" : "") + '">' + esc((a.kind === "edu" ? "教育局 " : "聯盟 ") + a.title) + "</span>"; });
    return m;
  }
  // 一組的完整檢視（公開頁、計分台共用）
  function groupHTML(st, gk, o) {
    o = o || {};
    const g = D.groups[gk];
    const head = "<h2>" + esc(g.name) + ' <span class="mute small">' + SESS[g.session] + "・" + D.teams[gk].length + " 隊" + (g.noEdu ? "・只發聯盟獎狀" : "") + "</span></h2>";
    if (g.kind === "mys") return head + mysTableHTML(st, gk, o);
    if (g.kind === "task") return head + taskTableHTML(st, gk, o);
    if (g.kind === "line") return head + lineTargetHTML(st) + lineTableHTML(st, gk, o) + '<p class="note">最終圈累計秒數最接近目標者勝，同差距再比次終圈…；沒跑完依完成圈數排在後面；150 秒上限。每隊取最好的一次。</p>';
    const sub = o.sub || "rank";
    return head + (sub === "rank" ? "<h3>總名次</h3>" + sumoRankHTML(st, gk, o) + "<h3>預賽積分</h3>" + sumoStandingsHTML(st, gk, o)
      : sub === "final" ? finalsHTML(st, gk) : sub === "draw" ? drawTableHTML(st, gk) : scheduleHTML(st, gk, o));
  }

  // ====================== 計時器（5 分鐘挑戰、30 秒相撲…）======================
  const TM = {};                      // key → 結束時間
  let actx = null;
  function beep(times) {
    try { if (navigator.vibrate) navigator.vibrate(times > 1 ? [300, 150, 300] : 400); } catch (e) {}
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < (times || 1); i++) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
        const t0 = actx.currentTime + i * 0.35;
        g.gain.setValueAtTime(0.3, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
        o.start(t0); o.stop(t0 + 0.3);
      }
    } catch (e) {}
  }
  const mmss = (sec) => { const s = Math.max(0, Math.ceil(sec)); return Math.floor(s / 60) + ":" + pad(s % 60); };
  function timerHTML(key, sec, label) {
    const end = TM[key];
    const left = end ? (end - Date.now()) / 1000 : null;
    return '<div class="timer"><span class="cd' + (left != null && left <= 0 ? " late" : "") + '" data-cd="' + esc(key) + '">' + (left == null ? mmss(sec) : left > 0 ? mmss(left) : "時間到") + "</span>" +
      (end ? '<button type="button" class="ghost small" data-act="cd-stop" data-k="' + esc(key) + '">停止</button>' : '<button type="button" class="ghost small" data-act="cd" data-k="' + esc(key) + '" data-sec="' + sec + '">▶ ' + esc(label || "開始計時") + "</button>") + "</div>";
  }
  setInterval(() => {
    document.querySelectorAll("[data-cd]").forEach((el) => {
      const end = TM[el.dataset.cd]; if (!end) return;
      const left = (end - Date.now()) / 1000;
      el.textContent = left > 0 ? mmss(left) : "時間到";
      el.classList.toggle("late", left <= 0);
    });
    Object.keys(TM).forEach((k) => { if (TM[k] && TM[k] <= Date.now() && !TM[k + "#beeped"]) { TM[k + "#beeped"] = 1; beep(3); } });
  }, 250);

  // ====================== 裁判輸入：JBC 一隊的卡片 ======================
  const MY = {};                      // 隊號 → 神秘題輸入中的 {s, c:[], edit:key}
  function nextMysKey(st, id, prefix) {
    let n = 0;
    R.mysAttempts(st, id).forEach((a) => { const t = a.key.split(":")[2].split("."); if (t[0] === prefix) n = Math.max(n, Number(t[1]) || 0); });
    return "mys:" + id + ":" + prefix + "." + (n + 1);
  }
  function jbcCardHTML(st, id, o) {
    o = o || {};
    const t = team(id), gk = R.gkOf(id), g = D.groups[gk], cfg = R.cfgOf(st);
    let h = '<div class="card team" data-team="' + id + '"><div class="fh"><b>' + teamHTML(id) + '</b><span class="tag">' + esc(g.name) + "</span></div>" +
      '<p class="mute small" style="margin:2px 0 6px">' + esc(t.unit) + "・" + t.n + " 人" + (R.isAbsent(st, id) ? '　<span class="tag err">計分台已設為缺賽</span>' : "") + "</p>";
    if (g.kind === "task") return h + taskEditHTML(st, id, g) + "</div>";
    // ① 基礎題
    const nb = R.basicDone(st, id);
    h += '<p class="steph"><b>①</b>基礎變化題（前 30 分鐘只能做這 2 題）</p><div class="pick">' + [1, 2].map((k) => {
      const rec = st["basic:" + id + ":" + k], p = (rec && rec.payload) || {};
      return p.done ? '<button type="button" class="confirm done" data-act="b-undo" data-k="' + k + '">✓ 基礎題 ' + k + " 完成<small>" + hhmm(p.at || rec.time) + (rec.pending ? "・待上傳" : "") + "（按這裡取消）</small></button>"
        : '<button type="button" class="confirm" data-act="b-done" data-k="' + k + '">基礎題 ' + k + "<small>裁判見證完成，按這裡</small></button>";
    }).join("") + "</div>";
    h += '<p class="note">' + (nb >= 2 ? "✓ 2 題都完成＝未來工程師" : "完成 " + nb + " 題（2 題都完成＝未來工程師，0–1 題＝探索工程師）") + "</p>";
    // ② 神秘題
    h += '<p class="steph"><b>②</b>神秘題（滿分 ' + cfg.mmax + " 分，每次 5 分鐘、不限次數）</p>";
    const at = R.mysAttempts(st, id);
    if (at.length) h += '<div class="allm">' + at.map((a, i) => '<div class="lrow att' + (a.p.void ? " void" : "") + '"><span class="rnd">第 ' + (i + 1) + ' 次</span><span class="lt"><b class="big">' + esc(a.p.s) + "</b> 分" +
      (a.p.void ? ' <span class="tag">已作廢</span>' : "") + (st[a.key].pending ? ' <span class="tag warn">待上傳</span>' : "") + '</span><small class="mute">' + hhmm(a.p.at || a.time) + " " + esc(a.by || "") + "</small>" +
      (o.admin || canEditMys(a.key, o) ? '<button type="button" class="ghost small" data-act="m-edit" data-key="' + a.key + '">修改</button><button type="button" class="ghost small" data-act="m-void" data-key="' + a.key + '">' + (a.p.void ? "恢復" : "作廢") + "</button>" : "") + "</div>").join("") + "</div>";
    const open = R.mysOpen(cfg, g.session, o.now || new Date());
    const my = MY[id];
    if (!o.admin && nb < 2 && !(my && my.edit)) h += '<div class="banner">要先完成 2 題基礎題，才能挑戰神秘題（目前 ' + nb + " / 2）</div>";
    else if (!o.admin && !open && !(my && my.edit)) { const m = R.mysOpenMin(cfg, g.session); h += '<div class="banner">神秘題 ' + pad(Math.floor(m / 60)) + ":" + pad(m % 60) + " 開放（比賽開始 " + cfg.gate + " 分鐘內只能做基礎題）</div>"; }
    else {
      const d = my || { s: "", c: [] };
      const n = d.edit ? at.findIndex((a) => a.key === d.edit) + 1 : at.length + 1;
      h += '<div class="mysin">' + timerHTML("mys:" + id, 300, "開始 5 分鐘") +
        (cfg.items.length ? '<div class="items">' + cfg.items.map((x, i) => '<label class="check"><input type="checkbox" data-act="m-item" data-i="' + i + '"' + (d.c.indexOf(i) >= 0 ? " checked" : "") + "> " + esc(x.t) + ' <small class="mute">' + x.p + " 分</small></label>").join("") + "</div>" : "") +
        '<label class="lbl inline">' + (d.edit ? "修改第 " + n + " 次的分數" : "第 " + n + " 次挑戰的分數") + '<input type="number" inputmode="decimal" min="0" max="' + cfg.mmax + '" step="any" data-act="m-s" value="' + esc(d.s) + '" placeholder="0–' + cfg.mmax + '"></label>' +
        '<div class="foot">' + (d.edit || d.s !== "" ? '<button type="button" class="ghost small" data-act="m-cancel">取消</button>' : "") + '<button type="button" data-act="m-send"' + (d.s === "" ? " disabled" : "") + ">" + (d.edit ? "送出修改" : "送出第 " + n + " 次成績") + "</button></div></div>";
    }
    const rk = R.mysRanking(D, st, gk).rows.find((r) => r.id === id);
    if (rk && rk.scores.length) h += '<p class="note">有效成績：' + rk.scores.join("、") + "　目前本組第 " + rk.rank + " 名" + (rk.tie ? "（並列）" : "") + "</p>";
    return h + "</div>";
  }
  const canEditMys = (key, o) => o.station && key.split(":")[2].split(".")[0] === (o.station === "SUB" ? "SUB" : o.station);
  function taskEditHTML(st, id, g) {
    const n = g.tasks || 1, sec = g.full.indexOf("探索") >= 0 ? 240 : 600;
    let h = '<p class="steph"><b>①</b>每題 2 次機會，每次 ' + sec / 60 + " 分鐘" + (sec === 600 ? "（含組裝）" : "（不含組裝）") + "</p>" + timerHTML("task:" + id, sec, "開始 " + sec / 60 + " 分鐘");
    for (let k = 1; k <= n; k++) {
      const x = R.taskOf(st, id, k), rec = st["task:" + id + ":" + k];
      h += '<div class="rd task" data-k="' + k + '"><span class="rl">第 ' + k + " 題" + (x.ok ? ' <span class="tag ok">完成</span>' : x.used >= 2 ? ' <span class="tag">2 次都沒成功</span>' : "") + (rec && rec.pending ? ' <span class="tag warn">待上傳</span>' : "") + "</span>";
      for (let i = 0; i < 2; i++) {
        if (i === 1 && x.tries[0] !== "F") break;
        const v = x.tries[i];
        h += '<div class="trow"><span class="mute">第 ' + (i + 1) + " 次</span>" + (v ? '<i class="chip ' + (v === "S" ? "ok" : "g") + '">' + (v === "S" ? "成功" : "失敗") + "</i>"
          : '<button type="button" class="opt ok" data-act="t-set" data-k="' + k + '" data-v="S">成功</button><button type="button" class="opt" data-act="t-set" data-k="' + k + '" data-v="F">失敗</button>') + "</div>";
      }
      if (x.used) h += '<button type="button" class="ghost small" data-act="t-reset" data-k="' + k + '">這題按錯了，重新輸入</button>';
      h += "</div>";
    }
    const row = R.taskTable(D, st, R.gkOf(id)).find((r) => r.id === id);
    return h + '<p class="note">' + (row.future ? "✓ 全部完成＝未來工程師" : "完成 " + row.okN + " / " + n + " 題（全部完成＝未來工程師，否則探索工程師）") + "</p>";
  }

  // ====================== 裁判輸入：相撲台 ======================
  const drafts = {};                  // key → 還沒送出的局數
  const SU = { focus: null, showAll: false };
  function boutRows(key, d, isFinal) {
    const opts = isFinal ? BOUT_OPTS.slice(0, 4) : BOUT_OPTS;
    return [0, 1, 2].map((i) => {
      const before = d.slice(0, i), dis = (i > 0 && !d[i - 1]) || (isFinal && R.boDone(before));   // 11/7：預賽三回合全打，不會先鎖；決賽三戰兩勝
      return '<div class="rd"><span class="rl">第 ' + (i + 1) + ' 局</span><div class="opts' + (isFinal ? " four" : "") + '">' + opts.map(([v, l, c]) =>
        '<button type="button" class="opt ' + c + (d[i] === v ? " on" : "") + '" data-act="bout" data-i="' + i + '" data-v="' + v + '"' + (dis && d[i] !== v ? " disabled" : "") + ">" + l + "</button>").join("") + "</div></div>";
    }).join("");
  }
  function weightBox(st, id) {
    const w = R.weightOf(st, id);
    return '<label class="wbox">重量 <input type="number" inputmode="decimal" data-act="w-in" data-id="' + id + '" value="' + (w || "") + '" placeholder="公克"> g</label>';
  }
  // 一場（預賽或決賽）的輸入卡
  function boutCard(st, key, red, blue, title, sub, isFinal, o) {
    o = o || {};
    const rec = st[key], saved = rec && rec.payload ? (isFinal ? rec.payload.rounds : rec.payload.r) || [] : [];
    const d = (drafts[key] || saved).slice();
    const dirty = key in drafts;
    const p = R.tally(d), done = isFinal ? R.boDone(d) : R.rrDone(d);
    let h = '<div class="card now" data-key="' + key + '"><div class="nowh"><b>' + esc(title) + "</b><span>" + esc(sub) + "</span></div>";
    if (!red || !blue) return h + '<p class="note">對戰隊伍尚未產生（預賽結束、名次確定後自動配對）。</p></div>';
    h += '<div class="vs big"><div class="side red"><small>紅方</small>' + teamHTML(red) + weightBox(st, red) + '</div><div class="pts">' + p.red + " : " + p.blue + '</div><div class="side blue"><small>藍方</small>' + teamHTML(blue) + weightBox(st, blue) + "</div></div>" +
      '<div class="foot" style="justify-content:flex-start"><button type="button" class="ghost small" data-act="w-save" data-ids="' + red + "," + blue + '">儲存重量</button><span class="mute small">' + (isFinal ? "時間到雙方都在場上：判重量輕者勝" : "三回合都要打；每贏一回合 1 分；時間到判重量輕者贏、同重平手 0 分") + '</span></div>' +
      timerHTML(key, 30, "開始 30 秒") + boutRows(key, d, isFinal) +
      '<div class="pick"><button type="button" class="ghost" data-act="forfeit" data-v="XB">紅方缺賽／逾時<small>判藍勝 ' + (isFinal ? "2:0" : "3:0") + '</small></button><button type="button" class="ghost" data-act="forfeit" data-v="XR">藍方缺賽／逾時<small>判紅勝 ' + (isFinal ? "2:0" : "3:0") + '</small></button></div>' +
      '<div class="foot"><span class="mute small">' + (rec ? esc(rec.by) + " " + hhmm(rec.time) + (rec.pending ? "・待上傳" : "") : (isFinal ? "三戰兩勝" : "三回合全打")) + "</span>" +
      (o.admin && rec ? '<button type="button" class="ghost small" data-act="bout-clear">清除</button>' : "") +
      (dirty ? '<button type="button" class="ghost small" data-act="bout-undo">取消</button>' : "") +
      '<button type="button" data-act="bout-send"' + (dirty && (done || o.admin) ? "" : " disabled") + ">" + (done ? "送出（" + (isFinal ? (p.red > p.blue ? "紅勝" : p.blue > p.red ? "藍勝" : "平手") + " " + p.red + ":" + p.blue : "紅 " + p.red + " 分：藍 " + p.blue + " 分") + "）" : (isFinal ? "還沒分出勝負" : "三回合還沒打完")) + "</button></div>";
    return h + "</div>";
  }
  function arenaHTML(st, sess, arena, o) {
    o = o || {};
    const gk = D.arenas[sess][arena];
    if (!gk) return '<div class="banner">這個台' + SESS[sess] + "沒有比賽</div>";
    const g = D.groups[gk], q = R.arenaQueue(D, st, gk, arena);
    if (!R.drawDone(D, st, gk)) return "<h2>" + arena + " 號台・" + esc(g.name) + '</h2><div class="banner err">計分台還沒輸入完「' + esc(g.name) + '」的抽籤結果，輸入完這裡才會出現對戰隊伍（約 15–25 秒自動更新）。</div>' +
      '<p class="note">本台對戰（籤號）：' + q.all.map((m) => "第 " + m[0] + " 輪 籤 " + m[4] + " vs 籤 " + m[5]).join("、") + "</p>";
    let h = "<h2>" + arena + " 號台・" + esc(g.name) + ' <span class="mute small">預賽 ' + q.done + "/" + q.total + "</span></h2>";
    // 決賽（這一台是該組的決賽台，且對戰已產生）
    const F = R.finals(D, st, gk);
    const fins = ["SF1", "SF2", "P3", "F"].filter((k) => Number(F[k].arena) === arena);
    const curFin = fins.find((k) => SU.focus === "final:" + gk + ":" + k) || fins.find((k) => F[k].red && F[k].blue && !F[k].winner);
    if (curFin) h += boutCard(st, "final:" + gk + ":" + curFin, F[curFin].red, F[curFin].blue, "決賽｜" + R.FINAL_NAME[curFin], g.name, true, o);
    const focus = q.all.find((m) => R.matchKey(gk, m) === SU.focus);
    const cur = focus || q.now;
    if (!curFin) {
      if (cur) h += boutCard(st, R.matchKey(gk, cur), cur[2], cur[3], focus && R.matchInfo(st, gk, focus).done ? "修改成績" : "現在比賽", "第 " + cur[0] + " 輪・" + arena + " 號台", false, o);
      else h += '<div class="banner okb">本台預賽全部完成 ✓' + (fins.length ? "　決賽在這一台，隊伍產生後會出現在這裡" : "") + "</div>";
      const nx = q.all.filter((m) => !R.matchInfo(st, gk, m).done && m !== cur)[0];
      if (nx) h += '<div class="nextcall"><b>下一場（先請他們準備）</b>第 ' + nx[0] + ' 輪：<span class="r">紅 ' + teamText(nx[2]) + '</span>　vs　<span class="b">藍 ' + teamText(nx[3]) + "</span></div>";
    }
    const list = q.all.map((m) => {
      const key = R.matchKey(gk, m), x = R.matchInfo(st, gk, m), p = R.tally(x.r), rec = st[key];
      return '<div class="lrow' + (x.done ? " done" : "") + '"><span class="rnd">第 ' + m[0] + ' 輪</span><span class="lt"><span class="r">紅 ' + teamText(m[2]) + '</span><span class="b">藍 ' + teamText(m[3]) + "</span></span>" +
        '<span class="res">' + (x.done ? "<b>" + p.red + ":" + p.blue + "</b>" + (x.forfeit ? '<small class="warn">缺賽</small>' : "") : "") + "</span>" +
        (x.done && !x.forfeit ? (rec && rec.src === "admin" && !o.admin ? '<small class="mute">計分台已改</small>' : '<button type="button" class="ghost small" data-act="su-edit" data-key="' + key + '">修改</button>') : "") + "</div>";
    }).join("") + fins.filter((k) => F[k].winner).map((k) => '<div class="lrow done"><span class="rnd">' + R.FINAL_NAME[k] + '</span><span class="lt"><span class="r">紅 ' + teamText(F[k].red) + '</span><span class="b">藍 ' + teamText(F[k].blue) + '</span></span><span class="res"><b>' + F[k].r + ":" + F[k].b + "</b></span>" +
      '<button type="button" class="ghost small" data-act="su-edit" data-key="final:' + gk + ":" + k + '">修改</button></div>').join("");
    h += '<button type="button" class="ghost wide" data-act="su-all">' + (SU.showAll ? "▲ 收起" : "▼ 看本台全部對戰（" + q.done + " / " + q.total + " 完成）") + "</button>" + (SU.showAll ? '<div class="allm">' + list + "</div>" : "");
    return h;
  }

  // ====================== 裁判輸入：循線（碼錶＋手動修改）======================
  const LE = { team: "", att: 1, t: [], done: false, run: false, t0: 0, dirty: false };
  function leLoad(st) {
    const p = (st["line:" + LE.team + ":" + LE.att] || {}).payload;
    LE.t = p ? p.t.slice() : []; LE.done = p ? !!p.done : false; LE.dirty = false;
  }
  function lineEditorHTML(st, o) {
    o = o || {};
    const set = (st.lineset || {}).payload, cfg = R.cfgOf(st);
    const n = set ? set.laps : 5;
    let h = '<div class="card editor">' + (set ? lineTargetHTML(st) : '<p class="target warn">計分台尚未設定圈數與秒數（可以先計時）</p>') +
      '<div class="tgrid">' + groupsBy((g) => g.kind === "line").map((gk) => '<p class="tglabel">' + esc(D.groups[gk].name) + "</p>" + D.teams[gk].map((t) => {
        const k = Array.from({ length: cfg.lineTries }, (_, i) => i + 1).filter((a) => st["line:" + t.id + ":" + a]).length;
        return '<button type="button" class="tbtn' + (LE.team === t.id ? " on" : "") + (k >= cfg.lineTries ? " full" : "") + '" data-act="le-pick" data-v="' + t.id + '"><b class="code">' + esc(t.id) + "</b> " + esc(t.name) + "<small>" + (k ? "已跑 " + k + " 次" : "尚未出賽") + "</small></button>";
      }).join("")).join("") + "</div>";
    if (!LE.team) return h + '<p class="note">點上面的隊伍開始計時。</p></div>';
    const ev = set && LE.t.length ? R.lineEval(set, { t: LE.t, done: LE.done }) : null;
    h += '<h3>' + teamHTML(LE.team) + '</h3><div class="seg">' + Array.from({ length: cfg.lineTries }, (_, i) => i + 1).map((a) => '<button type="button" class="' + (LE.att === a ? "on" : "") + '" data-act="le-att" data-v="' + a + '">第 ' + a + " 次" + (st["line:" + LE.team + ":" + a] ? " ✓" : "") + "</button>").join("") + "</div>" +
      '<div class="watch"><span class="lw-time">' + (LE.run ? "" : f2(LE.t.length ? LE.t[LE.t.length - 1] : 0)) + '</span><small>秒</small></div><div class="btnrow">' +
      (LE.run ? '<button type="button" class="big go" data-act="le-lap">過線（記一圈）</button><button type="button" class="big stop" data-act="le-stop">終止</button>'
        : '<button type="button" class="big go" data-act="le-start">' + (LE.t.length ? "重新計時" : "開始計時") + "</button>") + "</div>" +
      '<div class="laps">' + Array.from({ length: n }, (_, i) => {
        const v = LE.t[i], diff = set && v ? Math.abs(v - (i + 1) * set.sec) : null;
        return '<label class="lap"><span>第 ' + (i + 1) + ' 圈</span><input type="number" inputmode="decimal" step="0.01" min="0" data-act="le-t" data-k="' + i + '" value="' + (v ? f2(v) : "") + '" placeholder="累計秒"><small class="mute">' + (diff != null ? "差 " + f2(diff) : "") + "</small></label>";
      }).join("") + "</div>" +
      '<label class="check"><input type="checkbox" data-act="le-done"' + (LE.done ? " checked" : "") + "> 跑完全部圈數，最後停在終點線上</label>" +
      (ev ? '<p class="eval">' + (ev.done ? "完成 " + ev.laps + " 圈，最終 " + f2(ev.final) + " 秒（差 " + f2(ev.diffs[0]) + "）" : "未完成：完成 " + ev.laps + " 圈") + "</p>" : "") +
      '<p class="note">秒數記到小數第 2 位；中間圈車頭碰到終點線就記，最後一圈要停在終點線上；超過 ' + R.LINE_MAX_SEC + " 秒的圈不算。</p>" +
      '<div class="foot"><button type="button" class="ghost small" data-act="le-clear">清空重來</button><button type="button" data-act="le-send"' + (LE.dirty && !LE.run && LE.t.length ? "" : " disabled") + ">送出第 " + LE.att + " 次成績</button></div></div>";
    return h;
  }
  setInterval(() => {
    if (LE.run) document.querySelectorAll(".lw-time").forEach((el) => { el.textContent = f2((performance.now() - LE.t0) / 1000); });
  }, 50);

  // ====================== 事件 ======================
  // ctx：{ state(), save(items) → Promise<{ok, message}>, render(), toast(msg, ok), admin, station() }
  function bindEditors(root, ctx) {
    const after = (p, fn) => p.then((r) => { if (r && r.ok && fn) fn(); toast(r.message, r.ok); ctx.render(); return r; });
    const stationId = () => (ctx.admin ? "ADM" : ctx.station ? ctx.station() : "SUB");
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.tagName === "INPUT" || b.tagName === "SELECT") return;
      const act = b.dataset.act, st = ctx.state();
      const tc = b.closest("[data-team]"), id = tc && tc.dataset.team;
      const kc = b.closest("[data-key]"), key = kc && kc.dataset.key;
      // 計時
      if (act === "cd") { TM[b.dataset.k] = Date.now() + Number(b.dataset.sec) * 1000; delete TM[b.dataset.k + "#beeped"]; beep(1); ctx.render(); return; }
      if (act === "cd-stop") { delete TM[b.dataset.k]; delete TM[b.dataset.k + "#beeped"]; ctx.render(); return; }
      // 基礎題
      if (act === "b-done") {
        const t = team(id);
        if (!confirm(id + " " + t.name + "\n基礎題 " + b.dataset.k + " 完成（裁判見證）？")) return;
        after(ctx.save([{ key: "basic:" + id + ":" + b.dataset.k, payload: { done: true, at: new Date().toISOString() } }]));
        return;
      }
      if (act === "b-undo") {
        if (!confirm("取消 " + id + " 基礎題 " + b.dataset.k + " 的完成紀錄？")) return;
        after(ctx.save([{ key: "basic:" + id + ":" + b.dataset.k, payload: { done: false } }]));
        return;
      }
      // 神秘題
      if (act === "m-edit") { const a = st[b.dataset.key].payload; MY[id] = { s: String(a.s), c: (a.c || []).slice(), edit: b.dataset.key }; ctx.render(); return; }
      if (act === "m-void") {
        const a = st[b.dataset.key].payload;
        if (!confirm(a.void ? "恢復這次成績（" + a.s + " 分）？" : "作廢這次成績（" + a.s + " 分）？作廢後不列入排名。")) return;
        after(ctx.save([{ key: b.dataset.key, payload: Object.assign({}, a, { void: !a.void }) }]));
        return;
      }
      if (act === "m-cancel") { delete MY[id]; ctx.render(); return; }
      if (act === "m-send") {
        const d = MY[id], cfg = R.cfgOf(st), s = Number(d && d.s);
        if (!d || d.s === "" || !(s >= 0 && s <= cfg.mmax)) { toast("分數要在 0–" + cfg.mmax + " 之間", false); return; }
        const k = d.edit || nextMysKey(st, id, stationId());
        const old = d.edit ? st[d.edit].payload : null;
        if (!confirm(id + " " + team(id).name + "\n神秘題 " + s + " 分\n\n請選手確認後按「確定」送出")) return;
        const payload = { s, at: old ? old.at || new Date().toISOString() : new Date().toISOString() };
        if (d.c.length) payload.c = d.c.slice();
        if (old && old.void) payload.void = true;
        delete TM["mys:" + id];
        after(ctx.save([{ key: k, payload }]), () => { delete MY[id]; });
        return;
      }
      // 啟蒙／探索
      if (act === "t-set") {
        const k = b.dataset.k, x = R.taskOf(st, id, k);
        if (!confirm(id + " 第 " + k + " 題 第 " + (x.used + 1) + " 次：" + (b.dataset.v === "S" ? "成功" : "失敗") + "？")) return;
        after(ctx.save([{ key: "task:" + id + ":" + k, payload: { t: x.tries.concat(b.dataset.v) } }]));
        return;
      }
      if (act === "t-reset") {
        if (!confirm("清掉 " + id + " 第 " + b.dataset.k + " 題的紀錄，重新輸入？")) return;
        after(ctx.save([{ key: "task:" + id + ":" + b.dataset.k, payload: { t: [] } }]));
        return;
      }
      // 相撲
      if (act === "su-all") { SU.showAll = !SU.showAll; ctx.render(); return; }
      if (act === "su-edit") { SU.focus = b.dataset.key; SU.showAll = false; delete drafts[SU.focus]; ctx.render(); window.scrollTo(0, 0); return; }
      if (act === "bout" || act === "forfeit") {
        const isFinal = key.startsWith("final:"), rec = st[key];
        let d = (drafts[key] || (rec && rec.payload ? (isFinal ? rec.payload.rounds : rec.payload.r) || [] : [])).slice();
        if (act === "forfeit") d = isFinal ? [b.dataset.v, b.dataset.v] : [b.dataset.v, b.dataset.v, b.dataset.v];   // 11/7：預賽缺賽判 3:0
        else { const i = Number(b.dataset.i); if (d[i] === b.dataset.v) d.length = i; else { d[i] = b.dataset.v; d.length = i + 1; } }
        while (isFinal && d.length > 1 && R.boDone(d.slice(0, d.length - 1))) d.pop();
        drafts[key] = d; ctx.render(); return;
      }
      if (act === "bout-undo") { delete drafts[key]; if (SU.focus === key) SU.focus = null; ctx.render(); return; }
      if (act === "bout-clear") { if (confirm("清除這場成績？")) after(ctx.save([{ key, payload: null }]), () => { delete drafts[key]; }); return; }
      if (act === "bout-send") {
        const d = drafts[key], isFinal = key.startsWith("final:"), p = R.tally(d);
        if (!confirm("紅 " + p.red + " : " + p.blue + " 藍\n雙方選手確認後按「確定」送出")) return;
        const payload = isFinal ? (ctx.admin ? Object.assign({}, (st[key] || {}).payload, { rounds: d, adminRounds: true }) : { rounds: d }) : { r: d };
        delete TM[key];
        after(ctx.save([{ key, payload }]), () => { delete drafts[key]; if (SU.focus === key) SU.focus = null; });
        return;
      }
      if (act === "w-save") {
        const items = b.dataset.ids.split(",").map((x) => { const el = root.querySelector('[data-act="w-in"][data-id="' + x + '"]'); return el && el.value !== "" ? { key: "weight:" + x, payload: { g: Number(el.value) } } : null; }).filter(Boolean);
        if (!items.length) { toast("請先輸入重量", false); return; }
        after(ctx.save(items));
        return;
      }
      // 循線
      if (act === "le-pick") {
        if (LE.dirty && !confirm("目前的秒數還沒送出，確定換隊伍？")) return;
        LE.team = b.dataset.v; LE.run = false;
        const cfg = R.cfgOf(st);
        LE.att = 1; for (let a = 1; a <= cfg.lineTries; a++) if (!st["line:" + LE.team + ":" + a]) { LE.att = a; break; }
        leLoad(st); ctx.render(); return;
      }
      if (act === "le-att") { LE.att = Number(b.dataset.v); leLoad(st); ctx.render(); return; }
      if (act === "le-start") {
        if (LE.t.length && !confirm("重新計時會清掉目前的圈數秒數，確定？")) return;
        LE.t = []; LE.done = false; LE.run = true; LE.t0 = performance.now(); LE.dirty = true; ctx.render(); return;
      }
      if (act === "le-lap") {
        const set = (st.lineset || {}).payload, max = set ? set.laps : 5;
        if (LE.t.length < max) LE.t.push(Math.round((performance.now() - LE.t0) / 10) / 100);
        if (LE.t.length >= max) { LE.run = false; LE.done = !!set; }
        ctx.render(); return;
      }
      if (act === "le-stop") { LE.run = false; LE.done = false; ctx.render(); return; }
      if (act === "le-clear") { LE.t = []; LE.done = false; LE.run = false; LE.dirty = true; ctx.render(); return; }
      if (act === "le-send") {
        const set = (st.lineset || {}).payload, max = set ? set.laps : 5;
        const t = LE.t.filter((x) => x > 0).slice(0, max).map((x) => Math.round(x * 100) / 100);
        if (!confirm(LE.team + " 第 " + LE.att + " 次：" + t.join("、") + " 秒" + (LE.done ? "（停在終點線）" : "（未完成）") + "\n選手確認後按「確定」送出")) return;
        after(ctx.save([{ key: "line:" + LE.team + ":" + LE.att, payload: { t, done: LE.done } }]), () => { LE.dirty = false; });
      }
    });
    root.addEventListener("input", (e) => {
      const el = e.target, act = el.dataset && el.dataset.act;
      const tc = el.closest("[data-team]"), id = tc && tc.dataset.team;
      if (act === "m-s") { MY[id] = Object.assign({ s: "", c: [] }, MY[id], { s: el.value }); const btn = tc.querySelector('[data-act="m-send"]'); if (btn) btn.disabled = el.value === ""; }
    });
    root.addEventListener("change", (e) => {
      const el = e.target, act = el.dataset && el.dataset.act, st = ctx.state();
      const tc = el.closest("[data-team]"), id = tc && tc.dataset.team;
      if (act === "m-item") {
        const cfg = R.cfgOf(st), d = MY[id] = Object.assign({ s: "", c: [] }, MY[id]);
        const i = Number(el.dataset.i);
        d.c = el.checked ? Array.from(new Set(d.c.concat(i))).sort((a, b) => a - b) : d.c.filter((x) => x !== i);
        d.s = String(Math.max(0, Math.min(cfg.mmax, d.c.reduce((s, k) => s + (Number((cfg.items[k] || {}).p) || 0), 0))));
        ctx.render();
      } else if (act === "le-t") {
        LE.t[Number(el.dataset.k)] = el.value === "" ? 0 : Number(el.value);
        while (LE.t.length && !(LE.t[LE.t.length - 1] > 0)) LE.t.pop();
        LE.dirty = true; ctx.render();
      } else if (act === "le-done") { LE.done = el.checked; LE.dirty = true; ctx.render(); }
    });
  }
  // 正在輸入（游標在輸入框、碼錶在跑、有沒送出的局數）時，背景更新不要重畫
  const busy = (root) => LE.run || Object.keys(drafts).length > 0 || Object.keys(MY).some((k) => MY[k] && (MY[k].s !== "" || MY[k].edit)) ||
    (document.activeElement && root.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName));

  function toast(msg, ok) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
    el.textContent = msg || (ok ? "完成" : "失敗");
    el.className = "show " + (ok ? "ok" : "err");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = ""; }, ok ? 2200 : 4500);
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  return { esc, pad, hhmm, hhmmss, f2, SESS, KIND, team, teamHTML, teamText, groupsBy, mysTableHTML, taskTableHTML, sumoStandingsHTML, scheduleHTML, finalsHTML, sumoRankHTML,
    lineTableHTML, lineTargetHTML, groupHTML, drawTableHTML, awardMap, timerHTML, jbcCardHTML, arenaHTML, boutCard, lineEditorHTML, bindEditors, busy, toast, download, drafts, MY, LE, SU, TM };
})();
