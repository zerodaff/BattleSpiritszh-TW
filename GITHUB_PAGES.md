# GitHub Pages 發布說明

## 要上傳到 GitHub 的公開網站檔案

- `index.html`
- `app.js`
- `styles.css`
- `favicon.svg`
- `.nojekyll`
- `README.md`
- `supabase.sql`
- `import-format.md`

## 不建議放進公開 repo 的檔案

- `26RBS.xlsx`
- `excel/`
- `scripts/`
- `IMPORT.md`
- `TRANSFER.md`
- `bs-card-view-full-20260714.zip`
- 任何含有 `service_role` key 的檔案

## GitHub Pages 設定

1. 建立 GitHub repository。
2. 上傳公開網站檔案到 repository 根目錄。
3. 到 GitHub repository 的 `Settings`。
4. 選 `Pages`。
5. `Build and deployment` 選 `Deploy from a branch`。
6. Branch 選 `main`，資料夾選 `/root`。
7. 儲存後等待 GitHub Pages 產生網址。

## Supabase 注意事項

- 前端只能使用 `anon public` key。
- 不要把 `service_role` key 放到 GitHub 或前端程式。
- 管理後台寫入資料需要登入帳號在 `profiles.role` 是 `admin`。
