output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs (for ALB)"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (for ECS and ElastiCache)"
  value       = aws_subnet.private[*].id
}

output "sg_alb_id" {
  description = "Security group ID for the ALB"
  value       = aws_security_group.alb.id
}

output "sg_ecs_id" {
  description = "Security group ID for ECS tasks"
  value       = aws_security_group.ecs.id
}

output "sg_redis_id" {
  description = "Security group ID for ElastiCache Redis"
  value       = aws_security_group.redis.id
}

output "ecr_repository_url" {
  description = "ECR repository URL — use this to tag and push Docker images"
  value       = aws_ecr_repository.app.repository_url
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint — set as REDIS_HOST in ECS task"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].port
}

output "alb_dns_name" {
  description = "ALB DNS name - point your domain here or use directly for testing"
  value       = aws_lb.main.dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "secret_arns" {
  description = "Secrets Manager ARNs — referenced in ECS task definition"
  value = {
    app    = aws_secretsmanager_secret.app.arn
    db     = aws_secretsmanager_secret.db.arn
    twilio = aws_secretsmanager_secret.twilio.arn
    push   = aws_secretsmanager_secret.push.arn
    google = aws_secretsmanager_secret.google.arn
  }
}
