import React, { useEffect, useRef, useState } from 'react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  onClose: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null); // Store HLS instance
  
  // Performance Fix: Default to PROXY enabled.
  // Trying to direct connect to IPTV streams often results in CORS timeouts (5-10s delay).
  // Starting with the proxy immediately makes it feel instant.
  const [useProxy, setUseProxy] = useState(true);
  
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'initializing' | 'playing' | 'buffering' | 'error'>('initializing');
  const [debugMsg, setDebugMsg] = useState('Initializing...');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Check if it's a local demo file or direct blob, otherwise proxy
    const isBlob = channel.url.startsWith('blob:') || channel.url.includes('localhost');
    setUseProxy(!isBlob);
    
    setError(null);
    setStatus('initializing');
    setDebugMsg('Loading stream...');
    setRetryCount(0);
  }, [channel]);

  // Main Player Logic
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
        hlsRef.current.stopLoad();
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    const streamUrl = useProxy 
        ? `/api/proxy?url=${encodeURIComponent(channel.url)}` 
        : channel.url;
    
    console.log(`[Player] Loading: ${streamUrl} (Proxy: ${useProxy})`);
    
    if (useProxy) setDebugMsg('Connecting...');
    else setDebugMsg('Connecting to Source...');

    // Detect if HLS
    const isM3U8 = streamUrl.toLowerCase().includes('.m3u8') || 
                   (channel.contentType === 'live' && !streamUrl.toLowerCase().match(/\.(mp4|mkv|avi|mov)$/));

    const handleSuccess = () => {
        setStatus('playing');
        setDebugMsg('');
    };

    const handleFailure = (msg: string) => {
        console.warn(`[Player Error] ${msg}`);
        
        // Fallback: If proxy failed (500), try direct? 
        // Or if direct failed, try proxy.
        if (!useProxy && !streamUrl.includes('/api/proxy')) {
            console.log("Direct connection failed. Switching to Proxy...");
            setUseProxy(true);
            setRetryCount(prev => prev + 1);
            return;
        }

        setStatus('error');
        setError(msg);
    };

    const attemptPlay = () => {
        if (!video) return;
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                // AbortError is benign (happens if play interrupted by pause/load/unmount)
                if (error.name === 'AbortError') return;
                console.log("Auto-play prevented:", error);
            });
        }
    };

    if (isM3U8 && window.Hls && window.Hls.isSupported()) {
        const hlsConfig = {
            enableWorker: true,
            manifestLoadingTimeOut: 15000, 
            manifestLoadingMaxRetry: 2,
            startLevel: -1,
            // Optimized Buffering
            maxBufferLength: 60, 
            maxMaxBufferLength: 120,
            backBufferLength: 30,
            // Low Latency / Fast Start
            startFragPrefetch: true
        };

        const hls = new window.Hls(hlsConfig);
        hlsRef.current = hls;

        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            setDebugMsg('Buffering...');
            attemptPlay();
        });

        hls.on(window.Hls.Events.ERROR, (_: any, data: any) => {
            if (data.fatal) {
                switch (data.type) {
                    case window.Hls.ErrorTypes.NETWORK_ERROR:
                        console.warn("HLS Network Error - Retrying...");
                        hls.startLoad(); 
                        break;
                    case window.Hls.ErrorTypes.MEDIA_ERROR:
                        console.warn("HLS Media Error - Recovering...");
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
        attemptPlay();
    } else {
        // Native MP4/MKV
        video.src = streamUrl;
        video.load();
        attemptPlay();
    }

    const onVideoError = () => {
        const err = video.error;
        let msg = "Playback failed.";
        if (err) {
            if (err.code === 3) msg = "Browser cannot play this video format.";
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
        if (hlsRef.current) {
            hlsRef.current.stopLoad(); // Immediately stop network activity
            hlsRef.current.detachMedia();
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        video.removeEventListener('error', onVideoError);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('playing', onPlaying);
        
        // Clean source to stop downloading
        video.pause();
        video.removeAttribute('src'); 
        video.load();
    };
  }, [channel, useProxy, retryCount]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header / Controls */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent z-20 flex justify-between items-start">
        <div className="max-w-[70%]">
            <h2 className="text-xl font-bold text-white truncate drop-shadow-md">{channel.name}</h2>
            <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-300 text-xs px-2 py-1 bg-white/10 rounded">{channel.group}</span>
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
                        {error}
                        <br/>
                        <span className="text-sm text-gray-500 mt-2 block">
                           The connection to the provider was lost or timed out.
                        </span>
                    </p>
                    <div className="flex justify-center gap-4">
                        <button 
                            onClick={() => { setStatus('initializing'); setRetryCount(prev => prev + 1); }}
                            className="bg-gray-700 text-white font-bold py-2 px-6 rounded hover:bg-gray-600 transition"
                        >
                            Retry
                        </button>
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