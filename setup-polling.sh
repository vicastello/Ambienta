#!/bin/bash

# 🚀 Supabase Polling Setup - Bash Script
# Execute this to set up polling automatically
# Run: bash setup-polling.sh

set -e

echo "🚀 Supabase Polling Setup"
echo "=========================="

# Check for required tools
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Installing PostgreSQL..."
    if command -v brew &> /dev/null; then
        brew install postgresql
    else
        echo "❌ Please install PostgreSQL first"
        exit 1
    fi
fi

# Get credentials
SUPABASE_HOST="db.znoiauhdrujwkfryhwiz.supabase.co"
SUPABASE_DB="postgres"
SUPABASE_USER="postgres"

echo ""
echo "📌 Get your password from:"
echo "   https://app.supabase.com/project/znoiauhdrujwkfryhwiz/settings/database"
echo ""

read -sp "🔐 Enter Supabase database password: " SUPABASE_PASSWORD
echo ""

# Build connection string
export PGPASSWORD="$SUPABASE_PASSWORD"
CONNECTION_STRING="postgresql://$SUPABASE_USER@$SUPABASE_HOST:5432/$SUPABASE_DB?sslmode=require"

echo ""
echo "📡 Testing connection..."

# Test connection
if ! psql "$CONNECTION_STRING" -c "SELECT 1" &> /dev/null; then
    echo "❌ Connection failed. Check your password."
    exit 1
fi

echo "✅ Connected!"

# Execute setup SQL
echo ""
echo "🔄 Executing setup SQL..."

# Read SQL file
if [ ! -f "SETUP_EFFICIENT_POLLING.sql" ]; then
    echo "❌ File not found: SETUP_EFFICIENT_POLLING.sql"
    exit 1
fi

# Execute
if psql "$CONNECTION_STRING" -f "SETUP_EFFICIENT_POLLING.sql" 2>&1 | tee /tmp/setup.log; then
    echo ""
    echo "✨ Setup completed successfully!"
    echo "======================================"
    echo "✅ Polling is now ACTIVE"
    echo "   • Runs every 1 minute"
    echo "   • Dashboard updates automatically"
    echo ""
    echo "📊 Dashboard:"
    echo "   https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app"
    echo ""
    echo "📝 Verify with:"
    echo '   SELECT * FROM cron.job WHERE jobname LIKE "sync%";'
else
    echo "❌ Setup failed. Check /tmp/setup.log for details."
    exit 1
fi

unset PGPASSWORD
