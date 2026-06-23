#!/bin/bash

# Store the script's directory and change to it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Cleanup function to kill the background node API server when this script exits
cleanup() {
  if [ -n "$API_PID" ]; then
    echo -e "\nStopping API server (PID: $API_PID)..."
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# 1. Start the API server in the background
echo "=== Starting API Server ==="
if [ -d "api" ]; then
  cd api
  # Start node index.js in background
  node index.js &
  API_PID=$!
  cd ..
  echo "API server started in background with PID: $API_PID"
else
  echo "Error: 'api' directory not found!"
  exit 1
fi

# Give the API server a moment to start up
sleep 2

# 2. Reverse TCP port 3000 for Android debugging
echo "=== Configuring ADB Port Forwarding ==="
if command -v adb >/dev/null 2>&1; then
  # Check if there are active devices
  DEVICES=$(adb devices | grep -v "List of devices" | grep "device" || true)
  if [ -z "$DEVICES" ]; then
    echo "Warning: No active Android devices/emulators detected via ADB. Make sure your device is connected/running."
  else
    echo "Device detected. Reversing port 3000..."
    adb reverse tcp:3000 tcp:3000 || echo "Warning: adb reverse failed, but continuing..."
  fi
else
  echo "Warning: 'adb' command not found. Skipping adb reverse."
fi

# 3. Run the Expo Android app
echo "=== Launching Expo Android ==="
npx expo run:android
