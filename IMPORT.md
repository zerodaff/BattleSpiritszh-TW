# 匯入 26RBS.xlsx 到 Supabase

這份專案提供 Excel 匯入腳本，可以把 `26RBS.xlsx` 內的卡片資料寫入 Supabase 的 `sets` 與 `cards` 資料表。

## 需要準備

- Supabase `Project URL`
- Supabase `service_role` key

注意：匯入腳本必須使用 `service_role` key，不要使用 anon key。`service_role` key 有完整資料庫權限，請不要放進前端或公開 repo。

## PowerShell 執行方式

先設定環境變數：

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

再執行匯入：

```powershell
python .\scripts\import_excel_to_supabase.py .\26RBS.xlsx
```

如果你的電腦沒有可用的 `python` 指令，請改用已安裝的 Python 3 完整路徑執行同一個腳本。

## 匯入行為

- 讀取每個工作表。
- 支援第一列有欄位名稱，或沒有欄位名稱的固定欄位順序。
- 需要至少有 `CardNumber` 與 `CardName`。
- 從卡號推斷 `set_code`，例如 `26RBS01-X01` 會得到 `26RBS01`。
- 先 upsert `sets`，再 upsert `cards`。
- 使用 `card_number` 去重複與更新既有資料。

## 欄位對應

- `CardNumber` -> `card_number`
- `Rarity` -> `rarity`
- `Cost` -> `cost`
- `CardName` -> `card_name`
- `Type` -> `type`
- `System` -> `system`
- `Suffix` -> `suffix`
- `Effect` -> `effect`
- `Color` -> `color`
- `ImageUrl` -> `image_url`
- `set_category` -> `sets.set_category`
- `set_section` -> `sets.set_section`

## 匯入前資料庫更新

第一次使用分類欄位前，請先在 Supabase SQL Editor 執行 `set-classification-migration.sql`。

匯入時不會重排既有卡包的 `sort_order`；只有新卡包會依 Excel 工作表順序排到最後。
