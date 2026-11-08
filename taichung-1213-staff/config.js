// Apps Script「網頁應用程式網址」（/exec 結尾）。
// 留空時網站會用「示範模式」：資料只存在自己的瀏覽器，方便測試畫面。
window.API_URL = "https://script.google.com/macros/s/AKfycbxqwDneFvCJpHPVS3rGxwkf269p5ssf0zaZVb-sYeBHt2OErVGANjj_ePr1gdVHNrStUw/exec";

// 手冊 PDF 的連結。本機預覽指向 03_賽前須知 裡的正本；
// 上線前把兩個 PDF 複製進 staff-site 根目錄，改成檔名（例 "工作人員任務手冊.pdf"）。留空就不顯示按鈕。
window.DOCS = {
  staff: "../../03_賽前須知/工作人員/工作人員任務手冊.pdf",
  judge: "../../03_賽前須知/裁判/裁判手冊_202612.pdf",
};
