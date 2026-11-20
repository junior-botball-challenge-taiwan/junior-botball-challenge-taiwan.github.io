// JBC 台中站工作人員專區（照 GRG 2026 staff-site 改）：崗位資料在 roles.js（由 build_staff.py 產生），後台在 apps-script/Code.gs
(function () {
  const $ = (id) => document.getElementById(id);
  const ROLES = window.ROLES, EV = window.EVENT;
  const ARRANGE = "A", ARRANGE_NAME = "由主辦單位安排崗位（機動人員）";   // 11/8 理事長：派去哪個裁判崗位都可以，或當天當機動、隨時派任務（可多人）
  const FIXED = window.FIXED || {};                         // 主辦指定且已有人：{ id: 暱稱 }（組長）
  const RESERVED = new Set((window.RESERVED || []).map(String)); // 主辦指定、還沒有人：不開放認領
  const FIXED_NAMES = new Set(Object.values(FIXED));
  // 11/8 理事長：好友同組保留的連續裁判位置（只有那組好友能認領，那組好友也只在自己的保留位認領）
  const TEAMS = window.TEAMS || [];
  const teamOfRole = (id) => TEAMS.findIndex((t) => t.ids.map(String).includes(String(id)));
  const teamOfNick = (n) => TEAMS.findIndex((t) => t.nicks.includes(n));
  const TEAM_NAMES = new Set([].concat(...TEAMS.map((t) => t.nicks)));
  // 11/19 下午理事長：組長 G1、G2 限有賽事經驗者認領（資格在後台名單分頁檢查，網頁不放名單）
  const EXP_ONLY = new Set((window.EXP_ONLY || []).map(String));
  const EXP_MSG = "這個崗位限有機器人賽事、營隊或大型活動志工／工作人員經驗的人認領（依報名表單）；如果你有經驗但表單填「否」，請在工作人員 LINE 群組告訴大會";
  // 互動位置圖：{ id: { am: [[左%, 上%]…], pm: … } }
  const POS = window.POS || {};
  const SESS = [["am", "上午"], ["pm", "下午"]];
  let mapOpen = null, mapSess = {}, bigSess = "am";
  // 11/20 理事長：改成「大會指派崗位」——登入（暱稱＋電話）看大會排好的崗位，按按鈕考自己崗位的測驗；不再開放自己認領／取消
  //   指派模式下 roles.js 的 FIXED（自己認領時代的主辦指定）不再蓋到名單上，以後台認領分頁為準
  const ASSIGN = true;
  const ASSIGN_MSG = "崗位由大會安排，要換工作請在工作人員 LINE 群組告訴大會";
  const TRAINING_URL = window.TRAINING_URL || "../taichung-1213-judge-training/";   // 同一個網域：登入資料用 sessionStorage 帶過去（電話不放網址）
  const LOGIN_KEY = "jbc1213-staff-login";
  const TRACK_LABEL = { "JBC 場地裁判": "JBC 場地裁判", "相撲": "相撲裁判", "循線": "循線裁判", "共同": "共同須知" };
  // 崗位 → 測驗類別（要和 Code.gs 的 trackOfRole_ 一致）：J、JM＝JBC 場地裁判；S＝相撲；L＝循線；其他＝共同
  const trackOf = (code) => /^J/.test(code) ? "JBC 場地裁判" : /^S/.test(code) ? "相撲" : /^L/.test(code) ? "循線" : "共同";
  // 11/20 晚理事長：L1、L2（上午 JBC 機動、下午循線）循線＋JBC 場地裁判兩種都要考（要和 Code.gs 的 tracksOfRole_ 一致）
  const tracksOf = (code) => (/^L/.test(code) ? [trackOf(code), "JBC 場地裁判"] : [trackOf(code)]);
  let me = null;   // 登入後：{ nickname, roleId, code, roleName, track, tracks, assigned, quiz, quizzes, allPass }
  const withFixed = (c) => (ASSIGN ? { ...(c || {}) } : { ...(c || {}), ...FIXED });
  const GROUP_COLOR = window.GROUP_COLOR || {};
  const byId = {}; ROLES.forEach((r) => (byId[String(r.id)] = r));
  const roleName = (id) => { if (String(id) === ARRANGE) return ARRANGE_NAME; const r = byId[String(id)]; return r ? r.code + " " + r.title : ""; };
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const strip = (t) => String(t).replace(/<[^>]+>/g, "");

  let state = { open: false, openAt: EV.openAt, offset: 0, nicknames: [], claims: {}, arrange: [] };
  let filter = "全部", query = "";
  const ui = {}; // 每一列的輸入狀態：{ nick, phone, cancel, msg, ok }，重新整理時保留

  // ---------- 後台：正式（Apps Script）或示範模式 ----------
  const demo = !window.API_URL;
  const DEMO_STAFF = { "示範-小明": "0912345678", "示範-小華": "0922333444", "示範-阿美": "0933111222" };
  const DEMO_EXP = new Set(["示範-小明"]);   // 示範模式：只有小明有賽事經驗（可認領 G1、G2）
  const DEMO_ASSIGN = { "49": "示範-小明", "2": "示範-小華" };   // 示範模式的大會指派：小明 L2（上午 JBC 機動、下午循線）、小華 J01、阿美還沒排
  const DEMO_QUIZ = { "示範-小明": { score: 92, pass: true, track: "循線", byTrack: { "循線": { score: 92, pass: true } } } };   // 示範：小明循線已及格、JBC 還沒考
  const demoOpen = () => new URLSearchParams(location.search).has("open");
  function demoLoad() { try { return JSON.parse(localStorage.getItem("jbcTcDemo") || "null") || { claims: {}, arrange: [] }; } catch (e) { return { claims: {}, arrange: [] }; } }
  function demoSave(d) { try { localStorage.setItem("jbcTcDemo", JSON.stringify(d)); } catch (e) {} }
  const norm = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("886")) d = "0" + d.slice(3); return d; };

  async function apiStatus() {
    if (demo && ASSIGN) return { open: true, openAt: EV.openAt, now: new Date().toISOString(), nicknames: Object.keys(DEMO_STAFF), claims: { ...DEMO_ASSIGN }, arrange: [], quiz: { ...DEMO_QUIZ } };
    if (demo) return { open: demoOpen() || Date.now() >= new Date(EV.openAt).getTime(), openAt: EV.openAt, now: new Date().toISOString(), nicknames: Object.keys(DEMO_STAFF), ...demoLoad() };
    const res = await fetch(window.API_URL, { cache: "no-store" });
    return res.json();
  }
  // 11/20：登入看我的崗位（後台 action 'me'：暱稱＋電話驗證，錯 5 次鎖 15 分）
  async function apiMe(nickname, phone) {
    if (demo) {
      if (!DEMO_STAFF[nickname]) return { ok: false, message: "找不到這個暱稱" };
      if (norm(DEMO_STAFF[nickname]).slice(-9) !== norm(phone).slice(-9)) return { ok: false, message: "電話號碼不符" };
      const id = Object.keys(DEMO_ASSIGN).find((k) => DEMO_ASSIGN[k] === nickname), r = id && byId[id];
      const tracks = r ? tracksOf(r.code) : ["共同"], bt = (DEMO_QUIZ[nickname] || {}).byTrack || {}, quizzes = {};
      tracks.forEach((t) => (quizzes[t] = bt[t] || null));
      return { ok: true, nickname, roleId: r ? r.id : null, code: r ? r.code : "", roleName: r ? r.code + " " + r.title : "大會安排中", track: tracks[0], tracks, assigned: !!r,
        quiz: quizzes[tracks[0]], quizzes, allPass: tracks.every((t) => quizzes[t] && quizzes[t].pass) };
    }
    const res = await fetch(window.API_URL, { method: "POST", body: JSON.stringify({ action: "me", nickname, phone }) });
    return res.json();
  }
  async function apiPost(req) {
    if (ASSIGN) return { ok: false, message: ASSIGN_MSG };   // 11/20 理事長：不再開放自己認領／取消
    if (demo) {
      if (!state.open) return { ok: false, message: "尚未開放填寫（" + EV.openText + " 開放）" };
      const d = demoLoad(), c = d.claims, a = d.arrange;
      if (norm(DEMO_STAFF[req.nickname]) !== norm(req.phone)) return { ok: false, message: "電話號碼不符", ...d };
      if (FIXED[String(req.roleId)] || RESERVED.has(String(req.roleId))) return { ok: false, message: "這個崗位由主辦單位指定", ...d };
      if (req.action === "claim" && EXP_ONLY.has(String(req.roleId)) && !DEMO_EXP.has(req.nickname)) return { ok: false, message: EXP_MSG, ...d };
      if (req.action === "claim") {
        const mt = teamOfNick(req.nickname), rt = req.roleId === ARRANGE ? -1 : teamOfRole(req.roleId);
        if (mt >= 0 && rt !== mt) return { ok: false, message: "你和好友的位置保留在 " + TEAMS[mt].codes.join("、") + "，請在那幾格認領", ...d };
        if (rt >= 0 && rt !== mt) return { ok: false, message: "這個位置保留給好友同組的夥伴", ...d };
      }
      const mine = Object.keys(c).find((k) => c[k] === req.nickname), inA = a.includes(req.nickname);
      const cur = mine ? roleName(mine) : inA ? ARRANGE_NAME : null;
      const release = () => { if (mine) delete c[mine]; if (inA) a.splice(a.indexOf(req.nickname), 1); };
      const done = (m) => { demoSave(d); return { ok: true, message: m, ...d }; };
      if (req.action === "cancel") { if (!cur) return { ok: false, message: "你目前沒有選擇", ...d }; release(); return done("已取消 " + cur); }
      if (req.roleId === ARRANGE) { if (inA) return done("你已經選擇 " + ARRANGE_NAME); release(); a.push(req.nickname); return done((cur ? "已從 " + cur + " 改為 " : "已選擇 ") + ARRANGE_NAME); }
      const id = String(req.roleId);
      if (c[id] && c[id] !== req.nickname) return { ok: false, message: "這個崗位已被 " + c[id] + " 認領", ...d };
      if (mine === id) return done("你已經認領 " + roleName(id));
      release(); c[id] = req.nickname;
      return done((cur ? "已從 " + cur + " 改為 " : "已認領 ") + roleName(id));
    }
    const res = await fetch(window.API_URL, { method: "POST", body: JSON.stringify(req) });
    return res.json();
  }

  // ---------- 畫面 ----------
  function renderStatic() {
    $("eventMeta").textContent = EV.date + "｜" + EV.place;
    $("openText").textContent = EV.openText + " 開放，";
    $("openAtText").textContent = EV.openText;
    $("contact").textContent = EV.contact;
    $("common").innerHTML = window.COMMON.map((t) => "<li>" + t + "</li>").join("");
    $("timeline").innerHTML = "<tr><th>時間</th><th>全場</th><th>工作人員重點</th></tr>" +
      window.TIMELINE.map((r) => "<tr><td class='t'>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>").join("");
    $("ruleBtns").innerHTML = window.RULE_TABS.map((t) => '<a class="btn-rule" href="' + EV.ruleUrl + '" target="_blank" rel="noopener">' + t + "</a>").join("");
    const docs = window.DOCS || {};
    [["staffDoc", docs.staff], ["judgeDoc", docs.judge]].forEach(([id, href]) => { if (href) { $(id).href = href; $(id).hidden = false; } });
    $("demoNote").hidden = !demo;
    const groups = ["全部"].concat(window.GROUP_ORDER);
    $("chips").innerHTML = groups.map((g) => '<button type="button" class="chip' + (g === filter ? " on" : "") + '" data-g="' + g + '">' + g +
      (g === "全部" ? "" : "（" + ROLES.filter((r) => r.group === g).length + "）") + "</button>").join("");
  }

  const list = (arr) => (arr && arr.length ? "<ul>" + arr.map((t) => "<li>" + t + "</li>").join("") + "</ul>" : "<p class='load'>無</p>");

  function whereIs() {
    const m = {};
    for (const id in state.claims) m[state.claims[id]] = byId[id] ? byId[id].code : "#" + pad(id);
    (state.arrange || []).forEach((n) => (m[n] = "主辦安排"));
    return m;
  }

  function nickOptions(key, onlyFrom) {
    const where = whereIs();
    const t = teamOfRole(key);
    const names = onlyFrom || (t >= 0 ? TEAMS[t].nicks.filter((n) => state.nicknames.includes(n) || demo)
      : state.nicknames.filter((n) => !FIXED_NAMES.has(n) && !TEAM_NAMES.has(n)));
    return '<option value="">選你的暱稱</option>' + names.map((n) =>
      '<option value="' + esc(n) + '"' + (ui[key] && ui[key].nick === n ? " selected" : "") + ">" + esc(n) + (where[n] && !onlyFrom ? "（目前：" + where[n] + "）" : "") + "</option>").join("");
  }

  // 11/8 理事長：裁判規則測驗在培訓網頁交卷，後台回傳每人最高分 state.quiz（byTrack＝每個類別各自的最高分）
  // 11/20 晚理事長：要考兩種的崗位（L1、L2）兩種都及格才算 ✅
  function quizTag(n, key) {
    const q = (state.quiz || {})[n], r = byId[String(key)];
    if (!q) return "・測驗未交";
    if (!r || !q.byTrack) return q.pass ? "・測驗 ✅" : "・測驗 " + q.score + " 分（未及格）";
    const ts = tracksOf(r.code), one = (t) => q.byTrack[t];
    if (ts.every((t) => one(t) && one(t).pass)) return "・測驗 ✅";
    if (ts.length === 1) return one(ts[0]) ? "・測驗 " + one(ts[0]).score + " 分（未及格）" : "・測驗未交";
    return "・測驗 " + ts.map((t) => (TRACK_LABEL[t] || t) + (one(t) ? (one(t).pass ? " ✅" : " " + one(t).score + " 分") : " 未交")).join("／");
  }

  function actionHTML(key, takenBy) {
    if (ASSIGN) return '<div class="act"><span class="who">' + (takenBy ? "✔ " + esc(takenBy) + "（大會安排）" + quizTag(takenBy, key)
      : RESERVED.has(key) ? "主辦單位指定" : "大會安排中") + "</span></div>";
    if (FIXED[key]) return '<div class="act"><span class="who">✔ ' + esc(FIXED[key]) + "（" + esc((window.FIXED_TAG || {})[key] || "主辦指定") + "）" + quizTag(FIXED[key]) + "</span></div>";
    if (RESERVED.has(key)) return '<div class="act"><span class="fixed-tag">主辦單位指定，不開放認領</span></div>';
    const u = ui[key] || {}, locked = !state.open, dis = locked ? " disabled" : "";
    const msg = u.msg ? '<p class="row-msg ' + (u.ok ? "ok" : "err") + '">' + esc(u.msg) + "</p>" : "";
    if (takenBy && !u.cancel) {
      return '<div class="act taken-act"><span class="who">✔ ' + esc(takenBy) + " 已認領" + quizTag(takenBy) + "</span>" +
        '<button type="button" class="ghost small" data-act="askcancel" data-key="' + key + '"' + dis + ">我要取消</button></div>" + msg;
    }
    const isCancel = !!u.cancel;
    const nickSel = '<select data-f="nick" data-key="' + key + '"' + dis + ">" +
      (isCancel ? nickOptions(key, key === ARRANGE ? state.arrange : [takenBy]) : nickOptions(key)) + "</select>";
    return '<div class="act">' + nickSel +
      '<input data-f="phone" data-key="' + key + '" type="tel" inputmode="numeric" autocomplete="tel" placeholder="請填寫手機號碼做本人確認" value="' + esc(u.phone || "") + '"' + dis + ">" +
      '<button type="button" data-act="' + (isCancel ? "cancel" : "claim") + '" data-key="' + key + '"' + dis + ">" + (isCancel ? "確認取消" : "確認") + "</button>" +
      (isCancel ? '<button type="button" class="ghost small" data-act="back" data-key="' + key + '">返回</button>' : "") +
      "</div>" + (locked ? '<p class="row-hint">' + EV.openText + " 開放</p>" : "") + msg;
  }

  function arrangeRow() {
    const a = state.arrange || [], u = ui[ARRANGE] || {};
    if (ASSIGN) return a.length ? '<div class="row arrange"><div class="row-head"><span class="num star">★</span><div class="row-title"><span class="title">' + ARRANGE_NAME +
      '</span><span class="short">由主辦單位派任務（機動人員）</span></div><span class="badge free">' + a.length + ' 人</span></div><p class="names">' + a.map(esc).join("、") + "</p></div>" : "";
    return '<div class="row arrange"><div class="row-head">' +
      '<span class="num star">★</span><div class="row-title"><span class="title">' + ARRANGE_NAME + '</span>' +
      '<span class="short">哪裡都可以！由主辦單位幫你安排崗位：派你去任何一個裁判位置，或當機動人員、當天由組長隨時派任務（可多人）</span></div>' +
      '<span class="badge free">' + a.length + " 人</span></div>" +
      (a.length ? '<p class="names">' + a.map(esc).join("、") + "</p>" : "") +
      actionHTML(ARRANGE, null) +
      (a.length && !u.cancel ? '<button type="button" class="link" data-act="askcancel" data-key="' + ARRANGE + '"' + (state.open ? "" : " disabled") + ">取消我的「由主辦單位安排」</button>" : "") +
      "</div>";
  }

  // ---------- 互動位置圖 ----------
  function mapHTML(sess, pins, labels) {
    return '<div class="mapwrap"><img src="map/' + sess + '.jpg" alt="' + (sess === "am" ? "上午" : "下午") + '場地圖" loading="lazy">' +
      pins.map((p, i) => '<span class="' + (labels ? "tag-pin" : "pin") + '" style="left:' + p[0] + "%;top:" + p[1] + '%"' +
        (labels ? ' data-act="goto" data-code="' + esc(labels[i]) + '"' : "") + ">" + (labels ? esc(labels[i]) : "") + "</span>").join("") + "</div>";
  }
  function tabsHTML(act, key, cur) {
    return '<div class="maptabs">' + SESS.map(([k, n]) => '<button type="button" class="chip' + (k === cur ? " on" : "") + '" data-act="' + act + '" data-key="' + key + '" data-s="' + k + '">' + n + "</button>").join("") + "</div>";
  }
  function rowMap(key) {
    const p = POS[key] || {}, s = mapSess[key] || (p.am ? "am" : "pm"), pins = p[s] || [];
    return '<div class="mapbox">' + tabsHTML("msess", key, s) +
      (pins.length ? "" : '<p class="row-hint">這個時段沒有固定位置（機動或支援，聽裁判長／組長調度）</p>') +
      mapHTML(s, pins) + '<p class="row-hint">紅點＝你的位置（' + (s === "am" ? "上午" : "下午") + '）。圖上的「判」是 JBC 裁判桌，相撲台、循線賽道在下方。</p></div>';
  }
  // 11/8 理事長：整張場地圖放大、每個位置直接顯示誰（已排定／已認領的暱稱），字也放大
  function bigMap() {
    const cl = state.claims || {};
    const tags = ROLES.map((r) => {
      const p = (POS[String(r.id)] || {})[bigSess]; if (!p || !/^(J\d|S\d|L\d)/.test(r.code)) return "";
      const who = cl[String(r.id)] || "", fixed = !!FIXED[String(r.id)];
      return '<span class="tag-pin' + (who ? (fixed ? " fixed" : " taken") : "") + '" style="left:' + p[0][0] + "%;top:" + p[0][1] + '%" data-act="goto" data-code="' + esc(r.code) + '">' +
        "<b>" + esc(r.code) + "</b>" + (who ? "<i>" + esc(who) + "</i>" : "<i>" + (ASSIGN ? "安排中" : "可認領") + "</i>") + "</span>";
    }).join("");
    $("bigmap").innerHTML = tabsHTML("bsess", "", bigSess) +
      '<div class="bigscroll"><div class="mapwrap big"><img src="map/' + bigSess + '.jpg" alt="場地圖">' + tags + "</div></div>" +
      '<p class="row-hint">手機可以左右滑動看整張圖。點位置（J＝JBC 場地裁判、S＝相撲台、L＝循線賽道）就會跳到那個崗位；名字是已排定或已認領的人。</p>';
  }

  // 11/8 理事長：認領了崗位的人點練習計分，直接帶到這個崗位（練習模式，資料只在自己手機）
  const SCORE_ST = window.SCORE_ST || {};
  function scoreLinks(key) {
    const s = SCORE_ST[key]; if (!s) return "";
    const a = (st, t) => '<a href="score/judge.html?demo=1&station=' + encodeURIComponent(st) + '" target="_blank" rel="noopener">' + t + "</a>";
    const parts = s.am && s.am === s.pm ? [a(s.am, "開始練習")] : [s.am && a(s.am, "上午崗位"), s.pm && a(s.pm, "下午崗位")].filter(Boolean);
    return '<p class="score-try">📱 用這個崗位練習計分（練習模式・密碼已填好 1213）：' + parts.join("　") + "</p>";
  }

  function roleRow(r) {
    const key = String(r.id), who = state.claims[key], t = teamOfRole(key);
    const ftag = (window.FIXED_TAG || {})[key] || "";
    const badge = ASSIGN ? (who ? ["taken", "已安排"] : RESERVED.has(key) ? ["taken", "主辦指定"] : ["free", "安排中"]) : FIXED[key] && ftag.indexOf("好友") === 0 ? ["team", "好友・已排好"] : FIXED[key] || RESERVED.has(key) ? ["taken", "主辦指定"] : who ? ["taken", "已認領"] : t >= 0 ? ["team", "好友保留"] : EXP_ONLY.has(key) ? ["team", "限有賽事經驗者"] : ["free", "可認領"];
    const hasMap = !!POS[key];
    return '<div class="row' + (who ? " is-taken" : "") + '" id="row-' + esc(r.code) + '"><div class="row-head">' +
      '<span class="num" style="background:' + (GROUP_COLOR[r.group] || "#555") + '">' + esc(r.code) + "</span>" +
      '<div class="row-title"><span class="title">' + esc(r.title) + '</span><span class="short">' + esc(r.short) + "</span></div>" +
      '<span class="badge ' + badge[0] + '">' + badge[1] + "</span></div>" +
      (EXP_ONLY.has(key) && !ASSIGN ? '<p class="team-tag">⭐ ' + esc(window.EXP_ONLY_TEXT || "限有賽事經驗者") + "</p>" : "") +
      (t >= 0 ? '<p class="team-tag">🤝 好友同組保留位（' + TEAMS[t].codes.join("、") + "）：只有 " + TEAMS[t].nicks.map(esc).join("、") + " 能在這幾格認領</p>" : "") +
      actionHTML(key, who) +
      (hasMap ? '<button type="button" class="link" data-act="map" data-key="' + key + '">' + (mapOpen === key ? "▲ 收起位置圖" : "📍 在場地圖上看位置（上午／下午）") + "</button>" : "") +
      (hasMap && mapOpen === key ? rowMap(key) : "") +
      scoreLinks(key) +
      '<details data-key="' + key + '"><summary>看詳細</summary><div class="body">' +
      '<p class="load">' + r.group + "</p>" +
      '<div class="two"><div class="box"><h4>上午</h4>' + list(r.am) + '</div><div class="box"><h4>下午</h4>' + list(r.pm) + "</div></div>" +
      '<div class="two"><div><h4>要帶</h4>' + list(r.bring) + "</div><div><h4>適合誰</h4>" + list(r.need) + "</div></div>" +
      '<div class="two"><div><h4>重點注意</h4>' + list(r.watch) + "</div><div><h4>要讀</h4>" + list(r.read) + "</div></div></div></details></div>";
  }

  function matches(r) {
    if (filter !== "全部" && r.group !== filter) return false;
    if (!query) return true;
    const hay = (r.code + " " + r.title + " " + r.short + " " + strip(r.am.join(" ")) + " " + strip(r.pm.join(" "))).toUpperCase();
    return query.toUpperCase().split(/\s+/).every((q) => hay.includes(q));
  }

  function renderDynamic() {
    const claims = state.claims || {}, arrange = state.arrange || [];
    const taken = Object.keys(claims).filter((k) => byId[k]).length;
    const open = ROLES.length - RESERVED.size;
    $("countText").textContent = ASSIGN ? "大會已安排 " + taken + " / " + open + " 個崗位" + (arrange.length ? "・機動人員 " + arrange.length + " 人" : "")
      : "已認領 " + taken + " / " + open + "・主辦安排 " + arrange.length + " 人" + (state.nicknames.length ? "・已填 " + (taken + arrange.length) + " / " + state.nicknames.length + " 人" : "");
    $("lockbox").hidden = ASSIGN || state.open;
    loginNicks();

    const openDetails = new Set([...document.querySelectorAll("#rows details[open]")].map((d) => d.dataset.key));
    const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset : null;
    const activeKey = active && active.key, activeF = active && active.f;

    bigMap();
    const shown = ROLES.filter(matches);
    $("rows").innerHTML = (filter === "全部" && !query ? arrangeRow() : "") + (shown.length ? shown.map(roleRow).join("") : "<p class='load'>找不到符合的崗位</p>");
    document.querySelectorAll("#rows details").forEach((d) => { if (openDetails.has(d.dataset.key) || (query && shown.length <= 3)) d.open = true; });
    if (activeKey && activeF) { const el = document.querySelector('#rows [data-key="' + activeKey + '"][data-f="' + activeF + '"]'); if (el) el.focus(); }
  }

  function tick() {
    if (state.open) return;
    const ms = new Date(state.openAt).getTime() - (Date.now() + state.offset);
    if (ms <= 0) { $("countdown").textContent = "開放中，重新整理…"; refresh(); return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    $("countdown").textContent = "倒數 " + d + " 天 " + pad(h) + ":" + pad(m) + ":" + pad(s);
  }

  async function refresh() {
    try {
      const st = await apiStatus();
      state = { ...state, ...st, claims: withFixed(st.claims), arrange: st.arrange || [], offset: new Date(st.now).getTime() - Date.now() };
      renderDynamic(); tick();
    } catch (e) {
      $("countText").textContent = "讀取失敗，請稍後重新整理";
    }
  }

  async function send(action, key) {
    const u = (ui[key] = ui[key] || {});
    const req = { action, nickname: u.nick || "", phone: u.phone || "", roleId: key };
    if (!req.nickname || !req.phone) { u.msg = "請選暱稱並填寫手機號碼做本人確認"; u.ok = false; renderDynamic(); return; }
    u.msg = "送出中…"; u.ok = true; renderDynamic();
    try {
      const r = await apiPost(req);
      if (r.claims) state.claims = withFixed(r.claims);
      if (r.arrange) state.arrange = r.arrange;
      for (const k in ui) if (k !== key) ui[k].msg = "";
      ui[key] = r.ok ? { msg: r.message, ok: true } : { ...u, msg: r.message, ok: false };
    } catch (e) {
      u.msg = "送出失敗，請檢查網路後再試一次"; u.ok = false;
    }
    renderDynamic();
  }

  // ---------- 11/20 登入 → 我的崗位卡 → 開始自己崗位的測驗 ----------
  const loadLogin = () => { try { return JSON.parse(sessionStorage.getItem(LOGIN_KEY) || "null"); } catch (e) { return null; } };
  const saveLogin = (v) => { try { v ? sessionStorage.setItem(LOGIN_KEY, JSON.stringify(v)) : sessionStorage.removeItem(LOGIN_KEY); } catch (e) {} };
  let lastNicks = "";
  function loginNicks() {
    const sel = $("loginNick"); if (!sel) return;
    const key = state.nicknames.join("|"); if (key === lastNicks) return; lastNicks = key;
    const cur = sel.value;
    sel.innerHTML = '<option value="">選你的暱稱</option>' + state.nicknames.map((n) => '<option value="' + esc(n) + '"' + (n === cur ? " selected" : "") + ">" + esc(n) + "</option>").join("");
  }
  function quizStatus(q) {
    if (!q) return '<span class="qs none">還沒考（11/20 歸零後）</span>';
    return q.pass ? '<span class="qs ok">✅ 已及格（最高 ' + q.score + " 分）</span>" : '<span class="qs ng">' + q.score + " 分，還沒及格（80 分及格，可以重考）</span>";
  }
  function renderMe() {
    const box = $("myCard"), lg = $("loginBox");
    if (!me) { box.hidden = true; lg.hidden = false; return; }
    lg.hidden = true; box.hidden = false;
    const r = me.roleId ? byId[String(me.roleId)] : null;
    const tracks = me.tracks && me.tracks.length ? me.tracks : [me.track || "共同"];
    const quizzes = me.quizzes || { [tracks[0]]: me.quiz || null };
    const quizOne = (t) => {   // 每一種測驗一個按鈕、各自顯示狀態（L1、L2 兩個）
      const label = TRACK_LABEL[t] || t, what = t === "共同" ? "共同須知題" : "共同須知題＋" + label + "題";
      return '<div class="quizone"><p class="qline">測驗：<b>' + esc(label) + "</b>（" + what + "）｜目前：" + quizStatus(quizzes[t]) + "</p>" +
        '<a class="bigbtn" data-act="quiz" data-track="' + esc(t) + '" href="' + TRAINING_URL + '">開始「' + esc(label) + "」測驗 →</a></div>";
    };
    const head = r ? '<div class="row-head"><span class="num" style="background:' + (GROUP_COLOR[r.group] || "#555") + '">' + esc(r.code) + "</span>" +
        '<div class="row-title"><span class="title">' + esc(r.title) + '</span><span class="short">' + esc(r.short) + "</span></div></div>"
      : '<div class="row-head"><span class="num star">…</span><div class="row-title"><span class="title">大會安排中</span><span class="short">崗位排好後會在這裡顯示；可以先考共同須知題</span></div></div>';
    box.innerHTML = '<p class="hello">👋 ' + esc(me.nickname) + (r ? "，這是大會幫你排好的崗位" : "，你的崗位大會還在安排") + "</p>" + head +
      '<div class="quizbox">' + (tracks.length > 1 ? '<p class="qline"><b>你的崗位要考 ' + tracks.length + " 種測驗，兩種都要及格</b>（" + tracks.map((t) => esc(TRACK_LABEL[t] || t)).join("＋") + "，各自交卷）</p>" : "") +
      tracks.map(quizOne).join("") +
      '<p class="row-hint">測驗已在 11/20 歸零，之前考過的也請照新崗位再考一次；80 分及格、可以重考，以最高分為準。交卷時再輸入一次手機號碼確認本人。</p></div>' +
      (r ? '<div class="two"><div class="box"><h4>上午</h4>' + list(r.am) + '</div><div class="box"><h4>下午</h4>' + list(r.pm) + "</div></div>" +
        (POS[String(r.id)] ? rowMap(String(r.id)) : "") + scoreLinks(String(r.id)) : "") +
      '<p class="rule">要換工作？請在工作人員 LINE 群組告訴大會，由大會幫你調整（網站不能自己換）。</p>' +
      '<p><button type="button" class="ghost small" data-act="logout">登出（換別人登入）</button></p>';
  }
  async function doLogin(nick, phone, silent) {
    const msg = $("loginMsg");
    if (!nick || !phone) { msg.textContent = "請選暱稱並輸入手機號碼"; msg.className = "row-msg err"; return; }
    if (!silent) { msg.textContent = "登入中…"; msg.className = "row-msg ok"; }
    try {
      const r = await apiMe(nick, phone);
      if (!r.ok) { me = null; saveLogin(null); msg.textContent = r.message || "登入失敗"; msg.className = "row-msg err"; renderMe(); return; }
      me = r; msg.textContent = "";
      const prev = loadLogin(), tracks = r.tracks && r.tracks.length ? r.tracks : [r.track];
      const track = prev && prev.nick === r.nickname && tracks.includes(prev.track) ? prev.track : tracks[0];
      saveLogin({ nick: r.nickname, phone, track, tracks, code: r.code, roleName: r.roleName, assigned: r.assigned, t: Date.now() });   // 培訓頁讀這個（同網域、只在這個分頁）
      renderMe();
    } catch (e) { msg.textContent = "登入失敗，請檢查網路後再試一次"; msg.className = "row-msg err"; }
  }
  if ($("mine")) {
    $("loginBtn").onclick = () => doLogin($("loginNick").value, $("loginPhone").value.trim());
    $("loginPhone").addEventListener("keydown", (e) => { if (e.key === "Enter") $("loginBtn").click(); });
    $("mine").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "logout") { me = null; saveLogin(null); $("loginPhone").value = ""; renderMe(); }
      else if (b.dataset.act === "quiz") { const v = loadLogin(); if (v) { v.track = b.dataset.track; saveLogin(v); } }   // 按哪個測驗按鈕，培訓頁就鎖那一種（不擋連結，同分頁開）
      else if (b.dataset.act === "msess") { mapSess[b.dataset.key] = b.dataset.s; renderMe(); }
    });
    const saved = loadLogin();
    if (saved && saved.nick && saved.phone) doLogin(saved.nick, saved.phone, true);   // 從培訓頁回來：重新讀一次最新分數
    else renderMe();
  }

  // ---------- 事件 ----------
  $("chips").onclick = (e) => { const b = e.target.closest("[data-g]"); if (!b) return; filter = b.dataset.g; renderStatic(); renderDynamic(); };
  $("search").addEventListener("input", (e) => { query = e.target.value.trim(); renderDynamic(); });
  $("rows").addEventListener("input", (e) => {
    const t = e.target, key = t.dataset.key, f = t.dataset.f;
    if (!key || !f) return;
    (ui[key] = ui[key] || {})[f] = t.value;
  });
  $("rows").addEventListener("change", (e) => {
    const t = e.target; if (t.dataset.key && t.dataset.f) (ui[t.dataset.key] = ui[t.dataset.key] || {})[t.dataset.f] = t.value;
  });
  $("rows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    const key = b.dataset.key, act = b.dataset.act;
    if (act === "claim") send("claim", key);
    else if (act === "cancel") { if (confirm("確定要取消嗎？")) send("cancel", key); }
    else if (act === "askcancel") { ui[key] = { cancel: true, nick: key === ARRANGE ? "" : state.claims[key] }; renderDynamic(); }
    else if (act === "back") { ui[key] = {}; renderDynamic(); }
    else if (act === "map") { mapOpen = mapOpen === key ? null : key; renderDynamic(); }
    else if (act === "msess") { mapSess[key] = b.dataset.s; renderDynamic(); }
  });
  $("bigmap").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "bsess") { bigSess = b.dataset.s; bigMap(); }
    else if (b.dataset.act === "goto") {
      const code = b.dataset.code, r = ROLES.find((x) => x.code === code); if (!r) return;
      filter = "全部"; query = code; $("search").value = code; mapOpen = String(r.id); mapSess[mapOpen] = bigSess;
      renderStatic(); renderDynamic();
      const el = document.getElementById("row-" + code); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  renderStatic(); bigMap(); refresh();
  setInterval(tick, 1000);
  setInterval(() => { const a = document.activeElement; if (!(a && a.closest && a.closest("#rows") && (a.tagName === "INPUT" || a.tagName === "SELECT"))) refresh(); }, 30000);
})();
