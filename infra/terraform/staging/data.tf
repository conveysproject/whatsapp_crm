# RDS Aurora PostgreSQL 16
resource "aws_db_subnet_group" "main" {
  name       = "WBMSG-staging"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_rds_cluster" "main" {
  cluster_identifier     = "WBMSG-staging"
  engine                 = "aurora-postgresql"
  engine_version         = "16.1"
  database_name          = "WBMSG"
  master_username        = "WBMSG"
  master_password        = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = true
  storage_encrypted      = true
}

resource "aws_rds_cluster_instance" "main" {
  count              = 1
  identifier         = "WBMSG-staging-${count.index}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.t3.medium"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
}

# ElastiCache Redis 7
resource "aws_elasticache_subnet_group" "main" {
  name       = "WBMSG-staging"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "WBMSG-staging"
  description                = "WBMSG staging Redis"
  node_type                  = "cache.t3.micro"
  num_cache_clusters         = 1
  engine_version             = "7.0"
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}
