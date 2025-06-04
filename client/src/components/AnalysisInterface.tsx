import { useState, useCallback } from "react";
import { Exercise } from "@/pages/home";
import CameraView from "@/components/CameraView";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { Results } from "@mediapipe/pose";

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

export default function AnalysisInterface({ 
  selectedExercise, 
  isActive, 
  onStopAnalysis 
}: AnalysisInterfaceProps) {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  
  const { metrics, feedback, processPoseResultsCallback, repFlash } = usePoseDetection(selectedExercise, isActive);

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    setVideoElement(video);
  }, []);

  const handlePoseResults = useCallback((results: Results) => {
    processPoseResultsCallback(results);
  }, [processPoseResultsCallback]);

  const exercise = exercises[selectedExercise];

  return (
    <div className="max-w-6xl mx-auto mt-16">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        
        {/* Camera Feed Section */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-white mb-6">Live Camera Feed</h3>
          <div className="relative">
            <CameraView 
              isActive={isActive} 
              onVideoReady={handleVideoReady} 
              onPoseResults={handlePoseResults}
              trackingStatus={metrics.trackingStatus}
              detectionQuality={metrics.detectionQuality}
            />
            
            {/* Rep Flash Indicator */}
            {repFlash && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                <div className="bg-green-500/90 text-white px-8 py-4 rounded-2xl text-2xl font-bold animate-pulse">
                  🎯 REP DETECTED!
                </div>
              </div>
            )}
          </div>
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

          {/* Status Indicators */}
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-300">Person Detected</span>
                <span className={`font-semibold ${metrics.isPersonDetected ? 'text-green-500' : 'text-red-400'}`}>
                  {metrics.isPersonDetected ? '✅ Yes' : '❌ No'}
                </span>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <div className="flex justify-between items-center mb-2">
                <span className="text-slate-300">Exercising</span>
                <span className={`font-semibold ${metrics.isExercising ? 'text-green-500' : 'text-yellow-400'}`}>
                  {metrics.isExercising ? '✅ Active' : '⏸️ Standby'}
                </span>
              </div>
            </div>

            {metrics.isPersonDetected && metrics.isExercising && (
              <>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-300">Form Quality</span>
                    <span className={`font-semibold ${
                      metrics.formQuality >= 80 ? 'text-green-500' : 
                      metrics.formQuality >= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>{metrics.formQuality}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${
                        metrics.formQuality >= 80 ? 'bg-green-500' : 
                        metrics.formQuality >= 60 ? 'bg-yellow-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${metrics.formQuality}%` }}
                    ></div>
                  </div>
                </div>

                {selectedExercise !== 'plank' && (
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-slate-300">Repetitions</span>
                      <span className="text-white font-semibold">{metrics.reps}</span>
                    </div>
                  </div>
                )}

                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-300">Session Time</span>
                    <span className="text-white font-semibold">{metrics.sessionTime}</span>
                  </div>
                </div>
              </>
            )}
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
