import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, desc, lt, or, isNull } from "drizzle-orm";
import { 
  users, 
  exerciseSessions, 
  exerciseMetrics, 
  userProgress,
  authTokens,
  type User,
  type InsertUser,
  type InsertUserWithEmail,
  type ExerciseSession,
  type InsertExerciseSession,
  type ExerciseMetric,
  type InsertExerciseMetric,
  type UserProgress,
  type InsertUserProgress,
  type AuthToken,
  type InsertAuthToken
} from "../shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createUserWithEmail(user: InsertUserWithEmail): Promise<User>;
  updateUserPassword(userId: number, hashedPassword: string): Promise<User | undefined>;
  
  // Authentication token methods
  createAuthToken(token: InsertAuthToken): Promise<AuthToken>;
  getAuthToken(tokenHash: string, tokenType: string): Promise<AuthToken | undefined>;
  markTokenAsUsed(tokenId: number): Promise<AuthToken | undefined>;
  cleanupExpiredTokens(): Promise<void>;
  
  // Exercise session methods
  createSession(session: InsertExerciseSession): Promise<ExerciseSession>;
  getSession(id: number): Promise<ExerciseSession | undefined>;
  updateSession(id: number, updates: Partial<ExerciseSession>): Promise<ExerciseSession | undefined>;
  getUserSessions(userId: number, limit?: number): Promise<ExerciseSession[]>;
  
  // Exercise metrics methods
  createMetric(metric: InsertExerciseMetric): Promise<ExerciseMetric>;
  getSessionMetrics(sessionId: number): Promise<ExerciseMetric[]>;
  createMetricsBatch(metrics: InsertExerciseMetric[]): Promise<ExerciseMetric[]>;
  
  // User progress methods
  getUserProgress(userId: number, exerciseType?: string): Promise<UserProgress[]>;
  updateUserProgress(userId: number, exerciseType: string, updates: Partial<UserProgress>): Promise<UserProgress>;
}

// PostgreSQL Database Storage Implementation using Drizzle ORM
export class DatabaseStorage implements IStorage {
  private db;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    const sql = postgres(process.env.DATABASE_URL);
    this.db = drizzle(sql);
  }

  // User Management Methods
  async getUser(id: number): Promise<User | undefined> {
    try {
      const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting user:", error);
      throw new Error("Failed to retrieve user");
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const result = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting user by username:", error);
      throw new Error("Failed to retrieve user");
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const result = await this.db.insert(users).values(insertUser).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating user:", error);
      throw new Error("Failed to create user");
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting user by email:", error);
      throw new Error("Failed to retrieve user");
    }
  }

  async createUserWithEmail(insertUser: InsertUserWithEmail): Promise<User> {
    try {
      const result = await this.db.insert(users).values(insertUser).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating user with email:", error);
      throw new Error("Failed to create user");
    }
  }

  async updateUserPassword(userId: number, hashedPassword: string): Promise<User | undefined> {
    try {
      const result = await this.db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, userId))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error updating user password:", error);
      throw new Error("Failed to update password");
    }
  }

  // Authentication Token Methods
  async createAuthToken(token: InsertAuthToken): Promise<AuthToken> {
    try {
      const result = await this.db.insert(authTokens).values(token).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating auth token:", error);
      throw new Error("Failed to create authentication token");
    }
  }

  async getAuthToken(tokenHash: string, tokenType: string): Promise<AuthToken | undefined> {
    try {
      const result = await this.db
        .select()
        .from(authTokens)
        .where(and(
          eq(authTokens.tokenHash, tokenHash),
          eq(authTokens.tokenType, tokenType)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting auth token:", error);
      throw new Error("Failed to retrieve authentication token");
    }
  }

  async markTokenAsUsed(tokenId: number): Promise<AuthToken | undefined> {
    try {
      const result = await this.db
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(eq(authTokens.id, tokenId))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Error marking token as used:", error);
      throw new Error("Failed to mark token as used");
    }
  }

  async cleanupExpiredTokens(): Promise<void> {
    try {
      const now = new Date();
      await this.db
        .delete(authTokens)
        .where(lt(authTokens.expiresAt, now));
    } catch (error) {
      console.error("Error cleaning up expired tokens:", error);
      // Don't throw error for cleanup operations
    }
  }

  // Exercise Session Methods
  async createSession(session: InsertExerciseSession): Promise<ExerciseSession> {
    try {
      const result = await this.db.insert(exerciseSessions).values(session).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating session:", error);
      throw new Error("Failed to create exercise session");
    }
  }

  async getSession(id: number): Promise<ExerciseSession | undefined> {
    try {
      const result = await this.db.select().from(exerciseSessions).where(eq(exerciseSessions.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Error getting session:", error);
      throw new Error("Failed to retrieve session");
    }
  }

  async updateSession(id: number, updates: Partial<ExerciseSession>): Promise<ExerciseSession | undefined> {
    try {
      console.log(`🔄 [DB_UPDATE_DEBUG] Updating session ${id} with:`, updates);
      
      // First verify the session exists
      const existingSession = await this.db
        .select()
        .from(exerciseSessions)
        .where(eq(exerciseSessions.id, id))
        .limit(1);
      
      console.log(`🔍 [DB_UPDATE_DEBUG] Session ${id} exists in DB:`, {
        found: existingSession.length > 0,
        current: existingSession[0] || null
      });
      
      if (existingSession.length === 0) {
        console.error(`❌ [DB_UPDATE_DEBUG] Session ${id} not found in database`);
        return undefined;
      }
      
      // CRITICAL FIX: Ensure proper column mapping for database update
      const updateData = {
        ...updates,
        // Ensure proper data types and non-null values
        ...(updates.endTime && { endTime: updates.endTime }),
        ...(updates.duration !== undefined && { duration: Number(updates.duration) }),
        ...(updates.totalReps !== undefined && { totalReps: Number(updates.totalReps) }),
        ...(updates.averageFormScore !== undefined && { averageFormScore: Number(updates.averageFormScore) })
      };
      
      console.log(`🔧 [DB_UPDATE_DEBUG] Mapped update data:`, updateData);
      
      const result = await this.db
        .update(exerciseSessions)
        .set(updateData)
        .where(eq(exerciseSessions.id, id))
        .returning();
      
      console.log(`✅ [DB_UPDATE_DEBUG] Session ${id} updated successfully:`, result[0]);
      
      // Verify the update was persisted
      const verificationQuery = await this.db
        .select()
        .from(exerciseSessions)
        .where(eq(exerciseSessions.id, id))
        .limit(1);
      
      console.log(`🔍 [DB_UPDATE_DEBUG] Session ${id} verification after update:`, verificationQuery[0]);
      
      return result[0];
    } catch (error) {
      console.error(`❌ [DB_UPDATE_DEBUG] Error updating session ${id}:`, error);
      throw new Error("Failed to update session");
    }
  }

  async getUserSessions(userId: number, limit = 10): Promise<ExerciseSession[]> {
    try {
      console.log(`🔍 [DB_SESSIONS_DEBUG] Fetching sessions for user ${userId}, limit: ${limit}`);
      
      const result = await this.db
        .select()
        .from(exerciseSessions)
        .where(eq(exerciseSessions.userId, userId))
        .orderBy(desc(exerciseSessions.startTime))
        .limit(limit);
      
      console.log(`📊 [DB_SESSIONS_DEBUG] Found ${result.length} sessions for user ${userId}:`);
      result.forEach((session, index) => {
        console.log(`  ${index + 1}. Session ${session.id}: ${session.exerciseType}, ${session.totalReps} reps, ${session.averageFormScore}% form, ${session.duration}s`);
      });
      
      return result;
    } catch (error) {
      console.error(`❌ [DB_SESSIONS_DEBUG] Error getting user sessions for ${userId}:`, error);
      throw new Error("Failed to retrieve user sessions");
    }
  }

  // Exercise Metrics Methods
  async createMetric(metric: InsertExerciseMetric): Promise<ExerciseMetric> {
    try {
      const result = await this.db.insert(exerciseMetrics).values(metric).returning();
      return result[0];
    } catch (error) {
      console.error("Error creating metric:", error);
      throw new Error("Failed to create metric");
    }
  }

  async getSessionMetrics(sessionId: number): Promise<ExerciseMetric[]> {
    try {
      const result = await this.db
        .select()
        .from(exerciseMetrics)
        .where(eq(exerciseMetrics.sessionId, sessionId))
        .orderBy(exerciseMetrics.timestamp);
      return result;
    } catch (error) {
      console.error("Error getting session metrics:", error);
      throw new Error("Failed to retrieve session metrics");
    }
  }

  async createMetricsBatch(metrics: InsertExerciseMetric[]): Promise<ExerciseMetric[]> {
    try {
      if (metrics.length === 0) return [];
      const result = await this.db.insert(exerciseMetrics).values(metrics).returning();
      return result;
    } catch (error) {
      console.error("Error creating metrics batch:", error);
      throw new Error("Failed to create metrics batch");
    }
  }

  // User Progress Methods
  async getUserProgress(userId: number, exerciseType?: string): Promise<UserProgress[]> {
    try {
      const baseQuery = this.db.select().from(userProgress);
      
      if (exerciseType) {
        const result = await baseQuery.where(
          and(eq(userProgress.userId, userId), eq(userProgress.exerciseType, exerciseType))
        );
        return result;
      } else {
        const result = await baseQuery.where(eq(userProgress.userId, userId));
        return result;
      }
    } catch (error) {
      console.error("Error getting user progress:", error);
      throw new Error("Failed to retrieve user progress");
    }
  }

  async updateUserProgress(userId: number, exerciseType: string, updates: Partial<UserProgress>): Promise<UserProgress> {
    try {
      // First try to update existing record
      const existingResult = await this.db
        .update(userProgress)
        .set(updates)
        .where(and(eq(userProgress.userId, userId), eq(userProgress.exerciseType, exerciseType)))
        .returning();

      if (existingResult.length > 0) {
        return existingResult[0];
      }

      // If no existing record, create new one
      const newProgress: InsertUserProgress = {
        userId,
        exerciseType,
        totalSessions: 0,
        bestFormScore: 0,
        personalBestReps: 0,
        lastSessionDate: null,
        ...updates,
      };

      const result = await this.db.insert(userProgress).values(newProgress).returning();
      return result[0];
    } catch (error) {
      console.error("Error updating user progress:", error);
      throw new Error("Failed to update user progress");
    }
  }
}

export const storage = new DatabaseStorage();