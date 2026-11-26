// JBC 台中站工作人員專區（照 GRG 2026 staff-site 改）：崗位資料在 roles.js（由 build_staff.py 產生），後台在 apps-script/Code.gs
(function () {
  const $ = (id) => document.getElementById(id);
  const ROLES = window.ROLES, EV = window.EVENT;
  // 11/20 第 5 輪賽事主辦：「由主辦單位安排（機動人員）」改成「機動人員組」（可多人；沒崗位的人可以自己選，已排好崗位的人不能自己換；測驗考共同題）
  const ARRANGE = "A", ARRANGE_NAME = "機動人員組";
  const ARRANGE_JOB = ["比賽前有夥伴退出時，馬上頂上他的崗位", "當天現場收拾道具、協助場地復原"];
  const FIXED = window.FIXED || {};                         // 主辦指定且已有人：{ id: 暱稱 }（組長）
  const RESERVED = new Set((window.RESERVED || []).map(String)); // 主辦指定、還沒有人：不開放認領
  const FIXED_NAMES = new Set(Object.values(FIXED));
  // 11/8 賽事主辦：好友同組保留的連續裁判位置（只有那組好友能認領，那組好友也只在自己的保留位認領）
  const TEAMS = window.TEAMS || [];
  const teamOfRole = (id) => TEAMS.findIndex((t) => t.ids.map(String).includes(String(id)));
  const teamOfNick = (n) => TEAMS.findIndex((t) => t.nicks.includes(n));
  const TEAM_NAMES = new Set([].concat(...TEAMS.map((t) => t.nicks)));
  // 11/19 下午賽事主辦：組長 G1、G2 限有賽事經驗者認領（資格在後台名單分頁檢查，網頁不放名單）
  const EXP_ONLY = new Set((window.EXP_ONLY || []).map(String));
  const EXP_MSG = "這個崗位限有機器人賽事、營隊或大型活動志工／工作人員經驗的人認領（依報名表單）；如果你有經驗但表單填「否」，請在工作人員 LINE 群組告訴大會";
  // 互動位置圖：{ id: { am: [[左%, 上%]…], pm: … } }
  const POS = window.POS || {};
  const SESS = [["am", "上午"], ["pm", "下午"]];
  let mapOpen = null, mapSess = {}, bigSess = "am";
  // 11/20 賽事主辦：改成「大會指派崗位」——登入（暱稱＋電話）看大會排好的崗位，按按鈕考自己崗位的測驗；不再開放自己認領／取消
  //   指派模式下 roles.js 的 FIXED（自己認領時代的主辦指定）不再蓋到名單上，以後台認領分頁為準
  const ASSIGN = true;
  const ASSIGN_MSG = "崗位由大會安排，要換工作請在工作人員 LINE 群組告訴大會";
  const TRAINING_URL = window.TRAINING_URL || "../taichung-1213-judge-training/";   // 同一個網域：登入資料用 sessionStorage 帶過去（電話不放網址）
  const LOGIN_KEY = "jbc1213-staff-login";
  const TRACK_LABEL = { "JBC 場地裁判": "JBC 場地裁判", "相撲": "相撲裁判", "循線": "循線裁判", "共同": "共同須知" };
  // 崗位 → 測驗類別（要和 Code.gs 的 trackOfRole_ 一致）：J、JM＝JBC 場地裁判；S＝相撲；L＝循線；其他＝共同
  const trackOf = (code) => /^J/.test(code) ? "JBC 場地裁判" : /^S/.test(code) ? "相撲" : /^L/.test(code) ? "循線" : "共同";
  // 11/20 晚賽事主辦：L1、L2（上午 JBC 機動、下午循線）循線＋JBC 場地裁判兩種都要考（要和 Code.gs 的 tracksOfRole_ 一致）
  const tracksOf = (code) => (/^L/.test(code) ? [trackOf(code), "JBC 場地裁判"] : [trackOf(code)]);
  let me = null;   // 登入後：{ nickname, roleId, code, roleName, track, tracks, assigned, quiz, quizzes, allPass }
  const withFixed = (c) => (ASSIGN ? { ...(c || {}) } : { ...(c || {}), ...FIXED });
  const GROUP_COLOR = window.GROUP_COLOR || {};
  const byId = {}; ROLES.forEach((r) => (byId[String(r.id)] = r));
  // 11/20 第 3 輪（賽事主辦）：好友組一組一色（資料在 roles.js 的 FRIEND_GROUPS，由 build_staff.py 從 friend_groups.py 產生）；一定配「好友組 F05」字樣，色弱也看得懂
  const FRIEND_OF = {}; (window.FRIEND_GROUPS || []).forEach((g) => g.nicks.forEach((n) => (FRIEND_OF[n] = g)));
  const friendTag = (n) => { const g = n && FRIEND_OF[n]; return g ? '<span class="fg" style="--fg:' + g.color + '"><i aria-hidden="true"></i>好友組 ' + g.label.replace(/[&<>"]/g, "") + "</span>" : ""; };
  // 11/20 第 3 輪（賽事主辦）：還沒有崗位的人登入後可以自己認領空缺（不含主辦指定 RESERVED；已排好的人不能自己換）
  const FULL_MSG = "目前崗位都排滿了，先做共同測驗；有空缺會開放";
  let claimMsg = null;   // 我的崗位卡上的認領結果訊息
  const roleName = (id) => { if (String(id) === ARRANGE) return ARRANGE_NAME; const r = byId[String(id)]; return r ? r.code + " " + r.title : ""; };
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const strip = (t) => String(t).replace(/<[^>]+>/g, "");

  let state = { open: false, openAt: EV.openAt, offset: 0, nicknames: [], claims: {}, arrange: [], loaded: false };
  const selfOn = () => ASSIGN && state.selfClaim !== false;   // 後台 GET 回 selfClaim:false 就關掉（回到全部由大會安排）
  const isVacant = (id) => state.loaded && !!byId[String(id)] && !state.claims[String(id)] && !RESERVED.has(String(id));
  const vacantRoles = () => ROLES.filter((r) => isVacant(r.id));
  const canSelfClaim = () => selfOn() && state.loaded && !!me && !me.assigned && !(state.arrange || []).includes(me.nickname);
  let filter = "全部", query = "";
  const ui = {}; // 每一列的輸入狀態：{ nick, phone, cancel, msg, ok }，重新整理時保留

  // ---------- 後台：正式（Apps Script）或示範模式 ----------
  const demo = !window.API_URL;
  const DEMO_STAFF = { "示範-小明": "0912345678", "示範-小華": "0922333444", "示範-阿美": "0933111222", "示範-阿強": "0944555666" };
  const DEMO_ARRANGE = ["示範-阿強"];   // 示範模式的機動人員組（阿美還沒排，可以自己選空缺或機動人員組）
  const DEMO_EXP = new Set(["示範-小明"]);   // 示範模式：只有小明有賽事經驗（可認領 G1、G2）
  const DEMO_ASSIGN = { "49": "示範-小明", "2": "示範-小華" };   // 示範模式的大會指派：小明 L2（上午 JBC 機動、下午循線）、小華 J01、阿美還沒排
  const DEMO_QUIZ = { "示範-小明": { score: 92, pass: true, track: "循線", byTrack: { "循線": { score: 92, pass: true } } } };   // 示範：小明循線已及格、JBC 還沒考
  const demoOpen = () => new URLSearchParams(location.search).has("open");
  // 示範模式的崗位：小明 L2、小華 J01；好友組的暱稱照順序排進其他崗位（看得到顏色），剩下的是空缺（阿美可以認領）；?full=1＝全部排滿
  let DEMO_CLAIMS = null;
  function demoClaims() {
    if (DEMO_CLAIMS) return DEMO_CLAIMS;
    const c = { ...DEMO_ASSIGN }, nicks = [].concat(...(window.FRIEND_GROUPS || []).map((g) => g.nicks));
    const free = ROLES.map((r) => String(r.id)).filter((id) => !RESERVED.has(id) && !c[id]);
    nicks.forEach((n, i) => { if (free[i]) c[free[i]] = n; });
    if (new URLSearchParams(location.search).has("full")) free.slice(nicks.length).forEach((id, i) => (c[id] = "示範-已排" + (i + 1)));
    return (DEMO_CLAIMS = c);
  }
  function demoLoad() { try { return JSON.parse(localStorage.getItem("jbcTcDemo") || "null") || { claims: {}, arrange: [] }; } catch (e) { return { claims: {}, arrange: [] }; } }
  function demoSave(d) { try { localStorage.setItem("jbcTcDemo", JSON.stringify(d)); } catch (e) {} }
  const norm = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("886")) d = "0" + d.slice(3); return d; };

  async function apiStatus() {
    if (demo && ASSIGN) return { open: true, openAt: EV.openAt, now: new Date().toISOString(), nicknames: Object.keys(DEMO_STAFF), claims: { ...demoClaims() }, arrange: DEMO_ARRANGE.slice(), quiz: { ...DEMO_QUIZ }, selfClaim: true };
    if (demo) return { open: demoOpen() || Date.now() >= new Date(EV.openAt).getTime(), openAt: EV.openAt, now: new Date().toISOString(), nicknames: Object.keys(DEMO_STAFF), ...demoLoad() };
    const res = await fetch(window.API_URL, { cache: "no-store" });
    return res.json();
  }
  // 11/20：登入看我的崗位（後台 action 'me'：暱稱＋電話驗證，錯 5 次鎖 15 分）
  async function apiMe(nickname, phone) {
    if (demo) {
      if (!DEMO_STAFF[nickname]) return { ok: false, message: "找不到這個暱稱" };
      if (norm(DEMO_STAFF[nickname]).slice(-9) !== norm(phone).slice(-9)) return { ok: false, message: "電話號碼不符" };
      const dc = demoClaims(), id = Object.keys(dc).find((k) => dc[k] === nickname), r = id && byId[id];
      const tracks = r ? tracksOf(r.code) : ["共同"], bt = (DEMO_QUIZ[nickname] || {}).byTrack || {}, quizzes = {};
      tracks.forEach((t) => (quizzes[t] = bt[t] || null));
      const mobile = !r && DEMO_ARRANGE.includes(nickname);
      return { ok: true, nickname, roleId: r ? r.id : null, code: r ? r.code : mobile ? ARRANGE : "", roleName: r ? r.code + " " + r.title : mobile ? ARRANGE_NAME : "大會安排中", track: tracks[0], tracks, assigned: !!r, mobile,
        quiz: quizzes[tracks[0]], quizzes, allPass: tracks.every((t) => quizzes[t] && quizzes[t].pass) };
    }
    const res = await fetch(window.API_URL, { method: "POST", body: JSON.stringify({ action: "me", nickname, phone }) });
    return res.json();
  }
  // 11/20 第 3 輪：沒崗位的人認領空缺（後台 action 'claim'；電話用登入時的，存在 sessionStorage）
  async function apiClaim(roleId) {
    const v = loadLogin() || {}, req = { action: "claim", nickname: me ? me.nickname : "", phone: v.phone || "", roleId };
    if (demo) {
      const c = demoClaims(), id = String(roleId);
      if (Object.keys(c).some((k) => c[k] === req.nickname) || DEMO_ARRANGE.includes(req.nickname)) return { ok: false, message: ASSIGN_MSG };
      if (id === ARRANGE) { DEMO_ARRANGE.push(req.nickname); return { ok: true, message: "已加入 " + ARRANGE_NAME + "，可以開始測驗了（考共同題）", claims: { ...c }, arrange: DEMO_ARRANGE.slice() }; }
      if (RESERVED.has(id)) return { ok: false, message: "這個崗位由主辦單位指定" };
      if (c[id]) return { ok: false, message: "這個崗位已經有人了，請選其他空缺" };
      if (EXP_ONLY.has(id) && !DEMO_EXP.has(req.nickname)) return { ok: false, message: EXP_MSG };
      c[id] = req.nickname;
      return { ok: true, message: "已認領 " + roleName(id) + "，可以開始測驗了", claims: { ...c } };
    }
    const res = await fetch(window.API_URL, { method: "POST", body: JSON.stringify(req) });
    return res.json();
  }
  async function apiPost(req) {
    if (ASSIGN) return { ok: false, message: ASSIGN_MSG };   // 11/20 賽事主辦：不再開放自己認領／取消
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
    $("ruleBtns").innerHTML = window.RULE_TABS.map((t) => '<a class="btn-rule" href="' + esc(t.url) + '" target="_blank" rel="noopener">' + esc(t.name) + "</a>").join("");   // 11/20 第 4 輪：每個按鈕直接開對應分頁
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
    (state.arrange || []).forEach((n) => (m[n] = ARRANGE_NAME));
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

  // 11/8 賽事主辦：裁判規則測驗在培訓網頁交卷，後台回傳每人最高分 state.quiz（byTrack＝每個類別各自的最高分）
  // 11/20 晚賽事主辦：要考兩種的崗位（L1、L2）兩種都及格才算 ✅
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
    if (ASSIGN) {
      if (takenBy) return '<div class="act"><span class="who">✔ ' + esc(takenBy) + "（大會安排）" + quizTag(takenBy, key) + "</span>" + friendTag(takenBy) + "</div>";
      if (RESERVED.has(key)) return '<div class="act"><span class="who">主辦單位指定</span></div>';
      if (!selfOn() || !state.loaded) return '<div class="act"><span class="who">大會安排中</span></div>';
      const exp = EXP_ONLY.has(key) ? "（限有賽事經驗者）" : "";
      if (canSelfClaim()) return '<div class="act"><span class="who vac">空缺・可認領' + exp + '</span><button type="button" class="small" data-act="selfclaim" data-key="' + key + '">我要認領這格（' + esc(me.nickname) + "）</button></div>";
      return '<div class="act"><span class="who vac">空缺・可認領' + exp + "：還沒有崗位的人，在上面「我的崗位與測驗」登入後就能認領</span></div>";
    }
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
    if (ASSIGN) {   // 11/20 第 5 輪：機動人員組卡＝工作內容＋人數＋名單；沒崗位的人登入後可以加入
      const join = canSelfClaim() ? '<div class="act"><button type="button" class="small" data-act="selfclaim" data-key="' + ARRANGE + '">我要加入機動人員組（' + esc(me.nickname) + "）</button></div>"
        : selfOn() && state.loaded ? '<div class="act"><span class="who vac">還沒有崗位的人，在上面「我的崗位與測驗」登入後就能加入（可多人）</span></div>' : "";
      return '<div class="row arrange"><div class="row-head"><span class="num star">★</span><div class="row-title"><span class="title">' + ARRANGE_NAME +
        '</span><span class="short">可多人・測驗考共同題</span></div><span class="badge free">' + a.length + ' 人</span></div><ul class="arrange-job">' + ARRANGE_JOB.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" +
        '<p class="names">' + (a.length ? "名單：" + a.map((n) => esc(n) + friendTag(n)).join("、") : "目前還沒有人") + "</p>" + join + "</div>";
    }
    return '<div class="row arrange"><div class="row-head">' +
      '<span class="num star">★</span><div class="row-title"><span class="title">' + ARRANGE_NAME + '</span>' +
      '<span class="short">哪裡都可以！由主辦單位幫你安排崗位：派你去任何一個裁判位置，或當機動人員、當天由組長隨時派任務（可多人）</span></div>' +
      '<span class="badge free">' + a.length + " 人</span></div>" +
      (a.length ? '<p class="names">' + a.map(esc).join("、") + "</p>" : "") +
      actionHTML(ARRANGE, null) +
      (a.length && !u.cancel ? '<button type="button" class="link" data-act="askcancel" data-key="' + ARRANGE + '"' + (state.open ? "" : " disabled") + ">取消我的「由主辦單位安排」</button>" : "") +
      "</div>";
  }

  // ---------- 11/24 賽事主辦：依組別分頁籤（快速找到自己的位置；名單跟著後台認領／機動人員組） ----------
  const GTABS = [
    { key: "jbc", name: "JBC 場地裁判", has: (r) => /^J\d/.test(r.code) },
    { key: "jm", name: "JBC 機動裁判", has: (r) => /^JM/.test(r.code) },
    { key: "sumo", name: "相撲裁判", has: (r) => /^S\d/.test(r.code) },
    { key: "line", name: "循線裁判", has: (r) => /^L\d/.test(r.code) },
    { key: "lead", name: "組長與大會", has: (r) => !/^[JSL]/.test(r.code) },
    { key: "mob", name: ARRANGE_NAME, mobile: true },
  ];
  let gtab = "jbc", gtabMe = null, gHit = "";
  const tabOfNick = (n) => {
    if ((state.arrange || []).includes(n)) return "mob";
    const id = Object.keys(state.claims || {}).find((k) => state.claims[k] === n), r = id && byId[id];
    const t = r && GTABS.find((x) => !x.mobile && x.has(r));
    return t ? t.key : null;
  };
  function renderTabs() {
    const bar = $("gtabs"), panel = $("gpanel"); if (!bar || !panel) return;
    if (me && gtabMe !== me.nickname) { gtabMe = me.nickname; gtab = tabOfNick(me.nickname) || gtab; }   // 登入後自動切到自己的組別
    const claims = state.claims || {}, arrange = state.arrange || [];
    const cnt = (t) => (t.mobile ? arrange.length : ROLES.filter(t.has).length);
    bar.innerHTML = GTABS.map((t) => '<button type="button" role="tab" class="gtab' + (t.key === gtab ? " on" : "") + '" aria-selected="' + (t.key === gtab) + '" data-tab="' + t.key + '">' +
      esc(t.name) + '<span class="gc">' + cnt(t) + (t.mobile ? " 人" : " 格") + "</span></button>").join("");
    const myNick = me ? me.nickname : "";
    const mark = (n) => (n && n === myNick ? '<span class="you">你</span>' : "");
    const tab = GTABS.find((t) => t.key === gtab) || GTABS[0];
    if (tab.mobile) {
      panel.innerHTML = '<p class="gnote">' + esc(ARRANGE_JOB.join("；")) + "。測驗考共同題。</p>" +
        (arrange.length ? '<ul class="glist">' + arrange.map((n) => '<li class="gi' + (n === myNick || n === gHit ? " hit" : "") + '" data-nick="' + esc(n) + '"><span class="num star">★</span><span class="gn">' + esc(n) + mark(n) + friendTag(n) + "</span></li>").join("") + "</ul>"
          : '<p class="load">目前還沒有人</p>');
      return;
    }
    let lastZone = "";
    const items = ROLES.filter(tab.has).map((r) => {
      const id = String(r.id), n = claims[id] || "";
      const zone = tab.key === "jbc" ? ((r.am[0] || "").match(/第 ?\d+ ?區/) || [""])[0] : "";
      const head = zone && zone !== lastZone ? '<li class="gzone">' + esc(zone.replace(/\s/g, "")) + "</li>" : "";
      if (zone) lastZone = zone;
      const who = n ? esc(n) + mark(n) + friendTag(n) : RESERVED.has(id) ? '<span class="gv">主辦單位指定</span>' : '<span class="gv">空缺</span>';
      return head + '<li class="gi' + (n && (n === myNick || n === gHit) ? " hit" : "") + '" data-nick="' + esc(n) + '">' +
        '<span class="num" style="background:' + (GROUP_COLOR[r.group] || "#555") + '">' + esc(r.code) + "</span>" +
        '<span class="gn">' + who + '</span><span class="gs">' + esc(r.short) + "</span>" +
        '<button type="button" class="link" data-goto="' + esc(r.code) + '">看工作內容與位置</button></li>';
    });
    panel.innerHTML = '<ul class="glist">' + items.join("") + "</ul>";
  }
  function findInTabs(v) {
    const msg = $("tabFindMsg"); v = String(v || "").trim(); gHit = "";
    if (!v) { msg.textContent = ""; renderTabs(); return; }
    const pool = Object.values(state.claims || {}).concat(state.arrange || []);
    const exact = pool.filter((n) => n === v), hits = exact.length ? exact : pool.filter((n) => n.includes(v));
    if (hits.length === 1) {
      gHit = hits[0]; gtab = tabOfNick(gHit) || gtab; renderTabs();
      msg.className = "row-msg ok"; msg.textContent = gHit + " 在「" + (GTABS.find((t) => t.key === gtab) || {}).name + "」";
      const el = [...$("gpanel").querySelectorAll(".gi.hit")].find((x) => x.dataset.nick === gHit); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      renderTabs(); msg.className = "row-msg err";
      msg.textContent = hits.length ? "找到 " + hits.length + " 位：" + hits.slice(0, 5).join("、") + (hits.length > 5 ? "…" : "") + "，請打完整暱稱" : "找不到「" + v + "」，請確認暱稱（例：勤益-佳棋）";
    }
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
  // 11/8 賽事主辦：整張場地圖放大、每個位置直接顯示誰（已排定／已認領的暱稱），字也放大
  function bigMap() {
    const cl = state.claims || {};
    const tags = ROLES.map((r) => {
      const p = (POS[String(r.id)] || {})[bigSess]; if (!p || !/^(J\d|S\d|L\d)/.test(r.code)) return "";
      const who = cl[String(r.id)] || "", fixed = !!FIXED[String(r.id)] && !ASSIGN, fg = who && FRIEND_OF[who];
      const empty = ASSIGN ? (RESERVED.has(String(r.id)) ? "主辦指定" : selfOn() && state.loaded ? "空缺" : "安排中") : "可認領";
      return '<span class="tag-pin' + (who ? (fixed ? " fixed" : " taken") : "") + (fg ? " fr" : "") + '" style="left:' + p[0][0] + "%;top:" + p[0][1] + "%" + (fg ? ";--fg:" + fg.color : "") + '" data-act="goto" data-code="' + esc(r.code) + '">' +
        "<b>" + esc(r.code) + "</b>" + (who ? "<i>" + esc(who) + "</i>" : "<i>" + empty + "</i>") + (fg ? "<em>" + esc(fg.label) + "</em>" : "") + "</span>";
    }).join("");
    const fgs = window.FRIEND_GROUPS || [];
    $("bigmap").innerHTML = tabsHTML("bsess", "", bigSess) +
      '<div class="bigscroll"><div class="mapwrap big"><img src="map/' + bigSess + '.jpg" alt="場地圖">' + tags + "</div></div>" +
      '<p class="row-hint">手機可以左右滑動看整張圖。點位置（J＝JBC 場地裁判、S＝相撲台、L＝循線賽道）就會跳到那個崗位；名字是已排定的人，下面有色條和組號（例如 F05）的是好友組。</p>' +
      (fgs.length ? '<p class="fg-legend">好友組顏色：' + fgs.map((g) => friendTag(g.nicks[0])).join("") + "</p>" : "");
  }

  // 11/8 賽事主辦：認領了崗位的人點練習計分，直接帶到這個崗位（練習模式，資料只在自己手機）
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
    const badge = ASSIGN ? (who ? ["taken", "已安排"] : RESERVED.has(key) ? ["taken", "主辦指定"] : selfOn() && state.loaded ? ["free", "空缺・可認領"] : ["free", "安排中"]) : FIXED[key] && ftag.indexOf("好友") === 0 ? ["team", "好友・已排好"] : FIXED[key] || RESERVED.has(key) ? ["taken", "主辦指定"] : who ? ["taken", "已認領"] : t >= 0 ? ["team", "好友保留"] : EXP_ONLY.has(key) ? ["team", "限有賽事經驗者"] : ["free", "可認領"];
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
    $("countText").textContent = ASSIGN ? "大會已安排 " + taken + " / " + open + " 個崗位" + (selfOn() && state.loaded ? "・空缺 " + vacantRoles().length + " 個" : "") + "・機動人員組 " + arrange.length + " 人"
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
    renderTabs();
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
      state = { ...state, ...st, claims: withFixed(st.claims), arrange: st.arrange || [], offset: new Date(st.now).getTime() - Date.now(), loaded: true };
      renderDynamic(); tick();
      if (me && !me.assigned) renderMe();   // 沒崗位的人：空缺清單跟著更新
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
    renderTabs();
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
      : me.mobile ? '<div class="row-head"><span class="num star">★</span><div class="row-title"><span class="title">' + ARRANGE_NAME + '</span><span class="short">' + ARRANGE_JOB.map(esc).join("；") + "（測驗考共同題）</span></div></div>"
      : '<div class="row-head"><span class="num star">…</span><div class="row-title"><span class="title">大會安排中</span><span class="short">你可以自己認領空缺崗位，或加入機動人員組；可以先考共同須知題</span></div></div>';
    const flash = claimMsg ? '<p class="row-msg ' + (claimMsg.ok ? "ok" : "err") + '">' + esc(claimMsg.text) + "</p>" : "";
    // 11/26 賽事主辦：裁判看今年題目（題目在後台，不在網站上；要和 Code.gs 的 TASKS_ROLE_RE 一致）
    const tasksBtn = me.mobile || /^(R|J|S|L|Y)/.test(me.code || "") ? '<div class="quizbox"><a class="bigbtn" href="tasks.html">看今年題目（裁判訓練圖文版）→</a><p class="row-hint">只給裁判看，畫面有你的暱稱浮水印，請勿截圖、拍照、轉傳。</p></div>' : "";
    box.innerHTML = '<p class="hello">👋 ' + esc(me.nickname) + (r ? "，這是大會幫你排好的崗位" : me.mobile ? "，你在機動人員組" : "，你還沒有崗位") + "</p>" + friendTag(me.nickname) + flash + head + claimBoxHTML() + tasksBtn +
      '<div class="quizbox">' + (tracks.length > 1 ? '<p class="qline"><b>你的崗位要考 ' + tracks.length + " 種測驗，兩種都要及格</b>（" + tracks.map((t) => esc(TRACK_LABEL[t] || t)).join("＋") + "，各自交卷）</p>" : "") +
      tracks.map(quizOne).join("") +
      '<p class="row-hint">測驗已在 11/20 歸零，之前考過的也請照新崗位再考一次；80 分及格、可以重考，以最高分為準。交卷時再輸入一次手機號碼確認本人。</p></div>' +
      (r ? '<div class="two"><div class="box"><h4>上午</h4>' + list(r.am) + '</div><div class="box"><h4>下午</h4>' + list(r.pm) + "</div></div>" +
        (POS[String(r.id)] ? rowMap(String(r.id)) : "") + scoreLinks(String(r.id)) : "") +
      ruleTabsHTML() +
      '<p class="rule">要換工作？請在工作人員 LINE 群組告訴大會，由大會幫你調整（網站不能自己換）。</p>' +
      '<p><button type="button" class="ghost small" data-act="logout">登出（換別人登入）</button></p>';
  }
  // 11/20 第 4 輪賽事主辦：崗位卡也放「全部組別題目與規則」12 個連結（資料＝roles.js 的 RULE_TABS，build_staff.py 產生）；預設收起
  let rulesOpen = false;
  function ruleTabsHTML() {
    const tabs = window.RULE_TABS || []; if (!tabs.length) return "";
    return '<details class="ruletabs"' + (rulesOpen ? " open" : "") + '><summary>全部組別題目與規則（' + tabs.length + ' 個，台灣賽題庫 Google 文件）</summary>' +
      '<p class="row-hint">每個連結開新分頁、直接到那個組別的分頁；沒登入 Google 也打得開。</p><div class="ruletab-list">' +
      tabs.map((t) => '<a href="' + esc(t.url) + '" target="_blank" rel="noopener">' + esc(t.name) + "</a>").join("") + "</div></details>";
  }
  // 11/20 第 3 輪：沒崗位的人在卡片上看到空缺清單＋「認領這格」；沒有空缺就看到 FULL_MSG
  function claimBoxHTML() {
    if (!me || me.assigned || !selfOn()) return "";
    if ((state.arrange || []).includes(me.nickname)) return "";   // 主辦安排分頁上的人由大會派
    if (!state.loaded) return '<div class="claimbox"><p class="qline">崗位讀取中…</p></div>';
    const v = vacantRoles();
    const mob = '<li><span class="num star">★</span><span class="vt">' + ARRANGE_NAME + "（可多人；" + esc(ARRANGE_JOB.join("、")) + '；考共同題）</span><button type="button" class="small" data-act="selfclaim" data-key="' + ARRANGE + '">加入機動人員組</button></li>';
    if (!v.length) return '<div class="claimbox"><p class="qline"><b>' + FULL_MSG + '</b></p><p class="qline">也可以先加入機動人員組：</p><ul class="vac-list">' + mob + "</ul></div>";
    return '<div class="claimbox"><p class="qline"><b>可以自己認領空缺崗位，或加入機動人員組</b>（崗位一崗一人、先送先得；選了就是你的工作，要換要在工作人員 LINE 群組告訴大會）</p><ul class="vac-list">' +
      v.map((x) => '<li><span class="num" style="background:' + (GROUP_COLOR[x.group] || "#555") + '">' + esc(x.code) + '</span><span class="vt">' + esc(x.title) +
        (EXP_ONLY.has(String(x.id)) ? "（限有賽事經驗者）" : "") + '</span><button type="button" class="small" data-act="selfclaim" data-key="' + x.id + '">認領這格</button></li>').join("") + mob + "</ul></div>";
  }
  async function selfClaim(id) {
    const isMob = String(id) === ARRANGE, x = isMob ? { code: "★", title: ARRANGE_NAME } : byId[String(id)]; if (!x || !canSelfClaim()) return;
    if (!confirm((isMob ? "確定要加入「" + ARRANGE_NAME + "」嗎？" : "確定要認領「" + x.code + " " + x.title + "」嗎？") + "\n選了就是你的工作，網站不能自己換；要換請在工作人員 LINE 群組告訴大會。")) return;
    claimMsg = { text: "送出中…", ok: true }; renderMe();
    try {
      const res = await apiClaim(String(id));
      if (res.claims) state.claims = withFixed(res.claims);
      if (res.arrange) state.arrange = res.arrange;
      claimMsg = { text: res.message || (res.ok ? "已認領" : "認領失敗"), ok: !!res.ok };
      const v = loadLogin();
      if (res.ok && v) await doLogin(v.nick, v.phone, true);   // 重新登入：拿到新崗位與要考的測驗類別
      else refresh();
    } catch (e) { claimMsg = { text: "送出失敗，請檢查網路後再試一次", ok: false }; }
    renderMe(); renderDynamic();
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
      if (state.loaded) renderDynamic();   // 全部崗位清單：沒崗位的人看得到「我要認領這格」
    } catch (e) { msg.textContent = "登入失敗，請檢查網路後再試一次"; msg.className = "row-msg err"; }
  }
  if ($("mine")) {
    $("loginBtn").onclick = () => doLogin($("loginNick").value, $("loginPhone").value.trim());
    $("loginPhone").addEventListener("keydown", (e) => { if (e.key === "Enter") $("loginBtn").click(); });
    $("mine").addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches("details.ruletabs")) rulesOpen = e.target.open; }, true);   // 重畫崗位卡時保留展開狀態
    $("mine").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "logout") { me = null; claimMsg = null; saveLogin(null); $("loginPhone").value = ""; renderMe(); if (state.loaded) renderDynamic(); }
      else if (b.dataset.act === "selfclaim") selfClaim(b.dataset.key);
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
    if (act === "selfclaim") { selfClaim(key); const m = $("mine"); if (m) m.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (act === "claim") send("claim", key);
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

  $("gtabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    gtab = b.dataset.tab; renderTabs();
  });
  $("gpanel").addEventListener("click", (e) => {
    const b = e.target.closest("[data-goto]"); if (!b) return;
    const code = b.dataset.goto, r = ROLES.find((x) => x.code === code); if (!r) return;
    filter = "全部"; query = code; $("search").value = code;
    renderStatic(); renderDynamic();
    const el = document.getElementById("row-" + code); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("tabFind").addEventListener("input", (e) => findInTabs(e.target.value));

  renderStatic(); bigMap(); refresh();
  setInterval(tick, 1000);
  setInterval(() => { const a = document.activeElement; if (!(a && a.closest && a.closest("#rows") && (a.tagName === "INPUT" || a.tagName === "SELECT"))) refresh(); }, 30000);
})();
