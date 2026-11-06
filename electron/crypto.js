/*
 * Cookie decryption — matches backend's AES-CBC (OpenSSL EVP) scheme in
 * routes/admin.js. The server stores:
 *   user.cookie_session = JSON.stringify([encryptedBlob1, encryptedBlob2, ...])
 * where each blob = CryptoJS.AES.encrypt(JSON.stringify({url, cookies}), MASTER_KEY).toString()
 *
 * The master key is hardcoded to match the backend. Phase 9 proposes moving it
 * to runtime-delivered (not shipped in the binary) — see PLAN.md.
 */
const CryptoJS = require('crypto-js');

const MASTER_KEY_BASE64 = 'aUxGQjB5SlNMc09idEg2dE5jZlhNcW83TDhxY0VIcVo=';
const MASTER_KEY = Buffer.from(MASTER_KEY_BASE64, 'base64').toString();

function decryptBlob(encryptedString) {
  const decrypted = CryptoJS.AES.decrypt(encryptedString, MASTER_KEY);
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/*
 * Input shape: the `cookies` field from /login/ response:
 *   [{ cookie: "<JSON-stringified-array-of-encrypted-blobs>" }]
 * Output: array of plaintext bundles:
 *   [{ url, cookies: [...] }, ...]
 */
function decryptCookieBundles(cookiesArray) {
  const bundles = [];
  if (!Array.isArray(cookiesArray)) return bundles;

  for (const entry of cookiesArray) {
    const raw = entry && entry.cookie;
    if (!raw) continue;
    let blobs;
    try { blobs = JSON.parse(raw); } catch (_) { continue; }
    if (!Array.isArray(blobs)) continue;

    for (const blob of blobs) {
      try {
        const decStr = decryptBlob(blob);
        if (!decStr) continue;
        const parsed = JSON.parse(decStr);

        if (parsed && parsed.url && Array.isArray(parsed.cookies)) {
          // Standard bundle: { url, cookies: [...] }
          bundles.push(parsed);
        } else if (parsed && parsed.domain && parsed.name) {
          // Single cookie item without wrapping — build a bundle
          const bareDomain = parsed.domain.replace(/^\./, '');
          bundles.push({
            url: 'https://' + bareDomain,
            cookies: [parsed],
          });
        }
      } catch (_) { /* skip bad blob */ }
    }
  }
  return bundles;
}

module.exports = { MASTER_KEY, decryptBlob, decryptCookieBundles };
