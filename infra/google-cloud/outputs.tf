output "project_id" { value = google_project.crm.project_id }
output "region" { value = local.region }
output "backup_bucket" { value = google_storage_bucket.firestore_backups.name }
output "runtime_service_account" { value = google_service_account.runtime.email }
output "nightly_export_job" { value = google_cloud_scheduler_job.nightly_export.name }
