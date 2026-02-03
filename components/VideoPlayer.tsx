import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  onClose: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [useProxy, setUseProxy] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  
  // 1. Initialize & Normalize URL
  useLayoutEffect(() => {
    // Reset state when channel changes
    setError(null);
    setIsLoading(true);
    setUseProxy(false);
    
    // Auto-detect Mixed Content (HTTPS site -> HTTP stream)
    const isMixed = window.location.protocol === 'https:' && channel.url.startsWith('http:') && !channel.url.includes('corsproxy');
    if (isMixed) {
        setUseProxy(true);
    }

    // Normalization: Xtream Codes VOD (.mkv/.avi) -> .m3u8
    let urlToUse = channel.url;
    const xcRegex = /^(https?:\/\/[^/]+)\/(movie|series)\/([^/]+)\/([^/]+)\/(\d+)\.(.+)$/i;
    const match = urlToUse.match(xcRegex);
    if (match) {
        const ext = match[6].toLowerCase();
        if (ext !== 'm3u8') {
            console.log("[Player] Converting VOD URL to HLS (.m3u8) for compatibility");
            urlToUse = `${match[1]}/${match[2]}/${match[3]}/${match[4]}/${match[5]}.m3u8`;
        }
    }
    setCurrentUrl(urlToUse);

  }, [channel]);

  // 2. Handle Playback Logic
  useEffect(() => {
    if (!currentUrl) return;

    const video = videoRef.current;
    if (!video) return;

    const finalUrl = useProxy 
        ? `https://corsproxy.io/?${encodeURIComponent(currentUrl)}`
        : currentUrl;

    console.log(`[Player] Loading: ${finalUrl}`);
    
    // Cleanup previous HLS
    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    const isM3U8 = finalUrl.includes('.m3u8') || useProxy; // Proxy usually returns text/stream which hls.js might handle if it's m3u8 content

    if (isM3U8 && window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
            maxMaxBufferLength: 30, // Limit buffer to avoid memory issues
            xhrSetup: (xhr: any) => { xhr.withCredentials = false; }
        });
        
        hlsRef.current = hls;
        hls.loadSource(finalUrl);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            setIsLoading(false);
            const p = video.play();
            if (p) p.catch(e => console.warn("Autoplay blocked:", e));
        });

        hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) {
                console.warn("[HLS Error]", data);
                if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                    if (!useProxy) {
                        console.log("Network Error -> Trying Proxy");
                        setUseProxy(true);
                        return;
                    }
                    hls.startLoad();
                } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                    hls.recoverMediaError();
                } else {
                    hls.destroy();
                    setError("Stream error. Source might be offline.");
                }
            }
        });
    } else {
        // Native Playback (MP4 usually)
        video.src = finalUrl;
        video.load();
        
        const p = video.play();
        if (p) p.then(() => setIsLoading(false)).catch(e => console.warn("Native play error:", e));
    }

    const handleNativeError = () => {
        if (video.error) {
            console.error("Native Error:", video.error);
            setIsLoading(false);
            if (!useProxy) {
                 console.log("Native Error -> Trying Proxy");
                 setUseProxy(true);
            } else {
                 setError("Playback failed. Stream format unsupported or offline.");
            }
        }
    };
    
    const handleLoaded = () => setIsLoading(false);

    video.addEventListener('error', handleNativeError);
    video.addEventListener('loadeddata', handleLoaded);
    video.addEventListener('playing', handleLoaded);

    return () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        if (video) {
            video.removeEventListener('error', handleNativeError);
            video.removeEventListener('loadeddata', handleLoaded);
            video.removeEventListener('playing', handleLoaded);
            video.removeAttribute('src');
            video.load();
        }
    };
  }, [currentUrl, useProxy]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center">
      {/* Overlay Header */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent z-20 flex justify-between items-center">
        <div className="max-w-[60%]">
            <h2 className="text-xl font-bold text-white truncate drop-shadow-md">{channel.name}</h2>
            <p className="text-gray-300 text-sm truncate opacity-80">{channel.group}</p>
        </div>
        
        <div className="flex gap-3">
            <button 
                onClick={() => setUseProxy(!useProxy)}
                className={`px-3 py-1 rounded text-xs font-bold border transition ${
                    useProxy ? 'bg-green-600 border-green-500 text-white' : 'bg-white/10 border-white/20 text-gray-300 hover:bg-white/20'
                }`}
            >
                {useProxy ? 'Proxy ON' : 'Proxy OFF'}
            </button>
            <button 
                onClick={onClose}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded font-bold shadow-lg transition transform hover:scale-105"
            >
                Close
            </button>
        </div>
      </div>

      <div className="w-full h-full flex items-center justify-center bg-black relative">
        {/* Loading */}
        {isLoading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
                <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-white font-medium animate-pulse">Buffering...</p>
            </div>
        )}

        {/* Error */}
        {error && (
            <div className="absolute z-30 text-center p-8 bg-[#181818] rounded-xl border border-gray-700 max-w-lg shadow-2xl">
                <div className="text-red-500 text-3xl font-bold mb-4">Playback Failed</div>
                <p className="text-gray-300 mb-6 text-lg">{error}</p>
                
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={() => { setError(null); setIsLoading(true); setUseProxy(!useProxy); }}
                        className="bg-white text-black font-bold py-3 px-6 rounded hover:bg-gray-200 transition"
                    >
                        Try {useProxy ? 'Direct Connection' : 'Proxy Mode'}
                    </button>
                    
                    <a 
                        href={`vlc://${channel.url}`}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-6 rounded flex items-center justify-center gap-2 transition"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                        Open in VLC
                    </a>
                </div>
            </div>
        )}

        <video 
            ref={videoRef} 
            controls 
            className="w-full h-full max-h-screen object-contain focus:outline-none bg-black"
            autoPlay
            playsInline
            crossOrigin="anonymous"
        />
      </div>
    </div>
  );
};

export default VideoPlayer;