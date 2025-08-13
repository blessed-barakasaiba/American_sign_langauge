import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, StopCircle, RotateCcw, Volume2, Award, BookOpen } from 'lucide-react';

const App = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentPrediction, setCurrentPrediction] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [targetLetter, setTargetLetter] = useState('A');
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [gameMode, setGameMode] = useState(false);
  const [feedback, setFeedback] = useState('');

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const predictionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Start camera
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      
      setStream(mediaStream);
      setIsCapturing(true);
      
      // Start real-time predictions
      predictionIntervalRef.current = setInterval(() => {
        captureAndPredict();
      }, 1000); // Predict every second
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please check permissions.');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    if (predictionIntervalRef.current) {
      clearInterval(predictionIntervalRef.current);
      predictionIntervalRef.current = null;
    }
    
    setIsCapturing(false);
    setCurrentPrediction('');
    setConfidence(0);
  };

  // Capture frame and predict
  const captureAndPredict = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isLoading) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.videoWidth === 0) return;

    // Set canvas dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame
    ctx.drawImage(video, 0, 0);

    // Convert canvas to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.8);

    try {
      setIsLoading(true);
      
      const response = await fetch('http://127.0.0.1:8000/api/asl/predict/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageData }),
      });

      if (response.ok) {
        const result = await response.json();
        setCurrentPrediction(result.predicted_letter);
        setConfidence(result.confidence);

        // Game logic
        if (gameMode && result.predicted_letter === targetLetter && result.confidence > 0.7) {
          setScore(score + 1);
          setFeedback('Correct! Great job! 🎉');
          setTimeout(() => {
            nextLetter();
            setFeedback('');
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Prediction error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, gameMode, targetLetter, score]);

  // Next letter in game mode
  const nextLetter = () => {
    const currentIndex = alphabet.indexOf(targetLetter);
    const nextIndex = (currentIndex + 1) % alphabet.length;
    setTargetLetter(alphabet[nextIndex]);
    setAttempts(attempts + 1);
  };

  // Reset game
  const resetGame = () => {
    setScore(0);
    setAttempts(0);
    setTargetLetter('A');
    setFeedback('');
  };

  // Speak letter
  const speakLetter = (letter: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(`Letter ${letter}`);
      utterance.rate = 0.8;
      speechSynthesis.speak(utterance);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            ASL Learning Studio
          </h1>
          <p className="text-gray-300">Learn American Sign Language A-Z with real-time recognition</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Video Feed */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-2xl p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                  <Camera className="w-6 h-6" />
                  Live Recognition
                </h2>
                <div className="flex gap-2">
                  {!isCapturing ? (
                    <button
                      onClick={startCamera}
                      className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      Start Camera
                    </button>
                  ) : (
                    <button
                      onClick={stopCamera}
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <StopCircle className="w-4 h-4" />
                      Stop Camera
                    </button>
                  )}
                </div>
              </div>

              <div className="relative bg-black rounded-xl overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-80 object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {isCapturing && (
                  <div className="absolute top-4 left-4 bg-red-500 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    LIVE
                  </div>
                )}
              </div>

              {/* Prediction Display */}
              {currentPrediction && (
                <div className="mt-4 bg-gray-700 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-300 mb-1">Detected Sign:</p>
                      <p className="text-4xl font-bold text-cyan-400">{currentPrediction}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-300 mb-1">Confidence:</p>
                      <p className="text-2xl font-bold text-green-400">
                        {(confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                    <button
                      onClick={() => speakLetter(currentPrediction)}
                      className="bg-purple-600 hover:bg-purple-700 p-3 rounded-full transition-colors"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="mt-3">
                    <div className="bg-gray-600 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-green-400 to-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${confidence * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Control Panel */}
          <div className="space-y-6">
            {/* Game Mode Toggle */}
            <div className="bg-gray-800 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Learning Mode
                </h3>
                <button
                  onClick={() => {
                    setGameMode(!gameMode);
                    if (!gameMode) resetGame();
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    gameMode 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-gray-600 hover:bg-gray-700'
                  }`}
                >
                  {gameMode ? 'Game ON' : 'Game OFF'}
                </button>
              </div>

              {gameMode && (
                <div className="space-y-4">
                  <div className="bg-purple-600 rounded-xl p-4 text-center">
                    <p className="text-gray-200 mb-2">Show this letter:</p>
                    <p className="text-5xl font-bold">{targetLetter}</p>
                    <button
                      onClick={() => speakLetter(targetLetter)}
                      className="mt-2 bg-purple-500 hover:bg-purple-400 px-3 py-1 rounded-lg text-sm transition-colors"
                    >
                      🔊 Hear it
                    </button>
                  </div>

                  <div className="flex justify-between text-center">
                    <div>
                      <p className="text-gray-400">Score</p>
                      <p className="text-2xl font-bold text-green-400">{score}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Attempts</p>
                      <p className="text-2xl font-bold text-blue-400">{attempts}</p>
                    </div>
                  </div>

                  {feedback && (
                    <div className="bg-green-600 rounded-xl p-3 text-center font-medium">
                      {feedback}
                    </div>
                  )}

                  <button
                    onClick={resetGame}
                    className="w-full bg-gray-600 hover:bg-gray-700 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset Game
                  </button>
                </div>
              )}
            </div>

            {/* ASL Alphabet Reference */}
            <div className="bg-gray-800 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Award className="w-5 h-5" />
                ASL Alphabet
              </h3>
              <div className="grid grid-cols-6 gap-2">
                {alphabet.map((letter) => (
                  <button
                    key={letter}
                    onClick={() => {
                      setTargetLetter(letter);
                      speakLetter(letter);
                    }}
                    className={`p-2 rounded-lg font-bold transition-colors ${
                      letter === targetLetter && gameMode
                        ? 'bg-purple-600 text-white'
                        : letter === currentPrediction
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-gray-800 rounded-2xl p-6 shadow-2xl">
          <h3 className="text-xl font-semibold mb-4">How to Use:</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-gray-300">
            <div className="text-center">
              <div className="bg-blue-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2">
                1
              </div>
              <p>Click "Start Camera" to begin video capture</p>
            </div>
            <div className="text-center">
              <div className="bg-purple-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2">
                2
              </div>
              <p>Show ASL letters to the camera for recognition</p>
            </div>
            <div className="text-center">
              <div className="bg-green-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2">
                3
              </div>
              <p>Toggle Game Mode to practice systematically</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;