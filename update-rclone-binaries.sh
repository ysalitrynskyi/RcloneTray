#!/usr/bin/env bash

bin_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null && pwd)/rclone"
tmp_dir=$(mktemp -d 2>/dev/null || mktemp -d -t 'rclone')
latest_version=$(curl -s https://downloads.rclone.org/version.txt | tr -d '\r' | awk '{print $2}')

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
    curl --progress-bar -o "${tmp_dir}/${os}-${arch}.zip" "${url}"
    if [ $? -ne 0 ]; then
        echo "Failed to download. URL might be incorrect."
        return
    fi
    unzip -q "${tmp_dir}/${os}-${arch}.zip" -d "${tmp_dir}/${os}-${arch}"
    if [ $? -ne 0 ]; then
        echo "Failed to unzip. The file might not have been downloaded correctly."
        return
    fi
    mv "${tmp_dir}/${os}-${arch}/rclone-"*"/rclone"* "${bin_dir}/${bin_folder}/${arch}/"
    chmod +x "${bin_dir}/${bin_folder}/${arch}/rclone"*
}

download_and_extract "osx" "amd64" "darwin"
download_and_extract "osx" "arm64" "darwin"
download_and_extract "windows" "amd64" "win32"
download_and_extract "windows" "386" "win32"
download_and_extract "windows" "arm64" "win32"
architectures=("amd64" "386" "arm64" "arm-v7" "arm-v6" "arm" "mipsle" "mips")
for arch in "${architectures[@]}"; do
    download_and_extract "linux" "${arch}" "linux"
done

curl -s -o "${bin_dir}/LICENSE" "https://raw.githubusercontent.com/rclone/rclone/master/COPYING"
echo "${latest_version}" > "${bin_dir}/version.txt"
echo "Update complete."
