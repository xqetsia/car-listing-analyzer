#!/usr/bin/env python3
"""
Benchmark for car-listing-inspector's /api/analyze endpoint.

Measures:
  1. Sequential latency (mean/median/p95/min/max) over N requests.
  2. Concurrent latency under a burst of C simultaneous requests
     (this is what exposes the single-threaded dev-server bottleneck).

Usage:
  python benchmark.py --url http://127.0.0.1:5000/api/analyze --n 10 --concurrency 5
  python benchmark.py --out before.csv   # tag results for later comparison
"""
import argparse
import csv
import statistics
import time
from concurrent.futures import ThreadPoolExecutor

import requests

# Fixed test inputs so "before" and "after" runs hit the same workload.
# Text mode is used (not URL) so results aren't affected by the target
# site's own latency/availability.
SAMPLE_LISTINGS = [
    """2016 Honda Civic EX, 78,000 miles, clean title, $13,500.
    One owner, all maintenance records available, recent timing belt
    and brakes. No accidents. Selling because upgrading to an SUV.""",
    """2011 Ford F-150, 145,000 miles, salvage title, $6,000 OBO.
    Runs great!! Must sell today, cash only, no test drives. Some
    body damage from a 'minor' incident.""",
    """2019 Toyota Camry SE, 42,000 miles, clean title, $19,900.
    Dealer maintained, CarFax available on request, minor scratch on
    rear bumper, otherwise excellent condition.""",
]


def one_request(url, listing_text):
    payload = {"mode": "text", "value": listing_text}
    start = time.perf_counter()
    try:
        r = requests.post(url, json=payload, timeout=60)
        ok = r.status_code == 200
    except requests.RequestException:
        ok = False
    elapsed = time.perf_counter() - start
    return elapsed, ok


def summarize(label, latencies):
    latencies = sorted(latencies)
    print(f"\n--- {label} (n={len(latencies)}) ---")
    print(f"  mean:   {statistics.mean(latencies):.2f}s")
    print(f"  median: {statistics.median(latencies):.2f}s")
    print(f"  p95:    {latencies[int(len(latencies) * 0.95) - 1]:.2f}s")
    print(f"  min:    {min(latencies):.2f}s")
    print(f"  max:    {max(latencies):.2f}s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:5000/api/analyze")
    ap.add_argument("--n", type=int, default=9, help="total requests for sequential test")
    ap.add_argument("--concurrency", type=int, default=5, help="simultaneous requests for burst test")
    ap.add_argument("--out", default=None, help="CSV file to append raw results to")
    args = ap.parse_args()

    rows = []

    # 1. Sequential test — pure per-request latency, no contention.
    seq_latencies = []
    for i in range(args.n):
        listing = SAMPLE_LISTINGS[i % len(SAMPLE_LISTINGS)]
        elapsed, ok = one_request(args.url, listing)
        seq_latencies.append(elapsed)
        rows.append(("sequential", i, elapsed, ok))
        print(f"[sequential {i+1}/{args.n}] {elapsed:.2f}s ok={ok}")
    summarize("Sequential", seq_latencies)

    # 2. Concurrent burst test — reveals queuing from a single-threaded server.
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        listings = [SAMPLE_LISTINGS[i % len(SAMPLE_LISTINGS)] for i in range(args.concurrency)]
        t0 = time.perf_counter()
        results = list(pool.map(lambda l: one_request(args.url, l), listings))
        wall_clock = time.perf_counter() - t0
    burst_latencies = [r[0] for r in results]
    for i, (elapsed, ok) in enumerate(results):
        rows.append(("burst", i, elapsed, ok))
    summarize(f"Concurrent burst (c={args.concurrency})", burst_latencies)
    print(f"  wall clock for whole burst: {wall_clock:.2f}s "
          f"(ideal if fully parallel ≈ max single-request latency)")

    if args.out:
        with open(args.out, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["test_type", "index", "latency_s", "ok"])
            w.writerows(rows)
        print(f"\nRaw results written to {args.out}")


if __name__ == "__main__":
    main()