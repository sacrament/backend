# ── Subnet Group ─────────────────────────────────────────────────────────────
# ElastiCache must live in private subnets.

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project}-redis-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${var.project}-redis-subnet-group" }
}

# ── Redis Cluster ─────────────────────────────────────────────────────────────
# Single-node Redis 7 for the Socket.IO adapter and session cache.
# Upgrade to a replication group with multi-AZ when you need HA.

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "${var.project}-redis"
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
  parameter_group_name = "default.redis7"

  # Automatic minor version upgrades during maintenance window
  auto_minor_version_upgrade = true
  maintenance_window         = "sun:05:00-sun:06:00"
  snapshot_window            = "04:00-05:00"
  snapshot_retention_limit   = 3

  tags = { Name = "${var.project}-redis" }
}
