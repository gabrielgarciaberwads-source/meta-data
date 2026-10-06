#!/usr/bin/env bash
set -eu

umask 077

TLS_ROOT=${TLS_ROOT:-/opt/ownerinc/secrets/meta-raw-pipeline/tls}
PRIVATE_DIR="$TLS_ROOT/private"
SERVER_DIR="$TLS_ROOT/server"
CA_KEY="$PRIVATE_DIR/ca.key"
CA_CERT="$SERVER_DIR/ca.crt"
SERVER_KEY="$SERVER_DIR/server.key"
SERVER_CERT="$SERVER_DIR/server.crt"
SERVER_CERT_TMP="$SERVER_DIR/server.crt.tmp.$$"
SERVER_CSR="$PRIVATE_DIR/server.csr"
SERVER_EXT="$PRIVATE_DIR/server-ext.cnf"
CA_SERIAL="$PRIVATE_DIR/ca.srl"
HBA_FILE="$SERVER_DIR/pg_hba.conf"
POSTGRES_UID=${POSTGRES_UID:-70}
POSTGRES_GID=${POSTGRES_GID:-70}

mkdir -p "$PRIVATE_DIR" "$SERVER_DIR"
chmod 700 "$TLS_ROOT" "$PRIVATE_DIR"
chmod 755 "$SERVER_DIR"

if [ -e "$CA_KEY" ] && [ ! -s "$CA_KEY" ]; then
  echo 'Refusing to replace an empty CA key.' >&2
  exit 1
fi
if [ -e "$SERVER_KEY" ] && [ ! -s "$SERVER_KEY" ]; then
  echo 'Refusing to replace an empty server key.' >&2
  exit 1
fi

if [ ! -s "$CA_KEY" ]; then
  openssl genrsa -out "$CA_KEY" 4096 >/dev/null 2>&1
fi

if [ ! -s "$CA_CERT" ]; then
  openssl req -x509 -new -nodes -sha256 \
    -key "$CA_KEY" \
    -out "$CA_CERT" \
    -days 3650 \
    -subj '/CN=Ownerinc Meta Raw Internal CA' \
    >/dev/null 2>&1
fi

if [ ! -e "$CA_SERIAL" ]; then
  printf '01\n' > "$CA_SERIAL"
fi

if ! openssl x509 -in "$CA_CERT" -checkend 2592000 -noout >/dev/null 2>&1; then
  echo 'The existing CA expires in less than 30 days; refusing an automatic replacement.' >&2
  exit 1
fi

if [ ! -s "$SERVER_KEY" ] || [ ! -s "$SERVER_CERT" ]; then
  if [ -s "$SERVER_KEY" ] && [ ! -s "$SERVER_CERT" ]; then
    echo 'A server key exists without a server certificate; refusing to continue.' >&2
    exit 1
  fi

  openssl genrsa -out "$SERVER_KEY" 2048 >/dev/null 2>&1
  cat > "$SERVER_EXT" <<'EOF'
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:meta-raw-postgres,DNS:localhost
EOF
  openssl req -new -sha256 \
    -key "$SERVER_KEY" \
    -out "$SERVER_CSR" \
    -subj '/CN=meta-raw-postgres' \
    >/dev/null 2>&1
  openssl x509 -req -sha256 \
    -in "$SERVER_CSR" \
    -CA "$CA_CERT" \
    -CAkey "$CA_KEY" \
    -CAserial "$CA_SERIAL" \
    -out "$SERVER_CERT_TMP" \
    -days 825 \
    -extfile "$SERVER_EXT" \
    >/dev/null 2>&1
  mv "$SERVER_CERT_TMP" "$SERVER_CERT"
  rm -f "$SERVER_CSR" "$SERVER_EXT"
fi

if ! openssl x509 -in "$SERVER_CERT" -checkend 2592000 -noout >/dev/null 2>&1; then
  echo 'The existing server certificate expires in less than 30 days; refusing an automatic replacement.' >&2
  exit 1
fi

cat > "$HBA_FILE" <<'EOF'
# Managed by meta-raw-pipeline/deploy/provision-postgres-tls.sh
local   all   all                                      scram-sha-256
hostssl all   all   0.0.0.0/0                          scram-sha-256
hostssl all   all   ::/0                               scram-sha-256
host    all   all   0.0.0.0/0                          reject
host    all   all   ::/0                               reject
EOF

chmod 600 "$CA_KEY" "$SERVER_KEY"
if [ -e "$CA_SERIAL" ]; then
  chmod 600 "$CA_SERIAL"
fi
chmod 644 "$CA_CERT" "$SERVER_CERT" "$HBA_FILE"
chown "$POSTGRES_UID:$POSTGRES_GID" "$SERVER_KEY" "$SERVER_CERT" "$CA_CERT" "$HBA_FILE"

openssl x509 -in "$CA_CERT" -noout -subject -enddate
openssl x509 -in "$SERVER_CERT" -noout -subject -enddate
echo 'TLS_MATERIAL_READY'
