/*
 * Small OS-encrypted store for "Remember Email".
 * Uses Electron safeStorage (DPAPI on Windows, Keychain on macOS).
 * The file sits in app.getPath('userData') encrypted; a casual disk scan
 * cannot read it. If the OS has no encryption available, we silently refuse
 * to persist (better than writing plaintext).
 *
 * This only stores the user's email convenience value. The session itself
 * (secret_key, session_id, cookies) is in-memory only and never touches disk.
 */
const { safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');

const FILENAME = 'remembered-email.enc';

function filePath() {
  return path.join(app.getPath('userData'), FILENAME);
}

function getSavedEmail() {
  try {
    const p = filePath();
    if (!fs.existsSync(p)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    const buf = fs.readFileSync(p);
    const email = safeStorage.decryptString(buf);
    return email || null;
  } catch (e) {
    console.log('[store] read email failed:', e.message);
    return null;
  }
}

function saveEmail(email) {
  try {
    if (!email) return false;
    if (!safeStorage.isEncryptionAvailable()) {
      console.log('[store] OS encryption unavailable — email not persisted');
      return false;
    }
    const enc = safeStorage.encryptString(String(email));
    fs.writeFileSync(filePath(), enc);
    return true;
  } catch (e) {
    console.log('[store] save email failed:', e.message);
    return false;
  }
}

function clearSavedEmail() {
  try {
    const p = filePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { getSavedEmail, saveEmail, clearSavedEmail };
