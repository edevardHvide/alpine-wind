import json
import os
import urllib.request

GITHUB_REPO = "edevardHvide/pow-predictor"


def _log(level, message, **extra):
    print(json.dumps({"level": level, "message": message, **extra}, default=str))


def lambda_handler(event, context):
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    }

    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Invalid JSON"})}

    title = body.get("title", "").strip()
    if not title:
        return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "Title is required"})}

    issue_body = body.get("body", "").strip()
    labels = body.get("labels", [])

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return {"statusCode": 500, "headers": headers, "body": json.dumps({"error": "Server misconfigured"})}

    gh_payload = json.dumps({"title": title, "body": issue_body, "labels": labels}).encode()
    req = urllib.request.Request(
        f"https://api.github.com/repos/{GITHUB_REPO}/issues",
        data=gh_payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "pow-predictor-feedback-lambda",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return {
                "statusCode": 201,
                "headers": headers,
                "body": json.dumps({"ok": True, "number": data.get("number")}),
            }
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        _log("error", "GitHub API error", status=e.code, response=err_body)
        return {
            "statusCode": 502,
            "headers": headers,
            "body": json.dumps({"error": f"GitHub API error ({e.code})"}),
        }
    except Exception as e:
        _log("error", "Request failed", error=str(e))
        return {
            "statusCode": 502,
            "headers": headers,
            "body": json.dumps({"error": str(e)[:200]}),
        }
