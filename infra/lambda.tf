# --- Lambda: NVE API proxy ---

data "archive_file" "nve_proxy" {
  type        = "zip"
  source_file = "${path.module}/lambda/nve_proxy.py"
  output_path = "${path.module}/.build/nve_proxy.zip"
}

resource "aws_iam_role" "lambda" {
  name = "${var.project_name}-nve-proxy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "nve_proxy" {
  function_name    = "${var.project_name}-nve-proxy"
  role             = aws_iam_role.lambda.arn
  handler          = "nve_proxy.lambda_handler"
  runtime          = "python3.11"
  timeout          = 30
  memory_size      = 128
  filename         = data.archive_file.nve_proxy.output_path
  source_code_hash = data.archive_file.nve_proxy.output_base64sha256
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "ApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.nve_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.nve_proxy.execution_arn}/*/*"
}
