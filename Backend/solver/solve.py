"""CP-SAT timetable solver.  stdin: {"data":{...cleaned csv tables...},"config":{...}}  stdout: result JSON.
Progress lines go to stderr as:  PROGRESS {json}
"""
import json
import sys
import time
from collections import defaultdict

from ortools.sat.python import cp_model

from common import DAYS, build_candidates

FAMILIES = ["teacher_overlap", "room_overlap", "group_overlap", "shared_students", "group_day", "teacher_day", "teacher_week"]


class Progress(cp_model.CpSolverSolutionCallback):
    def __init__(self):
        super().__init__()
        self.t0 = time.time()
        self.count = 0

    def on_solution_callback(self):
        self.count += 1
        try:
            msg = {"elapsed": round(time.time() - self.t0, 1), "objective": self.ObjectiveValue(), "bound": self.BestObjectiveBound(), "solutions": self.count}
        except Exception:
            msg = {"elapsed": round(time.time() - self.t0, 1), "solutions": self.count}
        print("PROGRESS " + json.dumps(msg), file=sys.stderr, flush=True)


def solve(data, cfg, disabled=frozenset(), with_obj=True, time_limit=None, report_progress=True):
    cands, reasons = build_candidates(data)
    if reasons:
        return {"status": "INFEASIBLE", "reason": "no_candidates", "details": reasons, "assignments": []}

    off = {o["offering_id"]: o for o in data["offerings"]}
    groups = {g["group_id"]: g for g in data["groups"]}
    teachers = {t["teacher_id"]: t for t in data["teachers"]}
    m = cp_model.CpModel()
    x = {}
    occ_t, occ_r, occ_g = defaultdict(list), defaultdict(list), defaultdict(list)
    g_day, t_day, t_week = defaultdict(list), defaultdict(list), defaultdict(list)

    for oid, cl in cands.items():
        o = off[oid]
        p, g, t = o["periods"], o["group_id"], o["teacher_id"]
        vs = []
        for i, (d, s, r) in enumerate(cl):
            v = m.NewBoolVar(f"x_{oid}_{i}")
            x[oid, i] = v
            vs.append(v)
            for q in range(s, s + p):
                occ_t[(t, d, q)].append(v)
                occ_r[(r, d, q)].append(v)
                occ_g[(g, d, q)].append(v)
            g_day[(g, d)].append((v, p))
            t_day[(t, d)].append((v, p))
            t_week[t].append((v, p))
        m.AddExactlyOne(vs)  # hard 12 (one placement per offering)

    def amo(table):
        for lits in table.values():
            if len(lits) > 1:
                m.AddAtMostOne(lits)

    if "teacher_overlap" not in disabled: amo(occ_t)   # hard 01
    if "room_overlap" not in disabled: amo(occ_r)      # hard 02
    if "group_overlap" not in disabled: amo(occ_g)     # hard 03
    if "shared_students" not in disabled:              # hard 04
        for pr in data.get("shared_students", []):
            a, b = pr["group_a"], pr["group_b"]
            if a == b:
                continue
            for d in DAYS:
                for q in range(1, 9):
                    lits = occ_g.get((a, d, q), []) + occ_g.get((b, d, q), [])
                    if len(lits) > 1 and occ_g.get((a, d, q)) and occ_g.get((b, d, q)):
                        m.AddAtMostOne(lits)
    if "group_day" not in disabled:                    # hard 09
        for (g, d), lst in g_day.items():
            m.Add(sum(p * v for v, p in lst) <= groups[g]["max_periods_per_day"])
    if "teacher_day" not in disabled:                  # hard 10 (day)
        for (t, d), lst in t_day.items():
            m.Add(sum(p * v for v, p in lst) <= teachers[t]["max_periods_per_day"])
    if "teacher_week" not in disabled:                 # hard 10 (week)
        for t, lst in t_week.items():
            m.Add(sum(p * v for v, p in lst) <= teachers[t]["max_periods_per_week"])

    if with_obj:
        w = {"teacher_gap": 10, "group_balance": 1}
        w.update(cfg.get("weights") or {})
        terms = []
        # soft 1: teacher idle gaps between first and last class of a day
        for t in teachers:
            for d in DAYS:
                busy = {}
                for q in range(1, 9):
                    lits = occ_t.get((t, d, q))
                    if lits:
                        b = m.NewBoolVar(f"busy_{t}_{d}_{q}")
                        m.Add(b == sum(lits))
                        busy[q] = b
                if len(busy) < 2:
                    continue
                used = m.NewBoolVar(f"used_{t}_{d}")
                m.AddMaxEquality(used, list(busy.values()))
                first, last = m.NewIntVar(1, 8, f"f_{t}_{d}"), m.NewIntVar(1, 8, f"l_{t}_{d}")
                gap = m.NewIntVar(0, 7, f"gap_{t}_{d}")
                for q, b in busy.items():
                    m.Add(first <= q).OnlyEnforceIf(b)
                    m.Add(last >= q).OnlyEnforceIf(b)
                m.Add(gap >= last - first + 1 - sum(busy.values())).OnlyEnforceIf(used)
                terms.append(w["teacher_gap"] * gap)
        # soft 2: balance of each group's load across the 5 days (|5*load - total|)
        for g in groups:
            total = sum(off[o]["periods"] for o in off if off[o]["group_id"] == g)
            for d in DAYS:
                lst = g_day.get((g, d))
                if not lst:
                    continue
                dev = m.NewIntVar(0, 5 * 8, f"dev_{g}_{d}")
                diff = m.NewIntVar(-100, 100, f"diff_{g}_{d}")
                m.Add(diff == 5 * sum(p * v for v, p in lst) - total)
                m.AddAbsEquality(dev, diff)
                terms.append(w["group_balance"] * dev)
        if terms:
            m.Minimize(sum(terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit or cfg.get("timeLimitSec", 60))
    solver.parameters.num_workers = int(cfg.get("workers", 8))
    solver.parameters.random_seed = int(cfg.get("seed", 1))
    t0 = time.time()
    st = solver.Solve(m, Progress()) if report_progress else solver.Solve(m)
    name = solver.StatusName(st)
    res = {"status": name, "wall_time": round(time.time() - t0, 2), "assignments": []}
    if st in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if with_obj and m.HasObjective():
            res["objective"] = solver.ObjectiveValue()
            res["bound"] = solver.BestObjectiveBound()
        for oid, cl in cands.items():
            for i, (d, s, r) in enumerate(cl):
                if solver.Value(x[oid, i]):
                    res["assignments"].append({"offering_id": oid, "day": d, "start_period": s, "room_id": r})
        res["assignments"].sort(key=lambda a: a["offering_id"])
    return res


def diagnose(data, cfg):
    """When INFEASIBLE: drop one constraint family at a time to find which ones cause it."""
    culprits = []
    for fam in FAMILIES:
        r = solve(data, cfg, disabled=frozenset([fam]), with_obj=False, time_limit=10, report_progress=False)
        if r["status"] in ("OPTIMAL", "FEASIBLE"):
            culprits.append(fam)
    return culprits


def main():
    payload = json.load(sys.stdin)
    data, cfg = payload["data"], payload.get("config", {})
    res = solve(data, cfg)
    if res["status"] == "INFEASIBLE" and res.get("reason") != "no_candidates":
        res["culprit_constraints"] = diagnose(data, cfg)
    res["config"] = {k: cfg.get(k) for k in ("timeLimitSec", "seed", "workers", "weights")}
    json.dump(res, sys.stdout)


if __name__ == "__main__":
    main()
