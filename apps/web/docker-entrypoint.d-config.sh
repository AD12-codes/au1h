#!/bin/sh
# Writes the portal's runtime configuration from the environment before nginx starts.
set -eu
: "${AU1H_SERVER_URL:?Set AU1H_SERVER_URL to the public URL of the au1h server, e.g. https://api.example.com}"
cat > /usr/share/nginx/html/config.js <<CONFIG
window.__AU1H_CONFIG__ = {
  serverUrl: "${AU1H_SERVER_URL}",
  adminAppSlug: "${AU1H_ADMIN_APP_SLUG:-au1h-admin}",
  docsUrl: "${AU1H_DOCS_URL:-https://au1h.dev/docs}"
};
CONFIG
