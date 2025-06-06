import { useState, useEffect, useRef } from "react";
import PoseOverlay from "@/components/PoseOverlay";
import { Results } from "@mediapipe/pose";

interface FeedbackItem {
  type: 'success' | 'warning' | 'error';
  message: string;
  icon: string;
}

interface CameraViewProps {
  isActive: boolean;
  onVideoReady?: (video: HTMLVideoElement) => void;
  onPoseResults?: (results: Results) => void;
  trackingStatus?: 'optimal' | 'too_close' | 'partial' | 'lost' | 'repositioning';
  detectionQuality?: 'poor' | 'good' | 'excellent';
  isPersonDetected?: boolean;
  feedback?: FeedbackItem[];
  isPortraitMode?: boolean;
  currentCameraId?: string;
}

export default function CameraView({ 
  isActive, 
  onVideoReady, 
  onPoseResults, 
  trackingStatus = 'lost', 
  detectionQuality = 'poor', 
  isPersonDetected = false, 
  feedback = [], 
  isPortraitMode = true,
  currentCameraId
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'pending' | 'granted' | 'denied'>('pending');

  // Get camera container classes based on orientation
  const getCameraClasses = () => {
    if (isPortraitMode) {
      return 'aspect-[3/4] max-h-[500px] w-full max-w-[375px] mx-auto';
    }
    return 'aspect-video';
  };



  useEffect(() => {
    if (!isActive) {
      // Stop the camera when analysis is not active
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      return;
    }

    const startCamera = async () => {
      try {
        setError(null);
        setPermissionState('pending');

        const constraints = {
          video: {
            deviceId: currentCameraId ? { exact: currentCameraId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };

        console.log('Attempting to start camera with constraints:', constraints);
        console.log('Current camera ID:', currentCameraId);

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Camera stream started successfully');

        setStream(mediaStream);
        setPermissionState('granted');

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        setPermissionState('denied');
        
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError') {
            setError('Camera access denied. Please allow camera permissions and refresh the page.');
          } else if (err.name === 'NotFoundError') {
            setError('No camera device found. Please ensure you have a working camera.');
          } else if (err.name === 'NotSupportedError') {
            setError('Camera access is not supported in this browser.');
          } else {
            setError(`Camera error: ${err.message}`);
          }
        } else {
          setError('An unknown error occurred while accessing the camera.');
        }
      }
    };

    startCamera();

    // Cleanup function
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isActive, currentCameraId]);



  // Update video element when stream changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      
      // Notify parent when video is ready
      const handleLoadedData = () => {
        if (videoRef.current && onVideoReady) {
          onVideoReady(videoRef.current);
        }
      };
      
      videoRef.current.addEventListener('loadeddata', handleLoadedData);
      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('loadeddata', handleLoadedData);
        }
      };
    }
  }, [stream, onVideoReady]);

  if (!isActive) {
    return (
      <div className={`relative bg-slate-800/50 rounded-2xl overflow-hidden ${getCameraClasses()} border border-slate-700/50`}>
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <div className="text-6xl mb-4">📹</div>
            <p className="text-lg">Camera will activate when analysis starts</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`relative bg-slate-800/50 rounded-2xl overflow-hidden ${getCameraClasses()} border border-red-500/50`}>
        <div className="absolute inset-0 flex items-center justify-center text-red-400">
          <div className="text-center p-6">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="text-lg font-semibold mb-2">Camera Access Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (permissionState === 'pending') {
    return (
      <div className={`relative bg-slate-800/50 rounded-2xl overflow-hidden ${getCameraClasses()} border border-blue-500/50`}>
        <div className="absolute inset-0 flex items-center justify-center text-blue-400">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-pulse">📹</div>
            <p className="text-lg">Requesting camera access...</p>
            <p className="text-sm mt-2">Please allow camera permissions</p>
          </div>
        </div>
      </div>
    );
  }

  // Get border color based on tracking status
  const getBorderColor = () => {
    switch (trackingStatus) {
      case 'optimal':
        return 'border-green-500';
      case 'too_close':
        return 'border-yellow-400';
      case 'partial':
        return 'border-orange-400';
      case 'lost':
        return 'border-red-500';
      case 'repositioning':
        return 'border-blue-400';
      default:
        return 'border-slate-700/50';
    }
  };

  // Get quality indicator color
  const getQualityColor = () => {
    switch (detectionQuality) {
      case 'excellent':
        return 'text-green-500 bg-green-500/20';
      case 'good':
        return 'text-yellow-400 bg-yellow-400/20';
      case 'poor':
        return 'text-red-400 bg-red-400/20';
      default:
        return 'text-gray-400 bg-gray-400/20';
    }
  };

  return (
    <div className={`relative bg-slate-800/50 rounded-2xl overflow-hidden ${getCameraClasses()} border-2 transition-colors duration-300 ${getBorderColor()}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      
      {/* Pose Overlay */}
      <PoseOverlay
        videoElement={videoRef.current}
        isActive={isActive}
        onPoseResults={onPoseResults}
        isPortraitMode={isPortraitMode}
      />
      
      {/* Top Status Bar */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
        {/* Detection Quality & Person Status */}
        <div className="flex flex-col space-y-2">
          <div className={`flex items-center space-x-2 backdrop-blur-sm px-3 py-2 rounded-lg ${getQualityColor()}`}>
            <div className={`w-3 h-3 rounded-full ${trackingStatus === 'optimal' ? 'animate-pulse' : ''} ${
              detectionQuality === 'excellent' ? 'bg-green-500' :
              detectionQuality === 'good' ? 'bg-yellow-400' : 'bg-red-400'
            }`}></div>
            <span className="text-sm font-medium">
              {detectionQuality === 'excellent' ? 'EXCELLENT' :
               detectionQuality === 'good' ? 'GOOD' : 'POOR'}
            </span>
          </div>
          
          {/* Person Detection Status */}
          <div className={`flex items-center space-x-2 backdrop-blur-sm px-3 py-2 rounded-lg ${
            isPersonDetected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-400'
          }`}>
            <span className="text-xs font-medium">
              {isPersonDetected ? '👤 DETECTED' : '👤 NO PERSON'}
            </span>
          </div>
        </div>

        {/* Recording Indicator */}
        <div className="bg-red-500/20 backdrop-blur-sm px-3 py-2 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-white">REC</span>
          </div>
        </div>
      </div>



      {/* Tracking Status Message */}
      {trackingStatus !== 'optimal' && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg z-20">
          <span className="text-sm font-medium text-white">
            {trackingStatus === 'too_close' ? 'Move back for better tracking' :
             trackingStatus === 'partial' ? 'Stand fully in frame' :
             trackingStatus === 'lost' ? 'No person detected' :
             trackingStatus === 'repositioning' ? 'Tracking lost - repositioning...' :
             'Adjusting tracking...'}
          </span>
        </div>
      )}
    </div>
  );
}