import json
import os
import urllib.request

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 400

SYSTEM_PROMPT = """You are an alpine conditions analyst. Be extremely concise — each field must be 1 short sentence max (under 20 words).

Return a JSON object with exactly these 4 keys:
- "dataNotice": If no relevant field observations (relevance > 0.3) exist, say "No nearby field observations." Otherwise leave empty string.
- "windTransport": 1 short sentence on drift at this aspect/elevation.
- "surfaceConditions": 1 short sentence on likely snow surface.
- "stabilityConcerns": 1 short sentence on stability issues or "No data."

Prioritize high-relevance, high-competency observations. Be direct, no hedging.

Return ONLY raw JSON, no markdown."""


def build_user_message(body):
    point = body["point"]
    obs = body.get("observations", [])
    forecast = body.get("forecast")

    aspect_deg = round(point["aspect"] * 180 / 3.14159)
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    aspect_name = dirs[round(aspect_deg / 45) % 8]

    parts = [
        f"Terrain point: {point['lat']:.4f}N, {point['lng']:.4f}E, "
        f"{round(point['elevation'])}m elevation, {aspect_name}-facing ({aspect_deg} deg), "
        f"slope {round(point['slope'] * 180 / 3.14159)} deg"
    ]

    if forecast:
        parts.append(
            f"\nRegional forecast: Danger level {forecast['dangerLevel']} ({forecast['dangerLevelName']}). "
            f"Problems: {', '.join(forecast['avalancheProblems']) or 'None listed'}. "
            f"Weather: {forecast['mountainWeather'][:300]}"
        )
    else:
        parts.append("\nNo regional avalanche forecast available.")

    if obs:
        parts.append(f"\n{len(obs)} field observations (sorted by relevance):\n")
        for i, o in enumerate(obs[:25]):
            r = o["observation"]["registrations"]
            reg_parts = []
            if r.get("driftObs"):
                reg_parts.append(f"Drift: {r['driftObs']['driftCategory']}")
                if r["driftObs"].get("comment"):
                    reg_parts.append(f"({r['driftObs']['comment'][:100]})")
            if r.get("snowSurface"):
                reg_parts.append(f"Surface: {r['snowSurface']['surfaceType']}")
            if r.get("dangerSigns"):
                reg_parts.append(f"Danger signs: {', '.join(r['dangerSigns']['signs'][:5])}")
            if r.get("avalancheActivity"):
                reg_parts.append(f"Avalanche: {r['avalancheActivity']['type']}, trigger: {r['avalancheActivity']['trigger']}")

            parts.append(
                f"  {i+1}. relevance={o['relevance']:.2f}, "
                f"dist={o['distanceKm']:.1f}km, "
                f"elev_diff={o['elevationDiff']:.0f}m, "
                f"{o['hoursAgo']:.0f}h ago, "
                f"competency={o['observation']['competencyLevel']}/5"
                + (f" | {' | '.join(reg_parts)}" if reg_parts else " | (no snow registrations)")
            )
    else:
        parts.append("\nNo field observations available nearby.")

    return "\n".join(parts)


def lambda_handler(event, context):
    # Handle CORS preflight
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            "body": "",
        }

    try:
        body = json.loads(event.get("body", "{}"))

        # Basic validation
        if "point" not in body:
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing 'point' in request body"}),
            }

        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            return {
                "statusCode": 500,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"error": "API key not configured"}),
            }

        user_message = build_user_message(body)

        payload = json.dumps({
            "model": MODEL,
            "max_tokens": MAX_TOKENS,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_message}],
        }).encode("utf-8")

        req = urllib.request.Request(
            ANTHROPIC_API_URL,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
        )

        with urllib.request.urlopen(req, timeout=25) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        # Extract text from Claude response
        text = result["content"][0]["text"]

        # Strip markdown code fences if present
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

        # Try to parse as JSON; fall back to wrapping raw text
        try:
            summary = json.loads(cleaned)
        except json.JSONDecodeError:
            summary = {
                "dataNotice": "",
                "windTransport": text[:200],
                "surfaceConditions": "",
                "stabilityConcerns": "",
            }

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            "body": json.dumps(summary),
        }

    except Exception as e:
        return {
            "statusCode": 502,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
            "body": json.dumps({"error": str(e)}),
        }
