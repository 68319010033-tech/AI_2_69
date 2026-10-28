"""Shared helpers: candidate placement generation (used by CP-SAT and the baseline)."""
DAYS = ["MON", "TUE", "WED", "THU", "FRI"]
BLOCKS = [(1, 4), (5, 8)]  # morning, afternoon (lunch is between 4 and 5)


def build_candidates(data):
    """For every offering return all legal (day, start, room) placements.

    Filters applied here (hard constraints 05-08, 11): room type/capacity,
    single block (no lunch crossing), allowed timeslots, teacher/room blocks, fixed sessions.
    Returns (cands, reasons) where reasons explains offerings with no candidate.
    """
    groups = {g["group_id"]: g for g in data["groups"]}
    courses = {c["course_id"]: c for c in data["courses"]}
    rooms = data["rooms"]
    allowed = {(r["day"], r["period"]) for r in data["timeslots"]}
    tb = {(r["teacher_id"], r["day"], r["period"]) for r in data.get("teacher_blocks", [])}
    rb = {(r["room_id"], r["day"], r["period"]) for r in data.get("room_blocks", [])}
    fixed = {f["offering_id"]: f for f in data.get("fixed_sessions", [])}
    cands, reasons = {}, {}
    for off in data["offerings"]:
        oid, p = off["offering_id"], off["periods"]
        grp, course = groups[off["group_id"]], courses[off["course_id"]]
        ok_rooms = [r["room_id"] for r in rooms if r["room_type"] == course["room_type"] and r["capacity"] >= grp["size"]]
        lst = []
        why = []
        if not ok_rooms:
            why.append(f"no room of type {course['room_type']} with capacity >= {grp['size']}")
        starts = [s for lo, hi in BLOCKS for s in range(lo, hi - p + 2)]
        if not starts:
            why.append(f"{p} periods do not fit in one morning/afternoon block")
        for d in DAYS:
            for s in starts:
                per = range(s, s + p)
                if not all((d, q) in allowed for q in per):
                    continue
                if any((off["teacher_id"], d, q) in tb for q in per):
                    continue
                for r in ok_rooms:
                    if any((r, d, q) in rb for q in per):
                        continue
                    lst.append((d, s, r))
        if oid in fixed:
            f = fixed[oid]
            key = (f["day"], f["start_period"], f["room_id"])
            if key in lst:
                lst = [key]
            else:
                lst = []
                why.append(f"fixed session {key} violates room type/capacity/blocks/timeslots/lunch rule")
        if not lst and not why:
            why.append("every possible slot is blocked by timeslots / teacher_blocks / room_blocks")
        cands[oid] = lst
        if not lst:
            reasons[oid] = why
    return cands, reasons
