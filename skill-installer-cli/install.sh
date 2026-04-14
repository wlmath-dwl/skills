#!/usr/bin/env bash
set -euo pipefail

REPO="https://git.lianjia.com/gaoran007/skills.git"
BRANCH="master"
BINARY="skill-installer-cli"
INSTALL_DIR="/usr/local/bin"
SUBDIR="skill-installer-cli"

usage() {
  cat <<EOF
Usage: $0 [options]
  -r <repo>    Git repo URL (default: $REPO)
  -b <branch>  Git branch   (default: $BRANCH)
  -d <dir>     Install dir  (default: $INSTALL_DIR)
  -h           Show help
EOF
  exit 0
}

while getopts "r:b:d:h" opt; do
  case $opt in
    r) REPO="$OPTARG" ;;
    b) BRANCH="$OPTARG" ;;
    d) INSTALL_DIR="$OPTARG" ;;
    h) usage ;;
    *) usage ;;
  esac
done

# Check dependencies
for cmd in git go; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: $cmd is required but not found."; exit 1; }
done

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Cloning $REPO (branch: $BRANCH)..."
git clone --depth 1 --branch "$BRANCH" "$REPO" "$TMPDIR" 2>/dev/null

echo "Building $BINARY..."
cd "$TMPDIR/$SUBDIR"
CGO_ENABLED=0 go build -o "$BINARY" .

echo "Installing to $INSTALL_DIR/$BINARY..."
mkdir -p "$INSTALL_DIR"
if [ -w "$INSTALL_DIR" ]; then
  mv "$BINARY" "$INSTALL_DIR/$BINARY"
else
  sudo mv "$BINARY" "$INSTALL_DIR/$BINARY"
fi

echo "Done! $(command -v "$BINARY") installed."
