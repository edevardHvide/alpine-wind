terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket  = "pow-predictor-tfstate"
    key     = "infra/terraform.tfstate"
    region  = "eu-north-1"
    profile = "tennis-bot"
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}
