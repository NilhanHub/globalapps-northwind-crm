variable "project_id" {
  description = "Globally unique Google Cloud project ID."
  type        = string
  default     = "globalapps-northwind-crm"
}

variable "billing_account" {
  description = "Billing account ID owned by nilhan.dev@gmail.com."
  type        = string
  sensitive   = true
}

variable "owner_email" {
  description = "The only approved human cloud identity."
  type        = string
  default     = "nilhan.dev@gmail.com"
  validation {
    condition     = lower(var.owner_email) == "nilhan.dev@gmail.com"
    error_message = "No human identity other than nilhan.dev@gmail.com is approved."
  }
}

variable "monthly_budget_usd" {
  description = "Budget-alert amount; this is an alert, not a hard spending cap."
  type        = number
  default     = 10
}
