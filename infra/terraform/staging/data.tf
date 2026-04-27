# RDS Aurora PostgreSQL 16
resource "aws_db_subnet_group" "main" {
  name       = "trustcrm-staging"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_rds_cluster" "main" {
  cluster_identifier     = "trustcrm-staging"
  engine                 = "aurora-postgresql"
  engine_version         = "16.1"
  database_name          = "trustcrm"
  master_username        = "trustcrm"
  master_password        = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  storage_encrypted      = true
}

resource "aws_rds_cluster_instance" "main" {
  count              = 1
  identifier         = "trustcrm-staging-${count.index}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.t3.medium"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
}

# ElastiCache Redis 7
resource "aws_elasticache_subnet_group" "main" {
  name       = "trustcrm-staging"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "trustcrm-staging"
  description                = "TrustCRM staging Redis"
  node_type                  = "cache.t3.micro"
  num_cache_clusters         = 1
  engine_version             = "7.0"
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}
