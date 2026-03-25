output "cloudfront_domain" {
  description = "CloudFront distribution domain"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "s3_bucket" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.frontend.id
}

output "api_gateway_url" {
  description = "NVE proxy API endpoint"
  value       = aws_apigatewayv2_api.nve_proxy.api_endpoint
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.nve_proxy.function_name
}
