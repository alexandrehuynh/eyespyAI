import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireAuth } from "./auth";
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
  app.post("/api/exercise/session/start", requireAuth, async (req: any, res) => {
    try {
      const { exerciseType, cameraOrientation } = req.body;
      const sessionData = {
        userId: req.session.userId,
        exerciseType,
        cameraOrientation
      };
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
  app.put("/api/exercise/session/:id/end", requireAuth, async (req: any, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const { duration, totalReps, averageFormScore } = req.body;
      
      console.log(`Ending session ${sessionId} with data:`, { duration, totalReps, averageFormScore });
      
      // Verify session belongs to authenticated user
      const session = await storage.getSession(sessionId);
      if (!session || session.userId !== req.session.userId) {
        return res.status(404).json({ 
          success: false, 
          error: "Session not found" 
        });
      }
      
      console.log(`Session ${sessionId} before update:`, {
        id: session.id,
        exerciseType: session.exerciseType,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.duration,
        totalReps: session.totalReps,
        averageFormScore: session.averageFormScore
      });
      
      const updatedSession = await storage.updateSession(sessionId, {
        endTime: new Date(),
        duration,
        totalReps,
        averageFormScore
      });
      
      console.log(`Session ${sessionId} after update:`, {
        id: updatedSession?.id,
        exerciseType: updatedSession?.exerciseType,
        startTime: updatedSession?.startTime,
        endTime: updatedSession?.endTime,
        duration: updatedSession?.duration,
        totalReps: updatedSession?.totalReps,
        averageFormScore: updatedSession?.averageFormScore
      });

      if (!updatedSession) {
        return res.status(404).json({ 
          success: false, 
          error: "Session not found" 
        });
      }

      // Update user progress
      if (updatedSession.exerciseType) {
        const existingProgress = await storage.getUserProgress(
          req.session.userId, 
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
          req.session.userId, 
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

  // GET /api/exercise/sessions - Get current user's exercise sessions
  app.get("/api/exercise/sessions", requireAuth, async (req: any, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      
      const sessions = await storage.getUserSessions(req.session.userId, limit);
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
  app.post("/api/exercise/metrics", requireAuth, async (req: any, res) => {
    try {
      const metricData = insertExerciseMetricSchema.parse(req.body);
      
      // Verify session belongs to authenticated user
      const session = await storage.getSession(metricData.sessionId);
      if (!session || session.userId !== req.session.userId) {
        return res.status(403).json({ 
          success: false, 
          error: "Access denied" 
        });
      }
      
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
  app.post("/api/exercise/metrics/batch", requireAuth, async (req: any, res) => {
    try {
      const { metrics } = req.body;
      if (!Array.isArray(metrics)) {
        return res.status(400).json({ 
          success: false, 
          error: "Metrics must be an array" 
        });
      }

      console.log(`Recording metrics batch: ${metrics.length} metrics`);
      console.log('Sample metrics:', metrics.slice(0, 2));

      const validatedMetrics = metrics.map(metric => 
        insertExerciseMetricSchema.parse(metric)
      );
      
      // Verify all sessions belong to authenticated user
      for (const metric of validatedMetrics) {
        const session = await storage.getSession(metric.sessionId);
        if (!session || session.userId !== req.session.userId) {
          return res.status(403).json({ 
            success: false, 
            error: "Access denied" 
          });
        }
      }
      
      const savedMetrics = await storage.createMetricsBatch(validatedMetrics);
      console.log(`Successfully saved ${savedMetrics.length} metrics for session ${validatedMetrics[0]?.sessionId}`);
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
  app.get("/api/exercise/metrics/:sessionId", requireAuth, async (req: any, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      
      // Verify session belongs to authenticated user
      const session = await storage.getSession(sessionId);
      if (!session || session.userId !== req.session.userId) {
        return res.status(403).json({ 
          success: false, 
          error: "Access denied" 
        });
      }
      
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
  
  // GET /api/exercise/progress - Get current user's progress
  app.get("/api/exercise/progress", requireAuth, async (req: any, res) => {
    try {
      const exerciseType = req.query.exerciseType as string;
      
      const progress = await storage.getUserProgress(req.session.userId, exerciseType);
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
