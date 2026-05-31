import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
SECTORS_PATH = ROOT / "data" / "sectors.json"
OUTPUT_PATH = ROOT / "data" / "v4-study-data.json"

RUN_DATE = "2026-05-31"
THRESHOLD_EOK = 6000
PAGES = 5
WINDOWS = {
    "w1": 5,
    "w4": 20,
    "w12": 60,
    "m6": 100,
}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"
}


def main():
    source = json.loads(SECTORS_PATH.read_text(encoding="utf-8"))
    universe = build_universe(source)
    rows = []
    for index, item in enumerate(universe.values(), start=1):
        try:
            quote = fetch_quote(item["ticker"])
            history = fetch_foreign_history(item["ticker"], PAGES)
            row = build_row(item, quote, history)
        except Exception as exc:
            row = build_error_row(item, exc)
        rows.append(row)
        print(f"[{index:02d}/{len(universe)}] {item['company']} {item['ticker']}: {row['v4']['classification']}")
        time.sleep(0.12)

    rows.sort(
        key=lambda row: (
            row["v4"].get("classificationRank", 0),
            row["v4"].get("totalScore") or -1,
            row["v4"].get("undervaluationScore") or -1,
        ),
        reverse=True,
    )

    output = {
        "meta": {
            "title": "국민성장펀드 v4 저평가 스터디",
            "runDate": RUN_DATE,
            "threshold": "시가총액 6000억원 이하를 상한으로 사용",
            "purpose": "국민성장펀드 정책 수혜 가능성이 있으면서 아직 시장이 덜 본 저평가 후보를 스터디하기 위한 화면입니다.",
            "method": "정책 적합성, 사업 직접성, 저평가/소형주 매력, 1/4/12주 및 6개월 수급 추세, 주주구조·희석 리스크, 재무 체력, 재평가 촉매를 함께 봅니다.",
            "source": "Naver Finance item/frgn.naver and item/main.naver, 기존 v2 validation",
            "totalUniqueTickers": len(rows),
            "classCounts": count_by(rows, lambda row: row["v4"]["classification"]),
            "latestTradingDate": first_existing(rows, ["flowTrend", "latestDate"]),
        },
        "rows": rows,
        "studyRows": [row for row in rows if row["v4"]["classification"] in {"A", "B", "C"}],
    }
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {OUTPUT_PATH.relative_to(ROOT)}")


def build_universe(data):
    universe = {}
    validation_rank = {"Strong": 3, "Watch": 2, "Reconsider": 1}
    for sector in data.get("sectors", []):
        for candidate in sector.get("candidates", []):
            ticker = str(candidate.get("ticker", "")).strip()
            if not ticker:
                continue
            item = universe.setdefault(
                ticker,
                {
                    "ticker": ticker,
                    "company": candidate.get("company"),
                    "market": candidate.get("market"),
                    "sectors": [],
                    "valueChains": [],
                    "possiblePaths": [],
                    "capitalUses": [],
                    "reasons": [],
                    "nextChecks": [],
                    "baseValidation": "Reconsider",
                    "baseScore": 0,
                    "validationSummaries": [],
                    "valuationChecks": [],
                    "financialDilutionRisks": [],
                    "capitalMarketChecks": [],
                    "downsideChecks": [],
                    "sourceCandidates": [],
                },
            )
            item["sectors"].append(sector.get("name"))
            item["valueChains"].append(candidate.get("valueChain"))
            item["possiblePaths"].append(candidate.get("possiblePath"))
            item["capitalUses"].append(candidate.get("capitalUse"))
            item["reasons"].append(candidate.get("reason"))
            item["nextChecks"].extend(candidate.get("nextChecks", []))
            validation = candidate.get("investmentValidation", {})
            item["validationSummaries"].append(validation.get("validationSummary"))
            item["valuationChecks"].append(validation.get("valuationCheck"))
            item["financialDilutionRisks"].append(validation.get("financialDilutionRisk"))
            item["capitalMarketChecks"].extend(validation.get("capitalMarketChecks", []))
            item["downsideChecks"].extend(validation.get("downsideChecks", []))
            item["sourceCandidates"].append(candidate)
            label = validation.get("finalValidation", "Reconsider")
            if validation_rank.get(label, 0) > validation_rank.get(item["baseValidation"], 0):
                item["baseValidation"] = label
            item["baseScore"] = max(item["baseScore"], candidate.get("v2Screening", {}).get("score", 0))

    for item in universe.values():
        for key in [
            "sectors",
            "valueChains",
            "possiblePaths",
            "capitalUses",
            "reasons",
            "nextChecks",
            "validationSummaries",
            "valuationChecks",
            "financialDilutionRisks",
            "capitalMarketChecks",
            "downsideChecks",
        ]:
            item[key] = unique_compact(item[key])
    return universe


def fetch_quote(ticker):
    url = f"https://finance.naver.com/item/main.naver?code={ticker}"
    soup = get_soup(url)
    market_cap_eok = parse_eok_amount(text_of(soup.select_one("#_market_sum")))
    listed_shares = None
    per = None
    pbr = None
    eps = None
    bps = None

    for table in soup.select("table"):
        caption = text_of(table.find("caption"))
        table_text = table.get_text(" ", strip=True)
        if "시가총액" in caption:
            for tr in table.select("tr"):
                cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
                if len(cells) < 2:
                    continue
                if "시가총액" in cells[0] and market_cap_eok is None:
                    market_cap_eok = parse_eok_amount(cells[1])
                if "상장주식수" in cells[0]:
                    listed_shares = parse_int(cells[1])
        if "PER" in table_text and "PBR" in table_text:
            per = value_after(table_text, "PER")
            pbr = value_after(table_text, "PBR")
            eps = value_after(table_text, "EPS")
            bps = value_after(table_text, "BPS")

    return {
        "marketCapEok": market_cap_eok,
        "listedShares": listed_shares,
        "per": per,
        "pbr": pbr,
        "eps": eps,
        "bps": bps,
        "sourceUrl": url,
    }


def fetch_foreign_history(ticker, pages):
    daily = []
    for page in range(1, pages + 1):
        url = f"https://finance.naver.com/item/frgn.naver?code={ticker}&page={page}"
        soup = get_soup(url)
        table = None
        for candidate in soup.select("table"):
            text = candidate.get_text(" ", strip=True)
            if "날짜" in text and "외국인" in text and "보유율" in text:
                table = candidate
                break
        if table is None:
            continue
        for tr in table.select("tr"):
            cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
            if len(cells) != 9 or not re.match(r"\d{4}\.\d{2}\.\d{2}", cells[0]):
                continue
            close = parse_int(cells[1])
            foreign_net = parse_signed_int(cells[6])
            inst_net = parse_signed_int(cells[5])
            daily.append(
                {
                    "date": cells[0].replace(".", "-"),
                    "close": close,
                    "volume": parse_int(cells[4]),
                    "institutionNetShares": inst_net,
                    "foreignNetShares": foreign_net,
                    "foreignHoldingShares": parse_int(cells[7]),
                    "foreignHoldingRatePct": parse_float(cells[8]),
                    "foreignNetValueEok": round(close * foreign_net / 100_000_000, 2)
                    if close is not None and foreign_net is not None
                    else None,
                    "institutionNetValueEok": round(close * inst_net / 100_000_000, 2)
                    if close is not None and inst_net is not None
                    else None,
                }
            )
        time.sleep(0.03)

    unique = {row["date"]: row for row in daily}
    rows = list(unique.values())
    rows.sort(key=lambda row: row["date"])
    if not rows:
        raise RuntimeError("foreign history not found")
    return rows


def build_row(item, quote, history):
    market_cap = quote["marketCapEok"]
    latest = history[-1]
    windows = {name: summarize_window(history, days, market_cap, quote["listedShares"]) for name, days in WINDOWS.items()}
    price = summarize_price(history)
    ownership = summarize_ownership(history)
    study = build_study_fields(item, quote, windows, price, ownership)
    scores = build_scores(item, quote, windows, price, ownership, study)
    classification = classify(item, quote, windows, scores, study)
    return {
        "company": item["company"],
        "ticker": item["ticker"],
        "market": item["market"],
        "sectors": item["sectors"],
        "valueChains": item["valueChains"],
        "baseValidation": item["baseValidation"],
        "baseScore": item["baseScore"],
        "marketCap": {
            "eok": market_cap,
            "listedShares": quote["listedShares"],
            "thresholdEok": THRESHOLD_EOK,
            "sizeBucket": size_bucket(market_cap),
            "sourceUrl": quote["sourceUrl"],
        },
        "valuation": {
            "per": quote["per"],
            "pbr": quote["pbr"],
            "eps": quote["eps"],
            "bps": quote["bps"],
            "interpretation": valuation_interpretation(quote, market_cap),
        },
        "flowTrend": {
            "latestDate": latest["date"],
            "latestClose": latest["close"],
            "windows": windows,
            "ownership": ownership,
            "sourceUrl": f"https://finance.naver.com/item/frgn.naver?code={item['ticker']}&page=1",
        },
        "priceTrend": price,
        "study": study,
        "v4": {
            "classification": classification,
            "classificationRank": {"A": 5, "B": 4, "C": 3, "추적": 2, "제외": 1}.get(classification, 0),
            "totalScore": round(sum(scores.values()), 1),
            "undervaluationScore": scores["undervaluation"],
            "scores": scores,
            "verdict": verdict(classification, item, quote, windows, price, study),
        },
    }


def build_error_row(item, exc):
    return {
        "company": item["company"],
        "ticker": item["ticker"],
        "market": item["market"],
        "sectors": item["sectors"],
        "valueChains": item["valueChains"],
        "baseValidation": item["baseValidation"],
        "baseScore": item["baseScore"],
        "marketCap": {"eok": None, "listedShares": None, "thresholdEok": THRESHOLD_EOK, "sizeBucket": "확인 필요"},
        "valuation": {"per": None, "pbr": None, "eps": None, "bps": None, "interpretation": "데이터 수집 실패"},
        "flowTrend": {"windows": {}, "ownership": {}, "error": str(exc)},
        "priceTrend": {},
        "study": {"whyStudy": "데이터 수집 실패", "keyCatalysts": [], "riskFlags": [str(exc)], "nextStudyQuestions": []},
        "v4": {
            "classification": "제외",
            "classificationRank": 1,
            "totalScore": 0,
            "undervaluationScore": 0,
            "scores": {},
            "verdict": "수급/가격 데이터 수집 실패로 수동 확인 필요.",
        },
    }


def summarize_window(history, days, market_cap, listed_shares):
    subset = history[-days:] if len(history) >= days else history[:]
    first = subset[0]
    last = subset[-1]
    foreign_value = round(sum(row["foreignNetValueEok"] or 0 for row in subset), 2)
    inst_value = round(sum(row["institutionNetValueEok"] or 0 for row in subset), 2)
    foreign_shares = sum(row["foreignNetShares"] or 0 for row in subset)
    inst_shares = sum(row["institutionNetShares"] or 0 for row in subset)
    return {
        "days": len(subset),
        "startDate": first["date"],
        "endDate": last["date"],
        "foreignNetValueEok": foreign_value,
        "foreignNetShares": foreign_shares,
        "foreignValueToMarketCapPct": ratio_pct(foreign_value, market_cap),
        "foreignSharesToListedPct": ratio_pct(foreign_shares, listed_shares),
        "institutionNetValueEok": inst_value,
        "institutionNetShares": inst_shares,
        "institutionValueToMarketCapPct": ratio_pct(inst_value, market_cap),
        "holdingRateChangePctp": round((last["foreignHoldingRatePct"] or 0) - (first["foreignHoldingRatePct"] or 0), 4)
        if first["foreignHoldingRatePct"] is not None and last["foreignHoldingRatePct"] is not None
        else None,
        "priceReturnPct": ratio_pct((last["close"] or 0) - (first["close"] or 0), first["close"]),
    }


def summarize_price(history):
    latest = history[-1]
    closes = [row["close"] for row in history if row["close"] is not None]
    high = max(closes) if closes else None
    low = min(closes) if closes else None
    return {
        "latestClose": latest["close"],
        "observations": len(history),
        "highClose": high,
        "lowClose": low,
        "drawdownFromHighPct": ratio_pct((latest["close"] or 0) - high, high) if high else None,
        "reboundFromLowPct": ratio_pct((latest["close"] or 0) - low, low) if low else None,
        "returns": {
            name: summarize_return(history, days) for name, days in WINDOWS.items()
        },
    }


def summarize_return(history, days):
    subset = history[-days:] if len(history) >= days else history[:]
    if not subset or subset[0]["close"] in (None, 0) or subset[-1]["close"] is None:
        return None
    return ratio_pct(subset[-1]["close"] - subset[0]["close"], subset[0]["close"])


def summarize_ownership(history):
    first = history[0]
    last = history[-1]
    rates = [row["foreignHoldingRatePct"] for row in history if row["foreignHoldingRatePct"] is not None]
    return {
        "latestHoldingRatePct": last["foreignHoldingRatePct"],
        "oldestHoldingRatePct": first["foreignHoldingRatePct"],
        "sixMonthHoldingRateChangePctp": round(last["foreignHoldingRatePct"] - first["foreignHoldingRatePct"], 4)
        if first["foreignHoldingRatePct"] is not None and last["foreignHoldingRatePct"] is not None
        else None,
        "minHoldingRatePct": min(rates) if rates else None,
        "maxHoldingRatePct": max(rates) if rates else None,
    }


def build_study_fields(item, quote, windows, price, ownership):
    risks = []
    if quote["marketCapEok"] is None:
        risks.append("시가총액 확인 필요")
    elif quote["marketCapEok"] > THRESHOLD_EOK:
        risks.append("6000억원 초과")
    elif quote["marketCapEok"] < 500:
        risks.append("500억원 미만 초소형주: 유동성·재무 리스크 우선 확인")
    if item["baseValidation"] == "Reconsider":
        risks.append("기존 validation Reconsider")
    if (windows["w12"]["foreignValueToMarketCapPct"] or 0) < 0:
        risks.append("12주 외국인 누적 수급 음수")
    if (price["returns"].get("w12") or 0) > 80:
        risks.append("12주 주가 급등 구간")
    risks.extend(item["financialDilutionRisks"][:1])

    catalysts = unique_compact(item["capitalUses"] + item["possiblePaths"] + item["nextChecks"])[:6]
    questions = unique_compact(
        [
            "국민성장펀드 신규자금 유입형 투자 대상에 실제로 해당하는가?",
            "외국인 4주·12주 누적 수급이 일회성이 아니라 추세인가?",
            "최근 수급 대비 주가가 이미 과열되지 않았는가?",
            "CB/BW, 유상증자, 전환 가능 물량이 주가를 누를 가능성은 없는가?",
            "수주·매출·고객사·양산 전환 근거가 공시 또는 IR로 확인되는가?",
        ]
        + item["nextChecks"][:3]
    )
    why = f"{', '.join(item['sectors'][:2])} 정책 후보이며 {size_bucket(quote['marketCapEok'])} 구간입니다. "
    why += "중장기 수급과 촉매를 함께 확인해야 합니다."
    return {
        "whyStudy": why,
        "policyFitEvidence": item["reasons"][:3],
        "keyCatalysts": catalysts,
        "riskFlags": unique_compact(risks)[:7],
        "nextStudyQuestions": questions[:7],
        "valuationMemo": valuation_interpretation(quote, quote["marketCapEok"]),
    }


def build_scores(item, quote, windows, price, ownership, study):
    scores = {
        "policyFit": score_policy(item["baseValidation"]),
        "businessDirectness": score_directness(item),
        "undervaluation": score_undervaluation(quote, price),
        "flowTrend": score_flow(windows, ownership),
        "shareholderDilution": score_shareholder(study),
        "financialQuality": score_financial(quote, study),
        "catalyst": score_catalyst(study),
    }
    return scores


def score_policy(validation):
    return {"Strong": 20, "Watch": 15, "Reconsider": 7}.get(validation, 7)


def score_directness(item):
    text = " ".join(item["valueChains"] + item["reasons"])
    base = {"Strong": 13, "Watch": 10, "Reconsider": 5}.get(item["baseValidation"], 5)
    if any(keyword in text for keyword in ["장비", "소재", "부품", "인프라", "CDMO", "위성", "레이더", "전력망", "로봇"]):
        base += 2
    return min(15, base)


def score_undervaluation(quote, price):
    cap = quote["marketCapEok"]
    if cap is None:
        return 0
    if cap < 500:
        score = 8
    elif cap < 1500:
        score = 16
    elif cap <= 3000:
        score = 20
    elif cap <= 6000:
        score = 13
    else:
        score = 0
    drawdown = price.get("drawdownFromHighPct")
    r12 = price.get("returns", {}).get("w12")
    if drawdown is not None and drawdown <= -30:
        score += 2
    if r12 is not None and r12 > 80:
        score -= 5
    return max(0, min(20, score))


def score_flow(windows, ownership):
    score = 0
    for name, points in [("w1", 2), ("w4", 4), ("w12", 5), ("m6", 2)]:
        if (windows[name]["foreignValueToMarketCapPct"] or 0) > 0:
            score += points
    if (windows["w4"]["institutionValueToMarketCapPct"] or 0) > 0:
        score += 1
    if (windows["w12"]["institutionValueToMarketCapPct"] or 0) > 0:
        score += 1
    if (ownership.get("sixMonthHoldingRateChangePctp") or 0) > 0:
        score += 2
    return min(15, score)


def score_shareholder(study):
    score = 10
    risk_text = " ".join(study["riskFlags"])
    if "CB" in risk_text or "BW" in risk_text or "전환" in risk_text or "희석" in risk_text:
        score -= 3
    if "500억원 미만" in risk_text:
        score -= 2
    if "Reconsider" in risk_text:
        score -= 2
    return max(0, score)


def score_financial(quote, study):
    score = 6
    if quote["pbr"] is not None and quote["pbr"] <= 1.5:
        score += 2
    if quote["per"] is not None and quote["per"] > 0 and quote["per"] <= 25:
        score += 2
    if "재무" in " ".join(study["riskFlags"]):
        score -= 2
    return max(0, min(10, score))


def score_catalyst(study):
    text = " ".join(study["keyCatalysts"])
    score = 3
    if any(keyword in text for keyword in ["수주", "고객", "양산", "증설", "CAPEX", "설비", "R&D", "임상", "공급"]):
        score += 5
    if any(keyword in text for keyword in ["유상증자", "메자닌", "CB", "신규"]):
        score += 2
    return min(10, score)


def classify(item, quote, windows, scores, study):
    cap = quote["marketCapEok"]
    flow_positive = (windows["w4"]["foreignValueToMarketCapPct"] or 0) > 0 or (windows["w12"]["foreignValueToMarketCapPct"] or 0) > 0
    if cap is None:
        return "제외"
    if cap > THRESHOLD_EOK:
        return "추적" if item["baseValidation"] == "Strong" else "제외"
    if item["baseValidation"] == "Reconsider":
        return "C" if flow_positive else "제외"
    if scores["flowTrend"] >= 9 and scores["undervaluation"] >= 13 and scores["policyFit"] >= 15:
        return "A"
    if scores["policyFit"] >= 15 and scores["undervaluation"] >= 13:
        return "B"
    return "C"


def verdict(classification, item, quote, windows, price, study):
    if classification == "A":
        return "우선 스터디: 정책 적합성, 6000억원 이하, 중장기 수급, 저평가 구간이 함께 확인됩니다."
    if classification == "B":
        return "후보 스터디: 정책성과 저평가 구간은 유효하나 수급 추세 또는 촉매 확인이 더 필요합니다."
    if classification == "C":
        return "보류 스터디: 일부 조건은 맞지만 Reconsider, 수급 약화, 재무/희석 리스크를 먼저 확인해야 합니다."
    if classification == "추적":
        return "추적군: 정책 대표성은 있으나 6000억원을 초과해 저평가 발굴 목적과는 거리가 있습니다."
    return "제외: 정책 직접성, 시총, 수급, 데이터 중 핵심 조건이 부족합니다."


def fetch_text(url):
    response = requests.get(url, headers=HEADERS, timeout=20)
    response.raise_for_status()
    return response.text


def get_soup(url):
    return BeautifulSoup(fetch_text(url), "html.parser")


def text_of(node):
    return node.get_text(" ", strip=True) if node else ""


def parse_int(value):
    text = str(value or "").replace(",", "")
    match = re.search(r"[-+]?\d+", text)
    return int(match.group(0)) if match else None


def parse_signed_int(value):
    return parse_int(value)


def parse_float(value):
    text = str(value or "").replace(",", "")
    match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
    return float(match.group(0)) if match else None


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


def value_after(text, label):
    marker = re.search(rf"{re.escape(label)}[^0-9N/-]*([Nn]/A|[-+]?\d+(?:,\d{{3}})*(?:\.\d+)?)", text)
    if not marker:
        return None
    value = marker.group(1)
    if value.upper() == "N/A":
        return None
    return float(value.replace(",", ""))


def ratio_pct(numerator, denominator):
    if numerator is None or denominator in (None, 0):
        return None
    return round(numerator / denominator * 100, 4)


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


def size_bucket(market_cap_eok):
    if market_cap_eok is None:
        return "확인 필요"
    if market_cap_eok < 500:
        return "500억 미만"
    if market_cap_eok < 1500:
        return "500억~1500억"
    if market_cap_eok <= 3000:
        return "1500억~3000억"
    if market_cap_eok <= THRESHOLD_EOK:
        return "3000억~6000억"
    return "6000억 초과"


def valuation_interpretation(quote, market_cap):
    parts = [size_bucket(market_cap)]
    if quote.get("pbr") is not None:
        parts.append(f"PBR {quote['pbr']}")
    if quote.get("per") is not None:
        parts.append(f"PER {quote['per']}")
    if len(parts) == 1:
        parts.append("PER/PBR 확인 필요")
    return " / ".join(parts)


def count_by(rows, key_func):
    counts = {}
    for row in rows:
        key = key_func(row)
        counts[key] = counts.get(key, 0) + 1
    return counts


def first_existing(rows, path):
    for row in rows:
        current = row
        for key in path:
            current = current.get(key) if isinstance(current, dict) else None
        if current is not None:
            return current
    return None


if __name__ == "__main__":
    main()
