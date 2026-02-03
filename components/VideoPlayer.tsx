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
  const [isLoading, setIsLoading] = useState(true);
  const [isRetryingWithProxy, setIsRetryingWithProxy] = useState(false);

  useEffect(() => {
    // Reset state when channel changes
    setError(null);
    setIsLoading(true);
    setIsRetryingWithProxy(false);
    
    // Initial load
    loadStream(channel.url, false);

    return () => {
        destroyHls();
    };
  }, [channel]);

  const destroyHls = () => {
      if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
      }
  };

  const loadStream = (url: string, useProxy: boolean) => {
      const video = videoRef.current;
      if (!video) return;

      destroyHls();
      
      const streamUrl = useProxy 
          ? `/api/proxy?url=${encodeURIComponent(url)}` 
          : url;
          
      console.log(`[Player] Loading: ${streamUrl} (Proxy: ${useProxy})`);

      // Basic detection
      const isM3U8 = streamUrl.toLowerCase().includes('.m3u8') || (useProxy && url.toLowerCase().includes('.m3u8'));

      if (isM3U8 && window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({
              enableWorker: true,
              lowLatencyMode: true,
              // If using proxy, we can allow credentials/cookies if needed, but usually false is safer for generic streams
              xhrSetup: (xhr: any) => { xhr.withCredentials = false; }
          });
          hlsRef.current = hls;
          
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
              setIsLoading(false);
              video.play().catch(e => console.log("Autoplay blocked", e));
          });

          hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
              if (data.fatal) {
                  console.warn("[HLS Error]", data);
                  if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                      // Network error triggers retry logic
                      handleLoadError();
                  } else {
                      hls.destroy();
                      handleLoadError();
                  }
              }
          });

      } else if (video.canPlayType('application/vnd.apple.mpegurl') && isM3U8) {
          // Native HLS (Safari)
          video.src = streamUrl;
          video.play().catch(() => {});
      } else {
          // Native MP4/MKV
          video.src = streamUrl;
          video.load();
          video.play().catch(() => {});
      }
  };

  // Called when playback fails (Native error or HLS fatal error)
  const handleLoadError = () => {
      if (!isRetryingWithProxy) {
          console.log("[Player] Direct playback failed. Switching to Local Proxy...");
          setIsRetryingWithProxy(true);
          setIsLoading(true);
          // Retry with Proxy
          loadStream(channel.url, true);
      } else {
          console.error("[Player] Proxy playback also failed.");
          setIsLoading(false);
          setError("Stream unavailable. The source might be offline or format unsupported.");
      }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center">
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 to-transparent z-20 flex justify-between items-center">
        <div className="max-w-[70%]">
            <h2 className="text-xl font-bold text-white truncate drop-shadow-md">{channel.name}</h2>
            <div className="flex items-center gap-2">
                <p className="text-gray-300 text-sm truncate opacity-80">{channel.group}</p>
                {isRetryingWithProxy && <span className="text-[10px] bg-blue-900 text-blue-200 px-1 rounded border border-blue-700">Relay Active</span>}
            </div>
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
                <p className="text-white font-medium animate-pulse">
                    {isRetryingWithProxy ? 'Rerouting stream...' : 'Connecting...'}
                </p>
            </div>
        )}

        {/* Error UI */}
        {error && (
            <div className="absolute z-30 text-center p-8 bg-[#181818] rounded-xl border border-gray-700 max-w-lg shadow-2xl">
                <div className="text-red-500 text-3xl font-bold mb-4">Playback Failed</div>
                <p className="text-gray-300 mb-6 text-lg">{error}</p>
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
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-sm underline mt-2">
                        Close Player
                    </button>
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
            onLoadedData={() => setIsLoading(false)}
            onError={handleLoadError}
        />
      </div>
    </div>
  );
};

export default VideoPlayer;