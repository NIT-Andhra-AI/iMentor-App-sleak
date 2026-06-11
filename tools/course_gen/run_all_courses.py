#!/usr/bin/env python3
"""
Run all course generation sequentially.
Uses gemini-2.5-pro as primary model, falls back to gemini-2.5-flash / gemini-2.0-flash.

Usage:
  python tools/course_gen/run_all_courses.py
  python tools/course_gen/run_all_courses.py --skip dsa-placement
  python tools/course_gen/run_all_courses.py --start-from artificial-intelligence
  python tools/course_gen/run_all_courses.py --overwrite --start-from machine-learning
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent.resolve()

# Order: new courses first (most valuable), then enhancements
ALL_COURSE_IDS = [
    "dsa-placement",
    "artificial-intelligence",
    "deep-learning",
    "software-engineering",
    "quantum-computing",
    "vlsi-design",
    "robotics",
    "machine-learning",
    "data-structures",
    "algorithms",
]

# Pause between courses to let API capacity recover (seconds)
INTER_COURSE_PAUSE = 120


def main():
    parser = argparse.ArgumentParser(
        description="Run all course generation sequentially with smart model balancing.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Model strategy (handled inside gemini_build_courses.py):
  1. gemini-2.5-pro   — tried first (highest quality)
  2. gemini-2.5-flash — fallback if pro hits 429
  3. gemini-2.0-flash — last resort if both 2.5 models are exhausted
  Each model retried up to 2x with back-off before cascading.
        """,
    )
    parser.add_argument("--skip", nargs="+", default=[], metavar="COURSE_ID",
                        help="Course IDs to skip (already done or in progress)")
    parser.add_argument("--overwrite", action="store_true",
                        help="Overwrite existing pages (for enhancements)")
    parser.add_argument("--start-from", metavar="COURSE_ID",
                        help="Start from this course ID (skip all before it)")
    parser.add_argument("--pause", type=int, default=INTER_COURSE_PAUSE,
                        help=f"Seconds to pause between courses (default: {INTER_COURSE_PAUSE})")
    args = parser.parse_args()

    skip = set(args.skip)

    course_ids = list(ALL_COURSE_IDS)
    if args.start_from:
        try:
            idx = course_ids.index(args.start_from)
            course_ids = course_ids[idx:]
        except ValueError:
            print(f"ERROR: Unknown course id: {args.start_from}")
            sys.exit(1)

    script = REPO_ROOT / "tools" / "course_gen" / "gemini_build_courses.py"

    print(f"\n{'='*64}")
    print(f"  Student AI — Course Generation Pipeline")
    print(f"  Models: gemini-2.5-pro → gemini-2.5-flash → gemini-2.0-flash")
    print(f"  Courses to run: {len([c for c in course_ids if c not in skip])}")
    print(f"  Inter-course pause: {args.pause}s")
    print(f"{'='*64}\n")

    results = {}
    for i, course_id in enumerate(course_ids):
        if course_id in skip:
            print(f"\n⏭️  Skipping: {course_id}")
            results[course_id] = "skipped"
            continue

        print(f"\n{'='*64}")
        print(f"▶  [{i+1}/{len(course_ids)}] Starting: {course_id}")
        print(f"{'='*64}")

        cmd = [sys.executable, str(script), "--course-id", course_id]
        if args.overwrite and course_id in ("machine-learning", "data-structures", "algorithms"):
            cmd.append("--overwrite")

        t0 = time.time()
        try:
            result = subprocess.run(cmd, timeout=3600)  # 1hr max per course
            elapsed = int(time.time() - t0)
            if result.returncode == 0:
                results[course_id] = f"✅ done ({elapsed}s)"
            else:
                results[course_id] = f"⚠️  rc={result.returncode} ({elapsed}s)"
        except subprocess.TimeoutExpired:
            elapsed = int(time.time() - t0)
            results[course_id] = f"⏰ timeout ({elapsed}s)"

        # Inter-course pause so API capacity can recover
        remaining = [c for c in course_ids if c not in skip and c != course_id]
        remaining_idx = course_ids.index(course_id)
        if remaining_idx < len(course_ids) - 1:
            pause = args.pause
            print(f"\n⏸  Pausing {pause}s before next course (API capacity recovery) …")
            time.sleep(pause)

    print(f"\n{'='*64}")
    print("FINAL RESULTS:")
    for cid, status in results.items():
        print(f"  {status:35s}  {cid}")
    print(f"{'='*64}")


if __name__ == "__main__":
    main()
