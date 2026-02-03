import React, { useEffect, useRef, useState } from 'react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  onClose: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null); // Store HLS instance
  
  // LOGIC: If we are on HTTPS and the stream is HTTP, OR if it's a Live stream (m3u8), 
  // we default to proxy. Proxy is much safer for Live TV because of CORS and Mixed Content.
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isHttpStream = channel.url.startsWith('http:');
  const isLive = channel.contentType === 'live' || channel.url.includes('.m3u8');
  
  // Default to proxy if Mixed Content OR Live Stream (for stability)
  const [useProxy, setUseProxy] = useState(isHttps && isHttpStream || isLive);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'initializing' | 'playing' | 'buffering' | 'error'>('initializing');
  const [debugMsg, setDebugMsg] = useState('Initializing...');

  useEffect(() => {
    // Reset state on channel change
    // Always prefer proxy for live streams to ensure headers are sanitized (VLC Agent)
    const shouldProxy = (isHttps && isHttpStream) || isLive;
    setUseProxy(shouldProxy);
    
    setError(null);
    setStatus('initializing');
    setDebugMsg('Loading stream...');
  }, [channel]);

  // Main Player Logic
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    const streamUrl = useProxy 
        ? `/api/proxy?url=${encodeURIComponent(channel.url)}` 
        : channel.url;
    
    console.log(`[Player] Loading: ${streamUrl}`);
    
    if (useProxy) setDebugMsg('Connecting via Secure Relay...');

    // Detect if HLS
    const isM3U8 = streamUrl.toLowerCase().includes('.m3u8') || 
                   (channel.contentType === 'live' && !streamUrl.toLowerCase().match(/\.(mp4|mkv|avi|mov)$/));

    const handleSuccess = () => {
        setStatus('playing');
        setDebugMsg('');
    };

    const handleFailure = (msg: string) => {
        console.warn(`[Player Error] ${msg}`);
        
        // If we failed and haven't tried proxy yet, try it.
        if (!useProxy && !streamUrl.includes('/api/proxy')) {
            console.log("Switching to Secure Proxy...");
            setUseProxy(true);
            return;
        }

        setStatus('error');
        setError(msg);
    };

    if (isM3U8 && window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({
            enableWorker: true,
            lowLatencyMode: true,
            // Tuning for Speed & Stability
            manifestLoadingTimeOut: 20000,
            levelLoadingTimeOut: 20000,
            fragLoadingTimeOut: 20000,
            startFragPrefetch: true, // Fetch first segment immediately
            liveSyncDurationCount: 3, // Lower latency for live
            maxBufferLength: 30, // Keep buffer small for live stability
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
                        console.warn("HLS Network Error", data);
                        hls.startLoad(); // Aggressively try to recover network errors
                        break;
                    case window.Hls.ErrorTypes.MEDIA_ERROR:
                        console.warn("HLS Media Error - recovering...");
                        hls.recoverMediaError();
                        break;
                    default:
                        hls.destroy();
                        handleFailure("Stream format not supported.");
                        break;
                }
            }
        });

    } else if (video.canPlayType('application/vnd.apple.mpegurl') && isM3U8) {
        // Safari Native HLS
        video.src = streamUrl;
        video.play().catch(() => {});
    } else {
        // Native MP4
        video.src = streamUrl;
        video.load();
        video.play().catch(() => {});
    }

    const onVideoError = () => {
        const err = video.error;
        let msg = "Playback failed.";
        if (err) {
            if (err.code === 3) msg = "Browser cannot decode this format.";
            if (err.code === 4) msg = "Source unreachable.";
        }
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
                {useProxy && <span className="text-blue-300 text-xs px-2 py-1 bg-blue-900/50 rounded border border-blue-800">ENCRYPTED</span>}
            </div>
        </div>
        
        <button 
            onClick={onClose}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-bold shadow-lg transition"
        >
            Close
        </button>
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
                    <h3 className="text-2xl font-bold text-red-500 mb-2">Stream Offline</h3>
                    <p className="text-gray-300 mb-6">
                        The connection to the source server failed.
                        <br/>
                        <span className="text-sm text-gray-500 mt-2 block">
                           We tried to use our secure relay (User-Agent: VLC), but the upstream server is not responding. 
                        </span>
                    </p>
                    <button 
                        onClick={() => { setStatus('initializing'); setUseProxy(true); }}
                        className="bg-white text-black font-bold py-2 px-6 rounded hover:bg-gray-200 transition"
                    >
                        Retry
                    </button>
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