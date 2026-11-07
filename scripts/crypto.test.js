const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { keyFromB64, encrypt, decrypt, blindIndex } = require('./crypto');

const key = crypto.randomBytes(32);

test('round trip, including Vietnamese text', () => {
  assert.equal(decrypt(encrypt('Viêm phổi', key, 'p1:d'), key, 'p1:d'), 'Viêm phổi');
});

test('same plaintext gives different ciphertext', () => {
  assert.notEqual(encrypt('x', key, 'a'), encrypt('x', key, 'a'));
});

test('tampered ciphertext is rejected', () => {
  const buf = Buffer.from(encrypt('secret', key, 'a'), 'base64');
  buf[buf.length - 1] ^= 1;
  assert.throws(() => decrypt(buf.toString('base64'), key, 'a'));
});

test('ciphertext moved to another row or column is rejected', () => {
  assert.throws(() => decrypt(encrypt('secret', key, 'p1:d'), key, 'p2:d'));
});

test('wrong key is rejected', () => {
  assert.throws(() => decrypt(encrypt('secret', key, 'a'), crypto.randomBytes(32), 'a'));
});

test('blind index is stable and depends on the key', () => {
  assert.equal(blindIndex('999', key), blindIndex('999', key));
  assert.notEqual(blindIndex('999', key), blindIndex('999', crypto.randomBytes(32)));
});

test('bad key length is rejected', () => {
  assert.throws(() => keyFromB64('c2hvcnQ='));
});
