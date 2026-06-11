import { webcrypto } from 'crypto';
import fs from 'fs';
import path from 'path';

const { subtle } = webcrypto;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

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

  const pubKeyBytes = urlBase64ToUint8Array(pubKeyB64);
  const privKeyBytes = urlBase64ToUint8Array(privKeyB64);

  console.log('Public key bytes length:', pubKeyBytes.length);
  console.log('Private key bytes length:', privKeyBytes.length);

  // Import Public Key (SPKI)
  const publicKey = await subtle.importKey(
    'spki',
    pubKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    []
  );
  console.log('Public key imported successfully!');

  // Import Private Key (PKCS8)
  const privateKey = await subtle.importKey(
    'pkcs8',
    privKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  );
  console.log('Private key imported successfully!');

  // Sign a test token
  const testData = new TextEncoder().encode('test-token');
  const signature = await subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    testData
  );

  console.log('JWT signing successful! Signature length:', signature.byteLength);

} catch (e) {
  console.error('Validation failed:', e);
}
