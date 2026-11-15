#!/bin/sh
# One turn at the capture lock for both the standard shots and this lane's extras.
# Usage: sh scripts/lanes/atmosphere-queued.sh <name> [standard --only list] [extra --only list]
LOCK="${TMPDIR:-/tmp}/landtrain-capture.lock"
while ! mkdir "$LOCK" 2>/dev/null; do
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +20 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null; else sleep 5; fi
done
trap 'rmdir "$LOCK"' EXIT INT TERM
if [ "$2" != "none" ]; then
  node scripts/capture.mjs --out "captures/$1" ${2:+--only "$2"}
fi
if [ "$3" != "none" ]; then
  LANDTRAIN_LOCK_HELD=1 node scripts/lanes/atmosphere.mjs --out "captures/$1-extra" ${3:+--only "$3"}
fi
