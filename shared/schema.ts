import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Exercise Sessions Table
export const exerciseSessions = pgTable("exercise_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  exerciseType: text("exercise_type").notNull(), // 'squat', 'pushup', 'plank'
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  duration: integer("duration_seconds"),
  totalReps: integer("total_reps").default(0),
  averageFormScore: integer("average_form_score"), // 0-100
  cameraOrientation: text("camera_orientation"), // 'portrait' or 'landscape'
});

// Exercise Metrics Table - Real-time measurements during exercise
export const exerciseMetrics = pgTable("exercise_metrics", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => exerciseSessions.id),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  repNumber: integer("rep_number"),
  formScore: integer("form_score").notNull(), // 0-100
  kneeAngle: integer("knee_angle"), // For squats
  elbowAngle: integer("elbow_angle"), // For push-ups  
  bodyLineAngle: integer("body_line_angle"), // For planks
  detectionQuality: text("detection_quality"), // 'poor', 'good', 'excellent'
});

// User Progress Table - Aggregated statistics
export const userProgress = pgTable("user_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  exerciseType: text("exercise_type").notNull(),
  totalSessions: integer("total_sessions").default(0),
  bestFormScore: integer("best_form_score").default(0),
  personalBestReps: integer("personal_best_reps").default(0),
  lastSessionDate: timestamp("last_session_date"),
});

// Insert schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertExerciseSessionSchema = createInsertSchema(exerciseSessions).omit({
  id: true,
  startTime: true,
});

export const insertExerciseMetricSchema = createInsertSchema(exerciseMetrics).omit({
  id: true,
  timestamp: true,
});

export const insertUserProgressSchema = createInsertSchema(userProgress).omit({
  id: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type ExerciseSession = typeof exerciseSessions.$inferSelect;
export type InsertExerciseSession = z.infer<typeof insertExerciseSessionSchema>;
export type ExerciseMetric = typeof exerciseMetrics.$inferSelect;
export type InsertExerciseMetric = z.infer<typeof insertExerciseMetricSchema>;
export type UserProgress = typeof userProgress.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;
