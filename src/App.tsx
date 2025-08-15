import { useEffect, useRef, useState } from "react";

type PredictionResult = {
  letter: string;
  confidence: number;
  success: boolean;
  error?: string;
};

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const App = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [predictionLetter, setPredictionLetter] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(0);
  const [isCameraOn, setCameraOn] = useState<boolean>(false);
  const [isRealTimeOn, setRealTimeOn] = useState<boolean>(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(2);
  const [lastPredictionTime, setLastPredictionTime] = useState<number>(0);
  
  // Hand detection settings
  const [useHandDetection, setUseHandDetection] = useState<boolean>(false); // Start with manual mode
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);
  const [isDrawingBox, setIsDrawingBox] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{x: number, y: number} | null>(null);
  const [showBoundingBox, setShowBoundingBox] = useState<boolean>(true);

  // Simple motion-based hand detection
  const [motionDetection, setMotionDetection] = useState<boolean>(false);
  const [lastFrame, setLastFrame] = useState<ImageData | null>(null);

  // Simple motion-based hand detection function
  const detectMotionArea = (): BoundingBox | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    if (!lastFrame) {
      setLastFrame(currentFrame);
      return null;
    }

    // Simple difference detection
    let motionPixels: {x: number, y: number}[] = [];
    const threshold = 30;
    
    for (let i = 0; i < currentFrame.data.length; i += 4) {
      const r1 = currentFrame.data[i];
      const g1 = currentFrame.data[i + 1];
      const b1 = currentFrame.data[i + 2];
      
      const r2 = lastFrame.data[i];
      const g2 = lastFrame.data[i + 1];
      const b2 = lastFrame.data[i + 2];
      
      const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
      
      if (diff > threshold) {
        const pixelIndex = i / 4;
        const x = pixelIndex % canvas.width;
        const y = Math.floor(pixelIndex / canvas.width);
        motionPixels.push({x, y});
      }
    }
    
    setLastFrame(currentFrame);
    
    if (motionPixels.length < 100) return null; // Not enough motion
    
    // Find bounding box of motion
    const xs = motionPixels.map(p => p.x);
    const ys = motionPixels.map(p => p.y);
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    // Add padding
    const padding = 50;
    const x = Math.max(0, minX - padding);
    const y = Math.max(0, minY - padding);
    const width = Math.min(canvas.width - x, maxX - minX + 2 * padding);
    const height = Math.min(canvas.height - y, maxY - minY + 2 * padding);
    
    return {
      x: x / canvas.width,
      y: y / canvas.height,
      width: width / canvas.width,
      height: height / canvas.height
    };
  };

  // Draw bounding box overlay
  const drawBoundingBox = (box: BoundingBox, canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !videoRef.current) return;
    
    const videoRect = videoRef.current.getBoundingClientRect();
    canvas.width = videoRect.width;
    canvas.height = videoRect.height;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = useHandDetection ? '#10B981' : '#3B82F6';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    
    const x = box.x * canvas.width;
    const y = box.y * canvas.height;
    const width = box.width * canvas.width;
    const height = box.height * canvas.height;
    
    ctx.strokeRect(x, y, width, height);
    
    // Draw label
    ctx.fillStyle = useHandDetection ? '#10B981' : '#3B82F6';
    ctx.font = '14px sans-serif';
    ctx.fillText(useHandDetection ? 'Motion detected' : 'Manual selection', x, y - 10);
  };

  // Handle manual bounding box selection
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (useHandDetection || !overlayCanvasRef.current) return;
    
    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    setStartPoint({ x, y });
    setIsDrawingBox(true);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingBox || !startPoint || !overlayCanvasRef.current) return;
    
    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    const box: BoundingBox = {
      x: Math.min(startPoint.x, x),
      y: Math.min(startPoint.y, y),
      width: Math.abs(x - startPoint.x),
      height: Math.abs(y - startPoint.y)
    };
    
    setBoundingBox(box);
    drawBoundingBox(box, canvas);
  };

  const handleCanvasMouseUp = () => {
    setIsDrawingBox(false);
    setStartPoint(null);
  };

  // Crop image to bounding box
  const cropImageToBoundingBox = (canvas: HTMLCanvasElement, box: BoundingBox): string => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    const cropX = box.x * canvas.width;
    const cropY = box.y * canvas.height;
    const cropWidth = box.width * canvas.width;
    const cropHeight = box.height * canvas.height;
    
    // Create a new canvas for the cropped image
    const cropCanvas = document.createElement('canvas');
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) return '';
    
    cropCanvas.width = 64; // Match model input size
    cropCanvas.height = 64;
    
    // Draw the cropped region onto the new canvas, scaled to 64x64
    cropCtx.drawImage(
      canvas,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, 64, 64
    );
    
    return cropCanvas.toDataURL('image/jpeg', 0.8);
  };

  // Start camera
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        setCameraOn(true);
        setError('');
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera. Please check permissions.");
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setCameraOn(false);
      stopRealTime();
      setBoundingBox(null);
      setLastFrame(null);
    }
  };

  // Single prediction function
  const makePrediction = async (): Promise<boolean> => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return false;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context || video.readyState !== video.HAVE_ENOUGH_DATA) return false;

    setIsProcessing(true);

    try {
      // Draw video frame to canvas
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      let imageData: string;
      let currentBox = boundingBox;

      // Try motion detection if enabled
      if (useHandDetection) {
        const detectedBox = detectMotionArea();
        if (detectedBox) {
          currentBox = detectedBox;
          setBoundingBox(detectedBox);
        }
      }

      // Crop to bounding box if available
      if (currentBox) {
        imageData = cropImageToBoundingBox(canvas, currentBox);
        
        // Update overlay
        if (overlayCanvasRef.current && showBoundingBox) {
          drawBoundingBox(currentBox, overlayCanvasRef.current);
        }
      } else {
        // Use full image if no bounding box
        imageData = canvas.toDataURL('image/jpeg', 0.7);
        
        if (!useHandDetection && !boundingBox) {
          setError('Please select a bounding box around your hand first, or enable motion detection.');
          setIsProcessing(false);
          return false;
        }
      }

      // Send prediction request
      const response = await fetch("http://127.0.0.1:8000/api/predict_sign/", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageData
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setPredictionLetter(result.letter);
        setConfidence(result.confidence);
        setError('');
        setLastPredictionTime(Date.now());
        return true;
      } else {
        console.error('Prediction failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('Prediction error:', error);
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // Start real-time predictions
  const startRealTime = () => {
    if (!isCameraOn || isRealTimeOn) return;
    
    setRealTimeOn(true);
    setError('');
    
    const interval = 1000 / fps;
    
    intervalRef.current = setInterval(async () => {
      await makePrediction();
    }, interval);
  };

  // Stop real-time predictions
  const stopRealTime = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRealTimeOn(false);
    setIsProcessing(false);
  };

  // Handle FPS change
  const changeFPS = (newFps: number) => {
    setFps(newFps);
    if (isRealTimeOn) {
      stopRealTime();
      setTimeout(() => {
        setFps(newFps);
        startRealTime();
      }, 100);
    }
  };

  // Toggle hand detection mode
  const toggleHandDetection = () => {
    setUseHandDetection(!useHandDetection);
    setBoundingBox(null);
    setLastFrame(null);
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
  };

  // Auto-center bounding box
  const autoCenterBox = () => {
    if (!videoRef.current) return;
    
    const centerBox: BoundingBox = {
      x: 0.25,  // Start at 25% from left
      y: 0.2,   // Start at 20% from top  
      width: 0.5, // 50% width
      height: 0.6  // 60% height
    };
    
    setBoundingBox(centerBox);
    if (overlayCanvasRef.current && showBoundingBox) {
      drawBoundingBox(centerBox, overlayCanvasRef.current);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (stream) {
        stopCamera();
      }
    };
  }, [stream]);

  // Auto-stop real-time when camera stops
  useEffect(() => {
    if (!isCameraOn && isRealTimeOn) {
      stopRealTime();
    }
  }, [isCameraOn, isRealTimeOn]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4"> 
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
          <h1 className="text-4xl font-bold text-center">
            Precision ASL Recognition
          </h1>
          <p className="text-center text-blue-100 mt-2">
            Focus on hands for better sign language recognition
          </p>
        </div>
        
        <div className="p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            </div>
          )}

          {/* Hand Detection Settings */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Hand Focus Settings</h3>
            
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="handDetection"
                  checked={useHandDetection}
                  onChange={toggleHandDetection}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="handDetection" className="ml-2 text-sm font-medium text-gray-700">
                  Motion-Based Hand Detection
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="showBoundingBox"
                  checked={showBoundingBox}
                  onChange={(e) => setShowBoundingBox(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="showBoundingBox" className="ml-2 text-sm font-medium text-gray-700">
                  Show Detection Box
                </label>
              </div>

              <button
                onClick={autoCenterBox}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                disabled={!isCameraOn}
              >
                Auto-Center Box
              </button>
            </div>
            
            <p className="text-xs text-gray-600 mt-2">
              {useHandDetection ? 
                'System will detect motion/movement to focus on active hand area' : 
                'Click and drag on the video to manually select the hand region, or use Auto-Center'
              }
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Camera section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-gray-800">Camera Feed</h2>
                <div className="flex items-center gap-4">
                  {boundingBox && (
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${useHandDetection ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                      <span className="text-sm text-gray-600">
                        {useHandDetection ? 'Motion Tracking' : 'Manual Area'}
                      </span>
                    </div>
                  )}
                  {isRealTimeOn && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-red-600 font-medium">LIVE</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="relative bg-gray-900 rounded-xl overflow-hidden shadow-lg">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-auto"
                  style={{ display: isCameraOn ? 'block' : 'none' }}
                />
                
                {/* Overlay canvas for bounding box */}
                <canvas
                  ref={overlayCanvasRef}
                  className={`absolute top-0 left-0 w-full h-full ${!useHandDetection ? 'cursor-crosshair' : ''}`}
                  style={{ display: isCameraOn && showBoundingBox ? 'block' : 'none' }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                />
                
                {!isCameraOn && (
                  <div className="w-full h-80 bg-gray-800 flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-lg">Camera is off</span>
                    </div>
                  </div>
                )}
                
                {/* Processing overlay */}
                {isProcessing && (
                  <div className="absolute top-4 right-4 bg-blue-600 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Analyzing...
                  </div>
                )}
                
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {/* Controls */}
              <div className="space-y-4">
                <div className="flex gap-3 justify-center flex-wrap">
                  {isCameraOn ? (
                    <button 
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 transition-colors font-medium shadow-lg text-sm" 
                      onClick={stopCamera}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Stop Camera
                    </button>
                  ) : (
                    <button 
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors font-medium shadow-lg text-sm" 
                      onClick={startCamera}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Start Camera
                    </button>
                  )}
                  
                  {isRealTimeOn ? (
                    <button 
                      onClick={stopRealTime} 
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-orange-600 hover:bg-orange-700 transition-colors font-medium shadow-lg text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Stop Real-Time
                    </button>
                  ) : (
                    <button 
                      onClick={startRealTime} 
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium shadow-lg transition-colors text-sm ${
                        !isCameraOn
                          ? "bg-gray-400 cursor-not-allowed" 
                          : "bg-purple-600 hover:bg-purple-700"
                      }`} 
                      disabled={!isCameraOn}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Start Real-Time
                    </button>
                  )}
                  
                  <button 
                    onClick={() => makePrediction()} 
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium shadow-lg transition-colors text-sm ${
                      !isCameraOn || isProcessing
                        ? "bg-gray-400 cursor-not-allowed" 
                        : "bg-blue-600 hover:bg-blue-700"
                    }`} 
                    disabled={!isCameraOn || isProcessing}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    </svg>
                    Single Capture
                  </button>

                  {boundingBox && (
                    <button 
                      onClick={() => {
                        setBoundingBox(null);
                        if (overlayCanvasRef.current) {
                          const ctx = overlayCanvasRef.current.getContext('2d');
                          if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
                        }
                      }} 
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-gray-600 hover:bg-gray-700 transition-colors font-medium shadow-lg text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear Selection
                    </button>
                  )}
                </div>

                {/* FPS Control */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prediction Speed: {fps} FPS
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.5"
                    value={fps}
                    onChange={(e) => changeFPS(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    disabled={!isCameraOn}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0.5 FPS</span>
                    <span>5 FPS</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Results section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-gray-800">Recognition Results</h2>
                {lastPredictionTime > 0 && (
                  <span className="text-sm text-gray-500">
                    Last: {new Date(lastPredictionTime).toLocaleTimeString()}
                  </span>
                )}
              </div>
              
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl shadow-inner border">
                {predictionLetter ? (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className={`inline-flex items-center justify-center w-32 h-32 rounded-full text-5xl font-bold shadow-lg mb-4 transition-colors ${
                        confidence > 0.8 ? 'bg-green-600 text-white' :
                        confidence > 0.6 ? 'bg-blue-600 text-white' :
                        'bg-yellow-600 text-white'
                      }`}>
                        {predictionLetter}
                      </div>
                      <p className="text-lg text-gray-600">Current Prediction</p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg shadow">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-700 font-medium">Confidence Level:</span>
                        <span className={`text-2xl font-bold ${
                          confidence > 0.8 ? 'text-green-600' :
                          confidence > 0.6 ? 'text-blue-600' :
                          'text-yellow-600'
                        }`}>
                          {(confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div 
                          className={`h-4 rounded-full transition-all duration-300 ${
                            confidence > 0.8 ? 'bg-gradient-to-r from-green-500 to-green-600' :
                            confidence > 0.6 ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                            'bg-gradient-to-r from-yellow-500 to-yellow-600'
                          }`}
                          style={{ width: `${confidence * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    {confidence < 0.6 && (
                      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-lg">
                        <p className="text-sm">
                          <strong>Tip:</strong> Low confidence detected. Try improving lighting, adjusting the focus area, or holding your sign more steadily.
                        </p>
                      </div>
                    )}

                    {boundingBox && (
                      <div className="bg-green-50 border border-green-200 text-green-800 p-3 rounded-lg">
                        <p className="text-sm">
                          <strong>✓ Hand Focused:</strong> Analysis focused on selected hand region for better accuracy.
                        </p>
                      </div>
                    )}

                    {isRealTimeOn && (
                      <div className="bg-purple-50 border border-purple-200 text-purple-800 p-3 rounded-lg">
                        <p className="text-sm">
                          <strong>Real-time mode active!</strong> Hold your sign steady within the focus area.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h2a1 1 0 011 1v1m0 0h8m-8 0v3m8-3v3m-9 8h10l-5-5-5 5z" />
                    </svg>
                    <p className="text-gray-500 text-lg">
                      {useHandDetection ? 
                        'Move your hand to trigger motion detection' : 
                        'Select a focus area around your hand'
                      }
                    </p>
                    <p className="text-gray-400 text-sm mt-2">
                      {useHandDetection ? 
                        'System will detect movement and focus on active areas' :
                        'Click "Auto-Center Box" or drag to manually select hand area'
                      }
                    </p>
                  </div>
                )}
              </div>

              {/* Detection Status */}
              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-semibold text-gray-800 mb-2">Detection Status</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Detection Mode:</span>
                    <span className={`font-medium ${useHandDetection ? 'text-green-600' : 'text-blue-600'}`}>
                      {useHandDetection ? 'Motion Detection' : 'Manual Selection'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Focus Area Set:</span>
                    <span className={`font-medium ${boundingBox ? 'text-green-600' : 'text-red-600'}`}>
                      {boundingBox ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Analysis Area:</span>
                    <span className="font-medium text-gray-800">
                      {boundingBox ? 
                        `${Math.round(boundingBox.width * 100)}% × ${Math.round(boundingBox.height * 100)}%` : 
                        'Full Frame'
                      }
                    </span>
                  </div>
                  {useHandDetection && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Motion Tracking:</span>
                      <span className="font-medium text-blue-600">Active</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Quick Start Guide:</h4>
                <ol className="text-sm space-y-1 list-decimal list-inside">
                  <li>Start the camera</li>
                  <li>{useHandDetection ? 'Move your hand to trigger detection' : 'Click "Auto-Center Box" or manually draw around your hand'}</li>
                  <li>Use "Single Capture" to test or "Start Real-Time" for continuous recognition</li>
                  <li>Hold signs clearly within the focus area for best results</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;