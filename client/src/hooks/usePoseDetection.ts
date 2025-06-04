import { useState, useEffect, useRef, useCallback } from "react";
import { Pose, Results } from "@mediapipe/pose";
import { Exercise } from "@/pages/home";

export interface PoseMetrics {
  formQuality: number;
  reps: number;
  sessionTime: string;
  isPersonDetected: boolean;
  isExercising: boolean;
}

export interface PoseFeedback {
  type: 'success' | 'warning' | 'error';
  message: string;
  icon: string;
}

export function usePoseDetection(videoElement: HTMLVideoElement | null, exercise: Exercise, isActive: boolean) {
  const [metrics, setMetrics] = useState<PoseMetrics>({
    formQuality: 0,
    reps: 0,
    sessionTime: '00:00',
    isPersonDetected: false,
    isExercising: false
  });
  
  const [feedback, setFeedback] = useState<PoseFeedback[]>([]);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  
  const poseRef = useRef<Pose | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  
  // Exercise-specific state
  const previousPositionsRef = useRef<any[]>([]);
  const repCounterRef = useRef(0);
  const lastRepTimeRef = useRef(0);
  const exerciseStateRef = useRef<'up' | 'down' | 'neutral'>('neutral');

  // Session timer
  useEffect(() => {
    if (!isActive || !metrics.isPersonDetected) return;

    const timer = setInterval(() => {
      setSessionSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, metrics.isPersonDetected]);

  useEffect(() => {
    const minutes = Math.floor(sessionSeconds / 60);
    const seconds = sessionSeconds % 60;
    setMetrics(prev => ({
      ...prev,
      sessionTime: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }));
  }, [sessionSeconds]);

  // Calculate angle between three points
  const calculateAngle = useCallback((point1: any, point2: any, point3: any) => {
    const radians = Math.atan2(point3.y - point2.y, point3.x - point2.x) - 
                   Math.atan2(point1.y - point2.y, point1.x - point2.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
      angle = 360 - angle;
    }
    return angle;
  }, []);

  // Analyze squat form
  const analyzeSquat = useCallback((landmarks: any[]) => {
    if (!landmarks || landmarks.length < 33) return null;

    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];

    // Calculate knee angles
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // Calculate hip angle (torso lean)
    const leftShoulder = landmarks[11];
    const hipMidpoint = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2
    };
    const kneeMidpoint = {
      x: (leftKnee.x + rightKnee.x) / 2,
      y: (leftKnee.y + rightKnee.y) / 2
    };

    const torsoAngle = calculateAngle(leftShoulder, hipMidpoint, kneeMidpoint);

    // Determine squat position and count reps
    let currentState = exerciseStateRef.current;
    const now = Date.now();

    if (avgKneeAngle < 100 && currentState !== 'down') {
      currentState = 'down';
      exerciseStateRef.current = 'down';
    } else if (avgKneeAngle > 140 && currentState === 'down' && now - lastRepTimeRef.current > 1000) {
      currentState = 'up';
      exerciseStateRef.current = 'up';
      repCounterRef.current += 1;
      lastRepTimeRef.current = now;
    }

    // Calculate form quality
    let formScore = 100;
    let feedbackMessages: PoseFeedback[] = [];

    // Check depth
    if (avgKneeAngle > 110 && currentState === 'down') {
      formScore -= 20;
      feedbackMessages.push({
        type: 'warning',
        message: 'Squat deeper - knees should reach 90 degrees',
        icon: '⚠️'
      });
    } else if (currentState === 'down' && avgKneeAngle <= 90) {
      feedbackMessages.push({
        type: 'success',
        message: 'Perfect squat depth!',
        icon: '✅'
      });
    }

    // Check torso position
    if (torsoAngle < 70) {
      formScore -= 15;
      feedbackMessages.push({
        type: 'warning',
        message: 'Keep your torso more upright',
        icon: '⚠️'
      });
    } else if (torsoAngle > 85) {
      feedbackMessages.push({
        type: 'success',
        message: 'Excellent torso position',
        icon: '✅'
      });
    }

    // Check knee tracking
    const kneeAlignment = Math.abs(leftKnee.x - rightKnee.x);
    if (kneeAlignment > 0.1) {
      formScore -= 10;
      feedbackMessages.push({
        type: 'warning',
        message: 'Keep knees aligned',
        icon: '⚠️'
      });
    }

    return {
      formQuality: Math.max(formScore, 0),
      reps: repCounterRef.current,
      feedback: feedbackMessages,
      isExercising: currentState !== 'neutral' || avgKneeAngle < 150
    };
  }, [calculateAngle]);

  // Analyze push-up form
  const analyzePushUp = useCallback((landmarks: any[]) => {
    if (!landmarks || landmarks.length < 33) return null;

    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];

    // Calculate elbow angles
    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

    // Determine push-up position and count reps
    let currentState = exerciseStateRef.current;
    const now = Date.now();

    if (avgElbowAngle < 100 && currentState !== 'down') {
      currentState = 'down';
      exerciseStateRef.current = 'down';
    } else if (avgElbowAngle > 150 && currentState === 'down' && now - lastRepTimeRef.current > 1000) {
      currentState = 'up';
      exerciseStateRef.current = 'up';
      repCounterRef.current += 1;
      lastRepTimeRef.current = now;
    }

    // Calculate form quality
    let formScore = 100;
    let feedbackMessages: PoseFeedback[] = [];

    // Check depth
    if (avgElbowAngle > 110 && currentState === 'down') {
      formScore -= 20;
      feedbackMessages.push({
        type: 'warning',
        message: 'Lower yourself more - elbows should reach 90 degrees',
        icon: '⚠️'
      });
    } else if (currentState === 'down' && avgElbowAngle <= 100) {
      feedbackMessages.push({
        type: 'success',
        message: 'Perfect push-up depth!',
        icon: '✅'
      });
    }

    // Check body alignment
    const shoulder = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
    const hip = { x: (landmarks[23].x + landmarks[24].x) / 2, y: (landmarks[23].y + landmarks[24].y) / 2 };
    const ankle = { x: (landmarks[27].x + landmarks[28].x) / 2, y: (landmarks[27].y + landmarks[28].y) / 2 };

    const bodyAlignment = Math.abs(shoulder.y - hip.y) + Math.abs(hip.y - ankle.y);
    if (bodyAlignment > 0.2) {
      formScore -= 15;
      feedbackMessages.push({
        type: 'warning',
        message: 'Keep your body in a straight line',
        icon: '⚠️'
      });
    } else {
      feedbackMessages.push({
        type: 'success',
        message: 'Great body alignment',
        icon: '✅'
      });
    }

    return {
      formQuality: Math.max(formScore, 0),
      reps: repCounterRef.current,
      feedback: feedbackMessages,
      isExercising: currentState !== 'neutral' || avgElbowAngle < 170
    };
  }, [calculateAngle]);

  // Analyze plank form
  const analyzePlank = useCallback((landmarks: any[]) => {
    if (!landmarks || landmarks.length < 33) return null;

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    // Calculate body alignment
    const shoulder = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
    const hip = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
    const ankle = { x: (leftAnkle.x + rightAnkle.x) / 2, y: (leftAnkle.y + rightAnkle.y) / 2 };

    // Check if in plank position (shoulders, hips, ankles aligned)
    const shoulderHipDiff = Math.abs(shoulder.y - hip.y);
    const hipAnkleDiff = Math.abs(hip.y - ankle.y);
    const totalAlignment = shoulderHipDiff + hipAnkleDiff;

    // Calculate form quality
    let formScore = 100;
    let feedbackMessages: PoseFeedback[] = [];

    if (totalAlignment > 0.15) {
      formScore -= 30;
      if (hip.y < shoulder.y) {
        feedbackMessages.push({
          type: 'warning',
          message: 'Lower your hips - avoid pike position',
          icon: '⚠️'
        });
      } else {
        feedbackMessages.push({
          type: 'warning',
          message: 'Raise your hips - avoid sagging',
          icon: '⚠️'
        });
      }
    } else {
      feedbackMessages.push({
        type: 'success',
        message: 'Perfect plank alignment!',
        icon: '✅'
      });
    }

    // Check elbow position for forearm plank
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const elbow = { x: (leftElbow.x + rightElbow.x) / 2, y: (leftElbow.y + rightElbow.y) / 2 };
    
    if (Math.abs(elbow.x - shoulder.x) > 0.1) {
      formScore -= 15;
      feedbackMessages.push({
        type: 'warning',
        message: 'Keep elbows under shoulders',
        icon: '⚠️'
      });
    }

    return {
      formQuality: Math.max(formScore, 0),
      reps: 0, // Plank is time-based, not rep-based
      feedback: feedbackMessages,
      isExercising: totalAlignment < 0.3 // Person is in plank-like position
    };
  }, []);

  // Process pose results
  const processPoseResults = useCallback((results: Results) => {
    if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
      setMetrics(prev => ({
        ...prev,
        isPersonDetected: false,
        isExercising: false,
        formQuality: 0
      }));
      setFeedback([{
        type: 'warning',
        message: 'No person detected in frame',
        icon: '👤'
      }]);
      return;
    }

    // Person detected
    let analysis = null;
    switch (exercise) {
      case 'squat':
        analysis = analyzeSquat(results.poseLandmarks);
        break;
      case 'pushup':
        analysis = analyzePushUp(results.poseLandmarks);
        break;
      case 'plank':
        analysis = analyzePlank(results.poseLandmarks);
        break;
    }

    if (analysis) {
      setMetrics(prev => ({
        ...prev,
        isPersonDetected: true,
        isExercising: analysis.isExercising,
        formQuality: analysis.formQuality,
        reps: analysis.reps
      }));
      
      if (analysis.feedback.length > 0) {
        setFeedback(analysis.feedback);
      } else if (!analysis.isExercising) {
        setFeedback([{
          type: 'warning',
          message: `Get into ${exercise} position to start analysis`,
          icon: '💪'
        }]);
      }
    }
  }, [exercise, analyzeSquat, analyzePushUp, analyzePlank]);

  // Initialize MediaPipe Pose
  useEffect(() => {
    if (!isActive || !videoElement) return;

    const initializePose = async () => {
      try {
        const pose = new Pose({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
          }
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults(processPoseResults);
        poseRef.current = pose;

        // Start processing video frames
        const processFrame = async () => {
          if (videoElement && poseRef.current && isActive) {
            await poseRef.current.send({ image: videoElement });
            animationRef.current = requestAnimationFrame(processFrame);
          }
        };

        // Wait for video to be ready
        if (videoElement.readyState >= 2) {
          processFrame();
        } else {
          videoElement.addEventListener('loadeddata', processFrame);
        }

      } catch (error) {
        console.error('Error initializing MediaPipe Pose:', error);
        setFeedback([{
          type: 'error',
          message: 'Failed to initialize pose detection',
          icon: '❌'
        }]);
      }
    };

    initializePose();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (poseRef.current) {
        poseRef.current.close();
      }
    };
  }, [isActive, videoElement, processPoseResults]);

  // Reset when exercise changes or analysis stops
  useEffect(() => {
    if (!isActive) {
      repCounterRef.current = 0;
      exerciseStateRef.current = 'neutral';
      setSessionSeconds(0);
      setMetrics({
        formQuality: 0,
        reps: 0,
        sessionTime: '00:00',
        isPersonDetected: false,
        isExercising: false
      });
      setFeedback([]);
    }
  }, [isActive, exercise]);

  return { metrics, feedback };
}