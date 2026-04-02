# ── Secrets Manager ───────────────────────────────────────────────────────────
#
# Secrets are created with placeholder values here.
# Populate the real values after apply:
#
#   aws secretsmanager put-secret-value \
#     --secret-id winky/production/app \
#     --secret-string '{"APP_SECRET":"...","APP_SECRET_REFRESH":"...",...}'
#
# ECS task definitions (Phase 3) will reference these ARNs as environment variables.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  secret_prefix = "${var.project}/${var.environment}"
}

# ── Core app secrets ──────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.secret_prefix}/app"
  description             = "Core application secrets for ${var.project}"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    SECRET                  = "REPLACE_ME"
    APP_SECRET              = "REPLACE_ME"
    APP_SECRET_REFRESH      = "REPLACE_ME"
    CLIENT_JWT_BASE_SECRET  = "REPLACE_ME"
    OTP_SIGNATURE_SECRET    = "REPLACE_ME"
    OTP_CLIENT_KEY_CODE     = "REPLACE_ME"
    OTP_PHONE_HASH_SECRET   = "REPLACE_ME"
    PHONE_ENC_KEY_VERSION   = "1"
    PHONE_ENC_KEY_1         = "REPLACE_ME"
    CORS_ORIGIN             = "REPLACE_ME"
  })

  lifecycle {
    # Prevent Terraform from overwriting values you've updated manually in the console.
    ignore_changes = [secret_string]
  }
}

# ── Database ──────────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "db" {
  name                    = "${local.secret_prefix}/db"
  description             = "MongoDB Atlas connection string"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    MONGO_HOST = "REPLACE_ME"  # e.g. mongodb+srv://user:pass@cluster.mongodb.net/winky
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ── Twilio ────────────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "twilio" {
  name                    = "${local.secret_prefix}/twilio"
  description             = "Twilio credentials for SMS and voice"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "twilio" {
  secret_id = aws_secretsmanager_secret.twilio.id
  secret_string = jsonencode({
    TWILIO_ACCOUNT_SID                  = "REPLACE_ME"
    TWILIO_AUTH_TOKEN                   = "REPLACE_ME"
    TWILIO_API_KEY                      = "REPLACE_ME"
    TWILIO_API_KEY_SECRET               = "REPLACE_ME"
    TWILIO_APP_SID                      = "REPLACE_ME"
    TWILIO_NOTIFICATION_SERVICE_SID     = "REPLACE_ME"
    TWILIO_IOS_PUSH_CREDENTIAL_SID      = "REPLACE_ME"
    TWILIO_ANDROID_PUSH_CREDENTIAL_SID  = "REPLACE_ME"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ── Push Notifications ────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "push" {
  name                    = "${local.secret_prefix}/push"
  description             = "iOS (APN) and Android (GCM) push notification credentials"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "push" {
  secret_id = aws_secretsmanager_secret.push.id
  secret_string = jsonencode({
    GCM_SERVER_ID  = "REPLACE_ME"
    IOS_BUNDLE     = "REPLACE_ME"
    IOS_KEY_TOKEN  = "REPLACE_ME"
    IOS_TEAM_ID    = "REPLACE_ME"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ── Google OAuth ──────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "google" {
  name                    = "${local.secret_prefix}/google"
  description             = "Google OAuth client ID"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "google" {
  secret_id = aws_secretsmanager_secret.google.id
  secret_string = jsonencode({
    GOOGLE_CLIENT_ID = "REPLACE_ME"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
