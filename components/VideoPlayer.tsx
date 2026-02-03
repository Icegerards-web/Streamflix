import React, { useEffect, useRef, useState } from 'react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  onClose: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [useProxy, setUseProxy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  // Reset state on channel change
  useEffect(() => {
    // Auto-detect Mixed Content immediately
    const needsProxy = window.location.protocol === 'https:' && channel.url.startsWith('http:') && !channel.url.includes('corsproxy');
    setUseProxy(needsProxy);
    setRetryCount(0);
    setError(null);
    setIsLoading(true);
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

    // Detect if source is HLS (m3u8)
    const isM3U8 = /\.m3u8(\?.*)?$/i.test(finalUrl) || (useProxy && channel.url.includes('.m3u8'));

    console.log(`[Player] Loading: ${channel.name}`);
    console.log(`[Player] Url: ${finalUrl}`);
    console.log(`[Player] Mode: ${isM3U8 ? 'HLS' : 'Native'} | Proxy: ${useProxy}`);

    // 2. Cleanup previous HLS
    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    // 3. HLS Logic
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
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => console.warn("Autoplay blocked:", e));
            }
        });

        hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) {
                console.warn("[HLS Error]", data);
                switch (data.type) {
                    case window.Hls.ErrorTypes.NETWORK_ERROR:
                        // If network error (CORS or 404), and not using proxy, try proxy.
                        if (!useProxy) {
                            console.log("HLS Network Error -> Switching to Proxy");
                            setUseProxy(true);
                            return; // Trigger re-render
                        }
                        hls.startLoad();
                        break;
                    case window.Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;
                    default:
                        hls.destroy();
                        setError("Stream is offline or format is unsupported.");
                        break;
                }
            }
        });

    } else {
        // 4. Native Playback
        video.src = finalUrl;
        video.load();
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => setIsLoading(false))
                .catch(e => console.warn("Native playback start failed:", e));
        }
    }

    // 5. Native Error Handlers
    const handleNativeError = () => {
        if (video.error) {
            console.error("[Native Error]", video.error);
            setIsLoading(false);
            
            // If error and not proxy, try proxy first
            if (!useProxy) {
                console.log("Native Error -> Switching to Proxy");
                setUseProxy(true);
                return;
            }

            const code = video.error.code;
            let msg = "Unknown playback error.";
            if (code === 3) msg = "Decoding error. Format might be unsupported.";
            if (code === 4) msg = "Source unsupported or stream offline.";
            setError(msg);
        }
    };
    
    const handleLoadedData = () => {
        setIsLoading(false);
    };

    const handleStalled = () => {
        // If stuck loading for too long
        if (isLoading) {
             console.log("Stalled...");
        }
    };

    video.addEventListener('error', handleNativeError);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('stalled', handleStalled);

    return () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        if (video) {
            video.removeEventListener('error', handleNativeError);
            video.removeEventListener('loadeddata', handleLoadedData);
            video.removeEventListener('stalled', handleStalled);
            video.removeAttribute('src');
            video.load();
        }
    };
  }, [channel, useProxy, retryCount]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent z-20 flex justify-between items-center">
        <div className="max-w-[60%]">
            <h2 className="text-xl font-bold text-white truncate">{channel.name}</h2>
            <p className="text-gray-300 text-sm truncate">
                {channel.group}
            </p>
        </div>
        
        <div className="flex gap-3">
            <button 
                onClick={() => setUseProxy(!useProxy)}
                className={`px-3 py-1 rounded text-xs font-bold border ${useProxy ? 'bg-green-600 border-green-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
                title="Toggle Proxy Mode to bypass CORS/HTTPS restrictions"
            >
                {useProxy ? 'Proxy ON' : 'Proxy OFF'}
            </button>
            <button 
                onClick={onClose}
                className="text-white bg-red-600 hover:bg-red-700 px-6 py-2 rounded font-bold shadow-lg"
            >
                Close
            </button>
        </div>
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
                            Enable Proxy Mode
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