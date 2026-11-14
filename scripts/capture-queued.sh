#!/bin/sh
LOCK="${TMPDIR:-/tmp}/landtrain-capture.lock"
while ! mkdir "$LOCK" 2>/dev/null; do
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +20 2>/dev/null)" ]; then rmdir "$LOCK" 2>/dev/null; else sleep 5; fi
done
trap 'rmdir "$LOCK"' EXIT INT TERM
node scripts/capture.mjs "$@"
