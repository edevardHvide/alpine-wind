#!/bin/bash
# Bootstrap: create the S3 bucket for OpenTofu state.
# Run once before `tofu init`. Requires tennis-bot (admin) profile.
set -euo pipefail

BUCKET="pow-predictor-tfstate"
REGION="eu-north-1"
PROFILE="tennis-bot"

echo "Creating tfstate bucket: $BUCKET"
aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --create-bucket-configuration LocationConstraint="$REGION"

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --profile "$PROFILE" \
  --versioning-configuration Status=Enabled

aws s3api put-public-access-block \
  --bucket "$BUCKET" \
  --profile "$PROFILE" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "Done. Now run: cd infra && tofu init"
