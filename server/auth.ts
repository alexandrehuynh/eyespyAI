import type { Express, Request } from "express";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { 
  insertUserSchema, 
  insertUserWithEmailSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  magicLinkRequestSchema
} from "../shared/schema";
import { emailService } from "./email";
import { 
  AuthUtils, 
  passwordResetRateLimit, 
  magicLinkRateLimit, 
  ipBasedRateLimit 
} from "./auth-utils";

// Extend session interface to include user data
declare module 'express-session' {
  interface SessionData {
    userId: number;
    username: string;
  }
}

interface AuthenticatedRequest extends Request {
  session: {
    userId: number;
    username: string;
    destroy: (callback: (err: any) => void) => void;
  } & any;
}

export function registerAuthRoutes(app: Express) {
  // POST /api/auth/register - User registration with password hashing
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = insertUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: "Username already exists"
        });
      }
      
      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Create user
      const user = await storage.createUser({
        username,
        password: hashedPassword
      });
      
      // Create session
      req.session.userId = user.id;
      req.session.username = user.username;
      
      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username
        }
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({
        success: false,
        error: "Registration failed"
      });
    }
  });

  // POST /api/auth/login - User login with session creation
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: "Username and password are required"
        });
      }
      
      // Find user
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: "Invalid username or password"
        });
      }
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: "Invalid username or password"
        });
      }
      
      // Create session
      req.session.userId = user.id;
      req.session.username = user.username;
      
      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        success: false,
        error: "Login failed"
      });
    }
  });

  // POST /api/auth/logout - Session destruction
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({
          success: false,
          error: "Logout failed"
        });
      }
      
      res.clearCookie('connect.sid');
      res.json({
        success: true,
        data: { message: "Logged out successfully" }
      });
    });
  });

  // GET /api/auth/me - Get current authenticated user
  app.get("/api/auth/me", (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({
        success: false,
        error: "Not authenticated"
      });
    }
    
    res.json({
      success: true,
      data: {
        id: req.session.userId,
        username: req.session.username
      }
    });
  });

  // POST /api/auth/register-with-email - Enhanced registration with email
  app.post("/api/auth/register-with-email", ipBasedRateLimit, async (req, res) => {
    try {
      const { username, password, email } = insertUserWithEmailSchema.parse(req.body);
      
      // Check if user already exists by username or email
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          error: "Username already exists"
        });
      }

      if (email) {
        const existingEmail = await storage.getUserByEmail(email);
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            error: "Email already registered"
          });
        }
      }
      
      // Hash password
      const hashedPassword = await AuthUtils.hashPassword(password);
      
      // Create user
      const user = await storage.createUserWithEmail({
        username,
        password: hashedPassword,
        email: email ? AuthUtils.sanitizeEmail(email) : ""
      });
      
      // Create session
      req.session.userId = user.id;
      req.session.username = user.username;
      
      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username
        }
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({
        success: false,
        error: "Registration failed"
      });
    }
  });

  // POST /api/auth/forgot-password - Request password reset
  app.post("/api/auth/forgot-password", passwordResetRateLimit, async (req, res) => {
    try {
      const { email } = passwordResetRequestSchema.parse(req.body);
      const sanitizedEmail = AuthUtils.sanitizeEmail(email);
      
      // Find user by email (don't reveal if email exists)
      const user = await storage.getUserByEmail(sanitizedEmail);
      
      if (user) {
        // Generate secure token
        const resetToken = AuthUtils.generateSecureToken();
        const tokenHash = AuthUtils.hashToken(resetToken);
        const expiresAt = AuthUtils.getTokenExpiration(15); // 15 minutes
        
        // Store token in database
        await storage.createAuthToken({
          userId: user.id,
          tokenHash,
          tokenType: 'password_reset',
          expiresAt,
          usedAt: null
        });
        
        // Send password reset email
        await emailService.sendPasswordResetEmail(sanitizedEmail, resetToken);
      }
      
      // Always return success to prevent email enumeration
      res.json({
        success: true,
        data: {
          message: "If an account with that email exists, a password reset link has been sent."
        }
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      res.status(500).json({
        success: false,
        error: "Password reset request failed"
      });
    }
  });

  // POST /api/auth/reset-password - Confirm password reset
  app.post("/api/auth/reset-password", ipBasedRateLimit, async (req, res) => {
    try {
      const { token, password } = passwordResetConfirmSchema.parse(req.body);
      
      // Hash the provided token for comparison
      const tokenHash = AuthUtils.hashToken(token);
      
      // Find valid token
      const authToken = await storage.getAuthToken(tokenHash, 'password_reset');
      
      if (!authToken || authToken.usedAt || authToken.expiresAt < new Date()) {
        return res.status(400).json({
          success: false,
          error: "Invalid or expired reset token"
        });
      }
      
      // Hash new password
      const hashedPassword = await AuthUtils.hashPassword(password);
      
      // Update user password
      await storage.updateUserPassword(authToken.userId, hashedPassword);
      
      // Mark token as used
      await storage.markTokenAsUsed(authToken.id);
      
      res.json({
        success: true,
        data: {
          message: "Password successfully reset"
        }
      });
    } catch (error) {
      console.error("Password reset confirmation error:", error);
      res.status(400).json({
        success: false,
        error: "Password reset failed"
      });
    }
  });

  // POST /api/auth/magic-link - Request magic link
  app.post("/api/auth/magic-link", magicLinkRateLimit, async (req, res) => {
    try {
      const { email } = magicLinkRequestSchema.parse(req.body);
      const sanitizedEmail = AuthUtils.sanitizeEmail(email);
      
      // Find user by email
      const user = await storage.getUserByEmail(sanitizedEmail);
      
      if (user) {
        // Generate secure token
        const magicToken = AuthUtils.generateSecureToken();
        const tokenHash = AuthUtils.hashToken(magicToken);
        const expiresAt = AuthUtils.getTokenExpiration(5); // 5 minutes
        
        // Store token in database
        await storage.createAuthToken({
          userId: user.id,
          tokenHash,
          tokenType: 'magic_link',
          expiresAt,
          usedAt: null
        });
        
        // Send magic link email
        await emailService.sendMagicLinkEmail(sanitizedEmail, magicToken);
      }
      
      // Always return success to prevent email enumeration
      res.json({
        success: true,
        data: {
          message: "If an account with that email exists, a magic link has been sent."
        }
      });
    } catch (error) {
      console.error("Magic link request error:", error);
      res.status(500).json({
        success: false,
        error: "Magic link request failed"
      });
    }
  });

  // GET /api/auth/magic - Verify magic link
  app.get("/api/auth/magic", ipBasedRateLimit, async (req, res) => {
    try {
      const token = req.query.token as string;
      
      if (!token) {
        return res.status(400).json({
          success: false,
          error: "Magic link token is required"
        });
      }
      
      // Hash the provided token for comparison
      const tokenHash = AuthUtils.hashToken(token);
      
      // Find valid token
      const authToken = await storage.getAuthToken(tokenHash, 'magic_link');
      
      if (!authToken || authToken.usedAt || authToken.expiresAt < new Date()) {
        return res.status(400).json({
          success: false,
          error: "Invalid or expired magic link"
        });
      }
      
      // Get user
      const user = await storage.getUser(authToken.userId);
      if (!user) {
        return res.status(400).json({
          success: false,
          error: "User not found"
        });
      }
      
      // Create session
      req.session.userId = user.id;
      req.session.username = user.username;
      
      // Mark token as used
      await storage.markTokenAsUsed(authToken.id);
      
      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          message: "Successfully signed in with magic link"
        }
      });
    } catch (error) {
      console.error("Magic link verification error:", error);
      res.status(400).json({
        success: false,
        error: "Magic link verification failed"
      });
    }
  });
}

// Authentication middleware
export function requireAuth(req: any, res: any, next: any) {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      error: "Authentication required"
    });
  }
  next();
}