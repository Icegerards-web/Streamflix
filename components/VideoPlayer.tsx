import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  onClose: () => void;
}

// Proxy Rotation List
// 1. Local Backend (Most reliable for Mixed Content & CORS)
// 2. Corsproxy.io (Fast, Public)
// 3. Codetabs (Fallback)
const getProxyUrl = (index: number, url: string) => {
    const encoded = encodeURIComponent(url);
    switch (index % 3) {
        case 0: return `/api/proxy?url=${encoded}`;
        case 1: return `https://corsproxy.io/?${encoded}`;
        case 2: return `https://api.codetabs.com/v1/proxy?quest=${encoded}`;
        default: return url;
    }
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Logic States
  const [useProxy, setUseProxy] = useState(false);
  const [proxyIndex, setProxyIndex] = useState(0);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  
  // 1. Initialize & Normalize URL
  useLayoutEffect(() => {
    // Reset state when channel changes
    setError(null);
    setIsLoading(true);
    setUseProxy(false);
    setProxyIndex(0);
    
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
    
    // Auto-detect Mixed Content (HTTPS site -> HTTP stream)
    const isMixed = window.location.protocol === 'https:' && urlToUse.startsWith('http:') && !urlToUse.includes('corsproxy');
    if (isMixed) {
        setUseProxy(true);
        // Start with Local Proxy (Index 0) as it handles Mixed Content best
        setProxyIndex(0);
    }

  }, [channel]);

  // 2. Handle Playback Logic
  useEffect(() => {
    if (!currentUrl) return;

    const video = videoRef.current;
    if (!video) return;

    // Construct Final URL
    const finalUrl = useProxy 
        ? getProxyUrl(proxyIndex, currentUrl)
        : currentUrl;

    console.log(`[Player] Loading: ${finalUrl} (Proxy: ${useProxy} Idx: ${proxyIndex})`);
    
    // Cleanup previous HLS
    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    // Determine Mode
    // If we use local proxy, we might get an m3u8 stream but the extension is hidden in query.
    // We assume HLS if original url was m3u8 or if we are proxying (hls.js can detect mime type usually, but better to force it if we know)
    const isM3U8 = currentUrl.includes('.m3u8');

    if (isM3U8 && window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 90,
            maxMaxBufferLength: 30,
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
                   handlePlaybackError();
                } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
                    hls.recoverMediaError();
                } else {
                    hls.destroy();
                    handlePlaybackError();
                }
            }
        });
    } else {
        // Native Playback
        video.src = finalUrl;
        video.load();
        
        const p = video.play();
        if (p) p.then(() => setIsLoading(false)).catch(e => console.warn("Native play error:", e));
    }

    const handleNativeError = () => {
        if (video.error) {
            console.error("Native Error:", video.error);
            handlePlaybackError();
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
  }, [currentUrl, useProxy, proxyIndex]);

  // Robust Error Handler / Retry Logic
  const handlePlaybackError = () => {
      setIsLoading(true);
      
      if (!useProxy) {
          // If not using proxy, try proxy (Index 0 = Local)
          console.log("Error -> Switching to Proxy Mode (Local)");
          setUseProxy(true);
          setProxyIndex(0);
      } else {
          // If already using proxy, try next proxy
          if (proxyIndex < 2) {
              console.log(`Error -> Rotating Proxy to Index ${proxyIndex + 1}`);
              setProxyIndex(prev => prev + 1);
          } else {
              // All proxies failed
              setIsLoading(false);
              setError("Stream unavailable via all connection methods.");
          }
      }
  };

  const getCurrentProxyName = () => {
      if (!useProxy) return 'Direct';
      switch (proxyIndex % 3) {
          case 0: return 'Local Relay (Best)';
          case 1: return 'CorsProxy.io';
          case 2: return 'CodeTabs';
          default: return 'Unknown';
      }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center">
      {/* Overlay Header */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent z-20 flex justify-between items-center">
        <div className="max-w-[60%]">
            <h2 className="text-xl font-bold text-white truncate drop-shadow-md">{channel.name}</h2>
            <div className="flex items-center gap-2">
                <p className="text-gray-300 text-sm truncate opacity-80">{channel.group}</p>
                {useProxy && <span className="text-[10px] bg-blue-900 text-blue-200 px-1 rounded border border-blue-700">{getCurrentProxyName()}</span>}
            </div>
        </div>
        
        <div className="flex gap-3">
            <button 
                onClick={() => {
                    setUseProxy(!useProxy);
                    setProxyIndex(0);
                }}
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
                <p className="text-white font-medium animate-pulse">
                    {useProxy ? `Connecting via ${getCurrentProxyName()}...` : 'Buffering...'}
                </p>
            </div>
        )}

        {/* Error */}
        {error && (
            <div className="absolute z-30 text-center p-8 bg-[#181818] rounded-xl border border-gray-700 max-w-lg shadow-2xl">
                <div className="text-red-500 text-3xl font-bold mb-4">Playback Failed</div>
                <p className="text-gray-300 mb-6 text-lg">{error}</p>
                
                <div className="flex flex-col gap-3">
                     <button 
                        onClick={() => { setError(null); handlePlaybackError(); }}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded transition"
                    >
                        Try Next Connection Method
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