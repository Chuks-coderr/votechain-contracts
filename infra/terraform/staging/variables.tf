# Copyright 2024 VoteChain Contributors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Input variables for the VoteChain staging environment. (#267)

# ── General ──────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region in which all resources are created."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment label applied to all resources."
  type        = string
  default     = "staging"
}

# ── Networking ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the staging VPC."
  type        = string
  default     = "10.10.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets (one per AZ)."
  type        = list(string)
  default     = ["10.10.1.0/24", "10.10.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (one per AZ)."
  type        = list(string)
  default     = ["10.10.11.0/24", "10.10.12.0/24"]
}

variable "availability_zones" {
  description = "Availability zones for subnet placement."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# ── Compute ───────────────────────────────────────────────────────────────────

variable "instance_type" {
  description = "EC2 instance type for the staging backend."
  type        = string
  default     = "t3.small"
}

variable "ami_id" {
  description = "AMI ID for the staging backend instance (Amazon Linux 2023)."
  type        = string
  # Override in terraform.tfvars or via TF_VAR_ami_id
  default     = "ami-0c02fb55956c7d316" # us-east-1 Amazon Linux 2023
}

variable "key_name" {
  description = "EC2 key pair name for SSH access to the staging instance."
  type        = string
  default     = "votechain-staging"
}

# ── DNS ───────────────────────────────────────────────────────────────────────

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for DNS records."
  type        = string
  default     = ""
}

variable "staging_domain" {
  description = "Fully-qualified domain name for the staging environment."
  type        = string
  default     = "staging.votechain.example.com"
}

# ── Backend service ───────────────────────────────────────────────────────────

variable "backend_port" {
  description = "Port the VoteChain backend listens on."
  type        = number
  default     = 3000
}

variable "health_check_path" {
  description = "HTTP path used by the ALB health check."
  type        = string
  default     = "/health"
}
