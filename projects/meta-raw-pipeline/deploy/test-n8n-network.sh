#!/usr/bin/env bash
set -eu

cat <<'NODE' | docker exec -i n8n-web node
const net = require('node:net');
const socket = net.createConnection({ host: 'meta-raw-postgres', port: 5432 });
socket.setTimeout(5000);
socket.on('connect', () => {
  console.log('N8N_TO_META_RAW_POSTGRES_TCP_OK');
  socket.end();
});
socket.on('timeout', () => {
  console.error('N8N_TO_META_RAW_POSTGRES_TIMEOUT');
  process.exit(1);
});
socket.on('error', (error) => {
  console.error(`N8N_TO_META_RAW_POSTGRES_FAILED:${error.code}`);
  process.exit(1);
});
NODE
