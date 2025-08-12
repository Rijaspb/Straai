import * as crypto from 'crypto'

export class TokenManager {
  private readonly algorithm = 'aes-256-gcm'
  private readonly secretKey: Buffer

  constructor() {
    const keyString = process.env.ENCRYPTION_KEY || this.generateDefaultKey()
    this.secretKey = Buffer.from(keyString.slice(0, 64), 'hex') // Use first 32 bytes (64 hex chars)
    
    if (!process.env.ENCRYPTION_KEY) {
      console.warn('⚠️  ENCRYPTION_KEY not set. Using generated key for this session only.')
      console.warn('   Set ENCRYPTION_KEY in your .env file for persistent token encryption.')
    }
  }

  private generateDefaultKey(): string {
    // Generate a session-only key - tokens encrypted with this won't survive restarts
    return crypto.randomBytes(32).toString('hex')
  }

  async encrypt(text: string): Promise<string> {
    try {
      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv)
      
      let encrypted = cipher.update(text, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      
      const authTag = cipher.getAuthTag()
      
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
    } catch (error) {
      console.error('Token encryption failed:', error)
      throw new Error('Failed to encrypt token')
    }
  }

  async decrypt(encryptedText: string): Promise<string> {
    try {
      const parts = encryptedText.split(':')
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted token format')
      }

      const [ivHex, authTagHex, encrypted] = parts
      const iv = Buffer.from(ivHex, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv)
      decipher.setAuthTag(authTag)
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      
      return decrypted
    } catch (error) {
      console.error('Token decryption failed:', error)
      throw new Error('Failed to decrypt token')
    }
  }

  // Hash sensitive data for comparison without storing plaintext
  async hash(text: string): Promise<string> {
    return crypto.createHash('sha256').update(text).digest('hex')
  }

  // Generate secure random state for OAuth flows
  generateState(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  // Validate webhook signatures
  validateWebhookSignature(
    payload: string,
    signature: string,
    secret: string,
    algorithm: 'sha1' | 'sha256' = 'sha256'
  ): boolean {
    try {
      const expectedSignature = crypto
        .createHmac(algorithm, secret)
        .update(payload)
        .digest('hex')
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    } catch (error) {
      console.error('Webhook signature validation failed:', error)
      return false
    }
  }
}
