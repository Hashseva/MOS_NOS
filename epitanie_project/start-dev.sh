#!/usr/bin/env bash
set -euo pipefail

# Absolute path to the folder that contains this script (robust in WSL/OneDrive)
#SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
#cd "$SCRIPT_DIR"

# -----------------------------
# Config (ajuste si besoin)
# -----------------------------
KEYCLOAK_BASE="http://localhost:8080"
REALM="epitanie"
FRONT_CLIENT_ID="epitanie-frontend"
FRONT_REDIRECT="http://localhost:5173/*"
FRONT_ORIGIN="http://localhost:5173"
KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
KC_ADMIN_PASS="${KC_ADMIN_PASS:-admin}"

# Nom du service Keycloak dans docker-compose (si différent, ajuste)
KEYCLOAK_SVC="${KEYCLOAK_SVC:-keycloak}"

echo "🚀 Starting Epitanie stack..."

# -----------------------------
# Kill old dev servers
# -----------------------------
echo "🔪 Killing old backend/frontend processes..."
lsof -ti:4000 | xargs -r kill -9 || true
lsof -ti:5173 | xargs -r kill -9 || true

# -----------------------------
# Kill any host Postgres running on port 5432
# -----------------------------
#if lsof -i:5432 >/dev/null; then
#  echo "🛑 A local Postgres is running on port 5432. Killing it..."
#  lsof -ti:5432 | xargs -r kill -9 || true
#fi

docker compose down -v

# -----------------------------
# Docker services
# -----------------------------
echo "🐳 Starting Docker services (DB + Keycloak)…"
docker compose up -d

# -----------------------------
# Waiters
# -----------------------------
wait_for_url () {
  local url="$1"
  local tries="${2:-60}"
  local delay="${3:-2}"
  echo "⏳ Waiting for $url ..."
  for i in $(seq 1 "$tries"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "✅ $url is up"
      return 0
    fi
    sleep "$delay"
  done
  echo "❌ Timeout waiting for $url"
  return 1
}

# Attend Keycloak (endpoint 'master' toujours présent)
wait_for_url "$KEYCLOAK_BASE/realms/master/.well-known/openid-configuration" 90 2

# -----------------------------
# Provisioning Keycloak
# -----------------------------
create_realm_and_client_with_kcadm () {
  echo "🔐 Provisioning Keycloak via kcadm…"
  docker compose exec -T "$KEYCLOAK_SVC" /opt/keycloak/bin/kcadm.sh config credentials \
    --server "$KEYCLOAK_BASE" --realm master --user "$KC_ADMIN_USER" --password "$KC_ADMIN_PASS"

  # Realm (idempotent)
  docker compose exec -T "$KEYCLOAK_SVC" /opt/keycloak/bin/kcadm.sh get realms/"$REALM" >/dev/null 2>&1 \
    || docker compose exec -T "$KEYCLOAK_SVC" /opt/keycloak/bin/kcadm.sh create realms \
      -s realm="$REALM" -s enabled=true

  # Client (création minimale idempotente)
  if docker compose exec -T "$KEYCLOAK_SVC" /opt/keycloak/bin/kcadm.sh get clients -r "$REALM" -q clientId="$FRONT_CLIENT_ID" \
     | grep -q "\"clientId\" *: *\"$FRONT_CLIENT_ID\""; then
    echo "➡️  Client $FRONT_CLIENT_ID already exists. Updating…"
  else
    echo "➕ Creating client $FRONT_CLIENT_ID (minimal)…"
    docker compose exec -T "$KEYCLOAK_SVC" /opt/keycloak/bin/kcadm.sh create clients -r "$REALM" \
      -s clientId="$FRONT_CLIENT_ID" \
      -s publicClient=true \
      -s standardFlowEnabled=true \
      -s directAccessGrantsEnabled=true \
      -s 'attributes."pkce.code.challenge.method"=S256' \
      || true
      # ↑ Si ça échoue encore, supprime complètement cette ligne.
  fi

  # ID du client
  CID=$(docker compose exec -T "$KEYCLOAK_SVC" /opt/keycloak/bin/kcadm.sh get clients -r "$REALM" -q clientId="$FRONT_CLIENT_ID" \
        | tr -d '\r' | grep -oE '"id"[^"]*"[^"]*"' | head -n1 | cut -d '"' -f4)

  if [ -z "$CID" ]; then
    echo "❌ Impossible de récupérer l'ID du client $FRONT_CLIENT_ID"
    exit 1
  fi

  echo "🛠  Updating redirectUris / webOrigins…"
  docker compose exec -T "$KEYCLOAK_SVC" /opt/keycloak/bin/kcadm.sh update clients/"$CID" -r "$REALM" \
    -s 'redirectUris=["'"$FRONT_REDIRECT"'"]' \
    -s 'webOrigins=["'"$FRONT_ORIGIN"'"]'
}

run_local_populate_script () {
  if [ -f "./scripts/populate_keycloak.js" ]; then
    echo "🧩 Running local provisioning script: scripts/populate_keycloak.js"
    (cd scripts && node populate_keycloak.js)
    return 0
  fi
  return 1
}

# Essaye d’abord ton script Node local, sinon kcadm
if ! run_local_populate_script; then
  create_realm_and_client_with_kcadm
fi

# Vérifie que le realm est accessible
wait_for_url "$KEYCLOAK_BASE/realms/$REALM/.well-known/openid-configuration" 60 2

# 3) exécuter le populate pour rôles + utilisateurs
echo "👤 Populating Keycloak roles & users..."
if [ -f "./populate_keycloak.js" ]; then
  node ./populate_keycloak.js
elif [ -f "./scripts/populate_keycloak.js" ]; then
  (cd scripts && node populate_keycloak.js)
else
  echo "⚠️  populate_keycloak.js introuvable — skip."
fi

# -----------------------------
# Backend & Frontend
# -----------------------------
echo "🔧 Starting backend (Express)…"
( export PG_HOST=localhost
  export PG_PORT=5433
  export PG_USER=epitanie
  export PG_PASSWORD=epitanie
  export PG_DATABASE=epitanie
  cd backend && [ ! -d node_modules ] && npm install || true )
( export PG_HOST=localhost
  export PG_PORT=5433
  export PG_USER=epitanie
  export PG_PASSWORD=epitanie
  export PG_DATABASE=epitanie
  cd backend && npm start & )

echo "🌐 Starting frontend (Vite)…"
( cd frontend && [ ! -d node_modules ] && npm install || true )
( cd frontend && npx vite & )

# -----------------------------
# Info
# -----------------------------
echo ""
echo "💡 App:            http://localhost:5173"
echo "💡 Backend API:    http://localhost:4000"
echo "💡 Keycloak Admin: $KEYCLOAK_BASE (user: $KC_ADMIN_USER / pass: $KC_ADMIN_PASS)"
echo "💡 Realm:          $REALM | Client: $FRONT_CLIENT_ID"
