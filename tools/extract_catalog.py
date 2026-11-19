#!/usr/bin/env python3
"""Extract and sanitize the Ho Tu Lo Shu: 14 Books catalog."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

CJK_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]")
TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")
PAREN_CJK_RE = re.compile(
    r"\([^)]*[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF][^)]*\)"
    r"|\[[^\]]*[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF][^\]]*\]"
    r"|（[^）]*[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF][^）]*）"
)

DEFAULT_SOURCE_DIR = (
    "/home/jiyoung/workspace/무협위키/.local/graph/14books-data/"
    "extracted_ko/만능상인_포함/Mod/3138418939/Config"
)
REQUIRED_KEYS = (
    "stats",
    "difficulties",
    "equipSlots",
    "talentTrees",
    "codeAtlas",
    "normalInventory",
    "equipment",
    "skills",
    "talents",
    "nicknames",
    "areas",
    "teleporters",
    "npcNames",
    "buffs",
    "wulinTujian",
    "achievements",
    "qzzlPasses",
)

STATS = {
    "HP": ("HP", "기본", 0, 999999),
    "MaxHP": ("최대 HP", "기본", 0, 999999),
    "MP": ("MP", "기본", 0, 999999),
    "MaxMP": ("최대 MP", "기본", 0, 999999),
    "AP": ("AP", "기본", 0, 999999),
    "MaxAP": ("최대 AP", "기본", 0, 999999),
    "RecoverAP": ("AP 회복", "기본", 0, 999999),
    "Speed": ("속도", "기본", 0, 999999),
    "Physique": ("체력", "기본", 0, 999999),
    "Intelligence": ("지능", "기본", 0, 999999),
    "ZOC": ("이동 범위", "기본", 0, 999999),
    "Money": ("소지금", "성향·재화", 0, 999999999),
    "Madness": ("광기", "성향·재화", -999999, 999999),
    "Moral": ("도덕", "성향·재화", -999999, 999999),
    "Reputation": ("명성", "성향·재화", -999999, 999999),
    "YinAndYang": ("음양", "성향·재화", -999999, 999999),
    "Friendship": ("우정", "성향·재화", 0, 999999),
    "Fight": ("권법", "병기·무학", 0, 999999),
    "Sword": ("검법", "병기·무학", 0, 999999),
    "Blade": ("도법", "병기·무학", 0, 999999),
    "Spear": ("창곤", "병기·무학", 0, 999999),
    "Arrow": ("암기·궁술", "병기·무학", 0, 999999),
    "Short": ("단병", "병기·무학", 0, 999999),
    "Doctor": ("의술", "생활·기예", 0, 999999),
    "Poison": ("독술", "생활·기예", 0, 999999),
    "Neigong": ("내공", "생활·기예", 0, 999999),
    "Qinggong": ("경공", "생활·기예", 0, 999999),
    "HurbKnowledge": ("약초 지식", "생활·기예", 0, 999999),
    "MineralKnowledge": ("광물 지식", "생활·기예", 0, 999999),
    "StealKnowledge": ("도둑 지식", "생활·기예", 0, 999999),
    "BusinessKnowledge": ("상업 지식", "생활·기예", 0, 999999),
    "PercentageHP": ("HP 비율", "비율·기타", 0, 100),
    "PercentageMP": ("MP 비율", "비율·기타", 0, 100),
    "TalentPoint": ("재능 포인트", "비율·기타", 0, 999999),
    "CurrentPower": ("현재 전투력", "비율·기타", 0, 999999999),
    "PercentageMaxHP": ("최대 HP 비율", "비율·기타", 0, 100),
    "PercentageMaxMP": ("최대 MP 비율", "비율·기타", 0, 100),
    "Injured": ("부상", "상태이상", 0, 1),
    "Wounded": ("중상", "상태이상", 0, 1),
    "Poisoned": ("중독", "상태이상", 0, 1),
    "Sealed": ("봉인", "상태이상", 0, 1),
    "Confused": ("혼란", "상태이상", 0, 1),
    "Dazed": ("현기증", "상태이상", 0, 1),
    "Cramped": ("경련", "상태이상", 0, 1),
    "Sprained": ("삐끗함", "상태이상", 0, 1),
    "Exhausted": ("탈진", "상태이상", 0, 1),
    "Frozen": ("동결", "상태이상", 0, 1),
    "Drunk": ("취함", "상태이상", 0, 1),
}

NORMAL_CATEGORY_MAP = {
    **dict.fromkeys(("401", "402", "Drug_Medicine", "Herbs_Medicine"), "약품·약초"),
    **dict.fromkeys(
        (
            "601", "602", "604", "Stone_Forge", "Leather_Forge", "Muscle_Forge",
            "Wood_Forge", "Silk_Forge", "Bonus_Forge", "CentipedeBlood_Forge",
            "Gunpowder_Forge", "ScorpionPoison_Forge", "SnakePoison_Forge",
            "SpiderBlood_Forge",
        ),
        "단조·재료",
    ),
    **dict.fromkeys(
        ("703", "Cuisine_Food", "Vegetable_Food", "Meat_Food", "Wine_Food", "Fruit_Food"),
        "음식·주류",
    ),
    **dict.fromkeys(
        (
            "801", "809", "Other_Stuff", "Task_Stuff", "Swag_Stuff",
            "LegendaryBook_Stuff", "Antique_Stuff", "Flower_Stuff", "Chess_Stuff",
            "Piano_Stuff", "Currency_Stuff", "Write_Stuff", "Paint_Stuff",
        ),
        "잡물·천서·임무",
    ),
    "Worm_Poison": "독물·암기",
    "Throw_Poison": "독물·암기",
}

EQUIP_CATEGORY_MAP = {
    **dict.fromkeys(
        (
            "101", "104", "107", "109",
            "Fist_Weapon", "Sword_Weapon", "Blade_Weapon", "Stick_Weapon",
            "Dagger_Weapon", "Mace_Weapon", "Spear_Weapon", "Fan_Weapon",
            "Pen_Weapon", "Flute_Weapon", "Other_Weapon", "Arrow_Weapon",
        ),
        "Weapon",
    ),
    "201": "Cloth",
    "Cloth_Armor": "Cloth",
    "202": "Jewelry",
    "Jewelry_Armor": "Jewelry",
    "203": "Fashion",
    "Fashion_Armor": "Fashion",
    "Accessory_Armor": "Accessory",
    "Cloak_Armor": "Cloak",
    "Hat_Armor": "Hat",
}

EQUIP_SUBCATEGORY_KO = {
    "101": "권갑", "104": "도", "107": "창", "109": "부채",
    "Fist_Weapon": "권갑", "Sword_Weapon": "검", "Blade_Weapon": "도",
    "Stick_Weapon": "봉", "Dagger_Weapon": "비수", "Mace_Weapon": "타구봉·편",
    "Spear_Weapon": "창", "Fan_Weapon": "부채", "Pen_Weapon": "필",
    "Flute_Weapon": "피리", "Other_Weapon": "기타무기", "Arrow_Weapon": "암기·궁",
    "201": "의복", "Cloth_Armor": "의복",
    "202": "장신구", "Jewelry_Armor": "장신구",
    "203": "외형 의상", "Fashion_Armor": "외형 의상",
    "Accessory_Armor": "보패·장식",
    "Cloak_Armor": "망토",
    "Hat_Armor": "머리장식",
}

SKILL_CATEGORY_MAP = {
    "301": "권법", "Fight_Book": "권법",
    "302": "검법", "Sword_Book": "검법",
    "303": "도법", "Blade_Book": "도법",
    "304": "창곤", "Spear_Book": "창곤",
    "305": "암기·궁술", "Arrow_Book": "암기·궁술",
    "306": "단병", "Short_Book": "단병",
    "307": "내공", "Neigong_Book": "내공",
    "308": "경공", "Qinggong_Book": "경공",
    "309": "특수", "Special_Book": "특수",
    "310": "의술", "Doctor_Book": "의술",
    "318": "전속무학",
    "Poison_Book": "독술",
}


def has_cjk(value: str) -> bool:
    return bool(CJK_RE.search(str(value)))


def has_tag(value: str) -> bool:
    return bool(TAG_RE.search(str(value)))


def clean_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = TAG_RE.sub("", text)
    text = PAREN_CJK_RE.sub("", text)
    text = CJK_RE.sub("", text)
    return " ".join(text.split()).strip()


def valid_name(name: str) -> bool:
    return bool(name) and name.lower() not in {"temp", "test"} and not has_cjk(name)


def clean_int(value: Any, default: int = 0) -> int:
    text = clean_text(value)
    if not text:
        return default
    try:
        return int(float(text.replace(",", "")))
    except ValueError:
        return default


def clean_float(value: Any, default: float = 0.0) -> float:
    text = clean_text(value)
    if not text:
        return default
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return default


def cell(row: list[str], idx: int) -> str:
    return row[idx] if idx < len(row) else ""


def _find_file(folder: Path, filename: str) -> Path | None:
    if not folder.is_dir():
        return None
    exact = folder / filename
    if exact.is_file():
        return exact
    wanted = filename.casefold()
    for candidate in folder.iterdir():
        if candidate.is_file() and candidate.name.casefold() == wanted:
            return candidate
    return None


def _read_rows(folder: Path, filename: str) -> list[list[str]]:
    path = _find_file(folder, filename)
    if path is None:
        return []
    rows: list[list[str]] = []
    with path.open("r", encoding="utf-8-sig", errors="replace") as f:
        for raw in f:
            line = raw.rstrip("\r\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            rows.append(line.split("\t"))
    return rows


def _build_stats() -> dict[str, dict[str, Any]]:
    return {
        key: {"label": label, "group": group, "min": minimum, "max": maximum}
        for key, (label, group, minimum, maximum) in STATS.items()
    }


def build_catalog(source: Path) -> dict[str, Any]:
    text_dir = source / "TextFiles"

    catalog: dict[str, Any] = {
        "generatedBy": "tools/extract_catalog.py",
        "stats": _build_stats(),
        "difficulties": {
            "0": "쉬움", "1": "보통", "2": "어려움", "3": "종사",
            "4": "없음", "5": "확장 난이도",
        },
        "equipSlots": {
            "MajorWeapon": "주무기",
            "MinorWeapon": "보조무기",
            "Cloth": "의복",
            "Jewelry": "장신구",
            "Book": "비급",
            "Fashion": "외형 의상",
            "Accessory": "보패·장식",
            "Cloak": "망토",
            "Hat": "머리장식",
        },
        "talentTrees": {"0": "동", "1": "정", "2": "강", "3": "유", "4": "교", "5": "졸"},
        "codeAtlas": {
            "saveFormat": "HELUO_1_0 / HELUO_1_1 + SSTS-WULINLOG-V2",
            "equipSlots": "9종 (EquipType)",
            "modId": "SSTS",
            "wulinTujian": "wulin_met_{Id} / wulin_unlock_{Id}",
            "catalog": "SstsCatalog",
        },
        "normalInventory": {},
        "equipment": {},
        "skills": {},
        "talents": {},
        "nicknames": {},
        "areas": {},
        "teleporters": {},
        "npcNames": {},
        "buffs": {},
        "wulinTujian": {},
        "achievements": {},
        "qzzlPasses": [],
    }

    for row in _read_rows(text_dir, "NormalInventoryItem.txt"):
        item_id = clean_text(cell(row, 0))
        name = clean_text(cell(row, 1))
        if not item_id or not valid_name(name):
            continue
        raw_cat = clean_text(cell(row, 4))
        catalog["normalInventory"][item_id] = {
            "id": item_id,
            "name": name,
            "description": clean_text(cell(row, 3)),
            "category": NORMAL_CATEGORY_MAP.get(raw_cat, "기타"),
            "rawCategory": raw_cat,
            "price": clean_int(cell(row, 5)),
            "weight": clean_float(cell(row, 9)),
            "effects": clean_text(cell(row, 16)),
        }

    for row in _read_rows(text_dir, "EquipInventoryItem.txt"):
        item_id = clean_text(cell(row, 0))
        name = clean_text(cell(row, 1))
        if not item_id or not valid_name(name):
            continue
        raw_cat = clean_text(cell(row, 4))
        category = EQUIP_CATEGORY_MAP.get(raw_cat)
        if category is None and raw_cat.endswith("_Weapon"):
            category = "Weapon"
        if not category:
            category = "Weapon"
        sub_ko = EQUIP_SUBCATEGORY_KO.get(raw_cat, catalog["equipSlots"].get(category, "무기"))
        catalog["equipment"][item_id] = {
            "id": item_id,
            "name": name,
            "description": clean_text(cell(row, 3)),
            "category": category,
            "subCategoryKo": sub_ko,
            "rawCategory": raw_cat,
            "price": clean_int(cell(row, 5)),
            "weight": clean_float(cell(row, 9)),
            "level": clean_int(cell(row, 11)),
            "durability": clean_int(cell(row, 12)),
            "maxDurability": clean_int(cell(row, 13)),
            "hurt": clean_text(cell(row, 14)),
            "hurtDiff": clean_int(cell(row, 15)),
            "effects": clean_text(cell(row, 16)),
        }

    for row in _read_rows(text_dir, "SkillTreeItem.txt"):
        item_id = clean_text(cell(row, 0))
        name = clean_text(cell(row, 1))
        if not item_id or not valid_name(name):
            continue
        raw_cat = clean_text(cell(row, 4))
        category = SKILL_CATEGORY_MAP.get(raw_cat, "기타")
        catalog["skills"][item_id] = {
            "id": item_id,
            "name": name,
            "description": clean_text(cell(row, 3)),
            "categoryCode": raw_cat,
            "category": category,
            "rawCategory": raw_cat,
            "treeId": clean_text(cell(row, 11)),
            "weaponType": clean_text(cell(row, 12)),
        }

    for row in _read_rows(text_dir, "talentitem.txt"):
        raw_id = clean_text(cell(row, 0))
        name = clean_text(cell(row, 1))
        if not raw_id or not valid_name(name):
            continue
        tree_key = raw_id.split("_", 1)[0] if "_" in raw_id else ""
        catalog["talents"][raw_id] = {
            "id": raw_id,
            "name": name,
            "description": clean_text(cell(row, 2)),
            "tree": tree_key,
            "treeName": catalog["talentTrees"].get(tree_key, ""),
        }

    for row in _read_rows(text_dir, "NicknameItem.txt"):
        item_id = clean_text(cell(row, 0))
        name = clean_text(cell(row, 1))
        if item_id and valid_name(name):
            catalog["nicknames"][item_id] = {
                "id": item_id,
                "name": name,
                "description": clean_text(cell(row, 2)),
                "bonus": clean_text(cell(row, 3)),
            }

    for filename, target in (
        ("areaitem.txt", "areas"),
        ("teleporteritem.txt", "teleporters"),
        ("NpcItem.txt", "npcNames"),
    ):
        for row in _read_rows(text_dir, filename):
            item_id = clean_text(cell(row, 0))
            name = clean_text(cell(row, 1))
            if item_id and valid_name(name):
                catalog[target][item_id] = name

    for row in _read_rows(text_dir, "BufferItem.txt"):
        item_id = clean_text(cell(row, 0))
        name = clean_text(cell(row, 1))
        if item_id and valid_name(name):
            catalog["buffs"][item_id] = {
                "id": item_id,
                "name": name,
                "description": clean_text(cell(row, 2)),
            }

    for row in _read_rows(text_dir, "AchievementItem.txt"):
        item_id = clean_text(cell(row, 0))
        name = clean_text(cell(row, 1))
        if item_id and valid_name(name):
            catalog["achievements"][item_id] = {
                "id": item_id,
                "name": name,
                "description": clean_text(cell(row, 2)),
                "reward": clean_text(cell(row, 12)),
            }

    for row in _read_rows(source, "WulinTujianItem.txt"):
        item_id = clean_text(cell(row, 0))
        name = clean_text(cell(row, 3))
        if not item_id or not valid_name(name):
            continue
        npc_ids = [s.strip() for s in clean_text(cell(row, 5)).split(",") if s.strip()]
        skills = [s.strip() for s in clean_text(cell(row, 7)).split(",") if s.strip()]
        catalog["wulinTujian"][item_id] = {
            "id": item_id,
            "kind": clean_text(cell(row, 1)),
            "book": clean_text(cell(row, 2)),
            "name": name,
            "npcIds": npc_ids,
            "characterId": clean_text(cell(row, 6)),
            "skills": skills,
            "bio": clean_text(cell(row, 8)),
            "cost": clean_int(cell(row, 9)),
            "attrBonus": clean_text(cell(row, 11)),
            "bookItemId": clean_text(cell(row, 12)),
        }

    for row in _read_rows(source, "QzzlPassItem.txt"):
        period = clean_text(cell(row, 0))
        name = clean_text(cell(row, 2))
        if not period or not valid_name(name):
            continue
        catalog["qzzlPasses"].append({
            "period": period,
            "tier": clean_text(cell(row, 1)),
            "name": name,
            "book": clean_text(cell(row, 3)),
            "condition": clean_text(cell(row, 4)),
            "reward": clean_text(cell(row, 5)),
        })

    return catalog


def _validate_catalog(catalog: Any) -> list[str]:
    errors = []
    if not isinstance(catalog, dict):
        return ["Catalog payload must be a JSON object"]
    missing = [key for key in REQUIRED_KEYS if key not in catalog]
    if missing:
        errors.append("Missing required keys: " + ", ".join(missing))
    if len(catalog.get("stats", {})) != 48:
        errors.append("stats must contain exactly 48 entries")
    if len(catalog.get("equipSlots", {})) != 9:
        errors.append("equipSlots must contain exactly 9 entries")
    serialized = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    if has_cjk(serialized):
        errors.append("Catalog contains Hanzi")
    if has_tag(serialized):
        errors.append("Catalog contains <...> tags")
    return errors


def _payload_from_output(text: str) -> Any:
    marker = "  return {"
    start = text.find(marker)
    if start < 0:
        raise ValueError("catalog-data.js parse marker not found")
    start += len("  return ")
    end = text.rfind(";\n}));")
    if end < 0:
        end = text.rfind(";")
    return json.loads(text[start:end].strip())


def write_umd(output: Path, catalog: dict[str, Any]) -> None:
    payload = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    js = (
        "/* Auto-generated by tools/extract_catalog.py. Do not edit manually. */\n"
        "(function (root, factory) {\n"
        "  if (typeof module === 'object' && module.exports) module.exports = factory();\n"
        "  else root.SstsCatalog = factory();\n"
        "}(typeof self !== 'undefined' ? self : this, function () {\n"
        f"  return {payload};\n"
        "}));\n"
    )
    if has_cjk(js):
        raise AssertionError("output contains CJK/Hanzi")
    if has_tag(js):
        raise AssertionError("output contains <...> tags")
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix(output.suffix + ".tmp")
    tmp.write_text(js, encoding="utf-8")
    os.replace(tmp, output)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract SstsCatalog for the 14 Books save editor.")
    parser.add_argument("--source-dir", type=Path, default=Path(DEFAULT_SOURCE_DIR))
    parser.add_argument("--output", type=Path, default=Path("src/catalog-data.js"))
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args(argv)

    if args.check_only:
        try:
            text = args.output.read_text(encoding="utf-8")
            if has_cjk(text):
                raise ValueError("catalog-data.js contains Hanzi")
            if has_tag(text):
                raise ValueError("catalog-data.js contains <...> tags")
            catalog = _payload_from_output(text)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            print(f"check failed: {exc}", file=sys.stderr)
            return 1
        errors = _validate_catalog(catalog)
        if errors:
            for error in errors:
                print(f"check failed: {error}", file=sys.stderr)
            return 1
        print(f"OK: {args.output} ({len(text.encode('utf-8'))} bytes)")
        return 0

    if not args.source_dir.is_dir():
        print(f"source directory not found: {args.source_dir}", file=sys.stderr)
        return 1
    catalog = build_catalog(args.source_dir)
    errors = _validate_catalog(catalog)
    if errors:
        for error in errors:
            print(f"catalog validation failed: {error}", file=sys.stderr)
        return 1
    write_umd(args.output, catalog)
    print(f"wrote {args.output} ({args.output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
