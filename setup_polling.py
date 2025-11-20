#!/usr/bin/env python3
"""
🚀 Supabase Polling Setup Script
Executes SETUP_EFFICIENT_POLLING.sql directly via PostgreSQL

Setup:
    pip install psycopg2-binary

Usage:
    python3 setup_polling.py
"""

import psycopg2
import sys
import os

# Hardcoded Supabase connection (from environment or direct)
SUPABASE_HOST = "db.znoiauhdrujwkfryhwiz.supabase.co"
SUPABASE_DB = "postgres"
SUPABASE_USER = "postgres"

print("🚀 Supabase Polling Setup")
print("=" * 60)

# Get password from environment or prompt
password = os.getenv("SUPABASE_DB_PASSWORD", "").strip()
if not password:
    print("📌 Get your password from:")
    print("   https://app.supabase.com/project/znoiauhdrujwkfryhwiz/settings/database")
    print()
    password = input("🔐 Enter Supabase database password: ").strip()
    if not password:
        print("❌ Password required")
        sys.exit(1)

try:
    print("\n📡 Connecting to database...")
    conn = psycopg2.connect(
        host=SUPABASE_HOST,
        database=SUPABASE_DB,
        user=SUPABASE_USER,
        password=password,
        port=5432,
        sslmode="require",
    )
    print("✅ Connected!")

    # Read SQL file
    with open("SETUP_EFFICIENT_POLLING.sql", "r") as f:
        sql_content = f.read()

    # Split and execute statements
    statements = [s.strip() for s in sql_content.split(";") if s.strip() and not s.strip().startswith("--")]

    cursor = conn.cursor()

    print(f"\n🔄 Executing {len(statements)} statements...")
    for i, stmt in enumerate(statements, 1):
        display = stmt.replace("\n", " ")[:70]
        print(f"   [{i}/{len(statements)}] {display}...", end=" ")

        try:
            cursor.execute(stmt)
            conn.commit()
            print("✅")
        except psycopg2.Error as e:
            error_msg = str(e)
            if "does not exist" in error_msg or "already exists" in error_msg:
                print("⚠️ (skipping)")
            else:
                print("❌")
                print(f"\n❌ Error: {error_msg}")
                sys.exit(1)

    cursor.close()
    conn.close()

    print("\n✨ Setup completed successfully!")
    print("=" * 60)
    print("✅ Polling is now ACTIVE")
    print("   • Runs every 1 minute")
    print("   • Dashboard updates automatically")
    print("\n📊 Dashboard:")
    print("   https://gestor-tiny-qxv7irs5g-vihcastello-6133s-projects.vercel.app")

except psycopg2.OperationalError as e:
    print(f"\n❌ Connection failed: {e}")
    print("\n💡 Alternatives:")
    print("   1. Manual: Open Supabase SQL Editor")
    print("   2. Node.js: npm run setup")
    print("   3. API: GET /api/admin/setup-polling?confirm=yes")
    sys.exit(1)
except FileNotFoundError:
    print("❌ File not found: SETUP_EFFICIENT_POLLING.sql")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ Error: {e}")
    sys.exit(1)
