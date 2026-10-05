#!/bin/sh
set -e

# Make sure the data dir is writable by the app user, whatever the volume/bind mount ownership is.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  exec su-exec node "$@"
fi

exec "$@"
