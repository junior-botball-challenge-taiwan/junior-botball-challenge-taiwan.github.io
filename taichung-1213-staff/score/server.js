// JBC 台中站 1213 即時計分：寫入權限與資料檢查（純函式）
// 示範模式（api.js）、本機區網備援（tools/lan_server.js）、Apps Script（apps-script/Score.gs，由 tools/build_gs.py 產生）共用同一份
// 崗位（station）：A01–A27 上午 JBC 裁判、P01–P26 下午 JBC 裁判、S:am:<台>／S:pm:<台> 相撲台、L 循線、SUB 機動（全場都能輸入）
(function (root) {
  "use strict";
  const R = root.JBC_RULES || (typeof require !== "undefined" ? require("./rules.js") : null);

  const KINDS = ["cfg", "draw", "basic", "mys", "task", "sumo", "weight", "final", "lineset", "line", "absent"];
  const ADMIN_ONLY = { cfg: 1, draw: 1, lineset: 1, absent: 1 };
  const BOUT = { R: 1, B: 1, TR: 1, TB: 1, T0: 1, XR: 1, XB: 1 };
  const FINAL_SLOTS = ["SF1", "SF2", "P3", "F"];

  const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
  const isNum = (x, lo, hi) => typeof x === "number" && isFinite(x) && x >= lo && x <= hi;
  const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  const isStr = (x, n) => typeof x === "string" && x.length <= n;
  const hhmm = (x) => typeof x === "string" && /^\d{1,2}:\d{2}$/.test(x);

  // 所有崗位（給裁判頁選單與權限檢查）
  function stations(D) {
    const out = [];
    ["am", "pm"].forEach((sess) => {
      (D.judges[sess] || []).forEach((j) => out.push({ id: j.id, sess, type: "jbc", label: j.label, teams: j.teams }));
      Object.keys(D.arenas[sess] || {}).map(Number).sort((a, b) => a - b).forEach((n) => {
        const gk = D.arenas[sess][n];
        out.push({ id: "S:" + sess + ":" + n, sess, type: "sumo", arena: n, gk, label: (sess === "am" ? "上午" : "下午") + " 相撲 " + n + " 號台（" + D.groups[gk].name + "）" });
      });
    });
    out.push({ id: "L", sess: "pm", type: "line", label: "下午 循線賽道（2 條共用，選隊伍輸入）" });
    out.push({ id: "SUB", sess: "", type: "sub", label: "機動裁判（全場都能輸入）" });
    return out;
  }
  function stationOf(D, id) { return stations(D).find((s) => s.id === id) || null; }

  // 回傳錯誤訊息；空字串表示 OK
  function validate(D, st, kind, parts, p) {
    if (p === null) return "";
    if (!isObj(p)) return "資料格式錯誤";
    if (JSON.stringify(p).length > 3000) return "資料太大";
    const team = (id) => !!R.teamById(D, id);
    const kindOf = (id) => (D.groups[R.gkOf(id)] || {}).kind;
    switch (kind) {
      case "cfg":
        if (p.mmax != null && !isNum(p.mmax, 1, 10000)) return "神秘題滿分要是 1–10000";
        if ((p.am != null && !hhmm(p.am)) || (p.pm != null && !hhmm(p.pm))) return "開始時間格式 HH:MM";
        if (p.gate != null && !isInt(p.gate, 0, 90)) return "開放神秘題的分鐘數 0–90";
        if (p.lineTries != null && !isInt(p.lineTries, 1, 5)) return "循線次數 1–5";
        if (p.round != null && ["ceil", "floor"].indexOf(p.round) < 0) return "比例取整方式錯誤";
        if (p.items != null && !(Array.isArray(p.items) && p.items.length <= 20 && p.items.every((x) => isObj(x) && isStr(x.t, 40) && isNum(x.p, -10000, 10000)))) return "神秘題子項格式錯誤";
        return "";
      case "basic":
        return parts.length === 3 && team(parts[1]) && kindOf(parts[1]) === "mys" && ["1", "2"].indexOf(parts[2]) >= 0 && typeof p.done === "boolean" && (p.at == null || isStr(p.at, 40)) ? "" : "基礎題資料錯誤";
      case "mys": {
        if (parts.length !== 3 || !team(parts[1]) || kindOf(parts[1]) !== "mys" || !/^[A-Z0-9]{1,8}\.\d{1,3}$/.test(parts[2])) return "神秘題資料錯誤";
        const mmax = Number(R.cfgOf(st).mmax) || 100;
        if (!isNum(p.s, 0, mmax)) return "神秘題分數要在 0–" + mmax + " 之間";
        if (p.c != null && !(Array.isArray(p.c) && p.c.length <= 20 && p.c.every((x) => isInt(x, 0, 19)))) return "神秘題子項錯誤";
        return (p.at == null || isStr(p.at, 40)) && (p.void == null || typeof p.void === "boolean") ? "" : "神秘題資料錯誤";
      }
      case "task": {
        if (parts.length !== 3 || !team(parts[1]) || kindOf(parts[1]) !== "task") return "啟蒙／探索資料錯誤";
        const n = D.groups[R.gkOf(parts[1])].tasks || 1;
        if (!isInt(Number(parts[2]), 1, n) || String(Number(parts[2])) !== parts[2]) return "題號錯誤";
        return Array.isArray(p.t) && p.t.length <= 2 && p.t.every((x) => x === "S" || x === "F") && !(p.t[0] === "S" && p.t.length > 1) ? "" : "每題最多 2 次，成功後不再挑戰";
      }
      case "draw": {
        const g = D.groups[parts[1]];
        if (parts.length !== 2 || !g || g.kind !== "sumo" || !isObj(p.lots)) return "抽籤資料錯誤";
        if (g.fixedDraw) return "這組對戰順序已固定（照隊伍編號），不用抽籤";
        const n = g.lots || D.teams[parts[1]].length, seen = {};
        for (const k of Object.keys(p.lots)) {
          const id = p.lots[k];
          if (!isInt(Number(k), 1, n) || String(Number(k)) !== k) return "籤號要是 1–" + n;
          if (id === "" || id == null) continue;
          if (typeof id !== "string" || R.gkOf(id) !== parts[1] || !team(id)) return "籤 " + k + "：" + id + " 不是本組的隊伍";
          if (seen[id]) return id + " 抽到兩支籤（籤 " + seen[id] + "、" + k + "）";
          seen[id] = k;
        }
        return "";
      }
      case "sumo": {
        if (parts.length !== 4) return "相撲場次錯誤";
        const m = (D.schedule[parts[1]] || []).find((x) => String(x[0]) === parts[2] && String(x[1]) === parts[3]);
        if (!m) return "沒有這一場相撲";
        if (!R.drawDone(D, st, parts[1])) return "還沒輸入完抽籤結果，不能開打";
        return Array.isArray(p.r) && p.r.length <= 3 && p.r.every((x) => BOUT[x]) ? "" : "相撲成績格式錯誤";
      }
      case "weight":
        return parts.length === 2 && team(parts[1]) && kindOf(parts[1]) === "sumo" && isNum(p.g, 0, 100000) ? "" : "重量格式錯誤";
      case "final":
        if (parts.length !== 3 || !D.schedule[parts[1]] || FINAL_SLOTS.indexOf(parts[2]) < 0) return "決賽場次錯誤";
        if (p.rounds != null && !(Array.isArray(p.rounds) && p.rounds.length <= 5 && p.rounds.every((x) => BOUT[x] && x !== "T0"))) return "決賽成績格式錯誤";
        if ((p.red != null && !team(p.red)) || (p.blue != null && !team(p.blue))) return "決賽隊伍錯誤";
        return p.arena == null || isInt(p.arena, 1, 99) ? "" : "決賽台號錯誤";
      case "lineset":
        return isInt(p.laps, 2, 5) && isNum(p.sec, 10, 30) ? "" : "圈數 2–5、每圈秒數 10–30";
      case "line": {
        const tries = R.cfgOf(st).lineTries;
        if (parts.length !== 3 || !team(parts[1]) || kindOf(parts[1]) !== "line" || !isInt(Number(parts[2]), 1, tries)) return "循線場次錯誤（每隊 " + tries + " 次）";
        return Array.isArray(p.t) && p.t.length <= 5 && p.t.every((x) => isNum(x, 0, 999)) && (p.done == null || typeof p.done === "boolean") ? "" : "循線秒數格式錯誤";
      }
      case "absent":
        return parts.length === 2 && team(parts[1]) && typeof p.on === "boolean" && (p.miss == null || (Array.isArray(p.miss) && p.miss.every((x) => isInt(x, 0, 2)))) ? "" : "缺賽資料錯誤";
    }
    return "未知的資料";
  }

  // 這個崗位能不能寫這筆
  function allowed(D, st, station, kind, parts, cur) {
    if (station.type === "sub") return true;
    if (kind === "basic" || kind === "mys" || kind === "task") {
      if (station.type !== "jbc" || station.teams.indexOf(parts[1]) < 0) return false;
      return kind !== "mys" || parts[2].split(".")[0] === station.id;          // 神秘題只能寫自己編號的那幾筆
    }
    if (kind === "sumo") return station.type === "sumo" && station.gk === parts[1] && String(station.arena) === parts[3];
    if (kind === "weight") return station.type === "sumo" && station.gk === R.gkOf(parts[1]);
    if (kind === "final") {
      const arena = (cur && cur.payload && cur.payload.arena) || D.groups[parts[1]].finalArena;
      return station.type === "sumo" && station.gk === parts[1] && station.arena === Number(arena);
    }
    if (kind === "line") return station.type === "line";
    return false;
  }

  /**
   * D：data.js；state：目前資料；req.items：[{key, payload}]（payload 為 null＝刪除，只有計分台可以）
   * who：{admin:true} 或 {station:"A05", nick:"小明"}
   * 回傳 { results:[{key, ok, message}], changes:[{key, row|null}], state:新資料 }
   */
  function apply(D, state, req, who, now) {
    const st = Object.assign({}, state);
    const results = [], changes = [];
    const items = Array.isArray(req.items) ? req.items.slice(0, 80) : [];
    const station = who.admin ? null : stationOf(D, who.station);
    items.forEach((it) => {
      const key = String((it && it.key) || "");
      const parts = key.split(":"), kind = parts[0];
      const fail = (m) => results.push({ key, ok: false, message: m });
      if (KINDS.indexOf(kind) < 0) return fail("未知的資料");
      if ((kind === "cfg" || kind === "lineset") && parts.length !== 1) return fail("未知的資料");
      let p = it.payload === undefined ? null : it.payload;
      const err = validate(D, st, kind, parts, p);
      if (err) return fail(err);
      const cur = st[key];
      if (!who.admin) {
        if (!station) return fail("請重新選擇崗位");
        if (ADMIN_ONLY[kind] || p === null) return fail("只有計分台可以修改");
        if (!allowed(D, st, station, kind, parts, cur)) return fail("這不是你負責的隊伍／場地");
        if (kind === "final") {
          if (cur && cur.payload && cur.payload.adminRounds) return fail("計分台已修改這場，請找計分台");
          p = Object.assign({}, cur ? cur.payload : {}, { rounds: p.rounds || [] });   // 裁判只送局數，對戰隊伍與台號沿用
        } else if (cur && cur.src === "admin") return fail("計分台已修改這筆，請找計分台");
      }
      const by = who.admin ? "計分台" : (who.nick ? who.nick + "（" + station.id + "）" : station.id);
      const row = p === null ? null : { kind, payload: p, by, src: who.admin ? "admin" : "judge", time: now };
      if (row) st[key] = row; else delete st[key];
      changes.push({ key, row });
      results.push({ key, ok: true });
    });
    return { results, changes, state: st };
  }

  const API = { KINDS, stations, stationOf, validate, allowed, apply };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.JBC_SERVER = API;
})(typeof window !== "undefined" ? window : globalThis);
