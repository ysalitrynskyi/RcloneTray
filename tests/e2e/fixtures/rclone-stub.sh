#!/usr/bin/env bash
# Minimal rclone stub for E2E tests. Responds to the few subcommands RcloneTray
# calls on startup so the app can boot without a real rclone binary or network.
for arg in "$@"; do
  case "$arg" in
    version)   echo "rclone v1.65.0"; exit 0 ;;
    providers) echo "[]"; exit 0 ;;
    dump)      echo "{}"; exit 0 ;;
  esac
done
echo ""
exit 0
