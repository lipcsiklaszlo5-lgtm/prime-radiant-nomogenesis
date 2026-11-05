'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(
  'demo/nomogenesis_jury_demo.html',
  'utf8'
);

const first = JSON.parse(fs.readFileSync(
  'docs/evidence/R7-02B-01-transaction-witness.json',
  'utf8'
));

const second = JSON.parse(fs.readFileSync(
  'docs/evidence/R7-05C-public.json',
  'utf8'
));

const cert = JSON.parse(fs.readFileSync(
  'docs/evidence/R7-05C-genesis-certificate.json',
  'utf8'
)).genesis_certificate;

test('two recorded Testnet cases displayed', () => {
  assert.match(html, /id="testnet-comparison"/);
  assert.match(html, /TESTNET 01/);
  assert.match(html, /TESTNET 02/);
  assert.match(html, /1 minimal coalition/);
  assert.match(html, /3 minimal coalitions/);
});

test('both recorded presets are interactive', () => {
  assert.match(
    html,
    /data-example="second-testnet"/
  );

  assert.match(
    html,
    /b\.dataset\.example==='second-testnet'/
  );

  assert.match(html, /\?\[7,7,7\]/);
});

test('public evidence links reference actual cases', () => {
  assert.deepEqual(
    first.genesis_certificate.minimal_coalitions,
    [[1, 2, 3]]
  );

  assert.deepEqual(
    cert.minimal_coalitions,
    [[4, 5], [4, 6], [5, 6]]
  );

  assert.equal(
    second.certificate_hash,
    cert.certificate_hash
  );

  assert(html.includes(
    second.transactions.find(
      x => x.step === 'award'
    ).tx
  ));

  assert.match(
    html,
    /R7-05C-public\.json/
  );

  assert.match(
    html,
    /R7-05C-genesis-certificate\.json/
  );
});

test('simulation and limitations are explicit', () => {
  assert.match(
    html,
    /coalition-selection contract/
  );

  assert.match(
    html,
    /remain inconclusive/
  );

  assert.doesNotMatch(html, /private_key/);
  assert.doesNotMatch(html, /\/workspaces\//);
});
