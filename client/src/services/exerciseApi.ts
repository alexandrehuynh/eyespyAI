// Custom API request function for exercise data
async function apiRequest<T>({
  method,
  endpoint,
  body,
}: {
  method: string;
  endpoint: string;
  body?: any;
}): Promise<T> {
  const res = await fetch(endpoint, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.data || data; // Handle both wrapped and unwrapped responses
}
import type { 
  ExerciseSession, 
  ExerciseMetric, 
  UserProgress,
  InsertExerciseSession,
  InsertExerciseMetric 
} from "@shared/schema";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SessionStartRequest {
  userId: number;
  exerciseType: string;
  cameraOrientation?: string;
}

export interface SessionEndRequest {
  duration: number;
  totalReps: number;
  averageFormScore: number;
}

export interface MetricsBatchRequest {
  metrics: InsertExerciseMetric[];
}

// Exercise Session API calls
export const exerciseApi = {
  // Start a new exercise session
  async startSession(data: SessionStartRequest): Promise<ApiResponse<{ sessionId: number; startTime: string }>> {
    try {
      const response = await apiRequest({
        method: "POST",
        endpoint: "/api/exercise/session/start",
        body: data,
      });
      return { success: true, data: response };
    } catch (error) {
      console.error("Failed to start session:", error);
      return { success: false, error: "Failed to start exercise session" };
    }
  },

  // End an exercise session
  async endSession(sessionId: number, data: SessionEndRequest): Promise<ApiResponse<ExerciseSession>> {
    try {
      const response = await apiRequest<ExerciseSession>({
        method: "PUT",
        endpoint: `/api/exercise/session/${sessionId}/end`,
        body: data,
      });
      return { success: true, data: response };
    } catch (error) {
      console.error("Failed to end session:", error);
      return { success: false, error: "Failed to end exercise session" };
    }
  },

  // Get user's exercise sessions
  async getUserSessions(userId: number, limit = 10): Promise<ApiResponse<ExerciseSession[]>> {
    try {
      const response = await apiRequest<ExerciseSession[]>({
        method: "GET",
        endpoint: `/api/exercise/sessions/${userId}?limit=${limit}`,
      });
      return { success: true, data: response };
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
      return { success: false, error: "Failed to fetch exercise sessions" };
    }
  },

  // Record a single exercise metric
  async recordMetric(metric: InsertExerciseMetric): Promise<ApiResponse<ExerciseMetric>> {
    try {
      const response = await apiRequest<ExerciseMetric>({
        method: "POST",
        endpoint: "/api/exercise/metrics",
        body: metric,
      });
      return { success: true, data: response };
    } catch (error) {
      console.error("Failed to record metric:", error);
      return { success: false, error: "Failed to record exercise metric" };
    }
  },

  // Record multiple exercise metrics efficiently
  async recordMetricsBatch(metrics: InsertExerciseMetric[]): Promise<ApiResponse<ExerciseMetric[]>> {
    try {
      const response = await apiRequest<ExerciseMetric[]>({
        method: "POST",
        endpoint: "/api/exercise/metrics/batch",
        body: { metrics },
      });
      return { success: true, data: response };
    } catch (error) {
      console.error("Failed to record metrics batch:", error);
      return { success: false, error: "Failed to record exercise metrics" };
    }
  },

  // Get metrics for a specific session
  async getSessionMetrics(sessionId: number): Promise<ApiResponse<ExerciseMetric[]>> {
    try {
      const response = await apiRequest<ExerciseMetric[]>({
        method: "GET",
        endpoint: `/api/exercise/metrics/${sessionId}`,
      });
      return { success: true, data: response };
    } catch (error) {
      console.error("Failed to fetch metrics:", error);
      return { success: false, error: "Failed to fetch exercise metrics" };
    }
  },

  // Get user progress data
  async getUserProgress(userId: number, exerciseType?: string): Promise<ApiResponse<UserProgress[]>> {
    try {
      const queryParam = exerciseType ? `?exerciseType=${exerciseType}` : '';
      const response = await apiRequest<UserProgress[]>({
        method: "GET",
        endpoint: `/api/exercise/progress/${userId}${queryParam}`,
      });
      return { success: true, data: response };
    } catch (error) {
      console.error("Failed to fetch progress:", error);
      return { success: false, error: "Failed to fetch user progress" };
    }
  },
};

// Utility functions for graceful degradation
export const withGracefulDegradation = <T>(
  apiCall: () => Promise<ApiResponse<T>>,
  fallback: T
) => {
  return async (): Promise<T> => {
    try {
      const result = await apiCall();
      return result.success && result.data ? result.data : fallback;
    } catch (error) {
      console.warn("API call failed, using fallback:", error);
      return fallback;
    }
  };
};