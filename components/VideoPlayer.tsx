import React, { useEffect, useRef, useState } from 'react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  onClose: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null); // Store HLS instance
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 1. Cleanup previous state
    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }
    setError(null);
    setIsLoading(true);

    const src = channel.url;
    // Basic detection for HLS
    const isM3U8 = src.toLowerCase().includes('.m3u8');

    const handleSuccess = () => {
        setIsLoading(false);
    };

    const handleError = (e: any) => {
        console.error("Playback Error:", e);
        setIsLoading(false);
        setError("Unable to play this stream directly.");
    };

    console.log(`[VideoPlayer] Loading: ${src} (HLS: ${isM3U8})`);

    // 2. Playback Logic
    if (isM3U8 && window.Hls && window.Hls.isSupported()) {
        // Option A: HLS.js (Chrome, Firefox, Edge, etc.)
        const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: true,
        });
        hlsRef.current = hls;

        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => console.log("Autoplay blocked by browser."));
            handleSuccess();
        });

        hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) {
                switch (data.type) {
                    case window.Hls.ErrorTypes.NETWORK_ERROR:
                        console.warn("HLS Network Error - trying to recover...");
                        hls.startLoad();
                        break;
                    case window.Hls.ErrorTypes.MEDIA_ERROR:
                        console.warn("HLS Media Error - recovering...");
                        hls.recoverMediaError();
                        break;
                    default:
                        console.error("HLS Fatal Error");
                        hls.destroy();
                        handleError(data);
                        break;
                }
            }
        });

    } else if (video.canPlayType('application/vnd.apple.mpegurl') && isM3U8) {
        // Option B: Native HLS (Safari)
        video.src = src;
        video.addEventListener('loadedmetadata', () => {
            video.play().catch(() => console.log("Autoplay blocked."));
            handleSuccess();
        });
        video.addEventListener('error', handleError);

    } else {
        // Option C: Native Playback (MP4, MKV if supported, etc.)
        video.src = src;
        video.load();
        video.play().catch(() => console.log("Autoplay blocked."));
        
        video.addEventListener('loadeddata', handleSuccess);
        video.addEventListener('error', handleError);
    }

    // 3. Cleanup on unmount
    return () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
        }
        // Remove native listeners to prevent memory leaks
        video.removeEventListener('loadedmetadata', handleSuccess);
        video.removeEventListener('loadeddata', handleSuccess);
        video.removeEventListener('error', handleError);
    };
  }, [channel]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center">
      {/* Overlay Header */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent z-20 flex justify-between items-center">
        <div className="max-w-[80%]">
            <h2 className="text-xl font-bold text-white truncate drop-shadow-md">{channel.name}</h2>
            <p className="text-gray-300 text-sm truncate opacity-80">{channel.group}</p>
        </div>
        
        <button 
            onClick={onClose}
            className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded font-bold shadow-lg transition transform hover:scale-105"
        >
            Close
        </button>
      </div>

      <div className="w-full h-full flex items-center justify-center bg-black relative">
        
        {/* Loading Spinner */}
        {isLoading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
                <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-white font-medium animate-pulse">Buffering...</p>
            </div>
        )}

        {/* Error UI */}
        {error && (
            <div className="absolute z-30 text-center p-8 bg-[#181818] rounded-xl border border-gray-700 max-w-lg shadow-2xl">
                <div className="text-red-500 text-3xl font-bold mb-4">Playback Error</div>
                <p className="text-gray-300 mb-6 text-lg">
                    {error} <br/>
                    <span className="text-sm text-gray-500 mt-2 block">
                        (Browser blocked the connection or format is unsupported)
                    </span>
                </p>
                
                <div className="flex flex-col gap-3">
                    <a 
                        href={`vlc://${channel.url}`}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-6 rounded flex items-center justify-center gap-2 transition"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                        Open in VLC
                    </a>
                    
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-sm underline mt-2"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        )}

        {/* Video Element */}
        <video 
            ref={videoRef} 
            controls 
            className="w-full h-full max-h-screen object-contain focus:outline-none bg-black"
            playsInline
            crossOrigin="anonymous" 
        />
      </div>
    </div>
  );
};

export default VideoPlayer;