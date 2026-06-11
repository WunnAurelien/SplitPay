const spkiBase64Url = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAESTtHmD5s_Z2K4tNwepUdzJqV-KXxQ0LD9K_1wVeDBHG3sf2gMKMkRniOnwq2oBvLQxzI3QC9XosRA6MQx_fg8g';
const spkiDer = Buffer.from(spkiBase64Url, 'base64url');
const rawPublicKey = spkiDer.subarray(26);
console.log('Raw VAPID Public Key (Base64URL):', rawPublicKey.toString('base64url'));
