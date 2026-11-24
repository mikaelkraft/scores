#!/usr/bin/env bash
# Build Standalone NorraScore Android Release APK
# Targets Release v1.0.0 (Initial Release)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ANDROID_DIR="${PROJECT_DIR}/android"
SDK_JAR="${PROJECT_DIR}/.android-sdk/android.jar"
if [[ ! -f "${SDK_JAR}" ]]; then
    SDK_JAR="${HOME}/.android-sdk/android.jar"
fi

if [[ ! -f "${SDK_JAR}" ]]; then
    echo "Error: android.jar not found at ${SDK_JAR}" >&2
    exit 1
fi

echo "Building NorraScore v1.0.0 Release APK..."

mkdir -p "${ANDROID_DIR}/gen" "${ANDROID_DIR}/obj" "${ANDROID_DIR}/bin" "${ANDROID_DIR}/assets" "${PROJECT_DIR}/public/download"

# 1. Sync web assets for offline shell
cp "${PROJECT_DIR}/public/styles.css" "${ANDROID_DIR}/assets/"
cp "${PROJECT_DIR}/public/app.js" "${ANDROID_DIR}/assets/"
cp "${PROJECT_DIR}/public/favicon.svg" "${ANDROID_DIR}/assets/"
cp "${PROJECT_DIR}/public/apple-touch-icon.png" "${ANDROID_DIR}/assets/"
cp "${PROJECT_DIR}/public/apple-touch-icon.png" "${ANDROID_DIR}/res/drawable/ic_launcher.png"

# 2. Generate R.java
aapt package -f -m -J "${ANDROID_DIR}/gen" -M "${ANDROID_DIR}/AndroidManifest.xml" -S "${ANDROID_DIR}/res" -I "${SDK_JAR}"

# 3. Compile Java sources
javac -cp "${SDK_JAR}:${ANDROID_DIR}/gen" -d "${ANDROID_DIR}/obj" "${ANDROID_DIR}/src/xyz/mynorra/scores/MainActivity.java" "${ANDROID_DIR}/gen/xyz/mynorra/scores/R.java"

# 4. Generate classes.dex
d8 --output "${ANDROID_DIR}/bin/" --lib "${SDK_JAR}" "${ANDROID_DIR}/obj/xyz/mynorra/scores/"*.class

# 5. Package unaligned APK
aapt package -f -M "${ANDROID_DIR}/AndroidManifest.xml" -S "${ANDROID_DIR}/res" -A "${ANDROID_DIR}/assets" -I "${SDK_JAR}" -F "${ANDROID_DIR}/bin/norrascore-unaligned.apk"
(cd "${ANDROID_DIR}/bin" && aapt add norrascore-unaligned.apk classes.dex)

# 6. Align APK
zipalign -f -p 4 "${ANDROID_DIR}/bin/norrascore-unaligned.apk" "${ANDROID_DIR}/bin/norrascore-aligned.apk"

# 7. Sign APK (supports CI/prod secrets via ANDROID_KEYSTORE_PASS / ANDROID_KEY_PASS env vars)
KEYSTORE="${ANDROID_KEYSTORE_PATH:-${ANDROID_DIR}/norrascore.keystore}"
KEYSTORE_PASS="${ANDROID_KEYSTORE_PASS:-norrascore2026}"
KEY_PASS="${ANDROID_KEY_PASS:-${KEYSTORE_PASS}}"
KEY_ALIAS="${ANDROID_KEY_ALIAS:-norrascore}"

if [[ ! -f "${KEYSTORE}" ]]; then
    keytool -genkeypair -v -keystore "${KEYSTORE}" -storepass "${KEYSTORE_PASS}" -alias "${KEY_ALIAS}" -keypass "${KEY_PASS}" -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=NorraScore, OU=Engineering, O=Norra AI, L=Lagos, ST=Lagos, C=NG"
fi

OUTPUT_APK="${PROJECT_DIR}/public/download/norrascore.apk"
apksigner sign --ks "${KEYSTORE}" --ks-pass "pass:${KEYSTORE_PASS}" --key-pass "pass:${KEY_PASS}" --out "${OUTPUT_APK}" "${ANDROID_DIR}/bin/norrascore-aligned.apk"
apksigner verify --verbose "${OUTPUT_APK}"

echo "NorraScore v1.0.0 APK successfully generated at ${OUTPUT_APK} ($(wc -c < "${OUTPUT_APK}") bytes)"
