import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exerciseApi } from "@/services/exerciseApi";
import type { ExerciseSession, UserProgress } from "@shared/schema";
import { Exercise } from "@/pages/home";

interface ProgressDashboardProps {}

const exercises = {
  squat: { name: 'Squat', emoji: '🏋️', color: 'bg-blue-500' },
  pushup: { name: 'Push-up', emoji: '💪', color: 'bg-green-500' },
  plank: { name: 'Plank', emoji: '🧘', color: 'bg-purple-500' }
};

export default function ProgressDashboard({}: ProgressDashboardProps) {
  const [sessions, setSessions] = useState<ExerciseSession[]>([]);
  const [progress, setProgress] = useState<UserProgress[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise>('squat');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load recent sessions
        const sessionsResult = await exerciseApi.getUserSessions(20);
        if (sessionsResult.success && sessionsResult.data) {
          setSessions(sessionsResult.data);
        }

        // Load progress data
        const progressResult = await exerciseApi.getUserProgress();
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
  }, []);

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
          <div className="h-8 bg-slate-700/50 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-slate-800/50 rounded-xl border border-slate-700/50"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header with dark fitness theme */}
      <div className="text-center pb-8 border-b border-slate-700/50">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent mb-4">
          Exercise Progress
        </h1>
        <p className="text-slate-300 text-lg max-w-2xl mx-auto">
          Track your fitness journey and form improvements with AI-powered insights
        </p>
      </div>

      {/* Overview Cards with dark fitness theme */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(exercises).map(([type, config]) => {
          const exerciseProgress = getProgressForExercise(type as Exercise);
          return (
            <Card key={type} className="bg-slate-800/50 border-slate-700/50 hover:bg-slate-800/70 hover:border-slate-600/50 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-2xl">{config.emoji}</span>
                  <span>{config.name}</span>
                </CardTitle>
                <Badge className="bg-slate-700/80 text-slate-200 border-slate-600/50 hover:bg-slate-600/80">
                  {exerciseProgress?.totalSessions || 0} sessions
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Best Form Score</span>
                    <Badge className={`${getFormScoreColor(exerciseProgress?.bestFormScore)} text-white font-medium`}>
                      {exerciseProgress?.bestFormScore || 0}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Personal Best</span>
                    <span className="font-semibold text-white">{exerciseProgress?.personalBestReps || 0} reps</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Last Session</span>
                    <span className="text-sm text-slate-300">
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

      {/* Detailed Progress with dark theme */}
      <Card className="bg-slate-800/40 border-slate-700/50">
        <CardHeader className="border-b border-slate-700/30">
          <CardTitle className="text-xl font-semibold text-white">Session History</CardTitle>
          <CardDescription className="text-slate-400">Recent exercise sessions with detailed metrics</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs value={selectedExercise} onValueChange={(value) => setSelectedExercise(value as Exercise)}>
            <TabsList className="grid w-full grid-cols-3 bg-slate-700/50 border border-slate-600/50">
              {Object.entries(exercises).map(([type, config]) => (
                <TabsTrigger 
                  key={type} 
                  value={type}
                  className="text-slate-300 data-[state=active]:bg-slate-600 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-200"
                >
                  {config.emoji} {config.name}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {Object.keys(exercises).map((type) => (
              <TabsContent key={type} value={type} className="space-y-4">
                <div className="space-y-3">
                  {getRecentSessionsForExercise(type as Exercise).length > 0 ? (
                    getRecentSessionsForExercise(type as Exercise).map((session) => (
                      <div key={session.id} className="flex items-center justify-between p-4 bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/30 rounded-xl transition-all duration-200">
                        <div className="flex items-center space-x-4">
                          <div className={`w-3 h-3 rounded-full ${getFormScoreColor(session.averageFormScore)} shadow-lg`}></div>
                          <div>
                            <p className="font-medium text-white">{formatDate(session.startTime)}</p>
                            <p className="text-sm text-slate-400">
                              Duration: {formatDuration(session.duration)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <p className="font-semibold text-white">{session.totalReps || 0} reps</p>
                            <p className="text-sm text-slate-400">
                              Form: {session.averageFormScore || 0}%
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      <div className="text-6xl mb-4 opacity-50">🏋️</div>
                      <p className="text-lg font-medium text-slate-300 mb-2">No {exercises[type as keyof typeof exercises].name.toLowerCase()} sessions yet</p>
                      <p className="text-sm text-slate-500">Start exercising to see your progress here!</p>
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