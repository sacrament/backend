# ── ALB ───────────────────────────────────────────────────────────────────────
# Accepts HTTPS (443), HTTP (80), and temp HTTP (8080, pre-cert) from anywhere.

resource "aws_security_group" "alb" {
  name        = "${var.project}-sg-alb"
  description = "Allow inbound HTTP/HTTPS from internet"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Temp HTTP pre-cert"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-alb" }
}

# ── ECS Tasks ────────────────────────────────────────────────────────────────
# Tasks run in public subnets (no NAT Gateway cost) with assign_public_ip=true.
# Inbound is still locked to the ALB only — the public IP is never directly reachable.

resource "aws_security_group" "ecs" {
  name        = "${var.project}-sg-ecs"
  description = "Allow inbound from ALB only - tasks run in public subnets"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "App port from ALB"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound (MongoDB Atlas, Twilio, S3, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-ecs" }
}

# ── ElastiCache Redis ─────────────────────────────────────────────────────────
# Only accepts connections from ECS tasks.

resource "aws_security_group" "redis" {
  name        = "${var.project}-sg-redis"
  description = "Allow Redis access from ECS only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg-redis" }
}
