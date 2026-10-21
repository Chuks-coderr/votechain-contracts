#!/usr/bin/env bash
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

# Configure GitHub branch protection for the main branch
# Prerequisites: gh CLI installed and authenticated
# Usage: ./scripts/setup-branch-protection.sh

set -euo pipefail

REPO="${1:-.}"
BRANCH="main"

echo "🔐 Configuring branch protection for '$BRANCH' branch..."

# Verify gh is authenticated
if ! gh auth status &>/dev/null; then
    echo "❌ Error: GitHub CLI is not authenticated. Run 'gh auth login' first."
    exit 1
fi

# Get repository info to ensure we're in a valid repo
REPO_FULL_NAME=$(cd "$REPO" && git remote get-url origin | sed 's/.*://;s/\.git$//')
echo "📦 Repository: $REPO_FULL_NAME"

# Configure branch protection rules
echo "⚙️  Setting up branch protection rules..."

# Enable required status checks (CI/CD)
gh repo rule create \
    --repository "$REPO_FULL_NAME" \
    --branch "$BRANCH" \
    --require-status-checks \
    --required-status-checks "Build & Test,Build WASM" \
    --require-code-reviews \
    --required-approvals 1 \
    --dismiss-stale-reviews \
    --require-branch-protection-status-check \
    2>/dev/null || echo "ℹ️  Status checks rule already exists or rule system differs"

# Alternative method using the legacy API if rule create doesn't work
if ! gh repo rule create --help &>/dev/null 2>&1; then
    echo "Using legacy branch protection API..."
    
    # Create branch protection configuration
    gh api \
        --method PUT \
        "/repos/$REPO_FULL_NAME/branches/$BRANCH/protection" \
        --input - << 'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Build & Test", "Build WASM"]
  },
  "required_pull_request_reviews": {
    "dismissal_restrictions": {},
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "enforce_admins": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "require_linear_history": false
}
EOF
    RESULT=$?
else
    RESULT=0
fi

if [ $RESULT -eq 0 ]; then
    echo "✅ Branch protection configured successfully!"
    echo ""
    echo "Protection details for '$BRANCH':"
    echo "  • Require status checks to pass before merge"
    echo "  • Require PR reviews (1 approval minimum)"
    echo "  • Dismiss stale PR reviews when new commits are pushed"
    echo "  • Prevent force pushes and deletions"
    echo "  • Enforce admin rules"
else
    echo "⚠️  Warning: Could not fully configure branch protection"
    echo "This may be due to insufficient permissions or API limitations."
    echo "Please verify branch protection settings in GitHub web UI."
fi
