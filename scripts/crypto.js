// Client-side field encryption. The database only ever sees the output of these functions.
const crypto = require('node:crypto');

const keyFromB64 = (b64) => {
  const key = Buffer.from(b64 || '', 'base64');
  if (key.length !== 32) throw new Error('Key must be 32 bytes, base64 encoded');
  return key;
};

// aad binds a ciphertext to its row and column, so moving it to another row fails decryption.
function encrypt(plaintext, key, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

function decrypt(b64, key, aad) {
  const buf = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

const blindIndex = (value, key) => crypto.createHmac('sha256', key).update(value).digest('hex');

module.exports = { keyFromB64, encrypt, decrypt, blindIndex };
