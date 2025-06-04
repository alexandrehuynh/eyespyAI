import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import ExerciseSelector from "@/components/ExerciseSelector";
import AnalysisInterface from "@/components/AnalysisInterface";

export type Exercise = 'squat' | 'pushup' | 'plank';

export default function Home() {
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleExerciseSelect = (exercise: Exercise) => {
    setSelectedExercise(exercise);
  };

  const handleStartAnalysis = () => {
    if (selectedExercise) {
      setIsAnalyzing(true);
    }
  };

  const handleStopAnalysis = () => {
    setIsAnalyzing(false);
    setSelectedExercise(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-black text-white overflow-x-hidden">
      <AppHeader />
      
      <main className="container mx-auto px-6 pb-12">
        <ExerciseSelector
          selectedExercise={selectedExercise}
          onExerciseSelect={handleExerciseSelect}
          onStartAnalysis={handleStartAnalysis}
          isAnalyzing={isAnalyzing}
        />
        
        {isAnalyzing && selectedExercise && (
          <AnalysisInterface
            selectedExercise={selectedExercise}
            isActive={isAnalyzing}
            onStopAnalysis={handleStopAnalysis}
          />
        )}
      </main>

      {/* Feature Highlights Section */}
      <section className="container mx-auto px-6 py-16 border-t border-slate-800/50">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-3xl font-bold text-center mb-12 text-white">Why Choose EyeSpy AI?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="text-5xl mb-4">🎯</div>
              <h4 className="text-xl font-semibold mb-3 text-white">Precision Tracking</h4>
              <p className="text-slate-400">Advanced pose estimation technology ensures accurate form analysis in real-time.</p>
            </div>
            <div className="text-center p-6">
              <div className="text-5xl mb-4">🛡️</div>
              <h4 className="text-xl font-semibold mb-3 text-white">Injury Prevention</h4>
              <p className="text-slate-400">AI-powered corrections help prevent injuries by maintaining proper exercise form.</p>
            </div>
            <div className="text-center p-6">
              <div className="text-5xl mb-4">📈</div>
              <h4 className="text-xl font-semibold mb-3 text-white">Progress Tracking</h4>
              <p className="text-slate-400">Detailed analytics and progress tracking to optimize your workout routine.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
