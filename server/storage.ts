import { 
  users, 
  exerciseSessions,
  exerciseMetrics,
  userProgress,
  type User, 
  type InsertUser,
  type ExerciseSession,
  type InsertExerciseSession,
  type ExerciseMetric,
  type InsertExerciseMetric,
  type UserProgress,
  type InsertUserProgress
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private sessions: Map<number, ExerciseSession>;
  private metrics: Map<number, ExerciseMetric>;
  private progress: Map<string, UserProgress>; // key: userId-exerciseType
  private currentUserId: number;
  private currentSessionId: number;
  private currentMetricId: number;
  private currentProgressId: number;

  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.metrics = new Map();
    this.progress = new Map();
    this.currentUserId = 1;
    this.currentSessionId = 1;
    this.currentMetricId = 1;
    this.currentProgressId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Exercise session methods
  async createSession(session: InsertExerciseSession): Promise<ExerciseSession> {
    const id = this.currentSessionId++;
    const exerciseSession: ExerciseSession = {
      ...session,
      id,
      startTime: new Date(),
      endTime: null,
      duration: null,
      totalReps: 0,
      averageFormScore: null,
    };
    this.sessions.set(id, exerciseSession);
    return exerciseSession;
  }

  async getSession(id: number): Promise<ExerciseSession | undefined> {
    return this.sessions.get(id);
  }

  async updateSession(id: number, updates: Partial<ExerciseSession>): Promise<ExerciseSession | undefined> {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updates };
    this.sessions.set(id, updatedSession);
    return updatedSession;
  }

  async getUserSessions(userId: number, limit = 10): Promise<ExerciseSession[]> {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  // Exercise metrics methods
  async createMetric(metric: InsertExerciseMetric): Promise<ExerciseMetric> {
    const id = this.currentMetricId++;
    const exerciseMetric: ExerciseMetric = {
      ...metric,
      id,
      timestamp: new Date(),
    };
    this.metrics.set(id, exerciseMetric);
    return exerciseMetric;
  }

  async getSessionMetrics(sessionId: number): Promise<ExerciseMetric[]> {
    return Array.from(this.metrics.values())
      .filter(metric => metric.sessionId === sessionId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async createMetricsBatch(metrics: InsertExerciseMetric[]): Promise<ExerciseMetric[]> {
    const results: ExerciseMetric[] = [];
    for (const metric of metrics) {
      const result = await this.createMetric(metric);
      results.push(result);
    }
    return results;
  }

  // User progress methods
  async getUserProgress(userId: number, exerciseType?: string): Promise<UserProgress[]> {
    const progressList = Array.from(this.progress.values())
      .filter(progress => progress.userId === userId);
    
    if (exerciseType) {
      return progressList.filter(progress => progress.exerciseType === exerciseType);
    }
    
    return progressList;
  }

  async updateUserProgress(userId: number, exerciseType: string, updates: Partial<UserProgress>): Promise<UserProgress> {
    const key = `${userId}-${exerciseType}`;
    let progress = this.progress.get(key);
    
    if (!progress) {
      // Create new progress record
      const id = this.currentProgressId++;
      progress = {
        id,
        userId,
        exerciseType,
        totalSessions: 0,
        bestFormScore: 0,
        personalBestReps: 0,
        lastSessionDate: null,
        ...updates,
      };
    } else {
      // Update existing progress
      progress = { ...progress, ...updates };
    }
    
    this.progress.set(key, progress);
    return progress;
  }
}

export const storage = new MemStorage();
