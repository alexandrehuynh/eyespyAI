import { Exercise } from "@/pages/home";

interface ExerciseSelectorProps {
  selectedExercise: Exercise | null;
  onExerciseSelect: (exercise: Exercise) => void;
  onStartAnalysis: () => void;
  isAnalyzing: boolean;
}

const exercises = {
  squat: { 
    name: 'Squat', 
    emoji: '🏋️',
    description: 'Strengthen your legs and glutes with proper squat form. AI tracks your depth and alignment.'
  },
  pushup: { 
    name: 'Push-up', 
    emoji: '💪',
    description: 'Build upper body strength with perfect push-up technique. AI monitors your form and range.'
  },
  plank: { 
    name: 'Plank', 
    emoji: '🧘',
    description: 'Core stability and endurance training. AI ensures proper alignment and posture maintenance.'
  }
};

export default function ExerciseSelector({ 
  selectedExercise, 
  onExerciseSelect, 
  onStartAnalysis,
  isAnalyzing 
}: ExerciseSelectorProps) {
  if (isAnalyzing) return null;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Exercise Selection Header */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-4 text-white">Choose Your Exercise</h2>
        <p className="text-slate-400 text-lg">Select an exercise to begin AI-powered form analysis</p>
      </div>

      {/* Exercise Cards Container */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        {Object.entries(exercises).map(([key, exercise]) => (
          <div
            key={key}
            className={`bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20 ${
              selectedExercise === key
                ? 'border-blue-500 shadow-blue-500/50 bg-blue-500/10'
                : 'border-slate-700/50'
            }`}
            onClick={() => onExerciseSelect(key as Exercise)}
          >
            <div className="text-center">
              <div className="text-6xl mb-4">{exercise.emoji}</div>
              <h3 className="text-xl font-semibold mb-3 text-white">{exercise.name}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                {exercise.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Start Analysis Button */}
      <div className="text-center">
        <button
          className={`bg-green-500 hover:bg-green-600 text-white font-semibold py-4 px-8 rounded-xl text-lg transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-green-500/25 ${
            !selectedExercise ? 'opacity-50 cursor-not-allowed hover:scale-100' : ''
          }`}
          disabled={!selectedExercise}
          onClick={onStartAnalysis}
        >
          <span className="flex items-center justify-center space-x-2">
            <span>👁️</span>
            <span>Start AI Analysis</span>
          </span>
        </button>
      </div>
    </div>
  );
}
