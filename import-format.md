# Excel 匯入格式

Excel 可以使用欄位名稱列，也可以省略欄位名稱列。

## 建議欄位名稱

- `CardNumber` -> `card_number`
- `Rarity` -> `rarity`
- `Cost` -> `cost`
- `CardName` -> `card_name`
- `Type` -> `type`
- `System` -> `system`
- `Infix` -> `infix`（可留空）
- `Suffix` -> `suffix`
- `Effect` -> `effect`
- `Color` -> `color`
- `ImageUrl` -> `image_url`
- `set_category` -> `sets.set_category`（例如：本家、合作、詩姬）
- `set_section` -> `sets.set_section`（例如：預組、補充）

## 沒有欄位名稱時的欄位順序

1. `CardNumber`
2. `Rarity`
3. `Cost`
4. `CardName`
5. `Type`
6. `System`
7. `Infix`
8. `Suffix`
9. `Effect`
10. `Color`
11. `ImageUrl`
12. `set_category`
13. `set_section`
14. `SetName`（可留空）

`Infix` 空白時會以空字串匯入，不顯示卡片標籤，也不會出現在中綴篩選選項中。

分類欄位會寫入 `sets` 資料表。相同 `Code`，或唯一且相同的 `SetName`，會保留原本的 `sort_order`；新卡包依 Excel 工作表順序新增到最後。

## 彈數推斷

匯入腳本會從卡號推斷 `set_code`：

- `26RBS01-X01` -> `26RBS01`
- `26RCB01-X01` -> `26RCB01`

如果卡號無法推斷彈數，腳本會使用工作表名稱當作 `set_code`。

## JSON 範例

```json
[
  {
    "set_code": "26RBS01",
    "card_number": "26RBS01-X01",
    "rarity": "X",
    "cost": 5,
    "card_name": "Card Name",
    "type": "Spirit",
    "system": "System",
    "infix": "Infix",
    "suffix": "Suffix",
    "effect": "Card effect text",
    "color": "Red",
    "image_url": "https://example.com/card.png"
  }
]
```
