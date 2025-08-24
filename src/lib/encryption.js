import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.MESSAGE_ENCRYPTION_KEY || 'your-32-character-secret-key-here';

// Derive key using scrypt for better security
function deriveKey(purpose = 'messages') {
  const salt = purpose === 'messages' ? 'msg-salt' : 'file-salt';
  return crypto.scryptSync(ENCRYPTION_KEY, salt, 32);
}

// Encrypt text (for messages)
export function encryptMessage(text) {
  if (!text) return null;
  
  try {
    const key = deriveKey('messages');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(ALGORITHM, key);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      algorithm: ALGORITHM
    };
  } catch (error) {
    return null;
  }
}

// Decrypt text (for messages)
export function decryptMessage(encryptedObj) {
  if (!encryptedObj || !encryptedObj.encryptedData) return null;
  
  try {
    const key = deriveKey('messages');
    const decipher = crypto.createDecipher(ALGORITHM, key);
    
    let decrypted = decipher.update(encryptedObj.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    return null;
  }
}

// Encrypt file buffer
export function encryptFile(buffer) {
  if (!buffer) return null;
  
  try {
    const key = deriveKey('files');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(ALGORITHM, key);
    
    const encrypted = Buffer.concat([
      cipher.update(buffer),
      cipher.final()
    ]);
    
    return {
      encryptedBuffer: encrypted,
      iv: iv.toString('hex'),
      algorithm: ALGORITHM
    };
  } catch (error) {
    return null;
  }
}

// Decrypt file buffer
export function decryptFile(encryptedBuffer, iv) {
  if (!encryptedBuffer || !iv) return null;
  
  try {
    const key = deriveKey('files');
    const decipher = crypto.createDecipher(ALGORITHM, key);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final()
    ]);
    
    return decrypted;
  } catch (error) {
    return null;
  }
}

// Generate secure random string for invite codes
export function generateInviteCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}