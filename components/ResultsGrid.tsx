import React, { useState, useEffect, useRef } from 'react';
import { AnalysisResult } from '../types';
import { Pill, ArrowRight, Volume2, Square, Languages, Info, Loader2 } from 'lucide-react';
import { generateSpeech } from '../services/geminiService';

interface ResultsGridProps {
  result: AnalysisResult;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi (हिंदी)' },
  { code: 'te', label: 'Telugu (తెలుగు)' },
  { code: 'ta', label: 'Tamil (தமிழ்)' },
  { code: 'kn', label: 'Kannada (కನ್ನಡ)' },
  { code: 'bn', label: 'Bengali (বাংলা)' },
  { code: 'mr', label: 'Marathi (मరాఠీ)' },
];

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const ResultsGrid: React.FC<ResultsGridProps> = ({ result }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeProvider, setActiveProvider] = useState<'Bhashini' | 'Gemini' | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedLang, setSelectedLang] = useState('en');
  const [voiceWarning, setVoiceWarning] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
    };

    if ('speechSynthesis' in window) {
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      stopAll();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (isSpeaking) {
      stopAll();
    }
    setVoiceWarning(null);
  }, [selectedLang]);

  const stopAll = () => {
    window.speechSynthesis.cancel();
    if (activeSourceRef.current) {
        try {
            activeSourceRef.current.stop();
        } catch (e) {}
        activeSourceRef.current = null;
    }
    setIsSpeaking(false);
    setIsGenerating(false);
    setActiveProvider(null);
  };

  const speakSummary = async () => {
    if (isSpeaking || isGenerating) {
      stopAll();
      return;
    }
    setVoiceWarning(null);
    const summaryText = (result.bhashini_summary as any)[selectedLang] || result.bhashini_summary.en;
    if (!summaryText) return;

    let targetVoice = voices.find(v => v.lang.startsWith(selectedLang));
    if (!targetVoice && selectedLang === 'en') {
         targetVoice = voices.find(v => v.lang.includes('en'));
    }

    if (targetVoice) {
      setActiveProvider('Bhashini');
      const utterance = new SpeechSynthesisUtterance(summaryText);
      utterance.voice = targetVoice;
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); setActiveProvider(null); };
      utterance.onerror = () => { setIsSpeaking(false); setActiveProvider(null); };
      window.speechSynthesis.speak(utterance);
    } else {
      setActiveProvider('Gemini');
      try {
        setIsGenerating(true);
        const base64Audio = await generateSpeech(summaryText);
        setVoiceWarning(null);
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        }
        const ctx = audioContextRef.current;
        const audioBytes = decode(base64Audio);
        const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
            setIsSpeaking(false);
            activeSourceRef.current = null;
            setActiveProvider(null);
        };
        activeSourceRef.current = source;
        source.start(0);
        setIsSpeaking(true);
      } catch (err) {
        console.error(err);
        setVoiceWarning("Failed to generate audio. Please try English.");
        setActiveProvider(null);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const hasMeds = result.medications.length > 0;
  if (!hasMeds) return null;

  const doctorName = result.metadata.doctor.toLowerCase().includes('not provided') ? 'Unknown Practitioner' : result.metadata.doctor;
  const dateStr = result.metadata.date.toLowerCase().includes('not provided') ? 'Not specified' : result.metadata.date;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="bg-green-50 rounded-lg p-4 border border-green-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1 pr-4">
           <h2 className="text-sm font-semibold text-green-800 uppercase tracking-wide">Doctor</h2>
           <p className="text-gray-900 font-medium break-words leading-tight">{doctorName}</p>
        </div>
        <div className="sm:text-right shrink-0">
           <h2 className="text-sm font-semibold text-green-800 uppercase tracking-wide">Date</h2>
           <p className="text-gray-900 font-medium">{dateStr}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-4">
            <h2 className="text-xl font-bold text-gray-800 text-center sm:text-left w-full sm:w-auto">Prescription Analysis</h2>
            
            <div className="flex flex-col items-center sm:items-end w-full sm:w-auto">
                <div className="flex items-center gap-2 bg-white p-1 rounded-full border border-gray-200 shadow-sm z-10">
                    <div className="relative flex items-center">
                        <Languages className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
                        <select 
                            value={selectedLang}
                            onChange={(e) => setSelectedLang(e.target.value)}
                            disabled={isGenerating || isSpeaking}
                            className="pl-9 pr-3 py-1.5 bg-transparent text-sm font-medium text-gray-700 focus:outline-none cursor-pointer hover:bg-gray-50 rounded-l-full border-r border-gray-200 h-full appearance-none disabled:opacity-50"
                            aria-label="Select Language"
                        >
                            {SUPPORTED_LANGUAGES.map(lang => (
                                <option key={lang.code} value={lang.code}>{lang.label}</option>
                            ))}
                        </select>
                    </div>

                    <button 
                    onClick={speakSummary}
                    disabled={isGenerating}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full transition-colors text-sm font-medium focus:outline-none min-w-[90px] justify-center ${
                        isSpeaking || isGenerating
                        ? 'bg-green-100 text-green-800' 
                        : 'text-[#2E7D32] hover:bg-green-50'
                    }`}
                    aria-label={isSpeaking ? "Stop listening" : "Listen to summary"}
                    >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : isSpeaking ? <Square className="w-4 h-4 fill-current" /> : <Volume2 className="w-4 h-4" />}
                    <span>{isGenerating ? 'Loading' : isSpeaking ? 'Stop' : 'Listen'}</span>
                    </button>
                </div>
                {(isSpeaking || isGenerating) && activeProvider && (
                    <div className="mt-2 text-[10px] font-medium text-gray-500 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
                        <span className="relative flex h-2 w-2">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isGenerating ? 'bg-amber-400' : 'bg-green-400'} opacity-75`}></span>
                          <span className={`relative inline-flex rounded-full h-2 w-2 ${isGenerating ? 'bg-amber-500' : 'bg-green-500'}`}></span>
                        </span>
                        {activeProvider} is {isGenerating ? 'generating' : 'speaking'}...
                    </div>
                )}
            </div>
        </div>
        {voiceWarning && (
            <div className="self-center sm:self-end animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="bg-amber-50 text-amber-800 text-xs px-3 py-1.5 rounded-lg border border-amber-100 flex items-center gap-2 shadow-sm">
                    <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                    {voiceWarning}
                </div>
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {result.medications.map((med, idx) => (
          <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="p-5 border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/50">
                <div className="flex items-start gap-3">
                  <div className="bg-white p-2 rounded-lg shadow-sm">
                    <Pill className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">Prescribed Brand</span>
                    <h3 className="text-lg font-bold text-gray-800 leading-tight">{med.prescribed_brand}</h3>
                    <p className="text-sm text-gray-600 mt-1 font-mono">{med.active_salt}</p>
                    <div className="mt-3 inline-block px-3 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded-full">
                        Est. {med.brand_price_est}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-5 bg-white relative">
                  <div className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 bg-white rounded-full p-1 shadow-sm border border-gray-200 z-10">
                    <ArrowRight className="w-4 h-4 text-green-600" />
                  </div>
                <div className="flex items-start gap-3">
                  <div className="bg-green-100 p-2 rounded-lg shadow-sm">
                    <Pill className="w-5 h-5 text-[#2E7D32]" />
                  </div>
                  <div className="w-full">
                    <span className="text-xs font-semibold text-[#2E7D32] uppercase">Jan Aushadhi Generic</span>
                    <h3 className="text-lg font-bold text-[#2E7D32] leading-tight">{med.jan_aushadhi_generic}</h3>
                    <div className="flex justify-between items-end mt-3">
                          <div className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">
                            Est. {med.jan_aushadhi_price_est}
                        </div>
                        <div className="text-right">
                            <span className="block text-xs text-gray-500">You Save</span>
                            <span className="text-sm font-bold text-green-600">{med.savings_est}</span>
                        </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};