import React, { useEffect, useRef, useState } from 'react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  onClose: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null); // Store HLS instance in ref to survive renders
  const [error, setError] = useState<string | null>(null);
  const [useProxy, setUseProxy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Auto-detect Mixed Content (HTTPS site loading HTTP stream)
  useEffect(() => {
    if (window.location.protocol === 'https:' && channel.url.startsWith('http:') && !channel.url.includes('corsproxy')) {
        console.log("Mixed Content detected: Auto-enabling proxy");
        setUseProxy(true);
    } else {
        // Reset proxy state when channel changes (unless it was auto-set above)
        setUseProxy(false);
    }
  }, [channel]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setError(null);

    // 1. Determine URL
    const finalUrl = useProxy 
        ? `https://corsproxy.io/?${encodeURIComponent(channel.url)}` 
        : channel.url;

    const isM3U8 = /\.m3u8(\?.*)?$/i.test(finalUrl) || (useProxy && channel.url.includes('.m3u8'));

    console.log(`[Player] Loading: ${channel.name} | Proxy: ${useProxy} | Type: ${isM3U8 ? 'HLS' : 'Native'}`);

    // 2. Cleanup previous HLS instance immediately
    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    // 3. HLS Playback Logic
    if (isM3U8 && window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
            xhrSetup: (xhr: any) => { xhr.withCredentials = false; }
        });
        
        hlsRef.current = hls;

        hls.loadSource(finalUrl);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false);
            video.play().catch(e => console.warn("Autoplay blocked:", e));
        });

        hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) {
                switch (data.type) {
                    case window.Hls.ErrorTypes.NETWORK_ERROR:
                        console.warn("Network error, trying to recover...");
                        hls.startLoad();
                        break;
                    case window.Hls.ErrorTypes.MEDIA_ERROR:
                        console.warn("Media error, trying to recover...");
                        hls.recoverMediaError();
                        break;
                    default:
                        console.error("Fatal HLS error:", data);
                        hls.destroy();
                        setError("Stream is offline or format is unsupported.");
                        break;
                }
            }
        });

    } else {
        // 4. Native Playback (MP4, MKV, or Safari HLS)
        video.src = finalUrl;
        video.load();
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => setIsLoading(false))
                .catch(e => {
                    console.warn("Native playback failed:", e);
                    // Don't set error yet, wait for 'error' event
                });
        }
    }

    // 5. Native Error Listener
    const handleNativeError = () => {
        if (video.error) {
            setIsLoading(false);
            const code = video.error.code;
            let msg = "Unknown playback error.";
            
            if (code === 3) msg = "Decoding error. Format might be unsupported.";
            if (code === 4) msg = "Source unsupported or stream offline.";
            
            // If we aren't using proxy yet, suggest it
            if (!useProxy && window.location.protocol === 'https:' && channel.url.startsWith('http:')) {
                setUseProxy(true); // Force retry with proxy
                return;
            }

            setError(msg);
        }
    };
    
    // 6. Native Loaded Data Listener (to clear loading state)
    const handleLoadedData = () => {
        setIsLoading(false);
    };

    video.addEventListener('error', handleNativeError);
    video.addEventListener('loadeddata', handleLoadedData);

    return () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        if (video) {
            video.removeEventListener('error', handleNativeError);
            video.removeEventListener('loadeddata', handleLoadedData);
            video.removeAttribute('src');
            video.load();
        }
    };
  }, [channel, useProxy]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent z-20 flex justify-between items-center transition-opacity hover:opacity-100 opacity-0 md:opacity-100">
        <div className="max-w-[70%]">
            <h2 className="text-xl font-bold text-white truncate">{channel.name}</h2>
            <p className="text-gray-300 text-sm truncate">
                {channel.group} • {useProxy ? 'Proxy Mode' : 'Direct Mode'}
            </p>
        </div>
        <button 
            onClick={onClose}
            className="text-white bg-red-600 hover:bg-red-700 px-6 py-2 rounded font-bold shadow-lg"
        >
            Close
        </button>
      </div>

      <div className="w-full h-full flex items-center justify-center bg-black relative">
        
        {/* Loading Spinner */}
        {isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        )}

        {/* Error UI */}
        {error && (
            <div className="absolute z-30 text-center p-8 bg-gray-900/90 rounded-xl border border-gray-700 max-w-lg backdrop-blur">
                <div className="text-red-500 text-3xl font-bold mb-4">Playback Failed</div>
                <p className="text-gray-300 mb-8 text-lg">{error}</p>
                
                <div className="flex flex-col gap-4">
                    {!useProxy && (
                        <button 
                            onClick={() => setUseProxy(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded transition"
                        >
                            Try Proxy Mode (Fixes HTTP/HTTPS)
                        </button>
                    )}
                    
                    <a 
                        href={`vlc://${channel.url}`}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-6 rounded flex items-center justify-center gap-2 transition"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                        Open in VLC Player
                    </a>
                </div>
                <div className="mt-6 text-[10px] text-gray-500 font-mono break-all p-2 bg-black rounded">
                    Source: {channel.url}
                </div>
            </div>
        )}

        {/* Video Element */}
        <video 
            ref={videoRef} 
            controls 
            className="w-full h-full max-h-screen object-contain focus:outline-none"
            autoPlay
            playsInline
            crossOrigin="anonymous"
        />
      </div>
    </div>
  );
};

export default VideoPlayer;