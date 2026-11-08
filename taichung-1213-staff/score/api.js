// JBC 台中站 1213 即時計分：連線（Apps Script／本機區網備援／示範模式）＋裁判離線佇列
// 示範模式：score-config.js 沒有 SCORE_API_URL，或網址加 ?demo=1 → 資料只存在這台瀏覽器
//   示範密碼：計分台 demo、裁判 1213
window.JBC_API = (function () {
  "use strict";
  const S = window.JBC_SERVER, D = window.JBC_DATA;
  const qs = new URLSearchParams(location.search);
  const demo = !window.SCORE_API_URL || qs.has("demo");
  const DEMO_PW = { admin: "demo", judge: "1213" };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- 示範模式 ----------
  const demoState = () => store.get("jbcScoreDemo", {});
  function who(req) {
    if (req.admin != null) return String(req.admin) === DEMO_PW.admin ? { admin: true } : { err: "計分台密碼錯誤（示範模式密碼：demo）" };
    if (req.judge != null) {
      if (String(req.judge) !== DEMO_PW.judge) return { err: "裁判密碼錯誤（示範模式密碼：1213）" };
      if (!S.stationOf(D, req.station)) return { err: "請選擇崗位" };
      return { station: req.station, nick: String(req.nick || "").trim().slice(0, 20) };
    }
    return { err: "請先登入" };
  }
  function demoCall(req) {
    const w = who(req);
    if (w.err) return { ok: false, message: w.err };
    if (req.action === "score.login") return { ok: true, admin: !!w.admin, station: w.station || "" };
    if (req.action === "score.reset") {
      if (!w.admin) return { ok: false, message: "只有計分台可以清除" };
      const keep = {}; const s = demoState(); if (s.cfg) keep.cfg = s.cfg;
      store.set("jbcScoreDemo", keep);
      return { ok: true, message: "已清除示範資料（保留設定）", ...snapshot(keep) };
    }
    if (req.action !== "score.put") return { ok: false, message: "未知的動作" };
    const out = S.apply(D, demoState(), req, w, new Date().toISOString());
    store.set("jbcScoreDemo", out.state);
    return { ok: true, results: out.results, ...snapshot(out.state) };
  }
  const snapshot = (state) => ({ now: new Date().toISOString(), state, demo: true });

  // ---------- 連線 ----------
  async function post(req) {
    if (demo) {
      if (store.get("jbcDemoOffline", false)) throw new Error("示範：模擬斷線");   // 測試離線佇列用
      return demoCall(req);
    }
    const res = await fetch(window.SCORE_API_URL, { method: "POST", body: JSON.stringify(req) });   // text/plain，不觸發 CORS 預檢
    return res.json();
  }
  async function load() {
    if (demo) return { ok: true, ...snapshot(demoState()) };
    const res = await fetch(window.SCORE_API_URL + (window.SCORE_API_URL.indexOf("?") >= 0 ? "&" : "?") + "score=1&t=" + Date.now(), { cache: "no-store" });
    return res.json();
  }

  // ---------- 裁判離線佇列：先存在手機，有網路就上傳 ----------
  // 佇列項目：{key, payload, at}；同一個 key 只留最新的
  const QK = "jbcScoreQueue", RK = "jbcScoreRejected";
  const queue = () => store.get(QK, []);
  const rejected = () => store.get(RK, []);
  function enqueue(items) {
    const q = queue().filter((x) => !items.some((i) => i.key === x.key));
    items.forEach((i) => q.push({ key: i.key, payload: i.payload, at: Date.now() }));
    store.set(QK, q);
  }
  let flushing = null;
  // auth：{judge, station, nick} 或 {admin}；回傳 {sent, failed, offline, data}
  function flush(auth) {
    if (flushing) return flushing;
    flushing = (async () => {
      const q = queue();
      if (!q.length) return { sent: 0, failed: 0 };
      try {
        const r = await post({ action: "score.put", ...auth, items: q.map((x) => ({ key: x.key, payload: x.payload })) });
        if (!r.ok) return { sent: 0, failed: 0, error: r.message };
        const res = r.results || [];
        const bad = res.filter((x) => !x.ok);
        const sentAt = {};
        q.forEach((x) => { sentAt[x.key] = x.at; });
        store.set(QK, queue().filter((x) => !(x.key in sentAt) || x.at !== sentAt[x.key]));   // 送出期間又改的留著下次送
        if (bad.length) store.set(RK, rejected().concat(bad.map((b) => ({ ...b, at: Date.now() }))).slice(-20));
        return { sent: res.length - bad.length, failed: bad.length, data: r };
      } catch (e) {
        return { sent: 0, failed: 0, offline: true };
      }
    })();
    return flushing.finally(() => { flushing = null; });
  }
  // 把還沒上傳的資料疊在伺服器資料上，裁判看得到自己剛輸入的
  function overlay(state, by) {
    const st = Object.assign({}, state);
    queue().forEach((x) => {
      if (x.payload === null) { delete st[x.key]; return; }
      const kind = x.key.split(":")[0];
      const base = kind === "final" && st[x.key] ? st[x.key].payload : {};
      st[x.key] = { kind, payload: Object.assign({}, base, x.payload), by: by || "我", src: "pending", time: new Date(x.at).toISOString(), pending: true };
    });
    return st;
  }

  return { demo, DEMO_PW, store, post, load, queue, enqueue, flush, overlay, rejected, clearRejected: () => store.set(RK, []) };
})();
