#!/bin/sh
# Download the LOLA south polar DEM that tools/lola-horizon.mjs reads.
#
# LDEM_75S_120M covers 75 S to the pole at 120 m per pixel, 110 MB. That is
# every polar site in the catalogue with room for the 100 km horizon rays.
# The raster is not committed; terrain.js is.
#
# Product page: https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/
# Data set: LRO-L-LOLA-4-GDR-V1.0, heights relative to a radius of 1737.4 km.

set -e
base="https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG"
product="LDEM_75S_120M"
dir="$(dirname "$0")/../data/lola"

mkdir -p "$dir"
for ext in LBL IMG; do
  if [ -f "$dir/$product.$ext" ]; then
    echo "have $product.$ext"
  else
    echo "fetching $product.$ext"
    curl -# -o "$dir/$product.$ext" "$base/$product.$ext"
  fi
done

expected=116250752
actual=$(wc -c < "$dir/$product.IMG" | tr -d ' ')
if [ "$actual" != "$expected" ]; then
  echo "$product.IMG is $actual bytes, expected $expected (7624 x 7624 x 2)" >&2
  exit 1
fi
echo "ok, now run: node tools/lola-horizon.mjs"
