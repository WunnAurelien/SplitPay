import crypto from 'crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});

const publicKeyBase64 = publicKey
  .export({ type: 'spki', format: 'der' })
  .toString('base64url');

const privateKeyBase64 = privateKey
  .export({ type: 'pkcs8', format: 'der' })
  .toString('base64url');

console.log('VAPID Keys Generated successfully:');
console.log('Public Key (Base64URL):', publicKeyBase64);
console.log('Private Key (Base64URL):', privateKeyBase64);
