#!/usr/bin/env node

const http = require('http');
const { Server } = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils');

const host = process.env.HOST || 'localhost';
const port = process.env.PORT || 1234;

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('okay');
});

const wss = new Server({ server });

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req);
});

server.listen(port, host, () => {
  console.log(`Yjs-Websocket server running on port ${port}`);
});
