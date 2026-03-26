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

# --- Lambda: Conditions Summary (Claude API) ---

data "archive_file" "conditions_summary" {
  type        = "zip"
  source_file = "${path.module}/lambda/conditions_summary.py"
  output_path = "${path.module}/.build/conditions_summary.zip"
}

resource "aws_lambda_function" "conditions_summary" {
  function_name    = "${var.project_name}-conditions-summary"
  role             = aws_iam_role.lambda.arn
  handler          = "conditions_summary.lambda_handler"
  runtime          = "python3.11"
  timeout          = 30
  memory_size      = 128
  filename         = data.archive_file.conditions_summary.output_path
  source_code_hash = data.archive_file.conditions_summary.output_base64sha256

  environment {
    variables = {
      ANTHROPIC_API_KEY = var.anthropic_api_key
    }
  }
}

resource "aws_lambda_permission" "conditions_summary_apigw" {
  statement_id  = "ApiGatewayInvokeConditionsSummary"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.conditions_summary.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.nve_proxy.execution_arn}/*/*"
}

# --- Lambda: Feedback (GitHub issue creation) ---

data "archive_file" "feedback" {
  type        = "zip"
  source_file = "${path.module}/lambda/feedback.py"
  output_path = "${path.module}/.build/feedback.zip"
}

resource "aws_lambda_function" "feedback" {
  function_name    = "${var.project_name}-feedback"
  role             = aws_iam_role.lambda.arn
  handler          = "feedback.lambda_handler"
  runtime          = "python3.11"
  timeout          = 15
  memory_size      = 128
  filename         = data.archive_file.feedback.output_path
  source_code_hash = data.archive_file.feedback.output_base64sha256

  environment {
    variables = {
      GITHUB_TOKEN = var.github_token
    }
  }
}

resource "aws_lambda_permission" "feedback_apigw" {
  statement_id  = "ApiGatewayInvokeFeedback"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.feedback.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.nve_proxy.execution_arn}/*/*"
}
