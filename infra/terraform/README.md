# TrustCRM Infrastructure (Terraform)

AWS staging environment provisioned via Terraform.

## Resources

- VPC with public/private subnets across 2 AZs
- ECS Fargate cluster (API service)
- RDS PostgreSQL 16 (Aurora Serverless v2 in production)
- ElastiCache Redis 7
- S3 bucket for media/exports
- Application Load Balancer (HTTPS)

## Setup

1. Install [Terraform CLI](https://developer.hashicorp.com/terraform/install) >= 1.8
2. Configure AWS credentials: `aws configure`
3. Initialize: `terraform init`
4. Plan: `terraform plan -var-file=staging.tfvars`
5. Apply: `terraform apply -var-file=staging.tfvars`

> **Note:** Terraform state is stored in S3 backend. Backend config in `backend.tf` (not committed). Get the config from 1Password vault: "TrustCRM Infra".

## Environments

| Environment | Branch  | AWS Account      |
|-------------|---------|------------------|
| Staging     | develop | trustcrm-staging |
| Production  | main    | trustcrm-prod    |
