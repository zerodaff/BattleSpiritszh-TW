# Excel 匯入格式

Excel 可以使用欄位名稱列，也可以省略欄位名稱列。

## 建議欄位名稱

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
- `set_category` -> `sets.set_category`（例如：本家、合作、詩姬）
- `set_section` -> `sets.set_section`（例如：預組、補充）

## 沒有欄位名稱時的欄位順序

1. `CardNumber`
2. `Rarity`
3. `Cost`
4. `CardName`
5. `Type`
6. `System`
7. `Suffix`
8. `Effect`
9. `Color`
10. `ImageUrl`
11. `set_category`
12. `set_section`

分類欄位會寫入 `sets` 資料表。既有卡包保留原本的 `sort_order`，新卡包依 Excel 工作表順序新增到最後。

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
    "suffix": "Suffix",
    "effect": "Card effect text",
    "color": "Red",
    "image_url": "https://example.com/card.png"
  }
]
```
