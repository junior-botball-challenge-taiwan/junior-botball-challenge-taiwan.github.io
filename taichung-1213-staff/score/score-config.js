// JBC 台中站 1213 計分系統：後台網址
// 計分後台另外部署成獨立專案時，把它的「網頁應用程式網址」（…/exec）填在下面 "" 裡，例："https://script.google.com/macros/s/xxxx/exec"
// 空白＝示範模式（資料只存在這台裝置）。
// 斷網改用本機區網備援時：網址加 ?api=http://<筆電IP>:8787/api 開一次就會記住（加 ?api=reset 恢復）；
// 直接開 http://<筆電IP>:8787/score/… 的頁面不用設定（tools/lan_server.js 會自動帶入）。
// 沒填就沿用工作人員系統 ../config.js 的 API_URL（Score.gs 跟 Code.gs 同一個專案時，網址一樣）。
// 11/8 理事長：計分系統先上線給工作人員練習 → 全部示範模式（資料只存在各自手機，裁判密碼 1213、計分台 demo）。
// 12/6 前正式部署 Score.gs 時，刪掉下面這行、改用再下一行（沿用 config.js 的 API_URL）。
window.SCORE_API_URL = "";
// window.SCORE_API_URL = window.SCORE_API_URL || "" || window.API_URL || "";
(function () {
  try {
    const qs = new URLSearchParams(location.search), v = qs.get("api");
    if (v === "reset") localStorage.removeItem("jbcScoreApi");
    else if (v) localStorage.setItem("jbcScoreApi", v);
    const saved = localStorage.getItem("jbcScoreApi");
    if (saved) window.SCORE_API_URL = saved;
  } catch (e) {}
})();
