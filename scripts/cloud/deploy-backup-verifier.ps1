[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$ProjectId = 'globalapps-northwind-crm',
  [string]$ApprovedAccount = 'nilhan.dev@gmail.com',
  [string]$Region = 'asia-southeast1'
)

$ErrorActionPreference = 'Stop'
$activeAccount = (gcloud auth list --filter=status:ACTIVE --format='value(account)').Trim().ToLowerInvariant()
if ($activeAccount -ne $ApprovedAccount.ToLowerInvariant()) {
  throw "Active gcloud account is not the approved identity $ApprovedAccount."
}
if (-not $PSCmdlet.ShouldProcess($ProjectId, 'Deploy private backup freshness verifier and scheduler')) { return }

$functionName = 'northwind-backup-freshness'
$schedulerIdentity = "northwind-backup-scheduler@$ProjectId.iam.gserviceaccount.com"
$verifierIdentity = "northwind-backup-verifier@$ProjectId.iam.gserviceaccount.com"
$bucket = "$ProjectId-firestore-backups"

gcloud functions deploy $functionName --gen2 --runtime=nodejs22 --region=$Region `
  --source='infra/functions/backup-verifier' --entry-point=verifyBackupFreshness --trigger-http `
  --no-allow-unauthenticated --service-account=$verifierIdentity --set-env-vars="BACKUP_BUCKET=$bucket" `
  --memory=256Mi --timeout=60s --max-instances=1 --project=$ProjectId --account=$ApprovedAccount --quiet
if ($LASTEXITCODE -ne 0) { throw 'Backup verifier deployment failed.' }

gcloud functions add-invoker-policy-binding $functionName --gen2 --region=$Region `
  --member="serviceAccount:$schedulerIdentity" --project=$ProjectId --account=$ApprovedAccount --quiet | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Backup verifier invoker grant failed.' }

$uri = (gcloud functions describe $functionName --gen2 --region=$Region --project=$ProjectId --format='value(serviceConfig.uri)').Trim()
gcloud scheduler jobs update http northwind-backup-freshness-check --location=$Region --project=$ProjectId `
  --account=$ApprovedAccount --schedule='0 4 * * *' --time-zone='Asia/Singapore' --uri=$uri `
  --http-method=GET --oidc-service-account-email=$schedulerIdentity --oidc-token-audience="$uri/" `
  --max-retry-attempts=3 --quiet
if ($LASTEXITCODE -ne 0) { throw 'Backup freshness scheduler update failed.' }

[ordered]@{ status = 'deployed'; project = $ProjectId; region = $Region; identity = $ApprovedAccount } | ConvertTo-Json
