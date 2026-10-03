import argparse
import json
import os
import re
import sys
import urllib.request
from collections import OrderedDict

import openpyxl


def infer_set_code(card_number: str) -> str:
    match = re.match(r"^(\d+[A-Z]+\d+)", str(card_number or ""))
    return match.group(1) if match else ""


def normalize_text(value) -> str:
    if value is None:
        return ""
    text = str(value)
    text = text.replace("_x000D_", "\n")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n[ \t]*\n+", "\n", text)
    return text.strip()


def to_int(value) -> int:
    try:
        if value is None or value == "":
            return 0
        return int(float(value))
    except Exception:
        return 0


def read_cards_from_workbook(path: str):
    wb = openpyxl.load_workbook(path, data_only=True)
    cards = []
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        if not rows:
          continue

        header = [normalize_text(v) for v in rows[0]]
        col_index = {name: idx for idx, name in enumerate(header) if name}
        has_header = {"CardNumber", "CardName"}.issubset(col_index.keys())

        data_rows = rows[1:] if has_header else rows
        for row in data_rows:
            if has_header:
                card_number = normalize_text(row[col_index.get("CardNumber")]) if col_index.get("CardNumber") is not None else ""
                card_name = normalize_text(row[col_index.get("CardName")]) if col_index.get("CardName") is not None else ""
                rarity = normalize_text(row[col_index.get("Rarity")]) if col_index.get("Rarity") is not None else ""
                cost = to_int(row[col_index.get("Cost")]) if col_index.get("Cost") is not None else 0
                type_value = normalize_text(row[col_index.get("Type")]) if col_index.get("Type") is not None else ""
                system = normalize_text(row[col_index.get("System")]) if col_index.get("System") is not None else ""
                infix = normalize_text(row[col_index.get("Infix")]) if col_index.get("Infix") is not None else ""
                suffix = normalize_text(row[col_index.get("Suffix")]) if col_index.get("Suffix") is not None else ""
                effect = normalize_text(row[col_index.get("Effect")]) if col_index.get("Effect") is not None else ""
                color = normalize_text(row[col_index.get("Color")]) if col_index.get("Color") is not None else ""
                image_url = normalize_text(row[col_index.get("ImageUrl")]) if col_index.get("ImageUrl") is not None else ""
                set_name_index = col_index.get("SetName", col_index.get("set_name"))
                set_name = normalize_text(row[set_name_index]) if set_name_index is not None else ""
                set_category = normalize_text(row[col_index.get("set_category")]) if col_index.get("set_category") is not None else ""
                set_section = normalize_text(row[col_index.get("set_section")]) if col_index.get("set_section") is not None else ""
            else:
                # Column order in sheets without header:
                # CardNumber, Rarity, Cost, CardName, Type, System, Infix, Suffix, Effect, Color, ImageUrl
                card_number = normalize_text(row[0]) if len(row) > 0 else ""
                rarity = normalize_text(row[1]) if len(row) > 1 else ""
                cost = to_int(row[2]) if len(row) > 2 else 0
                card_name = normalize_text(row[3]) if len(row) > 3 else ""
                type_value = normalize_text(row[4]) if len(row) > 4 else ""
                system = normalize_text(row[5]) if len(row) > 5 else ""
                infix = normalize_text(row[6]) if len(row) > 6 else ""
                suffix = normalize_text(row[7]) if len(row) > 7 else ""
                effect = normalize_text(row[8]) if len(row) > 8 else ""
                color = normalize_text(row[9]) if len(row) > 9 else ""
                image_url = normalize_text(row[10]) if len(row) > 10 else ""
                set_category = normalize_text(row[11]) if len(row) > 11 else ""
                set_section = normalize_text(row[12]) if len(row) > 12 else ""
                set_name = normalize_text(row[13]) if len(row) > 13 else ""

            if not card_number or not card_name:
                continue

            cards.append({
                "set_code": ws.title,
                "card_number": card_number,
                "rarity": rarity,
                "cost": cost,
                "card_name": card_name,
                "type": type_value,
                "system": system,
                "infix": infix,
                "suffix": suffix,
                "effect": effect,
                "color": color,
                "image_url": image_url,
                "_set_name": set_name,
                "_set_category": set_category,
                "_set_section": set_section,
                "source": "bandai",
                "is_active": True,
            })

    dedup = OrderedDict()
    for card in cards:
        dedup[card["card_number"]] = card
    return list(dedup.values())


def upsert_sets(base_url: str, service_key: str, cards: list[dict]):
    imported_sets = OrderedDict()
    for card in cards:
        code = card.get("set_code")
        if code and code not in imported_sets:
            imported_sets[code] = {
                "set_name": card.get("_set_name", ""),
                "set_category": card.get("_set_category", ""),
                "set_section": card.get("_set_section", ""),
            }

    existing_sets = get_json(
        f"{base_url}/rest/v1/sets?select=code,name,sort_order,set_category,set_section",
        service_key,
    )
    existing_by_code = {row["code"]: row for row in existing_sets}
    names = {}
    duplicate_names = set()
    for row in existing_sets:
        normalized_name = normalize_text(row.get("name")).casefold()
        if not normalized_name:
            continue
        if normalized_name in names:
            duplicate_names.add(normalized_name)
        else:
            names[normalized_name] = row
    existing_by_name = {name: row for name, row in names.items() if name not in duplicate_names}
    next_sort_order = max([int(row.get("sort_order") or 0) for row in existing_sets] or [0]) + 1
    payload = []
    for code, classification in imported_sets.items():
        imported_name = classification["set_name"] or f"Battle Spirits {code}"
        existing = existing_by_code.get(code) or existing_by_name.get(normalize_text(imported_name).casefold())
        payload.append({
            "code": code,
            "name": classification["set_name"] or (existing or {}).get("name") or f"Battle Spirits {code}",
            "sort_order": int((existing or {}).get("sort_order") or 0) if existing else next_sort_order,
            "set_category": classification["set_category"] or (existing or {}).get("set_category") or "未分類",
            "set_section": classification["set_section"] or (existing or {}).get("set_section") or "其他",
        })
        if not existing:
            next_sort_order += 1

    if not payload:
        return

    post_json(
        f"{base_url}/rest/v1/sets?on_conflict=code",
        service_key,
        payload,
    )


def upsert_cards(base_url: str, service_key: str, cards: list[dict]):
    batch_size = 200
    for i in range(0, len(cards), batch_size):
        batch = [
            {key: value for key, value in card.items() if not key.startswith("_")}
            for card in cards[i:i + batch_size]
        ]
        post_json(
            f"{base_url}/rest/v1/cards?on_conflict=card_number",
            service_key,
            batch,
        )


def post_json(url: str, service_key: str, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        resp.read()


def get_json(url: str, service_key: str):
    req = urllib.request.Request(
        url,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser(description="Import Battle Spirits Excel into Supabase cards table.")
    parser.add_argument("excel", help="Path to the Excel file, e.g. 26RBS.xlsx")
    args = parser.parse_args()

    base_url = os.environ.get("SUPABASE_URL", "").strip()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not base_url or not service_key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.", file=sys.stderr)
        sys.exit(1)
    if "你的" in service_key or "service_role" in service_key.lower() and "eyJ" not in service_key:
        print("SUPABASE_SERVICE_ROLE_KEY looks like a placeholder. Please paste the real key from Supabase API Keys.", file=sys.stderr)
        sys.exit(1)
    try:
        service_key.encode("ascii")
    except UnicodeEncodeError:
        print("SUPABASE_SERVICE_ROLE_KEY must be plain ASCII. Please paste the exact secret token with no extra text.", file=sys.stderr)
        sys.exit(1)

    cards = read_cards_from_workbook(args.excel)
    if not cards:
        print("No cards found in workbook.", file=sys.stderr)
        sys.exit(1)

    upsert_sets(base_url, service_key, cards)
    upsert_cards(base_url, service_key, cards)

    print(f"Imported {len(cards)} cards into Supabase.")
    print("Sets included:", ", ".join(sorted({card["set_code"] for card in cards})))


if __name__ == "__main__":
    main()
