import crypto from 'crypto';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

const keyStr = "BMc-okCdr14GUXs8gDMHV2eaWmgKYJBGNpLM4ukLtTPherOLVNdF0YxZrL5Fg7zoa1Xernk97bWcaUXH1pbE4Cc";
try {
  const bytes = urlBase64ToUint8Array(keyStr);
  console.log("Decoded bytes length:", bytes.length);
  console.log("First byte:", bytes[0].toString(16));
  
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPublicKey(Buffer.from(bytes));
  console.log("EC Validation: Public key is a VALID point on the prime256v1 curve!");
} catch (e) {
  console.log("EC Validation FAILED:", e.message);
}
