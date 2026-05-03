output "alb_dns_name" {
  description = "Staging API ALB DNS — point staging.WBMSG.com CNAME here"
  value       = aws_lb.api.dns_name
}
output "ecr_api_url" {
  description = "ECR repository URL for CI/CD"
  value       = aws_ecr_repository.api.repository_url
}
output "db_endpoint" {
  description = "RDS cluster endpoint"
  value       = aws_rds_cluster.main.endpoint
  sensitive   = true
}
output "redis_endpoint" {
  description = "ElastiCache primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}
output "s3_media_bucket" {
  value = aws_s3_bucket.media.bucket
}
