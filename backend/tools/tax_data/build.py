"""Build the engine's countries.json and legal_forms.json from the researched source files.

Usage:  python3 backend/tools/tax_data/build.py [output_dir]

Each file in sources/ holds one region as researched (see README.md for where the
figures come from and how far they were checked). This script validates and
normalises them, applies the hand-verified overrides below, and writes the two
data files the engine loads. The output is plain ASCII: every other character is escaped.
"""
import json, re, sys, unicodedata
from pathlib import Path

SRC = Path(__file__).parent / "sources"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "app" / "engine"

if not OUT.is_dir():
    sys.exit("output directory %s does not exist" % OUT)
source_files = sorted(SRC.glob("*.json"))
if not source_files:
    sys.exit("no source files in %s" % SRC)

countries = {}
for path in source_files:
    try:
        entries = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        sys.exit("%s is not valid JSON: %s" % (path.name, exc))
    for c in entries:
        if not isinstance(c, dict) or not c.get("code") or not c.get("name"):
            sys.exit("%s has an entry without a code or a name" % path.name)
        if c["code"] in countries:
            sys.exit("%s appears in two source files" % c["code"])
        countries[c["code"]] = c

problems = []
dropped_forms = []
SHORT_ANY_CASE = {"ltd", "inc", "llc", "llp", "plc", "kft", "bhd", "zrt", "oyj", "srl", "spa", "snc", "aps", "gbr", "lda"}
ALLOWANCE_IS_A_CREDIT = {"IS"}
# short names and plain-language hints for the regimes shown in the demo
DISPLAY = {
    ("EE", "entrepreneur_account"): {
        "name": "Entrepreneur account (ettev\u00f5tluskonto)",
        "hint": "The bank sets the tax aside from every payment you receive. No monthly tax returns."},
    ("EE", "fie"): {
        "name": "FIE / self-employed",
        "hint": "Tax is worked out on your yearly profit. 45% is a cautious share to set aside if you have few business costs."},
}
SHORT_EXACT = {"Oy", "ehf", "eG", "mbH"}
ZERO_DECIMAL_STORED_X100 = {"IS"}   # researched in 1/100 units; ISO 4217 gives ISK no minor unit

def rescale(obj):
    if isinstance(obj, dict):
        return {k: (v // 100 if k.endswith("Minor") and is_int(v) else rescale(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [rescale(x) for x in obj]
    return obj


def is_int(v): return isinstance(v, int) and not isinstance(v, bool)

def clean_income_tax(spec):
    kind = spec.get("type")
    if kind == "none":
        return {"type": "none", "base": spec.get("base")}, True
    if kind == "flat":
        ok = is_int(spec.get("rateBp"))
        return {"type": "flat", "rateBp": spec.get("rateBp") if ok else None, "base": spec.get("base")}, ok
    raw = spec.get("brackets") or []
    brackets = [b for b in raw if is_int(b.get("rateBp"))]
    ok = bool(brackets) and len(brackets) == len(raw)
    if ok:
        limits = [b.get("upToMinor") for b in brackets]
        ok = limits[-1] is None and all(is_int(x) for x in limits[:-1]) and limits[:-1] == sorted(limits[:-1])
    out = [{"upToMinor": b.get("upToMinor"), "rateBp": b["rateBp"]} for b in brackets]
    return {"type": "progressive", "brackets": out, "base": spec.get("base")}, ok

def derive_rate(spec):
    if spec["type"] == "flat" and is_int(spec.get("rateBp")):
        return spec["rateBp"]
    if spec["type"] == "progressive":
        rates = [b["rateBp"] for b in spec["brackets"] if b["rateBp"] > 0]
        if rates:
            return rates[min(1, len(rates) - 1)]
    return None

def clean_deadlines(code, rid, items):
    out = []
    for d in items or []:
        t, day = d.get("type"), d.get("day")
        months = d.get("months")
        if not is_int(day) or not 1 <= day <= 31:
            problems.append(f"{code}/{rid}: deadline dropped {d}"); continue
        if t == "monthly":
            out.append({"name": d.get("name", ""), "type": "monthly", "day": day})
        elif months and all(is_int(m) and 1 <= m <= 12 for m in months):
            out.append({"name": d.get("name", ""), "type": "quarterly", "day": day, "months": sorted(set(months))})
        elif is_int(d.get("month")) and 1 <= d["month"] <= 12:
            out.append({"name": d.get("name", ""), "type": "annual", "day": day, "month": d["month"]})
        else:
            problems.append(f"{code}/{rid}: deadline dropped {d}")
    return out

result, forms = [], {}
for code in sorted(countries, key=lambda k: countries[k]["name"]):
    c = countries[code]
    if code in ZERO_DECIMAL_STORED_X100:
        c = rescale(c)
    regimes, seen = [], set()
    for r in c.get("regimes") or []:
        rid = re.sub(r"^%s_" % code.lower(), "", r["id"])
        if rid in seen:
            problems.append(f"{code}: duplicate regime {rid}"); continue
        seen.add(rid)
        spec, computable = clean_income_tax(r.get("incomeTax") or {"type": "none"})
        social = []
        for s in r.get("socialContributions") or []:
            if is_int(s.get("rateBp")) or is_int(s.get("fixedAnnualMinor")):
                social.append({k: s.get(k) for k in ("name", "rateBp", "base", "floorMinor", "capMinor", "fixedAnnualMinor")})
        rate, source = r.get("suggestedReserveRateBp"), "researched"
        if not is_int(rate) or not 0 <= rate <= 10000:
            rate, source = derive_rate(spec), "derived_from_rates"
        if rate is None:
            problems.append(f"{code}/{rid}: no usable rate, regime dropped"); continue
        allowance = r["allowanceMinor"] if is_int(r.get("allowanceMinor")) and r["allowanceMinor"] > 0 else 0
        # a zero-rate first bracket already encodes the tax-free amount; do not apply it twice
        if allowance and spec["type"] == "progressive" and spec["brackets"] and spec["brackets"][0]["rateBp"] == 0:
            allowance = 0
        note_extra = ""
        if code in ALLOWANCE_IS_A_CREDIT and allowance:
            allowance = 0
            note_extra = " The personal allowance is a tax credit, not a deduction, and is not modelled; estimates overstate tax."
        vat = r.get("vat") or {}
        deadlines = clean_deadlines(code, rid, r.get("deadlines"))
        components, extra_component, verification, rule_text = None, None, "secondary", None
        if (code, rid) == ("EE", "entrepreneur_account"):
            # Simplified Business Income Taxation Act, sections 4, 6(3) and 8(2), read 2026-11-13
            deadlines = [{"name": "Bank transfers the reserved business income tax to the Tax and Customs Board",
                          "type": "monthly", "day": 10}]
            components = [{"id": "income_tax", "name": "Income tax", "shareNum": 22, "shareDen": 55},
                          {"id": "social_tax", "name": "Social tax", "shareNum": 33, "shareDen": 55}]
            extra_component = {"id": "funded_pension", "name": "Funded pension contribution", "ratesBp": [200, 400, 600]}
            verification = "official"
            r = dict(r, sources=(r.get("sources") or []) + ["https://www.riigiteataja.ee/en/eli/ee/514032023002/consolide/current"])
        if (code, rid) == ("EE", "fie"):
            # emta.ee self-employed pages (income tax, social tax), read 2026-11-13
            deadlines = [d for d in deadlines if "advance" not in d["name"].lower()] + [
                {"name": "Social tax advance payment", "type": "quarterly", "day": 15, "months": [3, 6, 9, 12]},
                {"name": "Income tax advance payment", "type": "quarterly", "day": 15, "months": [9, 12]}]
            verification = "official"
            rule_text = "22% income tax on profit + 33% social tax"
        taxed = spec["type"] != "none"
        unverified = []
        if not computable: unverified.append("incomeTax")
        if not social and taxed: unverified.append("socialContributions")
        if not deadlines and taxed: unverified.append("deadlines")
        if not is_int(vat.get("standardRateBp")): unverified.append("vat")
        if source != "researched": unverified.append("suggestedReserveRateBp")
        display = DISPLAY.get((code, rid), {})
        regimes.append({
            "id": rid, "name": display.get("name", r["name"]), "appliesTo": r.get("appliesTo") or "",
            "incomeTax": spec, "computable": computable, "allowanceMinor": allowance,
            "socialContributions": social,
            "vat": {"registrationThresholdMinor": vat.get("registrationThresholdMinor") if is_int(vat.get("registrationThresholdMinor")) else None,
                    "standardRateBp": vat.get("standardRateBp") if is_int(vat.get("standardRateBp")) else None},
            "suggestedReserveRateBp": rate, "reserveRateSource": source,
            "reserveBasis": display.get("hint") or r.get("reserveBasis") or "Derived from the statutory income tax rate; contributions are not included.",
            "deadlines": deadlines, "notes": (r.get("notes") or "") + note_extra, "unverified": unverified,
            "components": components, "extraComponent": extra_component, "verification": verification,
            "ruleText": rule_text,
            "sources": [s for s in (r.get("sources") or []) if isinstance(s, str) and s.startswith("http")],
            "verifiedAt": r.get("verifiedAt") or "2026-11-13",
        })
    regimes = [r for r in regimes if r["sources"]] if regimes else regimes
    regimes.sort(key=lambda r: (code, r["id"]) not in DISPLAY or r["id"] != "entrepreneur_account")   # demo regime first
    inherits = c.get("inheritsFrom") if not regimes else None
    if not regimes and not inherits:
        problems.append(f"{code}: no usable regimes, country dropped"); continue
    result.append({"code": code, "name": c["name"], "currency": c.get("currency"),
                   "taxYear": c.get("taxYear") or {"startMonth": 1, "startDay": 1},
                   "inheritsFrom": inherits, "regimes": regimes})
    for f in c.get("legalForms") or []:
        token = " ".join(str(f.get("token", "")).split())
        bare = re.sub(r"[\W\d_]", "", token)
        if len(bare) < 2:
            continue
        sensitive = bool(f.get("caseSensitive"))
        if len(bare) <= 3 and bare.isascii():
            # short designators collide with given names and surnames: keep only the
            # unmistakable ones, and upper-case abbreviations matched case-sensitively
            dotted = bool(re.search(r"[^\w\s]", token.rstrip(".")))
            if dotted and len(bare) == 3:
                pass                      # s.r.o., d.o.o., S.p.A.: unmistakable when written with dots
            elif dotted and len(bare) == 2:
                sensitive = True          # a.s., k.s.: exact case only, so initials "A. S." do not match
            elif bare.casefold() in SHORT_ANY_CASE:
                sensitive = False
            elif bare.isupper() or bare in SHORT_EXACT:
                sensitive = True
            else:
                dropped_forms.append(token); continue
        plain_ascii = "".join(ch for ch in unicodedata.normalize("NFKD", token) if not unicodedata.combining(ch))
        variants = [token] + ([plain_ascii] if plain_ascii != token and plain_ascii.isascii() else [])
        for variant in variants:
            key = (variant if sensitive else variant.casefold(), sensitive)
            entry = forms.setdefault(key, {"token": variant, "caseSensitive": sensitive, "name": f.get("name") or "", "countries": []})
            if code not in entry["countries"]:
                entry["countries"].append(code)

kept = {c["code"] for c in result if c["regimes"]}
for c in list(result):
    if c["inheritsFrom"] and c["inheritsFrom"] not in kept:
        problems.append(f"{c['code']}: parent {c['inheritsFrom']} has no regimes, country dropped")
        result.remove(c)

result.append({"code": "*", "name": "Other", "currency": None, "taxYear": {"startMonth": 1, "startDay": 1},
    "inheritsFrom": None, "regimes": [{
        "id": "custom", "name": "Custom", "appliesTo": "Any country or regime not listed.",
        "incomeTax": {"type": "none", "base": None}, "computable": False, "allowanceMinor": 0,
        "socialContributions": [], "vat": {"registrationThresholdMinor": None, "standardRateBp": None},
        "suggestedReserveRateBp": 2000, "reserveRateSource": "user",
        "reserveBasis": "Enter the percentage you want to set aside.",
        "deadlines": [], "notes": "", "unverified": [], "sources": [], "verifiedAt": "2026-11-13",
        "components": None, "extraComponent": None, "verification": "user", "ruleText": None}]})

for c in result:
    for r in c["regimes"]:
        # keys the API contract and the other roles' plans use
        r["defaultRate"] = r["suggestedReserveRateBp"]
        r["hint"] = r["reserveBasis"]
        r["deadline"] = r["deadlines"][0] if r["deadlines"] else None

(OUT / "countries.json").write_text(json.dumps(result, ensure_ascii=True, indent=1) + "\n", encoding="utf-8")
# written forms the research missed
for token, name, codes in [("Kabushiki Kaisha", "Kabushiki kaisha", ["JP"]), ("Sp z o o", "Spolka z ograniczona odpowiedzialnoscia", ["PL"]),
                           ("Limited Liability Company", "Limited liability company", ["US"])]:
    forms.setdefault((token.casefold(), False), {"token": token, "caseSensitive": False, "name": name, "countries": codes})
# two-letter designators that are not also common surnames or name particles: safe to trust in an all-capitals name
CAPS_SAFE = {"AG", "AB", "AS", "OY", "OU", "O\u00dc", "BV", "NV", "KG"}
for f in forms.values():
    f["capsSafe"] = f["token"].upper() in CAPS_SAFE or f["token"] == "UAB"
    # leading designators that stay trustworthy in an all-capitals name (Baltic convention)
    f["capsLeading"] = f["token"] in ("AS", "UAB")
# in an all-capitals name the mixed-case "Oy" is printed "OY"
if ("Oy", True) in forms:
    forms.setdefault(("OY", True), dict(forms[("Oy", True)], token="OY", capsSafe=True))
form_list = sorted(forms.values(), key=lambda f: (f["token"].casefold(), f["token"]))
(OUT / "legal_forms.json").write_text(json.dumps({"forms": form_list}, ensure_ascii=True, indent=1) + "\n", encoding="utf-8")
print("countries", len(result), "regimes", sum(len(c["regimes"]) for c in result), "forms", len(form_list))
gaps = {}
for c in result:
    for r in c["regimes"]:
        for u in r["unverified"]:
            gaps.setdefault(u, []).append(c["code"])
for k, v in gaps.items(): print(" unverified", k, len(set(v)), " ".join(sorted(set(v))))
for p in problems: print(" PROBLEM", p)
print(" dropped short forms:", " ".join(sorted(set(dropped_forms))))
