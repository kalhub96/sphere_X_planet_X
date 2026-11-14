import asyncio
import time
import sys
import os
from httpx import AsyncClient, ASGITransport

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from main import app

BENCHMARKS = [
    {"name": "Barnard's Star", "ra": 269.4521, "dec": 4.6934, "fov": 0.08, "array": "D1"},
    {"name": "Epsilon Indi B", "ra": 331.0438, "dec": -56.7828, "fov": 0.15, "array": "D2"},
    {"name": "WISE 0855", "ra": 133.7951, "dec": -7.2451, "fov": 0.08, "array": "D6"},
    {"name": "RW Aurigae", "ra": 76.9564, "dec": 30.4014, "fov": 0.05, "array": "D2"},
    {"name": "R Draconis", "ra": 248.1633, "dec": 66.7539, "fov": 0.05, "array": "D3"},
]

async def prewarm():
    print("==================================================")
    print("PRE-WARMING SKYTRACE CACHE FOR 5 BENCHMARK TARGETS")
    print("==================================================")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for t in BENCHMARKS:
            name = t["name"]
            ra, dec, fov, arr = t["ra"], t["dec"], t["fov"], t["array"]
            t0 = time.perf_counter()

            # Pre-warm observations
            await client.get(f"/api/v1/observations?ra={ra}&dec={dec}&radius={fov/2.0}&array={arr}")
            # Pre-warm flipbook (epochs)
            await client.get(f"/api/v1/epochs?ra={ra}&dec={dec}&fov={fov}&array={arr}&stretch=asinh")
            # Pre-warm SED
            await client.get(f"/api/v1/candidates/bench_{name.replace(' ', '_')}/sed")

            # Check cached latency
            t1 = time.perf_counter()
            resp = await client.get(f"/api/v1/epochs?ra={ra}&dec={dec}&fov={fov}&array={arr}&stretch=asinh")
            cached_latency_ms = (time.perf_counter() - t1) * 1000

            print(f"✓ {name:<18}: Pre-warmed | Cached Latency: {cached_latency_ms:.1f} ms (Status: {resp.status_code})")

    print("\n🚀 CACHE PRE-WARMING COMPLETE! Live demo queries will return in < 100ms.")

if __name__ == "__main__":
    asyncio.run(prewarm())
