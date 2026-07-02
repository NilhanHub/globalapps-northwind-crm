[CmdletBinding()]
param(
  [string]$ProjectId = 'globalapps-northwind-crm',
  [string]$ApprovedAccount = 'nilhan.dev@gmail.com',
  [string]$BackupBucket = ''
)

$ErrorActionPreference = 'Stop'
$activeAccount = (gcloud auth list --filter=status:ACTIVE --format='value(account)').Trim().ToLowerInvariant()
if ($activeAccount -ne $ApprovedAccount.ToLowerInvariant()) {
  throw "Active gcloud account is not the approved identity $ApprovedAccount. No cloud checks were run."
}

$configuredProject = (gcloud config get-value project 2>$null).Trim()
if ($configuredProject -ne $ProjectId) {
  throw "Active gcloud project is '$configuredProject', expected '$ProjectId'."
}

if (-not $BackupBucket) { $BackupBucket = "$ProjectId-firestore-backups" }

$humanMembers = gcloud projects get-iam-policy $ProjectId --flatten='bindings[].members' --filter='bindings.members:user:*' --format='value(bindings.members)'
$unexpectedHumans = @($humanMembers | Where-Object { $_ -and $_.ToLowerInvariant() -ne "user:$($ApprovedAccount.ToLowerInvariant())" })
if ($unexpectedHumans.Count -gt 0) {
  throw 'Unexpected human IAM members exist. Review the project policy; this script will not print or remove them automatically.'
}

$backupJson = gcloud firestore backups list --project=$ProjectId --format=json | ConvertFrom-Json
$objectsJson = gcloud storage ls "gs://$BackupBucket/**" --json 2>$null | ConvertFrom-Json
$latestObject = @($objectsJson) | Sort-Object { [DateTime]$_.metadata.timeCreated } -Descending | Select-Object -First 1
$latestAgeHours = if ($latestObject) { ((Get-Date).ToUniversalTime() - ([DateTime]$latestObject.metadata.timeCreated).ToUniversalTime()).TotalHours } else { [double]::PositiveInfinity }

$result = [ordered]@{
  account = $ApprovedAccount
  project = $ProjectId
  unexpectedHumanIamMembers = 0
  managedBackupCount = @($backupJson).Count
  gcsExportPresent = [bool]$latestObject
  gcsLatestExportAgeHours = if ([double]::IsPositiveInfinity($latestAgeHours)) { $null } else { [math]::Round($latestAgeHours, 2) }
  status = if (@($backupJson).Count -gt 0 -and $latestAgeHours -le 30) { 'PASS' } else { 'FAIL' }
}
$result | ConvertTo-Json
if ($result.status -ne 'PASS') { exit 1 }
