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

# Setup script for CD pipeline deployment environment
# This script helps configure GitHub secrets and deployment credentials
# Usage: ./scripts/setup-deployment-env.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 VoteChain Deployment Environment Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v stellar &> /dev/null; then
    echo -e "${YELLOW}ℹ️  Stellar CLI not installed. Installing...${NC}"
    cargo install --locked stellar-cli --features opt
fi

if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI (gh) not found. Please install it:${NC}"
    echo "   https://cli.github.com"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo -e "${RED}❌ Not authenticated with GitHub. Run: gh auth login${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites satisfied${NC}"
echo ""

# Determine if creating new account or using existing
echo "🔑 Stellar Account Setup"
echo "========================"
echo ""
echo "1. Create NEW testnet deployment account"
echo "2. Use EXISTING account"
read -p "Choose (1 or 2): " choice

ACCOUNT_PUBLIC=""
ACCOUNT_SECRET=""

if [[ "$choice" == "1" ]]; then
    echo ""
    read -p "Enter account name (e.g., 'votechain-deploy'): " account_name
    
    echo -e "${YELLOW}Generating new keypair...${NC}"
    # Generate keypair
    KEYPAIR=$(stellar keys generate --network testnet "$account_name" 2>&1)
    
    # Extract keys from output
    ACCOUNT_PUBLIC=$(echo "$KEYPAIR" | grep "Public Key:" | awk '{print $3}')
    ACCOUNT_SECRET=$(echo "$KEYPAIR" | grep "Secret Key:" | awk '{print $3}')
    
    echo -e "${GREEN}✓ Keypair generated${NC}"
    echo ""
    echo "📝 New Account Details:"
    echo "   Public Key:  $ACCOUNT_PUBLIC"
    echo "   Secret Key:  ${ACCOUNT_SECRET:0:10}...${ACCOUNT_SECRET: -5}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Keep the secret key safe!${NC}"
    echo ""
    
    # Offer to fund account via Friendbot
    echo "🪣 Funding Account via Friendbot..."
    echo "   URL: https://friendbot.stellar.org/?addr=$ACCOUNT_PUBLIC"
    echo ""
    
    if command -v curl &> /dev/null; then
        echo "Attempting to fund account..."
        if RESPONSE=$(curl -s "https://friendbot.stellar.org/?addr=$ACCOUNT_PUBLIC"); then
            if echo "$RESPONSE" | grep -q "successful"; then
                echo -e "${GREEN}✓ Account funded with test XLM${NC}"
            else
                echo -e "${YELLOW}⚠️  Could not auto-fund. Visit URL above to fund manually.${NC}"
            fi
        else
            echo -e "${YELLOW}⚠️  Network error. Visit Friendbot URL above to fund manually.${NC}"
        fi
    fi
    
elif [[ "$choice" == "2" ]]; then
    echo ""
    read -p "Enter public key (starting with G): " ACCOUNT_PUBLIC
    read -sp "Enter secret key (starting with S): " ACCOUNT_SECRET
    echo ""
    
else
    echo -e "${RED}Invalid choice${NC}"
    exit 1
fi

echo ""
echo "✅ Account Setup Complete"
echo ""

# Get repository info
REPO_FULL_NAME=$(cd "$REPO_DIR" && git remote get-url origin | sed 's/.*://;s/\.git$//')
echo "📦 Repository: $REPO_FULL_NAME"
echo ""

# Configure GitHub Secrets
echo "🔐 Configuring GitHub Secrets"
echo "=============================="
echo ""

read -p "Update GitHub secrets? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Setting SOROBAN_ACCOUNT secret..."
    gh secret set SOROBAN_ACCOUNT --body "$ACCOUNT_PUBLIC" -R "$REPO_FULL_NAME" 2>/dev/null && \
        echo -e "${GREEN}✓ SOROBAN_ACCOUNT secret updated${NC}" || \
        echo -e "${RED}✗ Failed to set SOROBAN_ACCOUNT${NC}"
    
    echo "Setting SOROBAN_SECRET_KEY secret..."
    gh secret set SOROBAN_SECRET_KEY --body "$ACCOUNT_SECRET" -R "$REPO_FULL_NAME" 2>/dev/null && \
        echo -e "${GREEN}✓ SOROBAN_SECRET_KEY secret updated${NC}" || \
        echo -e "${RED}✗ Failed to set SOROBAN_SECRET_KEY${NC}"
else
    echo -e "${YELLOW}ℹ️  Skipping secret configuration${NC}"
    echo "   Add secrets manually in GitHub:"
    echo "   Settings → Secrets and variables → Actions"
    echo ""
    echo "   SOROBAN_ACCOUNT = $ACCOUNT_PUBLIC"
    echo "   SOROBAN_SECRET_KEY = $ACCOUNT_SECRET"
fi

echo ""
echo "✅ Secret Configuration Complete"
echo ""

# Verify deployment configuration
echo "🔍 Verifying Deployment Configuration"
echo "======================================"
echo ""

# Check config files exist
if [[ -f "$REPO_DIR/config/testnet.toml" ]]; then
    echo -e "${GREEN}✓ Testnet config found${NC}"
    cat "$REPO_DIR/config/testnet.toml"
else
    echo -e "${YELLOW}⚠️  Testnet config not found${NC}"
fi

# Check deployment script exists
if [[ -f "$REPO_DIR/scripts/deploy.sh" ]]; then
    echo -e "${GREEN}✓ Deployment script found${NC}"
else
    echo -e "${RED}✗ Deployment script not found${NC}"
fi

# Check workflow file exists
if [[ -f "$REPO_DIR/.github/workflows/deploy-testnet.yml" ]]; then
    echo -e "${GREEN}✓ CD workflow found${NC}"
else
    echo -e "${RED}✗ CD workflow not found${NC}"
fi

echo ""
echo "📊 Summary"
echo "=========="
echo ""
echo "Account:"
echo "  Public Key: $ACCOUNT_PUBLIC"
echo "  Network: Stellar Testnet"
echo "  RPC: https://soroban-testnet.stellar.org"
echo ""

echo "🎯 Next Steps:"
echo "1. Commit and push changes to main branch"
echo "2. Verify deployment in Actions tab"
echo "3. Check contracts on testnet explorer"
echo ""
echo "   Repository: https://github.com/$REPO_FULL_NAME"
echo "   Actions: https://github.com/$REPO_FULL_NAME/actions"
echo "   Testnet: https://testnet.stellar.expert/search?q=$ACCOUNT_PUBLIC"
echo ""

echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo "For more information, see:"
echo "  - docs/CD_PIPELINE_SETUP.md"
echo "  - docs/BRANCH_PROTECTION_SETUP.md"
