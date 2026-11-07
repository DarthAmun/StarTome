#!/usr/bin/env bash
# Builds local/tech-core-startome.json (a StarTome homebrew pack) from YOUR copy of
# the Starfinder Tech Core PDF. The output stays on your machine (local/ is git-ignored).
# Needs poppler-utils (pdftotext) and python3.
#   scripts/techcore/build.sh "/path/to/SF 2e - Tech Core.pdf"
set -euo pipefail
PDF="${1:?path to the Tech Core PDF}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
mkdir -p "$W/cols" "$W/tools" "$ROOT/local"
cp "$HERE"/*.py "$W/tools/"
pdftotext -layout "$PDF" "$W/tc.txt"
pdftotext -f 165 -l 256 -bbox-layout "$PDF" "$W/bbox.html"
python3 -I "$W/tools/bbox_cols.py" "$W/bbox.html" 165 > "$W/cols/all.txt"
awk '/^=== PAGE 207$/{f=1} /^=== PAGE 247$/{f=0} f' "$W/cols/all.txt" > "$W/cols/archive2.txt"
awk '/^=== PAGE 179$/{f=1} /^=== PAGE 185$/{f=0} f' "$W/cols/all.txt" > "$W/cols/stations.txt"
awk '/^=== PAGE 185$/{f=1} /^=== PAGE 197$/{f=0} f' "$W/cols/all.txt" > "$W/cols/equip.txt"
awk '/^=== PAGE 193$/{f=1} /^=== PAGE 195$/{f=0} f' "$W/cols/all.txt" > "$W/cols/drones.txt"
pdftotext -layout -f 193 -l 194 "$PDF" "$W/cols/weapons_layout.txt"
python3 -I "$W/tools/parse_archive.py" "$W/cols/archive2.txt" > "$W/archive.json"
python3 -I "$W/tools/parse_stations.py" "$W/cols/stations.txt" "$W/tools" > "$W/stations.json"
python3 -I "$W/tools/parse_upgrades.py" "$W/cols/equip.txt" "$W/tools" > "$W/upgrades.json"
python3 -I "$W/tools/build_pack.py" "$W" > "$ROOT/local/tech-core-startome.json"
echo "Wrote $ROOT/local/tech-core-startome.json — import it under Import & Export → Homebrew."
