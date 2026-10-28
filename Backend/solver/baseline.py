"""Baseline: randomized greedy with restarts (for comparison with CP-SAT)."""
import json
import random
import sys
import time
from collections import defaultdict

from common import DAYS, build_candidates


def attempt(data, cands, off, groups, teachers, partners, rng):
    tocc, rocc, gocc = set(), set(), set()
    gday, tday, tweek = defaultdict(int), defaultdict(int), defaultdict(int)
    placed, unplaced = {}, []
    order = sorted(cands, key=lambda o: (len(cands[o]), rng.random()))
    for oid in order:
        o = off[oid]
        p, g, t = o["periods"], o["group_id"], o["teacher_id"]
        cl = cands[oid][:]
        rng.shuffle(cl)
        done = False
        for (d, s, r) in cl:
            per = range(s, s + p)
            if gday[(g, d)] + p > groups[g]["max_periods_per_day"]: continue
            if tday[(t, d)] + p > teachers[t]["max_periods_per_day"]: continue
            if tweek[t] + p > teachers[t]["max_periods_per_week"]: continue
            if any((t, d, q) in tocc or (r, d, q) in rocc or (g, d, q) in gocc for q in per): continue
            if any((h, d, q) in gocc for h in partners[g] for q in per): continue
            for q in per:
                tocc.add((t, d, q)); rocc.add((r, d, q)); gocc.add((g, d, q))
            gday[(g, d)] += p; tday[(t, d)] += p; tweek[t] += p
            placed[oid] = {"offering_id": oid, "day": d, "start_period": s, "room_id": r}
            done = True
            break
        if not done:
            unplaced.append(oid)
    # teacher gap estimate to choose between complete attempts
    gaps = 0
    for t in teachers:
        for d in DAYS:
            qs = sorted(q for (tt, dd, q) in tocc if tt == t and dd == d)
            if qs:
                gaps += (qs[-1] - qs[0] + 1) - len(qs)
    return placed, unplaced, gaps


def main():
    payload = json.load(sys.stdin)
    data, cfg = payload["data"], payload.get("config", {})
    t0 = time.time()
    limit = float(cfg.get("timeLimitSec", 10))
    rng = random.Random(int(cfg.get("seed", 1)))
    cands, reasons = build_candidates(data)
    off = {o["offering_id"]: o for o in data["offerings"]}
    groups = {g["group_id"]: g for g in data["groups"]}
    teachers = {t["teacher_id"]: t for t in data["teachers"]}
    partners = defaultdict(set)
    for s in data.get("shared_students", []):
        partners[s["group_a"]].add(s["group_b"]); partners[s["group_b"]].add(s["group_a"])
    best, tries = None, 0
    while True:
        tries += 1
        res = attempt(data, cands, off, groups, teachers, partners, rng)
        key = (len(res[1]), res[2])
        if best is None or key < best[0]:
            best = (key, res)
        if time.time() - t0 > limit or tries >= 20000:
            break
    placed, unplaced, gaps = best[1]
    out = {"status": "FEASIBLE" if not unplaced else "PARTIAL", "wall_time": round(time.time() - t0, 2),
           "assignments": sorted(placed.values(), key=lambda a: a["offering_id"]), "unplaced": unplaced,
           "attempts": tries, "teacher_gaps_estimate": gaps, "config": {"timeLimitSec": limit, "seed": cfg.get("seed", 1)}}
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
