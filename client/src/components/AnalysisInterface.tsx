import { useState, useEffect } from "react";
import { Exercise } from "@/pages/home";
import CameraView from "@/components/CameraView";

interface AnalysisInterfaceProps {
  selectedExercise: Exercise;
  isActive: boolean;
  onStopAnalysis: () => void;
}

const exercises = {
  squat: { name: 'Squat', emoji: '🏋️' },
  pushup: { name: 'Push-up', emoji: '💪' },
  plank: { name: 'Plank', emoji: '🧘' }
};

interface Metrics {
  formQuality: number;
  reps: number;
  sessionTime: string;
}

interface FeedbackItem {
  type: 'success' | 'warning' | 'error';
  message: string;
  icon: string;
}

export default function AnalysisInterface({ 
  selectedExercise, 
  isActive, 
  onStopAnalysis 
}: AnalysisInterfaceProps) {
  const [metrics, setMetrics] = useState<Metrics>({
    formQuality: 92,
    reps: 0,
    sessionTime: '00:00'
  });

  const [feedback, setFeedback] = useState<FeedbackItem[]>([
    { type: 'success', message: 'Good knee alignment', icon: '✅' },
    { type: 'warning', message: 'Squat deeper for full range', icon: '⚠️' },
    { type: 'success', message: 'Excellent back posture', icon: '✅' }
  ]);

  const [sessionSeconds, setSessionSeconds] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    const timer = setInterval(() => {
      setSessionSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive]);

  useEffect(() => {
    const minutes = Math.floor(sessionSeconds / 60);
    const seconds = sessionSeconds % 60;
    setMetrics(prev => ({
      ...prev,
      sessionTime: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }));
  }, [sessionSeconds]);

  useEffect(() => {
    if (!isActive) return;

    const metricsInterval = setInterval(() => {
      setMetrics(prev => ({
        ...prev,
        formQuality: Math.floor(Math.random() * 20) + 80, // 80-100%
        reps: prev.reps + (Math.random() > 0.7 ? 1 : 0) // Occasionally increment reps
      }));

      // Update feedback occasionally
      if (Math.random() > 0.8) {
        const feedbackOptions = [
          { type: 'success' as const, message: 'Perfect form detected', icon: '✅' },
          { type: 'warning' as const, message: 'Maintain steady pace', icon: '⚠️' },
          { type: 'success' as const, message: 'Great core engagement', icon: '✅' },
          { type: 'warning' as const, message: 'Keep shoulders aligned', icon: '⚠️' },
          { type: 'success' as const, message: 'Optimal range of motion', icon: '✅' }
        ];
        
        const randomFeedback = feedbackOptions[Math.floor(Math.random() * feedbackOptions.length)];
        setFeedback(prev => [randomFeedback, ...prev.slice(0, 2)]);
      }
    }, 2000);

    return () => clearInterval(metricsInterval);
  }, [isActive]);

  const exercise = exercises[selectedExercise];

  return (
    <div className="max-w-6xl mx-auto mt-16">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        
        {/* Camera Feed Section */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-white mb-6">Live Camera Feed</h3>
          <CameraView isActive={isActive} />
        </div>

        {/* Real-time Feedback Section */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-white mb-6">AI Form Analysis</h3>
          
          {/* Current Exercise Display */}
          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
            <div className="flex items-center space-x-4 mb-4">
              <span className="text-4xl">{exercise.emoji}</span>
              <div>
                <h4 className="text-xl font-semibold text-white">{exercise.name} Analysis</h4>
                <p className="text-slate-400">Real-time form correction</p>
              </div>
            </div>
          </div>

          {/* Form Metrics */}
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-300">Form Quality</span>
                <span className="text-green-500 font-semibold">{metrics.formQuality}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${metrics.formQuality}%` }}
                ></div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-300">Repetitions</span>
                <span className="text-white font-semibold">{metrics.reps}</span>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-300">Session Time</span>
                <span className="text-white font-semibold">{metrics.sessionTime}</span>
              </div>
            </div>
          </div>

          {/* Real-time Feedback */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <h5 className="text-lg font-semibold text-white mb-3">Live Feedback</h5>
            <div className="space-y-2">
              {feedback.map((item, index) => (
                <div 
                  key={index}
                  className={`flex items-center space-x-2 ${
                    item.type === 'success' ? 'text-green-500' : 
                    item.type === 'warning' ? 'text-yellow-400' : 'text-red-400'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span className="text-sm">{item.message}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stop Analysis Button */}
          <button 
            onClick={onStopAnalysis}
            className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold py-3 px-6 rounded-xl border border-red-500/30 transition-all duration-200"
          >
            Stop Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
