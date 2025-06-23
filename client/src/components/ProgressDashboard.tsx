import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exerciseApi } from "@/services/exerciseApi";
import type { ExerciseSession, UserProgress } from "@shared/schema";
import { Exercise } from "@/pages/home";

interface ProgressDashboardProps {
  userId: number;
}

const exercises = {
  squat: { name: 'Squat', emoji: '🏋️', color: 'bg-blue-500' },
  pushup: { name: 'Push-up', emoji: '💪', color: 'bg-green-500' },
  plank: { name: 'Plank', emoji: '🧘', color: 'bg-purple-500' }
};

export default function ProgressDashboard({ userId }: ProgressDashboardProps) {
  const [sessions, setSessions] = useState<ExerciseSession[]>([]);
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise>('squat');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load recent sessions
        const sessionsResult = await exerciseApi.getUserSessions(userId, 20);
        if (sessionsResult.success && sessionsResult.data) {
          setSessions(sessionsResult.data);
        }

        // Load progress data
        const progressResult = await exerciseApi.getUserProgress(userId);
        if (progressResult.success && progressResult.data) {
          setProgress(progressResult.data);
        }
      } catch (error) {
        console.error("Failed to load progress data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [userId]);

  const getProgressForExercise = (exerciseType: Exercise) => {
    return progress.find(p => p.exerciseType === exerciseType);
  };

  const getRecentSessionsForExercise = (exerciseType: Exercise) => {
    return sessions
      .filter(s => s.exerciseType === exerciseType)
      .slice(0, 5);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0s";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString();
  };

  const getFormScoreColor = (score: number | null) => {
    if (!score) return "bg-gray-500";
    if (score >= 90) return "bg-green-500";
    if (score >= 70) return "bg-yellow-500";
    return "bg-red-500";
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Exercise Progress</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Track your fitness journey and form improvements</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(exercises).map(([type, config]) => {
          const exerciseProgress = getProgressForExercise(type as Exercise);
          return (
            <Card key={type} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {config.emoji} {config.name}
                </CardTitle>
                <Badge variant="secondary">
                  {exerciseProgress?.totalSessions || 0} sessions
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Best Form Score</span>
                    <Badge className={getFormScoreColor(exerciseProgress?.bestFormScore)}>
                      {exerciseProgress?.bestFormScore || 0}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Personal Best</span>
                    <span className="font-semibold">{exerciseProgress?.personalBestReps || 0} reps</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Last Session</span>
                    <span className="text-sm">
                      {exerciseProgress?.lastSessionDate 
                        ? formatDate(exerciseProgress.lastSessionDate)
                        : "Never"
                      }
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detailed Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Session History</CardTitle>
          <CardDescription>Recent exercise sessions with detailed metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedExercise} onValueChange={(value) => setSelectedExercise(value as Exercise)}>
            <TabsList className="grid w-full grid-cols-3">
              {Object.entries(exercises).map(([type, config]) => (
                <TabsTrigger key={type} value={type}>
                  {config.emoji} {config.name}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {Object.keys(exercises).map((type) => (
              <TabsContent key={type} value={type} className="space-y-4">
                <div className="space-y-3">
                  {getRecentSessionsForExercise(type as Exercise).length > 0 ? (
                    getRecentSessionsForExercise(type as Exercise).map((session) => (
                      <div key={session.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className={`w-3 h-3 rounded-full ${getFormScoreColor(session.averageFormScore)}`}></div>
                          <div>
                            <p className="font-medium">{formatDate(session.startTime)}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Duration: {formatDuration(session.duration)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <p className="font-semibold">{session.totalReps || 0} reps</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Form: {session.averageFormScore || 0}%
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <p>No {exercises[type as keyof typeof exercises].name.toLowerCase()} sessions yet</p>
                      <p className="text-sm">Start exercising to see your progress here!</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}