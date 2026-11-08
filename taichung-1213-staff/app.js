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
  // 互動位置圖：{ id: { am: [[左%, 上%]…], pm: … } }
  const POS = window.POS || {};
  const SESS = [["am", "上午"], ["pm", "下午"]];
  let mapOpen = null, mapSess = {}, bigSess = "am";
  const withFixed = (c) => ({ ...(c || {}), ...FIXED });
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
  const demoOpen = () => new URLSearchParams(location.search).has("open");
  function demoLoad() { try { return JSON.parse(localStorage.getItem("jbcTcDemo") || "null") || { claims: {}, arrange: [] }; } catch (e) { return { claims: {}, arrange: [] }; } }
  function demoSave(d) { try { localStorage.setItem("jbcTcDemo", JSON.stringify(d)); } catch (e) {} }
  const norm = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("886")) d = "0" + d.slice(3); return d; };

  async function apiStatus() {
    if (demo) return { open: demoOpen() || Date.now() >= new Date(EV.openAt).getTime(), openAt: EV.openAt, now: new Date().toISOString(), nicknames: Object.keys(DEMO_STAFF), ...demoLoad() };
    const res = await fetch(window.API_URL, { cache: "no-store" });
    return res.json();
  }
  async function apiPost(req) {
    if (demo) {
      if (!state.open) return { ok: false, message: "尚未開放填寫（" + EV.openText + " 開放）" };
      const d = demoLoad(), c = d.claims, a = d.arrange;
      if (norm(DEMO_STAFF[req.nickname]) !== norm(req.phone)) return { ok: false, message: "電話號碼不符", ...d };
      if (FIXED[String(req.roleId)] || RESERVED.has(String(req.roleId))) return { ok: false, message: "這個崗位由主辦單位指定", ...d };
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

  // 11/8 理事長：裁判規則測驗在培訓網頁交卷，後台回傳每人最高分 state.quiz
  function quizTag(n) {
    const q = (state.quiz || {})[n];
    return q ? (q.pass ? "・測驗 ✅" : "・測驗 " + q.score + " 分（未及格）") : "・測驗未交";
  }

  function actionHTML(key, takenBy) {
    if (FIXED[key]) return '<div class="act"><span class="who">✔ ' + esc(FIXED[key]) + '（主辦指定）</span></div>';
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
  function bigMap() {
    const pins = [], labels = [];
    ROLES.forEach((r) => { const p = (POS[String(r.id)] || {})[bigSess]; if (p && /^(J\d|S\d|L\d)/.test(r.code)) { pins.push(p[0]); labels.push(r.code); } });
    $("bigmap").innerHTML = tabsHTML("bsess", "", bigSess) + mapHTML(bigSess, pins, labels) +
      '<p class="row-hint">點代號（J＝JBC 場地裁判、S＝相撲台、L＝循線賽道）就會跳到那個崗位。</p>';
  }

  function roleRow(r) {
    const key = String(r.id), who = state.claims[key], t = teamOfRole(key);
    const badge = FIXED[key] || RESERVED.has(key) ? ["taken", "主辦指定"] : who ? ["taken", "已認領"] : t >= 0 ? ["team", "好友保留"] : ["free", "可認領"];
    const hasMap = !!POS[key];
    return '<div class="row' + (who ? " is-taken" : "") + '" id="row-' + esc(r.code) + '"><div class="row-head">' +
      '<span class="num" style="background:' + (GROUP_COLOR[r.group] || "#555") + '">' + esc(r.code) + "</span>" +
      '<div class="row-title"><span class="title">' + esc(r.title) + '</span><span class="short">' + esc(r.short) + "</span></div>" +
      '<span class="badge ' + badge[0] + '">' + badge[1] + "</span></div>" +
      (t >= 0 ? '<p class="team-tag">🤝 好友同組保留位（' + TEAMS[t].codes.join("、") + "）：只有 " + TEAMS[t].nicks.map(esc).join("、") + " 能在這幾格認領</p>" : "") +
      actionHTML(key, who) +
      (hasMap ? '<button type="button" class="link" data-act="map" data-key="' + key + '">' + (mapOpen === key ? "▲ 收起位置圖" : "📍 在場地圖上看位置（上午／下午）") + "</button>" : "") +
      (hasMap && mapOpen === key ? rowMap(key) : "") +
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
    $("countText").textContent = "已認領 " + taken + " / " + open + "・主辦安排 " + arrange.length + " 人" + (state.nicknames.length ? "・已填 " + (taken + arrange.length) + " / " + state.nicknames.length + " 人" : "");
    $("lockbox").hidden = state.open;

    const openDetails = new Set([...document.querySelectorAll("#rows details[open]")].map((d) => d.dataset.key));
    const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset : null;
    const activeKey = active && active.key, activeF = active && active.f;

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
