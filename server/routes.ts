import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertExerciseSessionSchema, 
  insertExerciseMetricSchema,
  type ExerciseSession,
  type ExerciseMetric,
  type UserProgress
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Exercise Session Routes
  
  // POST /api/exercise/session/start - Start new exercise session
  app.post("/api/exercise/session/start", async (req, res) => {
    try {
      const sessionData = insertExerciseSessionSchema.parse(req.body);
      const session = await storage.createSession(sessionData);
      
      res.json({ 
        success: true, 
        data: { 
          sessionId: session.id, 
          startTime: session.startTime 
        } 
      });
    } catch (error) {
      console.error("Error starting session:", error);
      res.status(400).json({ 
        success: false, 
        error: "Failed to start exercise session" 
      });
    }
  });

  // PUT /api/exercise/session/:id/end - End exercise session
  app.put("/api/exercise/session/:id/end", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const { duration, totalReps, averageFormScore } = req.body;
      
      const updatedSession = await storage.updateSession(sessionId, {
        endTime: new Date(),
        duration,
        totalReps,
        averageFormScore
      });

      if (!updatedSession) {
        return res.status(404).json({ 
          success: false, 
          error: "Session not found" 
        });
      }

      // Update user progress
      if (updatedSession.exerciseType && updatedSession.userId) {
        const existingProgress = await storage.getUserProgress(
          updatedSession.userId, 
          updatedSession.exerciseType
        );
        
        const currentProgress = existingProgress[0];
        const progressUpdates = {
          totalSessions: (currentProgress?.totalSessions || 0) + 1,
          lastSessionDate: new Date(),
          ...(averageFormScore > (currentProgress?.bestFormScore || 0) && {
            bestFormScore: averageFormScore
          }),
          ...(totalReps > (currentProgress?.personalBestReps || 0) && {
            personalBestReps: totalReps
          })
        };

        await storage.updateUserProgress(
          updatedSession.userId, 
          updatedSession.exerciseType, 
          progressUpdates
        );
      }

      res.json({ success: true, data: updatedSession });
    } catch (error) {
      console.error("Error ending session:", error);
      res.status(400).json({ 
        success: false, 
        error: "Failed to end exercise session" 
      });
    }
  });

  // GET /api/exercise/sessions/:userId - Get user's exercise sessions
  app.get("/api/exercise/sessions/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      
      const sessions = await storage.getUserSessions(userId, limit);
      res.json({ success: true, data: sessions });
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch exercise sessions" 
      });
    }
  });

  // Exercise Metrics Routes
  
  // POST /api/exercise/metrics - Record single exercise metric
  app.post("/api/exercise/metrics", async (req, res) => {
    try {
      const metricData = insertExerciseMetricSchema.parse(req.body);
      const metric = await storage.createMetric(metricData);
      
      res.json({ success: true, data: metric });
    } catch (error) {
      console.error("Error creating metric:", error);
      res.status(400).json({ 
        success: false, 
        error: "Failed to record exercise metric" 
      });
    }
  });

  // POST /api/exercise/metrics/batch - Record multiple metrics efficiently
  app.post("/api/exercise/metrics/batch", async (req, res) => {
    try {
      const { metrics } = req.body;
      if (!Array.isArray(metrics)) {
        return res.status(400).json({ 
          success: false, 
          error: "Metrics must be an array" 
        });
      }

      const validatedMetrics = metrics.map(metric => 
        insertExerciseMetricSchema.parse(metric)
      );
      
      const savedMetrics = await storage.createMetricsBatch(validatedMetrics);
      res.json({ success: true, data: savedMetrics });
    } catch (error) {
      console.error("Error creating metrics batch:", error);
      res.status(400).json({ 
        success: false, 
        error: "Failed to record exercise metrics" 
      });
    }
  });

  // GET /api/exercise/metrics/:sessionId - Get session metrics
  app.get("/api/exercise/metrics/:sessionId", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const metrics = await storage.getSessionMetrics(sessionId);
      
      res.json({ success: true, data: metrics });
    } catch (error) {
      console.error("Error fetching metrics:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch exercise metrics" 
      });
    }
  });

  // User Progress Routes
  
  // GET /api/exercise/progress/:userId - Get user progress
  app.get("/api/exercise/progress/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const exerciseType = req.query.exerciseType as string;
      
      const progress = await storage.getUserProgress(userId, exerciseType);
      res.json({ success: true, data: progress });
    } catch (error) {
      console.error("Error fetching progress:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to fetch user progress" 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
