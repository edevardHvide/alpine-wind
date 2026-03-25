variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-north-1"
}

variable "aws_profile" {
  description = "AWS CLI profile (needs admin-level access for infra changes)"
  type        = string
  default     = "tennis-bot"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "pow-predictor"
}

variable "s3_bucket_name" {
  description = "S3 bucket for frontend assets"
  type        = string
  default     = "pow-predictor-frontend"
}
