# ── WAF Web ACL (regional — attached to ALB) ──────────────────────────────────
#
# Uses AWS Managed Rule Groups for baseline protection.
# An explicit ALLOW rule for /api/generic/newToken runs first so the
# AWSManagedRulesCommonRuleSet keyword block on "token" in URL paths
# never fires for that endpoint.

resource "aws_wafv2_web_acl" "main" {
  name        = "${var.project}-waf"
  description = "WAF for ${var.project} ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # ── Rule 1: explicitly allow /api/generic/newToken ──────────────────────────
  # Priority 0 — evaluated before all managed rules so it short-circuits any
  # keyword-based block on "token" in the URI path.
  rule {
    name     = "AllowGenericNewToken"
    priority = 0

    action {
      allow {}
    }

    statement {
      byte_match_statement {
        search_string         = "/api/generic/newToken"
        positional_constraint = "STARTS_WITH"

        field_to_match {
          uri_path {}
        }

        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AllowGenericNewToken"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 2: AWS Managed Common Rule Set ─────────────────────────────────────
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 3: AWS Known Bad Inputs ─────────────────────────────────────────────
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesKnownBadInputsRuleSet"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project}-waf"
    sampled_requests_enabled   = true
  }

  tags = { Name = "${var.project}-waf" }
}

# ── Associate WAF with the ALB ────────────────────────────────────────────────

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}
