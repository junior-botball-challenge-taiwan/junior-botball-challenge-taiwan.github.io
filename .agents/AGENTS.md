# 專案特定行為準則 (Project Rules)

## Antigravity Native Memory (專案自動記憶)
- 本專案根目錄下會有一個 `project_memory.md` 檔案，作為此專案的長期記憶日誌。
- **當你完成一個重大任務或階段性工作時**，你必須主動使用寫檔工具 (`write_to_file` 或 `multi_replace_file_content`) 將「本次修改的核心摘要（約 50 字內）」追加 (Append) 到該檔案的最末端。
- **絕對禁止** 在對話框中輸出 Markdown 讓使用者手動複製貼上。身為 Agent，你必須自己動手寫檔。
- 每次開始新任務前，必須優先讀取 `project_memory.md` 以了解專案歷史脈絡。
