import { useState, useCallback, useEffect, useRef } from "react";
import { Exercise } from "@/pages/home";
import CameraView from "@/components/CameraView";
import { usePoseDetection } from "@/hooks/usePoseDetection";
import { Results } from "@mediapipe/pose";
import { exerciseApi } from "@/services/exerciseApi";
import type { InsertExerciseMetric } from "@shared/schema";

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
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string>('');
  const [camerasEnumerated, setCamerasEnumerated] = useState(false);
  
  // Session management state - independent of detection status
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionActive, setSessionActive] = useState(false); // Track session lifecycle separately from detection
  const metricsBuffer = useRef<InsertExerciseMetric[]>([]);
  const lastMetricTime = useRef<number>(0);
  const lastDetectionLogTime = useRef<number>(0);
  const METRIC_INTERVAL_MS = 1000; // Record metrics every second
  const BATCH_SIZE = 10; // Send metrics in batches of 10
  const DETECTION_LOG_INTERVAL_MS = 5000; // Log detection status every 5 seconds
  
  // Set default camera orientation based on exercise type
  const getDefaultOrientation = (exercise: Exercise) => {
    switch (exercise) {
      case 'squat':
        return true; // Portrait for vertical movement
      case 'pushup':
      case 'plank':
        return false; // Landscape for horizontal body positions
      default:
        return true;
    }
  };
  
  const [isPortraitMode, setIsPortraitMode] = useState(getDefaultOrientation(selectedExercise));

  // Get available cameras on component mount
  // Handle camera enumeration callback from CameraView
  const handleCamerasEnumerated = useCallback((cameras: MediaDeviceInfo[]) => {
    console.log('Cameras enumerated in AnalysisInterface:', cameras);
    setAvailableCameras(cameras);
    setCamerasEnumerated(true);
    
    // Set default camera if not already set (prefer front camera)
    if (cameras.length > 0 && !currentCameraId) {
      const frontCamera = cameras.find(device => 
        device.label.toLowerCase().includes('front') || 
        device.label.toLowerCase().includes('user')
      );
      const defaultCamera = frontCamera || cameras[0];
      console.log('Setting default camera:', defaultCamera.label);
      setCurrentCameraId(defaultCamera.deviceId);
    }
  }, [currentCameraId]);
  
  // Update camera orientation when exercise changes
  useEffect(() => {
    setIsPortraitMode(getDefaultOrientation(selectedExercise));
  }, [selectedExercise]);
  
  const { metrics, feedback, processPoseResultsCallback, repFlash } = usePoseDetection(selectedExercise, isActive);

  // Start exercise session ONLY when user manually starts analysis (not based on detection)
  useEffect(() => {
    if (isActive && !sessionActive) {
      const startSession = async () => {
        try {
          const result = await exerciseApi.startSession({
            exerciseType: selectedExercise,
            cameraOrientation: isPortraitMode ? 'portrait' : 'landscape'
          });
          
          if (result.success && result.data) {
            setCurrentSessionId(result.data.sessionId);
            setSessionStartTime(new Date());
            setSessionActive(true);
            console.log(`✅ Started NEW exercise session ${result.data.sessionId} for ${selectedExercise} (user initiated)`);
          }
        } catch (error) {
          console.warn("Failed to start session, continuing without database tracking:", error);
        }
      };
      
      startSession();
    }
  }, [isActive, selectedExercise, isPortraitMode, sessionActive]);

  // Record exercise metrics periodically - only when person is detected
  useEffect(() => {
    if (isActive && currentSessionId && metrics && metrics.isPersonDetected) {
      const now = Date.now();
      
      // Only record metrics at specified intervals to avoid overwhelming the database
      if (now - lastMetricTime.current >= METRIC_INTERVAL_MS) {
        const metric: InsertExerciseMetric = {
          sessionId: currentSessionId,
          formScore: metrics.formQuality,
          repNumber: metrics.reps,
          detectionQuality: metrics.detectionQuality,
          // Exercise-specific angle data
          ...(selectedExercise === 'squat' && metrics.currentAngles?.angles?.[0] && {
            kneeAngle: Math.round(metrics.currentAngles.angles[0].value || 0)
          }),
          ...(selectedExercise === 'pushup' && metrics.currentAngles?.angles?.[0] && {
            elbowAngle: Math.round(metrics.currentAngles.angles[0].value || 0)
          }),
          ...(selectedExercise === 'plank' && metrics.currentAngles?.angles?.[0] && {
            bodyLineAngle: Math.round(metrics.currentAngles.angles[0].value || 0)
          })
        };
        
        metricsBuffer.current.push(metric);
        lastMetricTime.current = now;
        
        console.log(`Recording metric for session ${currentSessionId}: reps=${metrics.reps}, form=${metrics.formQuality}%, detection=${metrics.isPersonDetected}`);
        
        // Send metrics in batches for efficiency
        if (metricsBuffer.current.length >= BATCH_SIZE) {
          const batchToSend = [...metricsBuffer.current];
          metricsBuffer.current = [];
          
          console.log(`Recording metrics batch for session ${currentSessionId}:`, {
            batchSize: batchToSend.length,
            latestMetric: batchToSend[batchToSend.length - 1]
          });
          
          exerciseApi.recordMetricsBatch(batchToSend).catch(error => {
            console.warn("Failed to record metrics batch:", error);
          });
        }
      }
    } else if (isActive && currentSessionId && metrics && !metrics.isPersonDetected) {
      // Log when metrics collection is paused due to detection loss
      console.log(`Metrics collection paused for session ${currentSessionId}: person not detected`);
    }
  }, [isActive, currentSessionId, metrics, selectedExercise]);

  // End session ONLY when user manually stops analysis (not based on detection loss)
  useEffect(() => {
    if (!isActive && sessionActive && currentSessionId && sessionStartTime) {
      const endSession = async () => {
        try {
          console.log(`🛑 User stopped analysis - ending session ${currentSessionId}`);
          
          // Send any remaining metrics in buffer
          if (metricsBuffer.current.length > 0) {
            console.log(`📤 Sending final metrics batch: ${metricsBuffer.current.length} metrics`);
            await exerciseApi.recordMetricsBatch([...metricsBuffer.current]);
            metricsBuffer.current = [];
          }
          
          // Calculate duration
          const duration = Math.round((Date.now() - sessionStartTime.getTime()) / 1000);
          
          // Get all recorded metrics for this session to calculate accurate summary
          const metricsResult = await exerciseApi.getSessionMetrics(currentSessionId);
          
          let sessionEndData;
          if (metricsResult.success && metricsResult.data && metricsResult.data.length > 0) {
            // Calculate aggregate statistics from all recorded metrics
            const allMetrics = metricsResult.data;
            const maxReps = Math.max(...allMetrics.map(m => m.repNumber || 0));
            const avgFormScore = Math.round(
              allMetrics.reduce((sum, m) => sum + (m.formScore || 0), 0) / allMetrics.length
            );
            
            sessionEndData = {
              duration,
              totalReps: maxReps,
              averageFormScore: avgFormScore
            };
            
            console.log(`📊 Session ${currentSessionId} final summary: ${allMetrics.length} data points, max reps: ${maxReps}, avg form: ${avgFormScore}%`);
          } else {
            // Fallback to live metrics if no recorded metrics found
            sessionEndData = {
              duration,
              totalReps: metrics?.reps || 0,
              averageFormScore: Math.round(metrics?.formQuality || 0)
            };
            
            console.warn(`⚠️ No recorded metrics found for session ${currentSessionId}, using live metrics as fallback`);
          }
          
          console.log(`📤 [FRONTEND_DEBUG] Sending session end request for session ${currentSessionId}:`, sessionEndData);
          const result = await exerciseApi.endSession(currentSessionId, sessionEndData);
          
          console.log(`📥 [FRONTEND_DEBUG] Session end API response:`, {
            success: result.success,
            data: result.data,
            error: result.error
          });
          
          if (result.success) {
            console.log(`✅ [FRONTEND_DEBUG] Successfully ended session ${currentSessionId} - ${duration}s, ${sessionEndData.totalReps} reps, ${sessionEndData.averageFormScore}% form`);
          } else {
            console.error(`❌ [FRONTEND_DEBUG] Failed to end session ${currentSessionId}:`, result.error);
          }
        } catch (error) {
          console.warn("Failed to end session properly:", error);
        } finally {
          // Clear session state only after successful completion
          setCurrentSessionId(null);
          setSessionStartTime(null);
          setSessionActive(false);
          console.log(`🧹 Cleared session state`);
        }
      };
      
      endSession();
    }
  }, [isActive, currentSessionId, sessionStartTime, metrics]);

  const handleVideoReady = useCallback((video: HTMLVideoElement) => {
    setVideoElement(video);
  }, []);

  const handlePoseResults = useCallback((results: Results) => {
    processPoseResultsCallback(results);
  }, [processPoseResultsCallback]);

  // Handle camera switching
  const handleCameraSwitch = (targetType: 'front' | 'back') => {
    console.log(`Attempting to switch to ${targetType} camera`);
    console.log('Available cameras:', availableCameras.map(cam => ({ id: cam.deviceId, label: cam.label })));
    
    const targetCamera = availableCameras.find(camera => {
      const label = camera.label.toLowerCase();
      if (targetType === 'front') {
        return label.includes('front') || label.includes('user');
      } else {
        return label.includes('back') || label.includes('environment');
      }
    });
    
    if (targetCamera) {
      console.log(`Switching to camera: ${targetCamera.label} (${targetCamera.deviceId})`);
      setCurrentCameraId(targetCamera.deviceId);
    } else {
      console.log(`No ${targetType} camera found, available cameras:`, availableCameras);
    }
  };

  // Get current camera type for visual feedback
  const getCurrentCameraType = () => {
    const currentCamera = availableCameras.find(camera => camera.deviceId === currentCameraId);
    if (currentCamera) {
      const label = currentCamera.label.toLowerCase();
      if (label.includes('front') || label.includes('user')) {
        return 'front';
      } else if (label.includes('back') || label.includes('environment')) {
        return 'back';
      }
    }
    return null;
  };

  const exercise = exercises[selectedExercise];

  return (
    <div className="max-w-6xl mx-auto mt-16">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        
        {/* Camera Feed Section */}
        <div className="space-y-6">
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-white mb-4">Live Camera Feed</h3>
            
            {/* Camera Controls Row */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              {/* Orientation Toggle */}
              <button
                onClick={() => setIsPortraitMode(!isPortraitMode)}
                className="flex items-center justify-between bg-slate-700/50 hover:bg-slate-600/50 text-white px-4 py-2 rounded-lg border border-slate-600/50 transition-all duration-200 min-w-[130px] touch-manipulation"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-colors ${
                    isPortraitMode ? 'bg-blue-400' : 'bg-orange-400'
                  }`}></div>
                  <span className="font-medium">{isPortraitMode ? 'Portrait' : 'Landscape'}</span>
                </div>
                <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4" />
                </svg>
              </button>

              {/* Camera Toggle */}
              <button
                onClick={() => {
                  const currentType = getCurrentCameraType();
                  if (currentType === 'front') {
                    handleCameraSwitch('back');
                  } else {
                    handleCameraSwitch('front');
                  }
                }}
                className={`flex items-center justify-between px-4 py-2 rounded-lg border transition-all duration-200 min-w-[130px] touch-manipulation ${
                  !camerasEnumerated || availableCameras.length <= 1 
                    ? 'opacity-50 cursor-not-allowed bg-slate-700/30 border-slate-600/30' 
                    : 'bg-slate-700/50 hover:bg-slate-600/50 border-slate-600/50'
                } text-white`}
                disabled={!camerasEnumerated || availableCameras.length <= 1}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-colors ${
                    getCurrentCameraType() === 'front' ? 'bg-green-400' : 
                    getCurrentCameraType() === 'back' ? 'bg-purple-400' : 'bg-gray-400'
                  }`}></div>
                  <span className="font-medium">
                    {!camerasEnumerated ? 'Loading...' :
                     getCurrentCameraType() === 'front' ? 'Front Cam' : 
                     getCurrentCameraType() === 'back' ? 'Back Cam' : 'Camera'}
                  </span>
                </div>
                <svg className="w-4 h-4 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4" />
                </svg>
              </button>
            </div>

            {/* Exercise-specific Guidance */}
            <div className="text-sm text-slate-400 mb-2">
              💡 {selectedExercise === 'squat' 
                ? 'Portrait mode recommended for vertical movement tracking' 
                : 'Landscape mode recommended for horizontal body position'}
            </div>
          </div>
          <div className="relative">
            <CameraView 
              isActive={isActive} 
              onVideoReady={handleVideoReady} 
              onPoseResults={handlePoseResults}
              trackingStatus={metrics.trackingStatus}
              detectionQuality={metrics.detectionQuality}
              isPersonDetected={metrics.isPersonDetected}
              isPortraitMode={isPortraitMode}
              currentCameraId={currentCameraId}
              onCamerasEnumerated={handleCamerasEnumerated}
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
          
          {/* Live Feedback Area */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 min-h-[120px]">
            <h5 className="text-lg font-semibold text-white mb-3">Live Feedback</h5>
            <div className="space-y-2">
              {feedback.length > 0 ? (
                feedback.slice(0, 4).map((item, index) => (
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
                ))
              ) : (
                <div className="text-slate-400 text-sm">
                  {metrics.isPersonDetected ? 
                    `Get into ${selectedExercise} position to start analysis` : 
                    'Position yourself in front of the camera'}
                </div>
              )}
            </div>
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

          {/* Exercise Metrics */}
          <div className="space-y-6">
            {metrics.isPersonDetected && (metrics.detectionQuality === 'good' || metrics.detectionQuality === 'excellent') && (
              <>
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-slate-300 text-lg">Form Quality</span>
                    <span className={`font-bold text-xl ${
                      metrics.formQuality >= 80 ? 'text-green-500' : 
                      metrics.formQuality >= 60 ? 'text-yellow-400' : 'text-red-400'
                    }`}>{metrics.formQuality}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-3">
                    <div 
                      className={`h-3 rounded-full transition-all duration-300 ${
                        metrics.formQuality >= 80 ? 'bg-green-500' : 
                        metrics.formQuality >= 60 ? 'bg-yellow-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${metrics.formQuality}%` }}
                    ></div>
                  </div>
                </div>

                {selectedExercise !== 'plank' && (
                  <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300 text-lg">Repetitions</span>
                      <span className="text-white font-bold text-2xl">{metrics.reps}</span>
                    </div>
                  </div>
                )}

                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 text-lg">Session Time</span>
                    <span className="text-white font-bold text-2xl">{metrics.sessionTime}</span>
                  </div>
                </div>

                {/* Real-time Angle Display */}
                {metrics.currentAngles && metrics.currentAngles.angles && (
                  <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300 text-lg">Angles</span>
                      <span className="text-blue-400 font-bold text-xl">
                        {metrics.currentAngles?.angles ? metrics.currentAngles.angles.map((angle, index) => (
                          <span key={angle.name}>
                            {angle.name} {Math.round(angle.value)}°
                            {index < (metrics.currentAngles?.angles?.length || 0) - 1 ? ' | ' : ''}
                          </span>
                        )) : 'No angle data'}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
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
