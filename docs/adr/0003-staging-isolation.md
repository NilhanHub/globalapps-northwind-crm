# ADR 0003: Staging isolation

Status: accepted.

Staging uses a separate Firebase project and separate Hostinger application at `crm-staging.globalapps.world`. It contains deterministic fictitious data only. A commit must pass staging before the identical SHA is promoted to production. Production credentials and datasets are prohibited in staging.
