# ── ECS Cluster ───────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled" # enable when you need CloudWatch metrics (adds cost)
  }

  tags = { Name = "${var.project}-cluster" }
}

# ── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project}"
  retention_in_days = 14

  tags = { Name = "${var.project}-logs" }
}

# ── Task Definition ───────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project}-app"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256  # 0.25 vCPU
  memory                   = 512  # 0.5 GB
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "${var.project}-app"
    image     = "${aws_ecr_repository.app.repository_url}:${var.ecr_image_tag}"
    essential = true

    portMappings = [{
      containerPort = var.app_port
      protocol      = "tcp"
    }]

    # Non-secret environment variables
    environment = [
      { name = "ENV_NAME",            value = "production" },
      { name = "PORT",                value = tostring(var.app_port) },
      { name = "AWS_REGION",          value = var.aws_region },
      { name = "AWS_BUCKET_NAME",     value = var.s3_bucket_name },
      { name = "MONGO_DB_NAME",       value = "winky" },
      { name = "REDIS_HOST",          value = aws_elasticache_cluster.redis.cache_nodes[0].address },
      { name = "REDIS_PORT",          value = tostring(aws_elasticache_cluster.redis.cache_nodes[0].port) },
      { name = "HEARTBEAT_INTERVAL",  value = "27000" },
      { name = "HEARTBEAT_TIMEOUT",   value = "40000" },
      { name = "UPGRADE_TIMEOUT",     value = "30000" },
    ]

    # Secrets injected from Secrets Manager at startup (no plaintext in task def)
    secrets = [
      { name = "SECRET",                                valueFrom = "${aws_secretsmanager_secret.app.arn}:SECRET::" },
      { name = "APP_SECRET",                            valueFrom = "${aws_secretsmanager_secret.app.arn}:APP_SECRET::" },
      { name = "APP_SECRET_REFRESH",                    valueFrom = "${aws_secretsmanager_secret.app.arn}:APP_SECRET_REFRESH::" },
      { name = "CLIENT_JWT_BASE_SECRET",                valueFrom = "${aws_secretsmanager_secret.app.arn}:CLIENT_JWT_BASE_SECRET::" },
      { name = "OTP_SIGNATURE_SECRET",                  valueFrom = "${aws_secretsmanager_secret.app.arn}:OTP_SIGNATURE_SECRET::" },
      { name = "OTP_CLIENT_KEY_CODE",                   valueFrom = "${aws_secretsmanager_secret.app.arn}:OTP_CLIENT_KEY_CODE::" },
      { name = "OTP_PHONE_HASH_SECRET",                 valueFrom = "${aws_secretsmanager_secret.app.arn}:OTP_PHONE_HASH_SECRET::" },
      { name = "OTP_GLOBAL_HOURLY_LIMIT",               valueFrom = "${aws_secretsmanager_secret.app.arn}:OTP_GLOBAL_HOURLY_LIMIT::" },
      { name = "PHONE_ENC_KEY_VERSION",                 valueFrom = "${aws_secretsmanager_secret.app.arn}:PHONE_ENC_KEY_VERSION::" },
      { name = "PHONE_ENC_KEY_1",                       valueFrom = "${aws_secretsmanager_secret.app.arn}:PHONE_ENC_KEY_1::" },
      { name = "CORS_ORIGIN",                           valueFrom = "${aws_secretsmanager_secret.app.arn}:CORS_ORIGIN::" },
      { name = "MONGO_HOST",                            valueFrom = "${aws_secretsmanager_secret.db.arn}:MONGO_HOST::" },
      { name = "TWILIO_ACCOUNT_SID",                    valueFrom = "${aws_secretsmanager_secret.twilio.arn}:TWILIO_ACCOUNT_SID::" },
      { name = "TWILIO_AUTH_TOKEN",                     valueFrom = "${aws_secretsmanager_secret.twilio.arn}:TWILIO_AUTH_TOKEN::" },
      { name = "TWILIO_API_KEY",                        valueFrom = "${aws_secretsmanager_secret.twilio.arn}:TWILIO_API_KEY::" },
      { name = "TWILIO_API_KEY_SECRET",                 valueFrom = "${aws_secretsmanager_secret.twilio.arn}:TWILIO_API_KEY_SECRET::" },
      { name = "TWILIO_APP_SID",                        valueFrom = "${aws_secretsmanager_secret.twilio.arn}:TWILIO_APP_SID::" },
      { name = "TWILIO_NOTIFICATION_SERVICE_SID",       valueFrom = "${aws_secretsmanager_secret.twilio.arn}:TWILIO_NOTIFICATION_SERVICE_SID::" },
      { name = "TWILIO_IOS_PUSH_CREDENTIAL_SID",        valueFrom = "${aws_secretsmanager_secret.twilio.arn}:TWILIO_IOS_PUSH_CREDENTIAL_SID::" },
      { name = "TWILIO_ANDROID_PUSH_CREDENTIAL_SID",    valueFrom = "${aws_secretsmanager_secret.twilio.arn}:TWILIO_ANDROID_PUSH_CREDENTIAL_SID::" },
      { name = "TWILIO_PHONE_NUMBER",                   valueFrom = "${aws_secretsmanager_secret.twilio.arn}:TWILIO_PHONE_NUMBER::" },
      { name = "GCM_SERVER_ID",                         valueFrom = "${aws_secretsmanager_secret.push.arn}:GCM_SERVER_ID::" },
      { name = "IOS_BUNDLE",                            valueFrom = "${aws_secretsmanager_secret.push.arn}:IOS_BUNDLE::" },
      { name = "IOS_KEY_TOKEN",                         valueFrom = "${aws_secretsmanager_secret.push.arn}:IOS_KEY_TOKEN::" },
      { name = "IOS_TEAM_ID",                           valueFrom = "${aws_secretsmanager_secret.push.arn}:IOS_TEAM_ID::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])

  tags = { Name = "${var.project}-task" }
}

# ── ECS Service ───────────────────────────────────────────────────────────────

resource "aws_ecs_service" "app" {
  name                               = "${var.project}-service"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.app.arn
  desired_count                      = 1
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  health_check_grace_period_seconds  = 60

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true # no NAT gateway needed
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "${var.project}-app"
    container_port   = var.app_port
  }

  depends_on = [
    aws_lb_listener.http,
    aws_iam_role_policy_attachment.ecs_execution_managed,
  ]

  tags = { Name = "${var.project}-service" }

  lifecycle {
    # Prevent Terraform from resetting the task count if you scale manually
    ignore_changes = [desired_count]
  }
}
