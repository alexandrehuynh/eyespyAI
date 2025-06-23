# EyeSpy AI - Replit Project Guide

## Overview

EyeSpy AI is an AI-powered fitness tracking application that combines real-time exercise form analysis with comprehensive session tracking and progress analytics. The application uses MediaPipe for pose detection and computer vision to analyze exercise movements (squats, push-ups, planks) and provides instant feedback on form quality, rep counting, and technique improvement.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React hooks with TanStack Query for server state
- **Routing**: Wouter for client-side navigation
- **UI Components**: Radix UI primitives with custom styling
- **Computer Vision**: MediaPipe for pose detection and analysis

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful endpoints with JSON responses
- **Middleware**: Custom logging, error handling, and request validation
- **Development Setup**: Vite for frontend bundling and hot reload

### Database Architecture
- **Database**: PostgreSQL (configured for Neon serverless)
- **ORM**: Drizzle ORM with TypeScript schema definitions
- **Schema**: Comprehensive fitness tracking with users, sessions, metrics, and progress tables
- **Migrations**: Drizzle Kit for schema management

## Key Components

### Exercise Analysis System
- **Real-time Pose Detection**: MediaPipe integration for live movement tracking
- **Form Analysis**: Custom algorithms for exercise-specific form validation
- **Rep Counting**: Automated repetition detection based on movement patterns
- **Feedback System**: Instant visual and textual feedback for form improvement

### Session Management
- **Session Tracking**: Complete workout session recording with start/end times
- **Metrics Collection**: Real-time capture of form scores, angles, and detection quality
- **Progress Analytics**: Historical data analysis and performance trends

### Camera System
- **Multi-camera Support**: Device enumeration and camera switching
- **Orientation Detection**: Portrait/landscape optimization per exercise type
- **Permission Handling**: Graceful camera access management

## Data Flow

### Exercise Session Workflow
1. User selects exercise type (squat, push-up, plank)
2. Camera permissions are requested and camera stream is initialized
3. Session is created in database with exercise type and user ID
4. MediaPipe pose detection begins analyzing video feed
5. Real-time metrics (form scores, angles, reps) are collected and buffered
6. Metrics are batch-uploaded to database during session
7. Session is completed with final statistics and progress is updated

### Pose Detection Pipeline
1. Video frame is processed by MediaPipe Pose model
2. Landmark coordinates are extracted and normalized
3. Exercise-specific angles are calculated (knee, elbow, body line)
4. Form quality is scored based on movement patterns
5. Rep detection triggers on completion of movement cycle
6. Feedback is generated and displayed to user

### Progress Analytics
1. Historical session data is aggregated by exercise type
2. Personal bests and improvement trends are calculated
3. Performance metrics are visualized in dashboard
4. Form score progression is tracked over time

## External Dependencies

### MediaPipe Integration
- **Pose Detection**: @mediapipe/pose for body landmark detection
- **Drawing Utilities**: @mediapipe/drawing_utils for pose visualization
- **Camera Utils**: @mediapipe/camera_utils for video stream management

### TensorFlow.js
- **Machine Learning**: @tensorflow/tfjs for AI model execution
- **WebGL Backend**: @tensorflow/tfjs-backend-webgl for GPU acceleration

### Database Connection
- **Neon Serverless**: @neondatabase/serverless for PostgreSQL connection
- **Connection Pooling**: Optimized for serverless environments

### UI Component Library
- **Radix UI**: Comprehensive primitive components for accessibility
- **Lucide Icons**: SVG icon library for consistent iconography
- **Class Variance Authority**: Type-safe component variant management

## Deployment Strategy

### Development Environment
- **Local Development**: npm run dev starts both frontend and backend
- **Hot Reload**: Vite provides instant feedback during development
- **Database**: Drizzle Kit handles schema migrations with `npm run db:push`

### Production Build
- **Frontend**: Vite builds optimized static assets to dist/public
- **Backend**: esbuild bundles Express server for Node.js runtime
- **Database**: PostgreSQL with connection pooling for scalability

### Replit Configuration
- **Modules**: Node.js 20, web development, PostgreSQL 16
- **Ports**: Frontend serves on port 5000, auto-scaling deployment
- **Environment**: Production variables for database connections

## Changelog

```
Changelog:
- June 23, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```