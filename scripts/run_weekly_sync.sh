#!/bin/bash
# Weekly sync wrapper for the macOS LaunchAgent.
# Runs the full Shopify/Google/Meta/calendar/AI-insights sync and logs output.
# Scheduled by ~/Library/LaunchAgents/com.coolkidz.branddashboard.sync.plist

PROJECT_DIR="/Users/melaniekingsford/brand-dashboard"
LOG="$HOME/Library/Logs/branddashboard-sync.log"

cd "$PROJECT_DIR" || exit 1
echo "===== Sync started $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG"
/usr/bin/python3 "$PROJECT_DIR/scripts/sync.py" >> "$LOG" 2>&1
echo "===== Sync finished $(date '+%Y-%m-%d %H:%M:%S') =====" >> "$LOG"
echo "" >> "$LOG"
