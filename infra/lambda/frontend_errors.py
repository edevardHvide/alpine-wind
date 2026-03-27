import json

# CORS is handled by API Gateway cors_configuration — no manual headers needed.

def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return {"statusCode": 400, "body": json.dumps({"error": "Invalid JSON"})}

    errors = body.get("errors", [])
    if not errors or not isinstance(errors, list):
        return {"statusCode": 400, "body": json.dumps({"error": "errors array required"})}

    # Write structured JSON to stdout → CloudWatch Logs
    for err in errors[:10]:  # Cap at 10 per batch
        print(json.dumps({
            "level": "ERROR",
            "type": err.get("type", "unknown"),
            "message": err.get("message", ""),
            "source": err.get("source", ""),
            "lineno": err.get("lineno"),
            "colno": err.get("colno"),
            "stack": err.get("stack", "")[:2000],
            "url": err.get("url", ""),
            "userAgent": err.get("userAgent", ""),
            "timestamp": err.get("timestamp", ""),
        }))

    return {"statusCode": 200, "body": json.dumps({"ok": True, "count": len(errors)})}
