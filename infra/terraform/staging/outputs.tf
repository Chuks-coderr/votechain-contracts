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
# Outputs for the VoteChain staging environment. (#267)

output "vpc_id" {
  description = "ID of the staging VPC."
  value       = aws_vpc.staging.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets."
  value       = aws_subnet.private[*].id
}

output "alb_dns_name" {
  description = "DNS name of the staging Application Load Balancer."
  value       = aws_lb.staging.dns_name
}

output "alb_arn" {
  description = "ARN of the staging ALB."
  value       = aws_lb.staging.arn
}

output "backend_instance_id" {
  description = "EC2 instance ID of the staging backend."
  value       = aws_instance.backend.id
}

output "backend_private_ip" {
  description = "Private IP address of the staging backend instance."
  value       = aws_instance.backend.private_ip
}

output "staging_url" {
  description = "Base URL for the staging environment."
  value       = var.route53_zone_id != "" ? "http://${var.staging_domain}" : "http://${aws_lb.staging.dns_name}"
}
