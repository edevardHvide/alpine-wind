import json
import math
import urllib.request
import re
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed


# MEPS Lambert Conformal Conic projection parameters
LAT0 = 63.3   # latitude_of_projection_origin
LON0 = 15.0   # longitude_of_central_meridian
LAT1 = 63.3   # standard_parallel
R = 6371000.0  # earth_radius
GRID_X0 = -1060084.0  # first x coordinate
GRID_Y0 = -1332517.9  # first y coordinate
GRID_DX = 2500.0       # grid spacing meters
GRID_NX = 949
GRID_NY = 1069

THREDDS_LATEST = "https://thredds.met.no/thredds/dodsC/mepslatest"
THREDDS_ARCHIVE = "https://thredds.met.no/thredds/dodsC/meps25epsarchive"


def latlon_to_lambert(lat, lon):
    """Convert WGS84 lat/lon to MEPS Lambert x,y in meters."""
    lat_r = math.radians(lat)
    lon_r = math.radians(lon)
    lat0_r = math.radians(LAT0)
    lon0_r = math.radians(LON0)
    lat1_r = math.radians(LAT1)

    n = math.sin(lat1_r)
    F = (math.cos(lat1_r) * math.tan(math.pi / 4 + lat1_r / 2) ** n) / n
    rho0 = R * F / math.tan(math.pi / 4 + lat0_r / 2) ** n
    rho = R * F / math.tan(math.pi / 4 + lat_r / 2) ** n

    x = rho * math.sin(n * (lon_r - lon0_r))
    y = rho0 - rho * math.cos(n * (lon_r - lon0_r))
    return x, y


def latlon_to_grid(lat, lon):
    """Convert lat/lon to nearest MEPS grid indices."""
    x, y = latlon_to_lambert(lat, lon)
    xi = round((x - GRID_X0) / GRID_DX)
    yi = round((y - GRID_Y0) / GRID_DX)
    xi = max(0, min(xi, GRID_NX - 1))
    yi = max(0, min(yi, GRID_NY - 1))
    return xi, yi


def find_latest_file():
    """Find the latest MEPS subset file on THREDDS."""
    now = datetime.now(timezone.utc)
    for hours_back in range(0, 24, 3):
        dt = now - timedelta(hours=hours_back)
        dt = dt.replace(hour=(dt.hour // 3) * 3, minute=0, second=0, microsecond=0)
        fname = f"meps_lagged_6_h_subset_2_5km_{dt.strftime('%Y%m%dT%H')}Z.ncml"
        url = f"{THREDDS_LATEST}/{fname}.dds"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "PowPredictor/1.0"})
            urllib.request.urlopen(req, timeout=5)
            return fname
        except Exception:
            continue
    return None


def fetch_opendap(base_url, fname, query):
    """Fetch ASCII data from OPeNDAP."""
    url = f"{base_url}/{fname}.ascii?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "PowPredictor/1.0"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8")


def parse_1d_values(text, varname):
    """Parse a 1D array from OPeNDAP ASCII response."""
    values = []
    lines = text.split("\n")
    capture = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if capture:
                break
            continue
        if f"{varname}.{varname}[" in stripped or (f"{varname}[" in stripped and "ARRAY" not in stripped and "Grid" not in stripped and "Float" not in stripped and "Int" not in stripped):
            capture = True
            continue
        if capture:
            for part in stripped.split(","):
                part = part.strip()
                if not part:
                    continue
                m = re.match(r"(?:\[\d+\])+,?\s*(.+)", part)
                if m:
                    part = m.group(1).strip()
                try:
                    values.append(float(part))
                except ValueError:
                    pass
    return values


def xy_to_speed_dir(x_vals, y_vals):
    """Convert x,y wind component arrays to speed,direction arrays."""
    speeds = []
    dirs = []
    for i in range(min(len(x_vals), len(y_vals))):
        spd = math.sqrt(x_vals[i] ** 2 + y_vals[i] ** 2)
        d = (270 - math.degrees(math.atan2(y_vals[i], x_vals[i]))) % 360
        speeds.append(round(spd, 2))
        dirs.append(round(d, 1))
    return speeds, dirs


def fetch_wind_latest(lat, lng, num_times=8):
    """Fetch forecast wind from mepslatest (has ensemble dimension)."""
    xi, yi = latlon_to_grid(lat, lng)
    fname = find_latest_file()
    if not fname:
        return None

    t_end = min(num_times - 1, 61)
    # Latest subset: dims [time][height2][ensemble_member][y][x], pressure[3]=850hPa
    q = (
        f"x_wind_10m[0:{t_end}][0][0][{yi}][{xi}],"
        f"y_wind_10m[0:{t_end}][0][0][{yi}][{xi}],"
        f"wind_speed_of_gust[0:{t_end}][0][0][{yi}][{xi}],"
        f"x_wind_pl[0:{t_end}][3][0][{yi}][{xi}],"
        f"y_wind_pl[0:{t_end}][3][0][{yi}][{xi}],"
        f"latitude[{yi}][{xi}],"
        f"longitude[{yi}][{xi}],"
        f"time[0:{t_end}]"
    )

    data = fetch_opendap(THREDDS_LATEST, fname, q)

    s10, d10 = xy_to_speed_dir(parse_1d_values(data, "x_wind_10m"),
                                parse_1d_values(data, "y_wind_10m"))
    s850, d850 = xy_to_speed_dir(parse_1d_values(data, "x_wind_pl"),
                                  parse_1d_values(data, "y_wind_pl"))
    gust = [round(v, 2) for v in parse_1d_values(data, "wind_speed_of_gust")]
    lat_val = parse_1d_values(data, "latitude")
    lon_val = parse_1d_values(data, "longitude")
    ts = [int(v * 1000) for v in parse_1d_values(data, "time")]

    return {
        "lat": lat_val[0] if lat_val else lat,
        "lng": lon_val[0] if lon_val else lng,
        "source": fname,
        "timestamps": ts,
        "windSpeed10m": s10,
        "windDir10m": d10,
        "windSpeed850hPa": s850,
        "windDir850hPa": d850,
        "windGust": gust,
    }


def fetch_archive_chunk(dt, xi, yi, num_steps=8):
    """Fetch num_steps hourly timesteps from one archive run.

    Archive files: meps_det_2_5km_YYYYMMDDTHHZ.nc
    Dims: [time][height7][y][x] for 10m, [time][pressure][y][x] for pl
    No ensemble dimension. pressure[10]=850hPa. 67 timesteps per run.
    """
    fname = f"{dt.strftime('%Y/%m/%d')}/meps_det_2_5km_{dt.strftime('%Y%m%dT%H')}Z.nc"
    t_end = min(num_steps - 1, 66)
    q = (
        f"x_wind_10m[0:{t_end}][0][{yi}][{xi}],"
        f"y_wind_10m[0:{t_end}][0][{yi}][{xi}],"
        f"wind_speed_of_gust[0:{t_end}][0][{yi}][{xi}],"
        f"x_wind_pl[0:{t_end}][10][{yi}][{xi}],"
        f"y_wind_pl[0:{t_end}][10][{yi}][{xi}],"
        f"time[0:{t_end}]"
    )

    try:
        data = fetch_opendap(THREDDS_ARCHIVE, fname, q)
    except Exception:
        return None

    s10, d10 = xy_to_speed_dir(parse_1d_values(data, "x_wind_10m"),
                                parse_1d_values(data, "y_wind_10m"))
    s850, d850 = xy_to_speed_dir(parse_1d_values(data, "x_wind_pl"),
                                  parse_1d_values(data, "y_wind_pl"))
    gust = [round(v, 2) for v in parse_1d_values(data, "wind_speed_of_gust")]
    ts = [int(v * 1000) for v in parse_1d_values(data, "time")]

    if not s10 or not s850:
        return None

    return {
        "timestamps": ts,
        "windSpeed10m": s10,
        "windDir10m": d10,
        "windSpeed850hPa": s850,
        "windDir850hPa": d850,
        "windGust": gust,
    }


def fetch_wind_historical(lat, lng, days_back=7):
    """Fetch historical wind at hourly resolution from archive runs.

    Strategy: pick two runs per day (00Z, 12Z), fetch first 12 hourly timesteps
    from each. For 7 days = 14 fetches (concurrent). Output is raw hourly data.
    """
    xi, yi = latlon_to_grid(lat, lng)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days_back)

    # Fetch lat/lon from a recent archive run
    lat_val, lon_val = lat, lng
    for d in range(0, 3):
        check_dt = now - timedelta(days=d)
        fname = f"{check_dt.strftime('%Y/%m/%d')}/meps_det_2_5km_{check_dt.strftime('%Y%m%d')}T12Z.nc"
        try:
            data = fetch_opendap(THREDDS_ARCHIVE, fname,
                                 f"latitude[{yi}][{xi}],longitude[{yi}][{xi}]")
            lv = parse_1d_values(data, "latitude")
            lnv = parse_1d_values(data, "longitude")
            if lv:
                lat_val = lv[0]
            if lnv:
                lon_val = lnv[0]
            break
        except Exception:
            continue

    # Build list of archive runs to fetch: 2 per day (00Z, 12Z), 12 timesteps each
    run_dts = []
    dt = start.replace(hour=0, minute=0, second=0, microsecond=0)
    while dt < now:
        for run_hour in (0, 12):
            run_dt = dt.replace(hour=run_hour)
            if run_dt < start - timedelta(hours=1) or run_dt > now:
                continue
            run_dts.append(run_dt)
        dt += timedelta(days=1)

    # Fetch all chunks concurrently
    all_ts = []
    all_s10 = []
    all_d10 = []
    all_s850 = []
    all_d850 = []
    all_gust = []

    with ThreadPoolExecutor(max_workers=7) as pool:
        futures = {
            pool.submit(fetch_archive_chunk, run_dt, xi, yi, 12): run_dt
            for run_dt in run_dts
        }
        for future in as_completed(futures):
            chunk = future.result()
            if chunk:
                all_ts.extend(chunk["timestamps"])
                all_s10.extend(chunk["windSpeed10m"])
                all_d10.extend(chunk["windDir10m"])
                all_s850.extend(chunk["windSpeed850hPa"])
                all_d850.extend(chunk["windDir850hPa"])
                all_gust.extend(chunk["windGust"])

    # Deduplicate by timestamp (overlapping runs), keep latest value
    seen = {}
    for i, ts in enumerate(all_ts):
        seen[ts] = i
    indices = sorted(seen.values(), key=lambda i: all_ts[i])

    # Output raw hourly data (no resampling)
    timestamps = [all_ts[i] for i in indices]
    wind_speed_10m = [all_s10[i] for i in indices]
    wind_dir_10m = [all_d10[i] for i in indices]
    wind_speed_850 = [all_s850[i] for i in indices]
    wind_dir_850 = [all_d850[i] for i in indices]
    wind_gust = [all_gust[i] for i in indices]

    return {
        "lat": lat_val,
        "lng": lon_val,
        "timestamps": timestamps,
        "windSpeed10m": wind_speed_10m,
        "windDir10m": wind_dir_10m,
        "windSpeed850hPa": wind_speed_850,
        "windDir850hPa": wind_dir_850,
        "windGust": wind_gust,
    }


def lambda_handler(event, context):
    qs = event.get("queryStringParameters") or {}

    try:
        mode = qs.get("mode", "full")  # "forecast" | "historical" | "full"
        days_back = int(qs.get("daysBack", "7"))
        num_times = int(qs.get("hours", "24"))

        if "points" in qs:
            pairs = qs["points"].split(";")
            points = []
            for pair in pairs:
                parts = pair.strip().split(",")
                points.append((float(parts[0]), float(parts[1])))
        elif "lat" in qs and "lng" in qs:
            points = [(float(qs["lat"]), float(qs["lng"]))]
        else:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "Provide lat+lng or points parameter"}),
            }

        results = []
        sources = set()

        for lat, lng in points:
            if mode == "forecast":
                r = fetch_wind_latest(lat, lng, num_times)
                if r:
                    sources.add(r.pop("source"))
                    results.append(r)

            elif mode == "historical":
                r = fetch_wind_historical(lat, lng, days_back)
                results.append(r)
                sources.add("meps_archive")

            elif mode == "full":
                # Historical + forecast merged into one timeline
                hist = fetch_wind_historical(lat, lng, days_back)
                fcast = fetch_wind_latest(lat, lng, num_times)

                if fcast:
                    sources.add(fcast.pop("source"))
                    # Append forecast timestamps after history ends
                    hist_end_ms = hist["timestamps"][-1] if hist["timestamps"] else 0
                    for i, ts in enumerate(fcast["timestamps"]):
                        if ts > hist_end_ms:
                            hist["timestamps"].append(ts)
                            hist["windSpeed10m"].append(fcast["windSpeed10m"][i])
                            hist["windDir10m"].append(fcast["windDir10m"][i])
                            hist["windSpeed850hPa"].append(fcast["windSpeed850hPa"][i])
                            hist["windDir850hPa"].append(fcast["windDir850hPa"][i])
                            hist["windGust"].append(fcast["windGust"][i])

                sources.add("meps_archive")
                results.append(hist)

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600",
            },
            "body": json.dumps({
                "sources": list(sources),
                "model": "MEPS 2.5km",
                "stations": results,
            }),
        }

    except Exception as e:
        import traceback
        return {
            "statusCode": 502,
            "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e), "trace": traceback.format_exc()}),
        }
