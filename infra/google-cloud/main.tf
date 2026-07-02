locals {
  region        = "asia-southeast1"
  backup_bucket = "${var.project_id}-firestore-backups"
  services = toset([
    "billingbudgets.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudfunctions.googleapis.com",
    "datastore.googleapis.com",
    "firebase.googleapis.com",
    "firestore.googleapis.com",
    "iam.googleapis.com",
    "logging.googleapis.com",
    "run.googleapis.com",
    "serviceusage.googleapis.com",
    "storage.googleapis.com"
  ])
}

resource "google_project" "crm" {
  name                = "GlobalApps Northwind CRM"
  project_id          = var.project_id
  billing_account     = var.billing_account
  auto_create_network = false
  deletion_policy     = "PREVENT"
}

resource "google_project_service" "apis" {
  for_each           = local.services
  project            = google_project.crm.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_firebase_project" "crm" {
  provider   = google-beta
  project    = google_project.crm.project_id
  depends_on = [google_project_service.apis]
}

resource "google_firestore_database" "crm" {
  project                           = google_project.crm.project_id
  name                              = "(default)"
  location_id                       = local.region
  type                              = "FIRESTORE_NATIVE"
  database_edition                  = "STANDARD"
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"
  deletion_policy                   = "ABANDON"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
  depends_on                        = [google_firebase_project.crm]
}

resource "google_firestore_backup_schedule" "daily" {
  project  = google_project.crm.project_id
  database = google_firestore_database.crm.name
  retention = "1209600s"
  daily_recurrence {}
}

resource "google_firestore_backup_schedule" "weekly" {
  project  = google_project.crm.project_id
  database = google_firestore_database.crm.name
  retention = "8467200s"
  weekly_recurrence {
    day = "SUNDAY"
  }
}

resource "google_storage_bucket" "firestore_backups" {
  project                     = google_project.crm.project_id
  name                        = local.backup_bucket
  location                    = upper(local.region)
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  lifecycle_rule {
    condition { age = 90 }
    action { type = "Delete" }
  }
}

resource "google_service_account" "runtime" {
  project      = google_project.crm.project_id
  account_id   = "northwind-hostinger-runtime"
  display_name = "Northwind Hostinger runtime"
}

resource "google_project_iam_member" "runtime_firestore" {
  project = google_project.crm.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_service_account" "backup_scheduler" {
  project      = google_project.crm.project_id
  account_id   = "northwind-backup-scheduler"
  display_name = "Northwind Firestore export scheduler"
}

resource "google_project_iam_member" "backup_export" {
  project = google_project.crm.project_id
  role    = "roles/datastore.importExportAdmin"
  member  = "serviceAccount:${google_service_account.backup_scheduler.email}"
}

resource "google_project_service_identity" "firestore" {
  provider   = google-beta
  project    = google_project.crm.project_id
  service    = "firestore.googleapis.com"
  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "firestore_export_storage" {
  bucket = google_storage_bucket.firestore_backups.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_project_service_identity.firestore.email}"
}

resource "google_service_account" "backup_verifier" {
  project      = google_project.crm.project_id
  account_id   = "northwind-backup-verifier"
  display_name = "Northwind backup freshness verifier"
}

resource "google_storage_bucket_iam_member" "backup_verifier_read" {
  bucket = google_storage_bucket.firestore_backups.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.backup_verifier.email}"
}

resource "google_cloud_scheduler_job" "nightly_export" {
  project     = google_project.crm.project_id
  region      = local.region
  name        = "northwind-nightly-firestore-export"
  description = "Nightly native Firestore export to the private 90-day backup bucket"
  schedule    = "0 2 * * *"
  time_zone   = "Asia/Singapore"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "30s"
    max_backoff_duration = "300s"
  }

  http_target {
    http_method = "POST"
    uri         = "https://firestore.googleapis.com/v1/projects/${google_project.crm.project_id}/databases/(default):exportDocuments"
    body        = base64encode(jsonencode({ outputUriPrefix = "gs://${google_storage_bucket.firestore_backups.name}" }))
    headers     = { "Content-Type" = "application/json" }
    oauth_token {
      service_account_email = google_service_account.backup_scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [google_project_iam_member.backup_export, google_storage_bucket_iam_member.firestore_export_storage]
}

resource "google_project_iam_member" "sole_human_owner" {
  project = google_project.crm.project_id
  role    = "roles/owner"
  member  = "user:${lower(var.owner_email)}"
}

resource "google_billing_budget" "crm" {
  billing_account = var.billing_account
  display_name    = "Northwind CRM monthly budget alert"
  budget_filter {
    projects = ["projects/${google_project.crm.number}"]
  }
  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_usd)
    }
  }
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
  threshold_rules { threshold_percent = 1.0 }
}
