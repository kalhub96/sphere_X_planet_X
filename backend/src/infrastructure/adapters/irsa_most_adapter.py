import httpx
from datetime import datetime

class IRSAMostAdapter:
    def __init__(self, most_url: str = "https://irsa.ipac.caltech.edu/cgi-bin/MOST/nph-most", timeout: float = 10.0) -> None:
        self._url = most_url
        self._timeout = timeout
        self._cache: dict[str, dict] = {}

    async def check(self, ra: float, dec: float, epoch_mjd: float = 60000.0) -> dict:
        key = f"{ra:.4f}_{dec:.4f}_{round(epoch_mjd, 1)}"
        if key in self._cache:
            return self._cache[key]

        # Query IRSA MOST API
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                params = {
                    "catalog": "all",
                    "ra": f"{ra:.5f}",
                    "dec": f"{dec:.5f}",
                    "radius": "10.0",  # arcseconds
                    "mjd": f"{epoch_mjd:.4f}",
                    "output_mode": "JSON",
                }
                resp = await client.get(self._url, params=params)
                if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("application/json"):
                    data = resp.json()
                    matches = data.get("matches", []) or data.get("data", [])
                    if len(matches) > 0:
                        first = matches[0]
                        name = first.get("name") or first.get("designation") or "Known Asteroid"
                        obj_type = first.get("type", "Asteroid")
                        result = {"match": True, "object_name": name, "object_type": obj_type}
                        self._cache[key] = result
                        return result
        except Exception:
            pass

        result = {"match": False, "object_name": None, "object_type": None}
        self._cache[key] = result
        return result
