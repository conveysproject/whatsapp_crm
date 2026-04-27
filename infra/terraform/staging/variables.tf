variable "aws_region" {
  default = "ap-south-1"
}
variable "environment" {
  default = "staging"
}
variable "api_image_tag" {
  description = "Docker image tag to deploy for the API"
}
variable "db_password" {
  description = "RDS master password"
  sensitive   = true
}
