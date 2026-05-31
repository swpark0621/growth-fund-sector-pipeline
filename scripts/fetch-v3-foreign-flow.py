import json
import re
import time
from datetime import date
from pathlib import Path

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "sectors.json"
OUTPUT_PATH = ROOT / "data" / "v3-foreign-flow.json"

RUN_DATE = "2026-05-31"
WEEK_START = "2026-05-25"
WEEK_END = "2026-05-29"
THRESHOLD_EOK = 6000

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
}


def main():
    sectors = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    universe = build_universe(sectors)
    rows = []

    for index, item in enumerate(universe.values(), start=1):
        ticker = item["ticker"]
        try:
            quote = fetch_quote(ticker)
            flow = fetch_foreign_flow(ticker)
            row = build_row(item, quote, flow)
        except Exception as exc:
            row = build_error_row(item, exc)
        rows.append(row)
        print(f"[{index:02d}/{len(universe)}] {item['company']} {ticker}: {row['v3']['classification']}")
        time.sleep(0.12)

    selected = [
        row
        for row in rows
        if row["foreignFlow"]["netValueToMarketCapPct"] is not None
        and row["foreignFlow"]["netValueToMarketCapPct"] > 0
    ]
    selected.sort(
        key=lambda row: (
            row["foreignFlow"]["netValueToMarketCapPct"] or -999,
            row["v3"]["priorityScore"] or -999,
            -(row["marketCap"]["eok"] or 10**9),
        ),
        reverse=True,
    )

    output = {
        "meta": {
            "title": "국민성장펀드 v3 외국인 수급 후보",
            "runDate": RUN_DATE,
            "weekStart": WEEK_START,
            "weekEnd": WEEK_END,
            "threshold": "시가총액 6000억원 이하",
            "foreignFlowRule": "지난주 외국인 순매수 금액 / 시가총액 비율이 양수인 종목을 우선 후보군으로 둡니다.",
            "smallCapRule": "동일한 정책 점수대에서는 시가총액이 낮을수록 valuation 점수와 우선순위가 높아집니다.",
            "source": "Naver Finance item/frgn.naver and item/main.naver",
            "totalUniqueTickers": len(universe),
            "positiveForeignFlow": len(selected),
            "eligibleA": sum(1 for row in rows if row["v3"]["classification"] == "A"),
            "watchC": sum(1 for row in rows if row["v3"]["classification"] == "C"),
            "excluded": sum(1 for row in rows if row["v3"]["classification"] == "제외"),
        },
        "rows": rows,
        "selectedRows": selected,
    }

    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {OUTPUT_PATH.relative_to(ROOT)}")


def build_universe(data):
    universe = {}
    validation_rank = {"Strong": 3, "Watch": 2, "Reconsider": 1}

    for sector in data.get("sectors", []):
        for candidate in sector.get("candidates", []):
            ticker = str(candidate.get("ticker", "")).strip()
            if not ticker or ticker == "확인 필요":
                continue

            current = universe.setdefault(
                ticker,
                {
                    "ticker": ticker,
                    "company": candidate.get("company"),
                    "market": candidate.get("market"),
                    "sectors": [],
                    "sectorIds": [],
                    "valueChains": [],
                    "possiblePaths": [],
                    "capitalUses": [],
                    "reasons": [],
                    "nextChecks": [],
                    "sourceCandidates": [],
                    "baseValidation": "Reconsider",
                    "baseScore": 0,
                },
            )
            current["sectors"].append(sector.get("name"))
            current["sectorIds"].append(sector.get("id"))
            current["valueChains"].append(candidate.get("valueChain"))
            current["possiblePaths"].append(candidate.get("possiblePath"))
            current["capitalUses"].append(candidate.get("capitalUse"))
            current["reasons"].append(candidate.get("reason"))
            current["nextChecks"].extend(candidate.get("nextChecks", []))
            current["sourceCandidates"].append(candidate)

            validation = candidate.get("investmentValidation", {}).get("finalValidation", "Reconsider")
            if validation_rank.get(validation, 0) > validation_rank.get(current["baseValidation"], 0):
                current["baseValidation"] = validation
            current["baseScore"] = max(current["baseScore"], candidate.get("v2Screening", {}).get("score", 0))

    for item in universe.values():
        for key in ["sectors", "sectorIds", "valueChains", "possiblePaths", "capitalUses", "reasons", "nextChecks"]:
            item[key] = unique_compact(item[key])

    return universe


def fetch_quote(ticker):
    url = f"https://finance.naver.com/item/main.naver?code={ticker}"
    soup = get_soup(url)
    market_cap_eok = None
    listed_shares = None

    market_sum = soup.select_one("#_market_sum")
    if market_sum:
        market_cap_eok = parse_eok_amount(market_sum.get_text(" ", strip=True))

    for table in soup.select("table"):
        caption = table.find("caption")
        if not caption or "시가총액" not in caption.get_text(" ", strip=True):
            continue
        for tr in table.select("tr"):
            cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
            if len(cells) < 2:
                continue
            if "상장주식수" in cells[0]:
                listed_shares = parse_int(cells[1])
            if "시가총액" in cells[0] and market_cap_eok is None:
                market_cap_eok = parse_eok_amount(cells[1])

    return {
        "marketCapEok": market_cap_eok,
        "listedShares": listed_shares,
        "sourceUrl": url,
    }


def fetch_foreign_flow(ticker):
    url = f"https://finance.naver.com/item/frgn.naver?code={ticker}&page=1"
    soup = get_soup(url)
    table = None
    for candidate in soup.select("table"):
        text = candidate.get_text(" ", strip=True)
        if "날짜" in text and "외국인" in text and "보유율" in text:
            table = candidate
            break
    if table is None:
        raise RuntimeError("foreign flow table not found")

    daily = []
    for tr in table.select("tr"):
        cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
        if len(cells) != 9 or not re.match(r"\d{4}\.\d{2}\.\d{2}", cells[0]):
            continue
        day = cells[0].replace(".", "-")
        if not (WEEK_START <= day <= WEEK_END):
            continue
        close = parse_int(cells[1])
        foreign_net_shares = parse_signed_int(cells[6])
        holding_shares = parse_int(cells[7])
        holding_rate = parse_float(cells[8])
        daily.append(
            {
                "date": day,
                "close": close,
                "institutionNetShares": parse_signed_int(cells[5]),
                "foreignNetShares": foreign_net_shares,
                "foreignHoldingShares": holding_shares,
                "foreignHoldingRatePct": holding_rate,
                "foreignNetValueEok": round(close * foreign_net_shares / 100_000_000, 2)
                if close is not None and foreign_net_shares is not None
                else None,
            }
        )

    if not daily:
        raise RuntimeError("no trading rows in target week")

    daily.sort(key=lambda row: row["date"])
    return {
        "daily": daily,
        "sourceUrl": url,
    }


def build_row(item, quote, flow):
    market_cap_eok = quote["marketCapEok"]
    listed_shares = quote["listedShares"]
    net_shares = sum(row["foreignNetShares"] or 0 for row in flow["daily"])
    net_value_eok = round(sum(row["foreignNetValueEok"] or 0 for row in flow["daily"]), 2)
    latest = flow["daily"][-1]
    ownership_change_pctp = (
        round(net_shares / listed_shares * 100, 4) if listed_shares and listed_shares > 0 else None
    )
    net_value_to_market_cap_pct = (
        round(net_value_eok / market_cap_eok * 100, 4)
        if market_cap_eok and market_cap_eok > 0
        else None
    )

    score_breakdown = build_score_breakdown(item, market_cap_eok, net_value_to_market_cap_pct)
    policy_score = sum(score_breakdown.values())
    foreign_momentum_score = momentum_score(net_value_to_market_cap_pct)
    priority_score = min(120, policy_score + foreign_momentum_score)
    classification = classify(item["baseValidation"], market_cap_eok, net_value_to_market_cap_pct)

    return {
        "company": item["company"],
        "ticker": item["ticker"],
        "market": item["market"],
        "sectors": item["sectors"],
        "valueChains": item["valueChains"],
        "possiblePaths": item["possiblePaths"],
        "capitalUses": item["capitalUses"],
        "reasons": item["reasons"][:3],
        "nextChecks": item["nextChecks"][:6],
        "baseValidation": item["baseValidation"],
        "baseScore": item["baseScore"],
        "marketCap": {
            "eok": market_cap_eok,
            "listedShares": listed_shares,
            "thresholdEok": THRESHOLD_EOK,
            "sourceUrl": quote["sourceUrl"],
        },
        "foreignFlow": {
            "weekStart": WEEK_START,
            "weekEnd": WEEK_END,
            "netShares": net_shares,
            "netValueEok": net_value_eok,
            "netValueToMarketCapPct": net_value_to_market_cap_pct,
            "ownershipChangePctp": ownership_change_pctp,
            "latestHoldingRatePct": latest["foreignHoldingRatePct"],
            "daily": flow["daily"],
            "sourceUrl": flow["sourceUrl"],
        },
        "v3": {
            "classification": classification,
            "policyScore": policy_score,
            "foreignMomentumScore": foreign_momentum_score,
            "priorityScore": priority_score,
            "scoreBreakdown": score_breakdown,
            "verdict": verdict(classification, market_cap_eok, net_value_to_market_cap_pct, item["baseValidation"]),
        },
    }


def build_error_row(item, exc):
    return {
        "company": item["company"],
        "ticker": item["ticker"],
        "market": item["market"],
        "sectors": item["sectors"],
        "valueChains": item["valueChains"],
        "possiblePaths": item["possiblePaths"],
        "capitalUses": item["capitalUses"],
        "reasons": item["reasons"][:3],
        "nextChecks": item["nextChecks"][:6],
        "baseValidation": item["baseValidation"],
        "baseScore": item["baseScore"],
        "marketCap": {
            "eok": None,
            "listedShares": None,
            "thresholdEok": THRESHOLD_EOK,
            "sourceUrl": f"https://finance.naver.com/item/main.naver?code={item['ticker']}",
        },
        "foreignFlow": {
            "weekStart": WEEK_START,
            "weekEnd": WEEK_END,
            "netShares": None,
            "netValueEok": None,
            "netValueToMarketCapPct": None,
            "ownershipChangePctp": None,
            "latestHoldingRatePct": None,
            "daily": [],
            "sourceUrl": f"https://finance.naver.com/item/frgn.naver?code={item['ticker']}&page=1",
            "error": str(exc),
        },
        "v3": {
            "classification": "제외",
            "policyScore": None,
            "foreignMomentumScore": 0,
            "priorityScore": None,
            "scoreBreakdown": {},
            "verdict": "데이터 수집 실패로 제외. 수동 확인 필요.",
        },
    }


def build_score_breakdown(item, market_cap_eok, net_value_to_market_cap_pct):
    return {
        "policyFit": policy_score(item["baseValidation"]),
        "valuationThreshold": valuation_score(market_cap_eok),
        "valueChainDirectness": directness_score(item),
        "growthCatalyst": growth_score(item),
        "investability": investability_score(item),
    }


def policy_score(validation):
    if validation == "Strong":
        return 34
    if validation == "Watch":
        return 25
    return 13


def valuation_score(market_cap_eok):
    if market_cap_eok is None:
        return 0
    if market_cap_eok > THRESHOLD_EOK:
        return 0
    return max(10, min(20, round(10 + ((THRESHOLD_EOK - market_cap_eok) / THRESHOLD_EOK) * 10)))


def directness_score(item):
    text = " ".join(item["valueChains"] + item["reasons"])
    score = 17 if item["baseValidation"] == "Strong" else 13 if item["baseValidation"] == "Watch" else 8
    if any(keyword in text for keyword in ["장비", "소재", "인프라", "부품", "직접", "CDMO", "위성", "레이더"]):
        score += 2
    return max(0, min(20, score))


def growth_score(item):
    candidates = item.get("sourceCandidates", [])
    scores = []
    for candidate in candidates:
        value = candidate.get("investmentValidation", {}).get("growthCatalyst", {}).get("probabilityPct")
        if isinstance(value, (int, float)):
            scores.append(value)
    if not scores:
        return 8
    return round(max(scores) / 100 * 15)


def investability_score(item):
    text = " ".join(item["possiblePaths"] + item["capitalUses"])
    score = 5
    if any(keyword in text for keyword in ["신규", "증자", "메자닌", "설비", "CAPEX", "R&D"]):
        score += 3
    if any(keyword in text for keyword in ["운전", "스케일업", "공장", "양산"]):
        score += 2
    return min(10, score)


def momentum_score(net_value_to_market_cap_pct):
    if net_value_to_market_cap_pct is None or net_value_to_market_cap_pct <= 0:
        return 0
    return min(20, round(net_value_to_market_cap_pct * 25, 1))


def classify(validation, market_cap_eok, net_value_to_market_cap_pct):
    if net_value_to_market_cap_pct is None or net_value_to_market_cap_pct <= 0:
        return "제외"
    if market_cap_eok is None or market_cap_eok > THRESHOLD_EOK:
        return "제외"
    if validation == "Reconsider":
        return "C"
    return "A"


def verdict(classification, market_cap_eok, flow_pct, validation):
    if classification == "A":
        return "유지: 외국인 순매수/시총 비율이 양수이고 6000억원 이하 기준을 통과했습니다."
    if classification == "C":
        return "보류: 외국인 수급과 시총 기준은 통과했지만 기존 validation이 Reconsider입니다."
    if flow_pct is None or flow_pct <= 0:
        return "제외: 지난주 외국인 순매수/시총 비율이 양수가 아닙니다."
    if market_cap_eok and market_cap_eok > THRESHOLD_EOK:
        return "제외: 외국인 수급은 양수이나 6000억원 기준을 초과합니다."
    return f"제외: 기존 validation({validation}) 또는 데이터 확인이 필요합니다."


def get_soup(url):
    response = requests.get(url, headers=HEADERS, timeout=20)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def parse_int(value):
    text = str(value or "").replace(",", "")
    match = re.search(r"[-+]?\d+", text)
    return int(match.group(0)) if match else None


def parse_eok_amount(value):
    text = str(value or "").replace(",", "").replace("\n", " ").strip()
    if not text:
        return None
    total = 0
    jo_match = re.search(r"([-+]?\d+(?:\.\d+)?)\s*조", text)
    eok_match = re.search(r"([-+]?\d+(?:\.\d+)?)\s*억", text)
    if jo_match:
        total += float(jo_match.group(1)) * 10000
    if eok_match:
        total += float(eok_match.group(1))
    if jo_match or eok_match:
        return int(round(total))
    return parse_int(text)


def parse_signed_int(value):
    text = str(value or "").replace(",", "")
    match = re.search(r"[-+]?\d+", text)
    return int(match.group(0)) if match else None


def parse_float(value):
    text = str(value or "").replace(",", "")
    match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
    return float(match.group(0)) if match else None


def unique_compact(values):
    output = []
    seen = set()
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        output.append(text)
    return output


if __name__ == "__main__":
    main()
