
import React, { useState, useEffect } from 'react';
import { UploadPanel } from './components/UploadPanel';
import { ImagePreview } from './components/ImagePreview';
import { ResultsGrid } from './components/ResultsGrid';
import { SavingsWidget } from './components/SavingsWidget';
import { DisclaimerBar } from './components/DisclaimerBar';
import { JanAushadhiLocator } from './components/JanAushadhiLocator';
import { analyzePrescription } from './services/geminiService';
import { AppStatus, AnalysisResult } from './types';
import { Stethoscope, Trash2, AlertCircle, Info } from 'lucide-react';

// Explicitly importing React to resolve the 'Cannot find namespace React' error for React.FC
const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrl && !imageUrl.startsWith('http')) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setImageUrl(URL.createObjectURL(selectedFile));
    setRotation(0);
    setStatus('uploading');
    setTimeout(() => setStatus('idle'), 500);
    setError(null);
    setResult(null);
  };

  const handleSampleSelect = async () => {
    try {
      setStatus('uploading');
      const sampleUrl = "https://aryaman.space/images/medical-text-extraction/prescription.jpeg";
      const response = await fetch(sampleUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`Failed to fetch sample: ${response.status}`);
      const blob = await response.blob();
      const sampleFile = new File([blob], "sample_prescription.jpg", { type: "image/jpeg" });
      setFile(sampleFile);
      setImageUrl(URL.createObjectURL(sampleFile));
      setRotation(0);
      setStatus('idle');
      setError(null);
      setResult(null);
    } catch (err) {
      console.error("Sample load error:", err);
      setError("Failed to load sample image.");
      setStatus('idle');
    }
  };

  const handleClear = () => {
    setFile(null);
    setImageUrl(null);
    setResult(null);
    setStatus('idle');
    setError(null);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const processAndCompressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          // Reduced MAX_DIMENSION to 1024 for faster transmission and inference without significant OCR loss
          const MAX_DIMENSION = 1024;
          if (width > height) {
            if (width > MAX_DIMENSION) {
              height *= MAX_DIMENSION / width;
              width = MAX_DIMENSION;
            }
          } else {
            if (height > MAX_DIMENSION) {
              width *= MAX_DIMENSION / height;
              height = MAX_DIMENSION;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl.split(',')[1]);
        };
        img.onerror = () => reject(new Error("Failed to load image"));
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
    });
  };

  const handleProcess = async () => {
    if (!file) return;
    setStatus('processing');
    setError(null);
    try {
      const base64 = await processAndCompressImage(file);
      const data = await analyzePrescription(base64, "image/jpeg");
      setResult(data);
      setStatus('success');
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('429')) {
         setError("High traffic. Please wait a moment.");
      } else {
         setError("We couldn't clearly read the medicines. Please try a clearer photo.");
      }
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen supports-[min-height:100dvh]:min-h-[100dvh] pb-20 font-sans text-gray-900 bg-gray-50/50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 flex-shrink-0">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-[#2E7D32] p-2 rounded-lg">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-none">Aushadh-AI</h1>
              <p className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">PMBJP Assistant</p>
            </div>
          </div>
          
          {status === 'success' && (
            <button 
              onClick={handleClear}
              className="text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1 text-sm font-bold"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </header>

      <main className={`container mx-auto px-4 max-w-4xl ${!file ? 'flex-grow flex flex-col justify-center' : 'py-8 space-y-8'}`}>
        {!file ? (
          <div className="w-full space-y-6 md:space-y-8">
            <div className="text-center space-y-3 md:space-y-4">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
                Save on Medicines with <span className="text-[#2E7D32] whitespace-nowrap">Jan Aushadhi</span>
              </h2>
              <p className="text-gray-600 max-w-xl mx-auto text-sm sm:text-base md:text-lg leading-relaxed">
                Upload your prescription to find high-quality generic equivalents and see how much you can save instantly.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start gap-3 animate-in slide-in-from-top-2 max-w-xl mx-auto text-left">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Analysis Failed</h3>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                  <button onClick={() => setStatus('idle')} className="text-sm underline text-red-800 mt-2 hover:text-red-900">Try Again</button>
                </div>
              </div>
            )}

            <UploadPanel onFileSelect={handleFileSelect} onSampleSelect={handleSampleSelect} />
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start gap-3 animate-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">Analysis Failed</h3>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                  <button onClick={() => setStatus('idle')} className="text-sm underline text-red-800 mt-2 hover:text-red-900">Try Again</button>
                </div>
              </div>
            )}

            {status !== 'success' && (
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center mb-6">
                    <h3 className="text-xl font-semibold text-gray-800">Verify & Analyze</h3>
                    <p className="text-gray-500">Ensure the image is clear and rotated correctly.</p>
                </div>
                <ImagePreview 
                    imageUrl={imageUrl!} 
                    rotation={rotation} 
                    onRotate={handleRotate} 
                    onClear={handleClear}
                    onProcess={handleProcess}
                    isProcessing={status === 'processing'}
                />
              </div>
            )}

            {status === 'success' && result && (
              <div className="space-y-6">
                <SavingsWidget medications={result.medications} />
                
                {result.medications.length === 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center space-y-3">
                    <Info className="w-10 h-10 text-blue-500 mx-auto" />
                    <h3 className="text-lg font-bold text-blue-900">No medicines detected</h3>
                    <p className="text-sm text-blue-700 max-w-md mx-auto">
                      Our AI couldn't find any medications in this scan. Please ensure the prescription text is clearly visible and not obscured by glare or shadows.
                    </p>
                  </div>
                )}
                
                <ResultsGrid result={result} />
                <JanAushadhiLocator />
                
                <div className="flex justify-center pt-8 pb-4">
                    <button 
                      onClick={handleClear}
                      className="px-6 py-3 bg-white border-2 border-[#2E7D32] text-[#2E7D32] rounded-lg font-bold hover:bg-green-50 transition-all shadow-sm"
                    >
                      Scan Another Prescription
                    </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <DisclaimerBar />
    </div>
  );
};

export default App;
