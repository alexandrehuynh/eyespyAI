import type { Express, Request } from "express";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";

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