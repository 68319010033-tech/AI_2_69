"""Generate a synthetic dataset (9 groups, 18 teachers, 11 rooms, 63 offerings, 126 periods)
with deliberately dirty formatting, to test the pipeline. NOT the real competition data."""
import csv, os, random, sys
out = sys.argv[1] if len(sys.argv) > 1 else "sample_data"
os.makedirs(out, exist_ok=True)
rnd = random.Random(7)
def w(name, header, rows):
    with open(os.path.join(out, name + ".csv"), "w", encoding="utf-8-sig", newline="") as f:
        cw = csv.writer(f); cw.writerow(header); cw.writerows(rows)

groups = [(f"G{i:02d}", f"Group {i}", rnd.randint(20, 32), 6) for i in range(1, 10)]
teachers = [(f"T{i:02d}", f"Teacher {i}", 6, 20) for i in range(1, 19)]
rooms = [(f"R{i:02d}", f"Room {i}", t, c) for i, (t, c) in enumerate(
    [("GENERAL", 40)] * 6 + [("COMPUTER", 35)] * 3 + [("NETWORK", 30), ("MEDIA", 30)], 1)]
courses = [(f"C{i:02d}", f"Course {i}", t) for i, t in enumerate(
    ["GENERAL"] * 6 + ["COMPUTER"] * 3 + ["NETWORK", "MEDIA"], 1)]
pattern = [3, 2, 2, 2, 2, 2, 1]  # 14 periods per group -> 126 total
offerings, k, tcount = [], 1, 0
for gi, g in enumerate(groups):
    for j, p in enumerate(pattern):
        c = courses[(gi + j * 2) % len(courses)]
        offerings.append((f"O{k:03d}", g[0], c[0], teachers[tcount % 18][0], p)); k += 1; tcount += 1
timeslots = [(d, p) for d in ["MON", "TUE", "WED", "THU", "FRI"] for p in range(1, 9)]
fixed = [("O001", "MON", 1, "R01"), ("O010", "TUE", 5, "R02")]
off = {o[0]: o for o in offerings}
for oid, d, s, r in fixed:  # make sure fixed rows are sensible for the sample
    assert off[oid][4] in (2, 3)
tblocks = [(teachers[i][0], d, p) for i, d, p in [(0, "WED", 1), (3, "FRI", 8), (5, "MON", 4), (8, "THU", 5), (11, "TUE", 2), (14, "WED", 7)]]
rblocks = [("R03", "FRI", 5), ("R03", "FRI", 6), ("R07", "MON", 1)]
shared = [("G01", "G02"), ("G03", "G04"), ("G05", "G06"), ("G07", "G08")]

# ---- write clean copies with intentional dirt ----
w("groups", ["group_id", "group_name", "size", "max_periods_per_day"], [(g[0].lower() if i == 2 else g[0], g[1], f" {g[2]} " if i == 1 else g[2], "06" if i == 4 else g[3]) for i, g in enumerate(groups)])
w("teachers", ["teacher_id", "teacher_name", "max_periods_per_day", "max_periods_per_week"], teachers)
rows = [(r[0], r[1], {"GENERAL": "GEN", "COMPUTER": "COM", "NETWORK": "NET", "MEDIA": "MED"}[r[2]] if i % 3 == 0 else r[2], r[3]) for i, r in enumerate(rooms)]
w("rooms", ["room_id", "room_name", "room_type", "capacity"], rows)
w("courses", ["course_id", "course_name", "room_type"], courses)
orows = [(" " + o[0].lower() + " " if i == 5 else o[0], *o[1:]) for i, o in enumerate(offerings)]
orows.append(orows[10])  # exact duplicate
w("offerings", ["offering_id", "group_id", "course_id", "teacher_id", "periods"], orows)
w("timeslots", ["day", "period"], timeslots)
w("teacher_blocks", ["teacher_id", "day", "period"], tblocks)
w("room_blocks", ["room_id", "day", "period"], rblocks)
w("fixed_sessions", ["offering_id", "day", "start_period", "room_id"], fixed)
w("shared_students", ["group_a", "group_b"], shared)
print("written", out, "offerings", len(offerings), "periods", sum(o[4] for o in offerings))
