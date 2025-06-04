import { useState, useEffect, useRef } from "react";
import PoseOverlay from "@/components/PoseOverlay";
import { Results } from "@mediapipe/pose";

interface CameraViewProps {
  isActive: boolean;
  onVideoReady?: (video: HTMLVideoElement) => void;
  onPoseResults?: (results: Results) => void;
  detectionQuality?: 'Poor' | 'Good' | 'Excellent';
  trackingStatus?: 'optimal' | 'too_close' | 'partial' | 'lost';
}

export default function CameraView({ isActive, onVideoReady, onPoseResults, detectionQuality, trackingStatus }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

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

        const videoConstraints = orientation === 'portrait' 
          ? {
              width: { ideal: 720 },
              height: { ideal: 1280 },
              facingMode: 'user'
            }
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            };

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false
        });

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
  }, [isActive]);

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
      <div className="relative bg-slate-800/50 rounded-2xl overflow-hidden aspect-video border border-slate-700/50">
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
      <div className="relative bg-slate-800/50 rounded-2xl overflow-hidden aspect-video border border-red-500/50">
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
      <div className="relative bg-slate-800/50 rounded-2xl overflow-hidden aspect-video border border-blue-500/50">
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
      case 'partial':
        return 'border-yellow-500';
      case 'lost':
        return 'border-red-500';
      default:
        return 'border-slate-700/50';
    }
  };

  // Get detection quality color
  const getDetectionColor = () => {
    switch (detectionQuality) {
      case 'Excellent':
        return 'text-green-500';
      case 'Good':
        return 'text-yellow-400';
      case 'Poor':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const aspectRatio = orientation === 'portrait' ? 'aspect-[9/16]' : 'aspect-video';

  return (
    <div className={`relative bg-slate-800/50 rounded-2xl overflow-hidden ${aspectRatio} border-2 transition-colors duration-300 ${getBorderColor()}`}>
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
      />
      
      {/* Orientation Toggle */}
      <div className="absolute top-4 left-4 z-20">
        <button
          onClick={() => setOrientation(prev => prev === 'portrait' ? 'landscape' : 'portrait')}
          className="bg-slate-800/80 hover:bg-slate-700/80 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
        >
          {orientation === 'portrait' ? '📱 Portrait' : '💻 Landscape'}
        </button>
      </div>

      {/* Detection Quality Indicator */}
      <div className={`absolute top-4 right-4 flex items-center space-x-2 bg-slate-800/80 backdrop-blur-sm px-3 py-2 rounded-lg z-20`}>
        <div className={`w-3 h-3 rounded-full animate-pulse ${
          trackingStatus === 'optimal' ? 'bg-green-500' : 
          trackingStatus === 'lost' ? 'bg-red-500' : 'bg-yellow-500'
        }`}></div>
        <span className={`text-sm font-medium ${getDetectionColor()}`}>
          {detectionQuality || 'Detecting...'}
        </span>
      </div>

      {/* Recording Indicator */}
      <div className="absolute bottom-4 right-4 flex items-center space-x-2 bg-red-500/20 backdrop-blur-sm px-3 py-2 rounded-lg z-20">
        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
        <span className="text-sm font-medium">RECORDING</span>
      </div>
    </div>
  );
}