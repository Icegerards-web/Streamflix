import React, { useEffect, useRef, useState } from 'react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  onClose: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null); // Store HLS instance
  
  // State
  const [useProxy, setUseProxy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'initializing' | 'playing' | 'buffering' | 'error'>('initializing');
  const [debugMsg, setDebugMsg] = useState('Initializing...');

  useEffect(() => {
    // Reset state on channel change
    setUseProxy(false);
    setError(null);
    setStatus('initializing');
    setDebugMsg('Loading stream...');
  }, [channel]);

  // Main Player Logic
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 1. Cleanup previous instances
    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    // 2. Prepare URL
    // If proxy is enabled, route through our local backend
    const streamUrl = useProxy 
        ? `/api/proxy?url=${encodeURIComponent(channel.url)}` 
        : channel.url;
    
    console.log(`[Player] Loading: ${streamUrl} (Proxy: ${useProxy})`);
    setDebugMsg(`Connecting to ${useProxy ? 'secure relay' : 'source'}...`);

    // 3. Determine Format
    // We assume .m3u8 is HLS. Live streams from Xtream are almost always .m3u8.
    // If content type is 'live' and no extension, assume HLS.
    const isM3U8 = streamUrl.toLowerCase().includes('.m3u8') || 
                   (channel.contentType === 'live' && !streamUrl.toLowerCase().match(/\.(mp4|mkv|avi|mov)$/));

    const handleSuccess = () => {
        setStatus('playing');
        setDebugMsg('');
    };

    const handleFailure = (msg: string, fatal: boolean = false) => {
        console.warn(`[Player Error] ${msg}`);
        
        // If we haven't tried proxy yet, try it automatically
        if (!useProxy && !streamUrl.includes('/api/proxy')) {
            console.log("Attempting auto-switch to proxy...");
            setUseProxy(true);
            return;
        }

        // If we are already using proxy or it's a fatal decode error
        setStatus('error');
        setError(msg);
    };

    // 4. Playback Implementation
    if (isM3U8 && window.Hls && window.Hls.isSupported()) {
        // --- HLS.js Path (Chrome, Firefox, Edge) ---
        const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: true,
            manifestLoadingTimeOut: 15000,
            levelLoadingTimeOut: 15000,
            fragLoadingTimeOut: 15000,
        });
        hlsRef.current = hls;

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            setDebugMsg('Buffering...');
            video.play().catch(e => console.log("Autoplay blocked:", e));
        });

        hls.on(window.Hls.Events.ERROR, (_: any, data: any) => {
            if (data.fatal) {
                switch (data.type) {
                    case window.Hls.ErrorTypes.NETWORK_ERROR:
                        console.warn("HLS Network Error");
                        // 403/Cors -> Fail immediately to trigger proxy
                        if (data.response?.code === 403 || data.response?.code === 0) {
                             handleFailure("Network blocked (CORS/403). Switching method...");
                             hls.destroy();
                        } else {
                             hls.startLoad(); // Try to recover
                        }
                        break;
                    case window.Hls.ErrorTypes.MEDIA_ERROR:
                        console.warn("HLS Media Error - recovering...");
                        hls.recoverMediaError();
                        break;
                    default:
                        hls.destroy();
                        handleFailure("Stream format not supported by browser.");
                        break;
                }
            }
        });

    } else if (video.canPlayType('application/vnd.apple.mpegurl') && isM3U8) {
        // --- Native HLS Path (Safari) ---
        video.src = streamUrl;
        video.play().catch(() => {});
        // Errors handled by native listener below

    } else {
        // --- Standard Native Path (MP4, etc) ---
        video.src = streamUrl;
        video.load();
        video.play().catch(() => {});
    }

    // Native Error Listener (Catch-all)
    const onVideoError = () => {
        const err = video.error;
        let msg = "Playback failed.";
        if (err) {
            if (err.code === 3) msg = "Browser cannot decode this video format.";
            if (err.code === 4) msg = "Source unreachable or blocked.";
        }
        // Only report if we aren't already recovering via HLS
        if (status !== 'error') {
            handleFailure(msg);
        }
    };

    const onWaiting = () => setStatus('buffering');
    const onPlaying = () => handleSuccess();

    video.addEventListener('error', onVideoError);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);

    return () => {
        if (hlsRef.current) hlsRef.current.destroy();
        video.removeEventListener('error', onVideoError);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('playing', onPlaying);
    };
  }, [channel, useProxy]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header / Controls */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent z-20 flex justify-between items-start">
        <div className="max-w-[70%]">
            <h2 className="text-xl font-bold text-white truncate drop-shadow-md">{channel.name}</h2>
            <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-300 text-xs px-2 py-1 bg-white/10 rounded">{channel.group}</span>
                {useProxy && <span className="text-blue-300 text-xs px-2 py-1 bg-blue-900/50 rounded border border-blue-800">Secure Mode</span>}
                <span className="text-gray-400 text-xs">{channel.contentType.toUpperCase()}</span>
            </div>
        </div>
        
        <div className="flex flex-col gap-2 items-end">
            <button 
                onClick={onClose}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-bold shadow-lg transition"
            >
                Close
            </button>
            {status === 'error' && !useProxy && (
                <button 
                    onClick={() => setUseProxy(true)}
                    className="text-xs text-gray-300 underline hover:text-white"
                >
                    Try Secure Mode
                </button>
            )}
        </div>
      </div>

      {/* Main Video Area */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        
        {/* Status Overlay */}
        {(status === 'initializing' || status === 'buffering') && !error && (
             <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-white font-medium animate-pulse">{debugMsg || 'Buffering...'}</p>
             </div>
        )}

        {/* Error Overlay */}
        {status === 'error' && error && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/90 p-6">
                <div className="bg-[#181818] p-8 rounded-xl border border-gray-700 max-w-lg w-full text-center shadow-2xl">
                    <h3 className="text-2xl font-bold text-red-500 mb-2">Playback Error</h3>
                    <p className="text-gray-300 mb-6">{error}</p>
                    
                    <div className="space-y-3">
                         <a 
                            href={`vlc://${channel.url}`}
                            className="block w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded transition flex items-center justify-center gap-2"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                            Open in VLC Player
                        </a>
                        <p className="text-xs text-gray-500">
                            Recommended for MKV/AVI files or unstable streams.
                        </p>
                    </div>
                </div>
            </div>
        )}

        <video 
            ref={videoRef}
            className="w-full h-full object-contain"
            controls
            autoPlay
            playsInline
            crossOrigin="anonymous"
        />
      </div>
    </div>
  );
};

export default VideoPlayer;