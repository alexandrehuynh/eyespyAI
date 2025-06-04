export default function AppHeader() {
  return (
    <header className="relative z-10 pt-8 pb-6">
      <div className="container mx-auto px-6 text-center">
        <div className="flex items-center justify-center space-x-3 mb-3">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center text-2xl">
            👁️
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
            EyeSpy AI
          </h1>
        </div>
        <p className="text-lg text-slate-300 max-w-2xl mx-auto">
          AI-Powered Movement Tracking for Safe and Effective Workouts
        </p>
      </div>
    </header>
  );
}
