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
  
  // New state to track the active URL being played (to support failover to .m3u8)
  const [currentUrl, setCurrentUrl] = useState(channel.url);
  const [isHlsOverride, setIsHlsOverride] = useState(false);

  // Reset state on channel change
  useEffect(() => {
    // Auto-detect Mixed Content immediately
    const needsProxy = window.location.protocol === 'https:' && channel.url.startsWith('http:') && !channel.url.includes('corsproxy');
    
    // Reset Everything
    setUseProxy(needsProxy);
    setRetryCount(0);
    setError(null);
    setIsLoading(true);
    setCurrentUrl(channel.url);
    setIsHlsOverride(false);
  }, [channel]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setError(null);

    // 1. Determine Final URL (Proxy + Override)
    const finalUrl = useProxy 
        ? `https://corsproxy.io/?${encodeURIComponent(currentUrl)}` 
        : currentUrl;

    // Detect if source is HLS (m3u8)
    // We check the URL extension OR if we forced HLS override
    const isM3U8 = isHlsOverride || /\.m3u8(\?.*)?$/i.test(finalUrl) || (useProxy && currentUrl.includes('.m3u8'));

    console.log(`[Player] Loading: ${channel.name}`);
    console.log(`[Player] Url: ${finalUrl}`);
    console.log(`[Player] Type: ${isM3U8 ? 'HLS' : 'Native'} | Proxy: ${useProxy}`);

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
                            return; 
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
            
            // SMART RECOVERY LOGIC
            
            // 1. If we haven't tried Proxy yet, try that first.
            if (!useProxy) {
                console.log("Native Error -> Switching to Proxy");
                setUseProxy(true);
                return;
            }

            // 2. If Proxy didn't work (or was already on), and it's NOT HLS yet,
            // Check if we can convert a standard VOD URL to HLS (.m3u8).
            // Many IPTV providers support changing .mkv/.mp4 to .m3u8 to get HLS.
            if (!isM3U8 && !isHlsOverride) {
                // Regex matches standard Xtream Codes patterns: /movie/user/pass/id.ext
                const xcRegex = /^(https?:\/\/[^/]+)\/(movie|series)\/([^/]+)\/([^/]+)\/(\d+)\.(.+)$/i;
                const match = currentUrl.match(xcRegex);
                
                if (match) {
                    // Reconstruct URL with .m3u8 extension
                    const newUrl = `${match[1]}/${match[2]}/${match[3]}/${match[4]}/${match[5]}.m3u8`;
                    console.log(`[Player] Smart Fallback: Converting MKV/MP4 to HLS -> ${newUrl}`);
                    
                    setCurrentUrl(newUrl);
                    setIsHlsOverride(true); // Force HLS mode next render
                    return;
                }
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
        if (isLoading) console.log("Stalled...");
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
  }, [currentUrl, useProxy, isHlsOverride]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent z-20 flex justify-between items-center">
        <div className="max-w-[60%]">
            <h2 className="text-xl font-bold text-white truncate">{channel.name}</h2>
            <p className="text-gray-300 text-sm truncate">
                {channel.group} {isHlsOverride && <span className="text-xs text-green-500 ml-2 border border-green-500 px-1 rounded">HLS MODE</span>}
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
                    Original Source: {channel.url}
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