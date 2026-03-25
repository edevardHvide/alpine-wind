# --- API Gateway v2 (HTTP API): NVE proxy ---

resource "aws_apigatewayv2_api" "nve_proxy" {
  name          = "${var.project_name}-nve-proxy"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["*"]
    allow_methods = ["GET"]
    allow_origins = ["*"]
  }
}

resource "aws_apigatewayv2_integration" "nve_proxy" {
  api_id                 = aws_apigatewayv2_api.nve_proxy.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.nve_proxy.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "nve_proxy" {
  api_id    = aws_apigatewayv2_api.nve_proxy.id
  route_key = "GET /api/nve/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.nve_proxy.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.nve_proxy.id
  name        = "$default"
  auto_deploy = true
}
