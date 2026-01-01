import { MapPin, Navigation, Loader2, AlertCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { findNearestStore } from '../services/geminiService';
import { StoreLocation } from '../types';

export const JanAushadhiLocator: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [store, setStore] = useState<StoreLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    // Attempt auto-locate on component mount
    handleLocate();
  }, []);

  const handleLocate = () => {
    setLoading(true);
    setError(null);
    setPermissionDenied(false);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setLoading(false);
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 15000, // Increased timeout to 15s for better reliability indoors
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await findNearestStore(
            position.coords.latitude,
            position.coords.longitude
          );
          
          if (result) {
            setStore(result);
          } else {
            setError("Unable to find a store nearby. Please try again or search on Google Maps.");
          }
        } catch (e: any) {
          console.error("Store search error:", e);
          setError("Connection issue. Please check your internet and try again.");
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        // Explicitly extract string message from error object to avoid [object Object]
        console.error("Geolocation error:", err.message || err);
        
        let userMessage = "Location could not be retrieved. Please try again.";
        
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionDenied(true);
          userMessage = "Location access is required to find the nearest store.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          userMessage = "Position unavailable. Please ensure GPS is enabled and you have a signal.";
        } else if (err.code === err.TIMEOUT) {
          userMessage = "Location request timed out. Please try again.";
        } else if (err.message && typeof err.message === 'string') {
          userMessage = err.message;
        }
        
        setError(userMessage);
        setLoading(false);
      },
      options
    );
  };

  if (store) {
     return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700 mt-6">
            <div className="p-4 bg-green-50 border-b border-green-100 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#2E7D32]" />
                <h3 className="font-semibold text-green-900">Nearest Jan Aushadhi Store</h3>
            </div>
            <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex-1">
                    <h4 className="text-lg font-bold text-gray-800">{store.name}</h4>
                    <p className="text-gray-600 mt-2 text-sm leading-relaxed whitespace-pre-line">{store.address}</p>
                </div>
                <a 
                    href={store.mapUri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#2E7D32] text-white rounded-lg font-medium hover:bg-[#256628] transition-colors shadow-sm whitespace-nowrap"
                >
                    <Navigation className="w-4 h-4" />
                    Navigate
                </a>
            </div>
        </div>
     );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center gap-3">
            <div className="bg-green-50 p-4 rounded-full">
                <MapPin className={`w-8 h-8 text-[#2E7D32] ${loading ? 'animate-pulse' : ''}`} />
            </div>
            <div>
                <h3 className="text-lg font-bold text-gray-800">
                    {loading ? 'Finding Nearest Kendra...' : 'Nearest Jan Aushadhi Store'}
                </h3>
                <p className="text-gray-500 max-w-md mx-auto mt-2 text-xs leading-relaxed">
                    Locate the closest Pradhan Mantri Bhartiya Janaushadhi Kendra to purchase generic medicines at affordable prices.
                </p>
            </div>
            
            {error && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-4 py-2 rounded-lg text-xs mt-2 border border-amber-100 max-w-sm mx-auto">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="text-left">{error}</span>
                </div>
            )}

            {!loading && (
              <button
                  onClick={handleLocate}
                  className="mt-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 hover:text-[#2E7D32] hover:border-[#2E7D32] transition-all flex items-center gap-2 shadow-sm"
              >
                  <Navigation className="w-4 h-4" />
                  Try Again
              </button>
            )}

            {loading && (
                <div className="flex items-center gap-2 text-gray-400 text-xs animate-pulse mt-1">
                   <Loader2 className="w-3.5 h-3.5 animate-spin" />
                   Identifying location...
                </div>
            )}
        </div>
    </div>
  );
};