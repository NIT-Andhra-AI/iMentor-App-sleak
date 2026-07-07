#!/bin/bash

# Store the script's directory and change to it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse arguments for clean option
CLEAN_CACHE=false
for arg in "$@"; do
  if [ "$arg" = "--clean" ] || [ "$arg" = "-c" ]; then
    CLEAN_CACHE=true
  fi
done

# Cleanup function to kill the background node API server when this script exits
cleanup() {
  if [ -n "$API_PID" ]; then
    echo -e "\nStopping API server (PID: $API_PID)..."
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Configure JAVA_HOME to use Java 21 (compatible with Gradle 8.14) instead of the default Java 25
if [ -d "/usr/lib/jvm/java-21-openjdk" ]; then
  export JAVA_HOME="/usr/lib/jvm/java-21-openjdk"
elif [ -d "/usr/lib/jvm/java-21" ]; then
  export JAVA_HOME="/usr/lib/jvm/java-21"
fi

if [ -n "$JAVA_HOME" ]; then
  echo "=== Java Configuration ==="
  echo "Using JAVA_HOME: $JAVA_HOME"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

# Perform cleaning if requested
if [ "$CLEAN_CACHE" = true ]; then
  echo "=== Cleaning Gradle and Project Caches ==="
  echo "Stopping Gradle daemons..."
  if [ -f "android/gradlew" ]; then
    cd android
    ./gradlew --stop || true
    echo "Deleting local build caches..."
    rm -rf .gradle build app/build || true
    cd ..
  fi
  echo "Deleting global transforms metadata caches..."
  rm -rf ~/.gradle/caches/8.14.3/transforms || true
  rm -rf ~/.gradle/caches/transforms-3 || true
  rm -rf ~/.gradle/caches/transforms-4 || true
  echo "Clearing Expo cache..."
  npx expo start --clear &
  CLEAR_PID=$!
  sleep 3
  kill "$CLEAR_PID" 2>/dev/null || true
fi

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