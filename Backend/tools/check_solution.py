"""Independent checker for the 12 hard constraints (does not share code with the solver).

Modes:
  python check_solution.py --stdin                     # {"data":{...},"assignments":[...]}
  python check_solution.py --data CLEANED_DIR --solution solution.csv   # canonical-header CSVs
"""
import argparse
import csv
import json
import sys
from collections import defaultdict

DAYS = ["MON", "TUE", "WED", "THU", "FRI"]
INT_COLS = {"size", "max_periods_per_day", "max_periods_per_week", "capacity", "periods", "period", "start_period"}
NAMES = ["groups", "teachers", "rooms", "courses", "offerings", "timeslots", "teacher_blocks", "room_blocks", "fixed_sessions", "shared_students"]
EX = 15  # max examples per constraint


def blk(p):
    return 0 if 1 <= p <= 4 else 1 if 5 <= p <= 8 else -1


def check(data, assignments):
    off = {o["offering_id"]: o for o in data["offerings"]}
    groups = {g["group_id"]: g for g in data["groups"]}
    teachers = {t["teacher_id"]: t for t in data["teachers"]}
    rooms = {r["room_id"]: r for r in data["rooms"]}
    courses = {c["course_id"]: c for c in data["courses"]}
    allowed = {(r["day"], r["period"]) for r in data["timeslots"]}
    tb = {(r["teacher_id"], r["day"], r["period"]) for r in data.get("teacher_blocks", [])}
    rb = {(r["room_id"], r["day"], r["period"]) for r in data.get("room_blocks", [])}
    fixed = {f["offering_id"]: f for f in data.get("fixed_sessions", [])}
    V = {f"c{i:02d}": [] for i in range(1, 13)}

    # c12: each offering exactly once
    cnt = defaultdict(int)
    for a in assignments:
        cnt[a["offering_id"]] += 1
    for oid in off:
        if cnt[oid] == 0: V["c12"].append(f"{oid} missing")
        elif cnt[oid] > 1: V["c12"].append(f"{oid} appears {cnt[oid]} times")
    for oid in cnt:
        if oid not in off: V["c12"].append(f"{oid} is not a valid offering_id")

    occ_t, occ_r, occ_g = defaultdict(list), defaultdict(list), defaultdict(list)
    gday, tday, tweek = defaultdict(int), defaultdict(int), defaultdict(int)
    seen = set()
    for a in assignments:
        oid = a["offering_id"]
        if oid not in off or oid in seen:
            continue
        seen.add(oid)
        o = off[oid]; p = o["periods"]; d = a["day"]; s = a["start_period"]; r = a["room_id"]
        t, g = o["teacher_id"], o["group_id"]
        per = list(range(s, s + p))
        # c07
        if d not in DAYS or any((d, q) not in allowed for q in per):
            V["c07"].append(f"{oid}: {d} periods {per[0]}-{per[-1]} not in allowed timeslots")
        # c06
        if s < 1 or per[-1] > 8 or blk(s) != blk(per[-1]):
            V["c06"].append(f"{oid}: {p} periods from {s} leave 1-8 or cross lunch")
        # c05
        room = rooms.get(r)
        if room is None: V["c05"].append(f"{oid}: room {r} unknown")
        else:
            if room["room_type"] != courses[o["course_id"]]["room_type"]:
                V["c05"].append(f"{oid}: room {r} type {room['room_type']} != {courses[o['course_id']]['room_type']}")
            if room["capacity"] < groups[g]["size"]:
                V["c05"].append(f"{oid}: room {r} capacity {room['capacity']} < {groups[g]['size']}")
        # c08
        for q in per:
            if (t, d, q) in tb: V["c08"].append(f"{oid}: teacher {t} blocked {d} p{q}")
            if (r, d, q) in rb: V["c08"].append(f"{oid}: room {r} closed {d} p{q}")
            occ_t[(t, d, q)].append(oid); occ_r[(r, d, q)].append(oid); occ_g[(g, d, q)].append(oid)
        gday[(g, d)] += p; tday[(t, d)] += p; tweek[t] += p
        # c11
        f = fixed.get(oid)
        if f and (f["day"], f["start_period"], f["room_id"]) != (d, s, r):
            V["c11"].append(f"{oid}: fixed {f['day']} {f['start_period']} {f['room_id']} but got {d} {s} {r}")

    for key, lst in occ_t.items():
        if len(lst) > 1: V["c01"].append(f"teacher {key[0]} {key[1]} p{key[2]}: {lst}")
    for key, lst in occ_r.items():
        if len(lst) > 1: V["c02"].append(f"room {key[0]} {key[1]} p{key[2]}: {lst}")
    for key, lst in occ_g.items():
        if len(lst) > 1: V["c03"].append(f"group {key[0]} {key[1]} p{key[2]}: {lst}")
    for s in data.get("shared_students", []):
        a, b = s["group_a"], s["group_b"]
        if a == b: continue
        for d in DAYS:
            for q in range(1, 9):
                if occ_g.get((a, d, q)) and occ_g.get((b, d, q)):
                    V["c04"].append(f"groups {a}&{b} overlap {d} p{q}: {occ_g[(a, d, q)]} / {occ_g[(b, d, q)]}")
    for (g, d), n in gday.items():
        if n > groups[g]["max_periods_per_day"]: V["c09"].append(f"group {g} {d}: {n} > {groups[g]['max_periods_per_day']}")
    for (t, d), n in tday.items():
        if n > teachers[t]["max_periods_per_day"]: V["c10"].append(f"teacher {t} {d}: {n} > {teachers[t]['max_periods_per_day']}/day")
    for t, n in tweek.items():
        if n > teachers[t]["max_periods_per_week"]: V["c10"].append(f"teacher {t}: {n} > {teachers[t]['max_periods_per_week']}/week")

    hard = {k: {"pass": not v, "count": len(v), "examples": v[:EX]} for k, v in V.items()}

    # soft metrics
    gaps = 0
    for t in teachers:
        for d in DAYS:
            qs = sorted(q for (tt, dd, q) in occ_t if tt == t and dd == d)
            if qs: gaps += (qs[-1] - qs[0] + 1) - len(qs)
    dev = 0.0; gmax = 0
    for g in groups:
        loads = [gday.get((g, d), 0) for d in DAYS]
        avg = sum(loads) / 5
        dev += sum(abs(l - avg) for l in loads); gmax = max(gmax, max(loads))
    return {
        "valid": all(h["pass"] for h in hard.values()),
        "hard": hard,
        "violations_total": sum(len(v) for v in V.values()),
        "scheduled": len(seen),
        "total_offerings": len(off),
        "scheduled_periods": sum(off[o]["periods"] for o in seen),
        "metrics": {"teacher_gaps": gaps, "group_balance_dev": round(dev, 2), "group_max_per_day": gmax},
    }


def load_dir(path):
    import os
    data = {}
    for n in NAMES:
        fp = os.path.join(path, n + ".csv")
        rows = []
        if os.path.exists(fp):
            with open(fp, encoding="utf-8-sig", newline="") as f:
                for r in csv.DictReader(f):
                    rows.append({k: (int(v) if k in INT_COLS and v not in ("", None) else v) for k, v in r.items()})
        data[n] = rows
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stdin", action="store_true")
    ap.add_argument("--data"); ap.add_argument("--solution")
    a = ap.parse_args()
    if a.stdin:
        p = json.load(sys.stdin)
        data, asg = p["data"], p["assignments"]
    else:
        data = load_dir(a.data)
        with open(a.solution, encoding="utf-8-sig", newline="") as f:
            asg = [{"offering_id": r["offering_id"].strip().upper(), "day": r["day"].strip().upper(),
                    "start_period": int(r["start_period"]), "room_id": r["room_id"].strip().upper()} for r in csv.DictReader(f)]
    res = check(data, asg)
    if a.stdin:
        json.dump(res, sys.stdout)
    else:
        for k, v in res["hard"].items():
            print(f"{k}: {'PASS' if v['pass'] else 'FAIL (' + str(v['count']) + ')'}")
            for e in v["examples"][:3]: print("    ", e)
        print("VALID" if res["valid"] else "INVALID", res["scheduled"], "/", res["total_offerings"], res["metrics"])
        sys.exit(0 if res["valid"] else 1)


if __name__ == "__main__":
    main()
