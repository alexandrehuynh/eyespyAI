# EyeSpyAI - AI-Powered Fitness Form Analysis

EyeSpyAI is a cutting-edge web application that provides real-time exercise form analysis and correction for fundamental exercises like squats, push-ups, and lunges. Using MediaPipe computer vision technology, it delivers instant visual and audio feedback to help users exercise safely and effectively at home.

## 🚀 Features

- **Real-time Pose Detection**: Advanced MediaPipe integration for accurate body tracking
- **Exercise Form Analysis**: AI-powered analysis of squat, push-up, and lunge form
- **Instant Feedback**: Visual and audio cues for form correction
- **Progress Tracking**: Comprehensive workout history and performance metrics
- **User Authentication**: Secure login with password reset and magic link support
- **Responsive Design**: Modern UI optimized for both desktop and mobile devices

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **MediaPipe** for real-time pose detection
- **TensorFlow.js** for AI processing
- **Radix UI** components for accessible UI elements

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **PostgreSQL** database with Drizzle ORM
- **Session-based authentication** with bcrypt
- **WebSocket support** for real-time communication

### Development Tools
- **Vite** for fast development and building
- **Drizzle Kit** for database migrations
- **ESBuild** for production builds

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL 15+
- Modern web browser with camera access

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/alexandrehuynh/eyespyAI.git
cd eyespyAI
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Database
```bash
# Start PostgreSQL service
brew services start postgresql@15

# Create database
createdb eyespyai
```

### 4. Set Environment Variables
```bash
export DATABASE_URL="postgresql://localhost:5432/eyespyai"
export SESSION_SECRET="your-secret-key-here"
export NODE_ENV="development"
```

### 5. Run Database Migrations
```bash
npm run db:push
```

### 6. Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## 🔧 Environment Configuration

Create a `.env` file in the root directory:

```env
# Database Configuration
DATABASE_URL=postgresql://localhost:5432/eyespyai

# Session Secret
SESSION_SECRET=your-secret-key-here

# Environment
NODE_ENV=development

# Optional: Email configuration for magic links and password reset
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
```

## 📱 Usage

1. **Register/Login**: Create an account or sign in to your existing account
2. **Select Exercise**: Choose from squats, push-ups, or lunges
3. **Camera Setup**: Allow camera access and position yourself in frame
4. **Start Workout**: Begin your exercise session
5. **Real-time Feedback**: Receive instant form corrections and guidance
6. **Track Progress**: View your workout history and improvement over time

## 🗄️ Database Schema

The application uses PostgreSQL with the following main tables:

- **users**: User accounts and authentication
- **exercise_sessions**: Workout session tracking
- **exercise_metrics**: Real-time form measurements
- **user_progress**: Aggregated performance statistics
- **auth_tokens**: Password reset and magic link tokens

## 🚀 Deployment

### Production Build
```bash
npm run build
npm start
```

### Environment Variables for Production
- Set `NODE_ENV=production`
- Use a secure `SESSION_SECRET`
- Configure production `DATABASE_URL`
- Enable HTTPS for secure cookies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **MediaPipe** for computer vision capabilities
- **TensorFlow.js** for AI processing
- **Drizzle ORM** for database management
- **Radix UI** for accessible components

## 📞 Support

For support and questions, please open an issue on GitHub or contact the development team.

---

**Built with ❤️ for better fitness and health**
