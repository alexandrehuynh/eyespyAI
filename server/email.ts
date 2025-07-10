import crypto from "crypto";

// Email service interface for authentication emails
export interface IEmailService {
  sendPasswordResetEmail(email: string, resetToken: string): Promise<void>;
  sendMagicLinkEmail(email: string, magicToken: string): Promise<void>;
}

// Console email service for development (logs emails instead of sending)
export class ConsoleEmailService implements IEmailService {
  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:5000'}/reset-password?token=${resetToken}`;
    
    console.log(`
=== PASSWORD RESET EMAIL ===
To: ${email}
Subject: Reset Your EyeSpy AI Password

Hi there,

You requested to reset your password for EyeSpy AI. Click the link below to reset your password:

${resetUrl}

This link will expire in 15 minutes for security reasons.

If you didn't request this password reset, please ignore this email.

Best regards,
EyeSpy AI Team
============================
    `);
  }

  async sendMagicLinkEmail(email: string, magicToken: string): Promise<void> {
    const magicUrl = `${process.env.APP_URL || 'http://localhost:5000'}/api/auth/magic?token=${magicToken}`;
    
    console.log(`
=== MAGIC LINK EMAIL ===
To: ${email}
Subject: Your EyeSpy AI Magic Link

Hi there,

Click the link below to sign in to EyeSpy AI:

${magicUrl}

This link will expire in 5 minutes for security reasons.

If you didn't request this sign-in link, please ignore this email.

Best regards,
EyeSpy AI Team
========================
    `);
  }
}

// Production email service (can be configured with Resend, SendGrid, etc.)
export class ProductionEmailService implements IEmailService {
  private apiKey: string;
  private fromEmail: string;

  constructor() {
    this.apiKey = process.env.EMAIL_API_KEY || '';
    this.fromEmail = process.env.FROM_EMAIL || 'auth@eyespy-ai.com';
    
    if (!this.apiKey) {
      console.warn('EMAIL_API_KEY not configured. Email service will not work in production.');
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:5000'}/reset-password?token=${resetToken}`;
    
    // TODO: Implement actual email sending with chosen provider (Resend/SendGrid)
    // For now, fall back to console logging
    console.log(`Would send password reset email to ${email} with URL: ${resetUrl}`);
    
    // Example Resend implementation:
    // const response = await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${this.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     from: this.fromEmail,
    //     to: email,
    //     subject: 'Reset Your EyeSpy AI Password',
    //     html: this.getPasswordResetTemplate(resetUrl),
    //   }),
    // });
  }

  async sendMagicLinkEmail(email: string, magicToken: string): Promise<void> {
    const magicUrl = `${process.env.APP_URL || 'http://localhost:5000'}/api/auth/magic?token=${magicToken}`;
    
    // TODO: Implement actual email sending
    console.log(`Would send magic link email to ${email} with URL: ${magicUrl}`);
  }

  private getPasswordResetTemplate(resetUrl: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a; color: #ffffff;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #10b981; margin: 0;">EyeSpy AI</h1>
          <p style="color: #9ca3af; margin: 5px 0;">AI-Powered Fitness Tracking</p>
        </div>
        
        <h2 style="color: #ffffff; margin-bottom: 20px;">Reset Your Password</h2>
        
        <p style="color: #d1d5db; line-height: 1.6; margin-bottom: 30px;">
          You requested to reset your password for EyeSpy AI. Click the button below to reset your password:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #10b981; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">
          This link will expire in 15 minutes for security reasons.<br>
          If you didn't request this password reset, please ignore this email.
        </p>
        
        <div style="border-top: 1px solid #374151; margin-top: 30px; padding-top: 20px; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            EyeSpy AI - AI-Powered Fitness Form Analysis
          </p>
        </div>
      </div>
    `;
  }

  private getMagicLinkTemplate(magicUrl: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a0a; color: #ffffff;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #10b981; margin: 0;">EyeSpy AI</h1>
          <p style="color: #9ca3af; margin: 5px 0;">AI-Powered Fitness Tracking</p>
        </div>
        
        <h2 style="color: #ffffff; margin-bottom: 20px;">Your Magic Sign-In Link</h2>
        
        <p style="color: #d1d5db; line-height: 1.6; margin-bottom: 30px;">
          Click the button below to sign in to EyeSpy AI:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${magicUrl}" style="background-color: #10b981; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Sign In Now
          </a>
        </div>
        
        <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">
          This link will expire in 5 minutes for security reasons.<br>
          If you didn't request this sign-in link, please ignore this email.
        </p>
        
        <div style="border-top: 1px solid #374151; margin-top: 30px; padding-top: 20px; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            EyeSpy AI - AI-Powered Fitness Form Analysis
          </p>
        </div>
      </div>
    `;
  }
}

// Create email service instance based on environment
export const emailService: IEmailService = process.env.NODE_ENV === 'production' 
  ? new ProductionEmailService() 
  : new ConsoleEmailService();