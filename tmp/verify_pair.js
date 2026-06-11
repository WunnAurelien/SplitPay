import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

try {
  const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8');
  let pubKeyB64 = '';
  let privKeyB64 = '';

  for (const line of envContent.split('\n')) {
    if (line.startsWith('VITE_VAPID_PUBLIC_KEY=')) {
      pubKeyB64 = line.split('=')[1].trim();
    } else if (line.startsWith('VITE_VAPID_PRIVATE_KEY=')) {
      privKeyB64 = line.split('=')[1].trim();
    }
  }

  console.log('Public Key in .env:', pubKeyB64);
  console.log('Private Key in .env:', privKeyB64);

  const pubBytes = Buffer.from(pubKeyB64, 'base64url');
  const privBytes = Buffer.from(privKeyB64, 'base64url');

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privBytes);
  const derivedPub = ecdh.getPublicKey('base64url');

  console.log('Derived Public Key from Private:', derivedPub);
  console.log('Match?', pubKeyB64 === derivedPub ? 'YES! Match!' : 'NO! Mismatch!');

} catch (e) {
  console.error('Error during verification:', e.message);
}
