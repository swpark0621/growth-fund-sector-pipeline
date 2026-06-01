import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "v4-study-data.json"
RUN_DATE = "2026-06-01"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
}

MANAGERS = {
    "BlackRock": ["blackrock", "ishares"],
    "Vanguard": ["vanguard"],
    "SSGA": ["state street", "ssga", "spdr"],
}


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    for index, row in enumerate(data["rows"], start=1):
        ownership = fetch_big3(row)
        row["big3Ownership"] = ownership
        print(f"[{index:02d}/{len(data['rows'])}] {row['company']} {ownership['summary']}")
        time.sleep(0.08)

    data["meta"]["big3Ownership"] = {
        "checkedAt": RUN_DATE,
        "source": "Fintel institutional ownership pages",
        "scope": "SEC 13F/NPORT/13D/G 등 공개 신고 기반 보유분입니다. 국내 전체 주주명부나 실시간 지분율을 의미하지 않습니다.",
        "managers": list(MANAGERS.keys()),
        "confirmedRows": sum(
            1
            for row in data["rows"]
            if any(item["status"] == "확인" for item in row.get("big3Ownership", {}).get("managers", []))
        ),
    }
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {DATA_PATH.relative_to(ROOT)}")


def fetch_big3(row):
    ticker = row["ticker"]
    url = f"https://fintel.io/so/kr/{ticker}"
    try:
        response = requests.get(url, headers=HEADERS, timeout=20)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        text = soup.get_text("\n", strip=True)
        lower = text.lower()
        managers = []
        for name, aliases in MANAGERS.items():
            hit = any(alias in lower for alias in aliases)
            managers.append(
                {
                    "name": name,
                    "status": "확인" if hit else "미확인",
                    "evidence": evidence_line(text, aliases) if hit else "",
                    "estimatedStakePct": estimate_stake_pct(text, aliases, row.get("marketCap", {}).get("listedShares")),
                }
            )
        stats = extract_fintel_stats(text)
        confirmed = [item["name"] for item in managers if item["status"] == "확인"]
        return {
            "checkedAt": RUN_DATE,
            "sourceUrl": url,
            "sourceScope": "Fintel SEC 신고 기반 institutional ownership",
            "managers": managers,
            "institutionalOwners": stats.get("institutionalOwners"),
            "institutionalSharesPct": stats.get("institutionalSharesPct"),
            "summary": ", ".join(confirmed) if confirmed else "Big3 확인 안 됨",
            "note": "BlackRock/iShares, Vanguard, State Street/SSGA/SPDR 명칭이 공개 Fintel 페이지에 잡히는지 확인",
        }
    except Exception as exc:
        return {
            "checkedAt": RUN_DATE,
            "sourceUrl": url,
            "sourceScope": "Fintel SEC 신고 기반 institutional ownership",
            "managers": [
                {"name": name, "status": "확인 필요", "evidence": "", "estimatedStakePct": None}
                for name in MANAGERS
            ],
            "institutionalOwners": None,
            "institutionalSharesPct": None,
            "summary": "수동확인 필요",
            "note": str(exc),
        }


def extract_fintel_stats(text):
    stats = {}
    owners = re.search(r"Institutional Owners\s+(\d+)\s+total", text)
    if owners:
        stats["institutionalOwners"] = int(owners.group(1))
    shares_pct = re.search(r"Institutional Shares \(Long\)\s+[\d,]+\s+-\s+([-\d.]+)%", text)
    if shares_pct:
        stats["institutionalSharesPct"] = float(shares_pct.group(1))
    return stats


def evidence_line(text, aliases):
    lines = text.splitlines()
    for line in lines:
        low = line.lower()
        if any(alias in low for alias in aliases):
            return re.sub(r"\s+", " ", line).strip()[:240]
    return ""


def estimate_stake_pct(text, aliases, listed_shares):
    if not listed_shares:
        return None
    lines = text.splitlines()
    for index, line in enumerate(lines):
        low = line.lower()
        if not any(alias in low for alias in aliases):
            continue
        window = " ".join(lines[index : index + 4])
        numbers = re.findall(r"\b\d{1,3}(?:,\d{3})+\b|\b\d+\b", window)
        parsed = [int(value.replace(",", "")) for value in numbers]
        parsed = [value for value in parsed if 0 < value <= listed_shares]
        if parsed:
            return round(max(parsed) / listed_shares * 100, 4)
    return None


if __name__ == "__main__":
    main()
