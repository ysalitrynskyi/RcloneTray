#!/usr/bin/env bash

set -euo pipefail

bin_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null && pwd)/rclone"
tmp_dir=$(mktemp -d 2>/dev/null || mktemp -d -t 'rclone')
trap 'rm -rf "${tmp_dir}"' EXIT

latest_version=$(curl -fsSL https://downloads.rclone.org/version.txt | tr -d '\r' | awk '{print $2}')

if [ -z "${latest_version}" ]; then
    echo "Unable to determine latest rclone version."
    exit 1
fi

if [ -f "${bin_dir}/version.txt" ]; then
    current_version=$(cat "${bin_dir}/version.txt" | tr -d '\r')
else
    current_version=''
fi

if [ "${current_version}" == "${latest_version}" ]; then
    echo "Already have the most recent rclone binaries."
    exit
else
    echo "Updating binaries from ${current_version} to ${latest_version}"
fi

download_and_extract() {
    os=$1
    arch=$2
    bin_folder=$3
    url="https://downloads.rclone.org/${latest_version}/rclone-${latest_version}-${os}-${arch}.zip"

    echo "Constructed URL: $url"

    mkdir -p "${bin_dir}/${bin_folder}/${arch}"
    curl -fL --progress-bar -o "${tmp_dir}/${os}-${arch}.zip" "${url}"
    unzip -q "${tmp_dir}/${os}-${arch}.zip" -d "${tmp_dir}/${os}-${arch}"
    mv "${tmp_dir}/${os}-${arch}/rclone-"*"/rclone"* "${bin_dir}/${bin_folder}/${arch}/"
    chmod +x "${bin_dir}/${bin_folder}/${arch}/rclone"*
}

# Optional first argument limits the download to a single target platform.
# Accepts: darwin | mac | osx | win32 | windows | win | linux
# When omitted, binaries for all platforms are downloaded (default behaviour).
target="${1:-all}"

download_darwin() {
    download_and_extract "osx" "amd64" "darwin"
    download_and_extract "osx" "arm64" "darwin"
}

download_win32() {
    download_and_extract "windows" "amd64" "win32"
    download_and_extract "windows" "386" "win32"
    download_and_extract "windows" "arm64" "win32"
}

download_linux() {
    local architectures=("amd64" "386" "arm64" "arm-v7" "arm-v6" "arm" "mipsle" "mips")
    for arch in "${architectures[@]}"; do
        download_and_extract "linux" "${arch}" "linux"
    done
}

case "${target}" in
    darwin|mac|osx)   download_darwin ;;
    win32|windows|win) download_win32 ;;
    linux)            download_linux ;;
    all)
        download_darwin
        download_win32
        download_linux
        ;;
    *)
        echo "Unknown platform '${target}'. Use: darwin | win32 | linux | all"
        exit 1
        ;;
esac

curl -fsSL -o "${bin_dir}/LICENSE" "https://raw.githubusercontent.com/rclone/rclone/master/COPYING"
# Only stamp version.txt for a complete download so a partial (single-platform)
# run does not make a later full run think everything is already up to date.
if [ "${target}" == "all" ]; then
    echo "${latest_version}" > "${bin_dir}/version.txt"
fi
echo "Update complete."
