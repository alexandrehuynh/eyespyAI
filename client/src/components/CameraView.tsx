import { useState, useEffect, useRef } from "react";

interface CameraViewProps {
  isActive: boolean;
  onVideoReady?: (video: HTMLVideoElement) => void;
}

export default function CameraView({ isActive, onVideoReady }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'pending' | 'granted' | 'denied'>('pending');

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

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
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

  return (
    <div className="relative bg-slate-800/50 rounded-2xl overflow-hidden aspect-video border border-slate-700/50">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      
      {/* Recording Indicator */}
      <div className="absolute top-4 right-4 flex items-center space-x-2 bg-red-500/20 backdrop-blur-sm px-3 py-2 rounded-lg">
        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
        <span className="text-sm font-medium">RECORDING</span>
      </div>

      {/* AI Overlay Indicators */}
      <div className="absolute top-4 left-4 flex items-center space-x-2 bg-blue-500/20 backdrop-blur-sm px-3 py-2 rounded-lg">
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
        <span className="text-sm font-medium">AI TRACKING</span>
      </div>
    </div>
  );
}