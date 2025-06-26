import crypto from "crypto";
import bcrypt from "bcrypt";

// Rate limiting store (in-memory for development)
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Security utilities for authentication
export class AuthUtils {
  // Generate cryptographically secure token
  static generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Hash token for database storage
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Compare tokens securely (prevents timing attacks)
  static compareTokens(providedToken: string, storedHash: string): boolean {
    const providedHash = this.hashToken(providedToken);
    return crypto.timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  }

  // Generate expiration time for tokens
  static getTokenExpiration(minutes: number): Date {
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + minutes);
    return expiration;
  }

  // Hash password with bcrypt
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  // Verify password with bcrypt
  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword);
  }

  // Rate limiting for authentication endpoints
  static checkRateLimit(identifier: string, maxAttempts: number, windowMinutes: number): boolean {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    
    const entry = rateLimitStore.get(identifier);
    
    if (!entry || now > entry.resetTime) {
      // First attempt or window expired
      rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now + windowMs
      });
      return true;
    }
    
    if (entry.count >= maxAttempts) {
      return false; // Rate limit exceeded
    }
    
    // Increment count
    entry.count++;
    rateLimitStore.set(identifier, entry);
    return true;
  }

  // Get remaining time for rate limit reset
  static getRateLimitResetTime(identifier: string): number {
    const entry = rateLimitStore.get(identifier);
    if (!entry) return 0;
    
    const now = Date.now();
    return Math.max(0, Math.ceil((entry.resetTime - now) / 1000));
  }

  // Clean up expired rate limit entries
  static cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }

  // Validate email format
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Sanitize email input
  static sanitizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  // Generate rate limit key for email-based operations
  static getEmailRateLimitKey(email: string, operation: string): string {
    return `${operation}:${this.sanitizeEmail(email)}`;
  }

  // Generate rate limit key for IP-based operations
  static getIPRateLimitKey(ip: string, operation: string): string {
    return `${operation}:${ip}`;
  }
}

// Rate limiting middleware factory
export function createRateLimit(maxAttempts: number, windowMinutes: number, keyGenerator: (req: any) => string) {
  return (req: any, res: any, next: any) => {
    const key = keyGenerator(req);
    
    if (!AuthUtils.checkRateLimit(key, maxAttempts, windowMinutes)) {
      const resetTime = AuthUtils.getRateLimitResetTime(key);
      return res.status(429).json({
        success: false,
        error: "Too many attempts. Please try again later.",
        retryAfter: resetTime
      });
    }
    
    next();
  };
}

// Common rate limiters
export const passwordResetRateLimit = createRateLimit(
  3, // 3 attempts
  60, // per hour
  (req) => AuthUtils.getEmailRateLimitKey(req.body.email, 'password_reset')
);

export const magicLinkRateLimit = createRateLimit(
  5, // 5 attempts
  60, // per hour
  (req) => AuthUtils.getEmailRateLimitKey(req.body.email, 'magic_link')
);

export const ipBasedRateLimit = createRateLimit(
  10, // 10 attempts
  60, // per hour
  (req) => AuthUtils.getIPRateLimitKey(req.ip || req.connection.remoteAddress, 'auth')
);

// Cleanup interval for rate limiting (runs every 15 minutes)
setInterval(() => {
  AuthUtils.cleanupRateLimits();
}, 15 * 60 * 1000);