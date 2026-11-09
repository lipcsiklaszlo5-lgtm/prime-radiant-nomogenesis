'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {componentFromCsv} = require('./r5_data_envelope.cjs');

if (!process.send) {
  throw Error('source requires isolated IPC process');
}

const data = path.resolve(__dirname, '../../demo/data');

const routes = new Map([
  ['/quantities', path.join(data, 'quantities.csv')],
  ['/prices', path.join(data, 'prices.csv')]
]);

const componentRoots = [
  '/quantities',
  '/prices'
].map((route, index) =>
  Array.from(componentFromCsv(routes.get(route), index).root)
);

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/components') {
    const payloads = [...routes.values()].map((filename, index) =>
      Array.from(componentFromCsv(filename, index).payload));
    response.writeHead(200, {'content-type': 'application/json'});
    response.end(JSON.stringify({payloads}));
    return;
  }
  const filename = routes.get(request.url);

  if (request.method !== 'GET' || !filename) {
    response.writeHead(404).end();
    return;
  }

  try {
    const content = fs.readFileSync(filename);
    response.writeHead(200, {
      'content-type': 'text/csv',
      'cache-control': 'no-store'
    });
    response.end(content);
  } catch (error) {
    console.error('SOURCE READ FAILURE:', error.message);
    response.writeHead(500).end('source failure');
  }
});

server.on('error', error => {
  console.error('SOURCE SERVER FAILURE:', error);
  process.exitCode = 1;
});

server.listen(0, '127.0.0.1', () => {
  process.send({
    kind: 'source-ready',
    pid: process.pid,
    endpoint: `http://127.0.0.1:${server.address().port}`,
    componentRoots
  });
});
