import crypto from 'crypto';

const { publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});

const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
console.log('SPKI DER Length:', spkiDer.length); // Should be 91 bytes

const rawPublicKey = spkiDer.subarray(26);
console.log('Raw Public Key Length:', rawPublicKey.length); // Should be 65 bytes
console.log('Starts with 0x04:', rawPublicKey[0] === 0x04); // Should be true

const rawPublicKeyBase64Url = rawPublicKey.toString('base64url');
console.log('Raw Public Key (Base64URL):', rawPublicKeyBase64Url);
