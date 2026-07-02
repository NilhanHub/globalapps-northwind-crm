# Google Cloud infrastructure

This Terraform creates the dedicated Singapore Firebase/Google Cloud project, Firestore database, managed backup schedules, private 90-day export bucket, nightly export scheduler, budget alerts and least-privileged runtime/backup service accounts.

Use Terraform only while `gcloud` is authenticated as `nilhan.dev@gmail.com`. Supply the billing account through an untracked variable or environment value; never commit it.

```powershell
terraform -chdir=infra/google-cloud init
terraform -chdir=infra/google-cloud plan -var="billing_account=<billing-account-id>"
terraform -chdir=infra/google-cloud apply -var="billing_account=<billing-account-id>"
```

If the preferred project ID is unavailable, pass a globally unique suffix and use that exact ID in Hostinger.

Terraform deliberately does not create or store the Hostinger runtime private key because keys written into Terraform state are difficult to contain safely. Create and rotate that key as a separate controlled deployment step.

After the first managed backup and nightly export exist, run `scripts/cloud/verify-cloud-state.ps1`. The verifier refuses another human account and fails for unexpected human IAM, missing managed backups or a GCS export older than 30 hours.

Deploy or update the private scheduled freshness function with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/cloud/deploy-backup-verifier.ps1 -Confirm
```

Its OIDC audience intentionally includes the trailing slash used by Cloud Run; changing that value causes authenticated Scheduler requests to receive `403`.
