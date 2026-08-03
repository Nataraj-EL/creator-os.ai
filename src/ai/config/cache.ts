import crypto from 'node:crypto';
import { ConfigCache } from './types';

export class SecureConfigCache implements ConfigCache {
  private cache: Map<string, { value: any; isSecret: boolean }> = new Map();
  private transientKey: Buffer;

  constructor() {
    this.transientKey = crypto.randomBytes(32);
  }

  public get(key: string): any {
    const cached = this.cache.get(key);
    if (!cached) return undefined;

    if (cached.isSecret) {
      return this.decrypt(cached.value);
    }
    return cached.value;
  }

  public set(key: string, value: any, isSecret = false): void {
    if (value === undefined) {
      this.delete(key);
      return;
    }

    if (isSecret) {
      const encrypted = this.encrypt(String(value));
      this.cache.set(key, { value: encrypted, isSecret: true });
    } else {
      this.cache.set(key, { value, isSecret: false });
    }
  }

  public delete(key: string): void {
    this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.transientKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    return JSON.stringify({
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      data: encrypted
    });
  }

  private decrypt(encryptedJson: string): string {
    try {
      const { iv, authTag, data } = JSON.parse(encryptedJson);
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.transientKey,
        Buffer.from(iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(authTag, 'base64'));
      let decrypted = decipher.update(data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err: any) {
      throw new Error(`Failed to decrypt cached secret: ${err.message}`);
    }
  }
}
