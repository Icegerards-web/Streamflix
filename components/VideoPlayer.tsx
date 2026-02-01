import React, { useEffect, useRef, useState } from 'react';
import { Channel } from '../types';

interface VideoPlayerProps {
  channel: Channel;
  onClose: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [useProxy, setUseProxy] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);

    // VOD files often fail due to CORS on IPTV servers. 
    // We default to proxy if it's not a live stream (m3u8) to increase success rate.
    // However, if the user manually toggles off proxy, we respect it.
    let hls: any;
    
    // Determine effective URL
    const url = useProxy 
        ? `https://corsproxy.io/?${encodeURIComponent(channel.url)}` 
        : channel.url;

    const isM3U8 = /\.m3u8(\?.*)?$/i.test(url) || (useProxy && channel.url.includes('.m3u8'));
    
    console.log(`Attempting playback: ${url} (M3U8: ${isM3U8})`);

    // HLS Handling
    if (isM3U8) {
         if (window.Hls && window.Hls.isSupported()) {
            hls = new window.Hls({
                enableWorker: true,
                lowLatencyMode: true,
                xhrSetup: function(xhr: any) {
                    xhr.withCredentials = false; // Helps with some CORS issues
                }
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            
            hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(e => console.error("Autoplay prevented", e));
            });
            
            hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
                if (data.fatal) {
                    if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
                        setError("Network Error. Trying to reconnect...");
                        hls.startLoad();
                    } else {
                        setError("Stream format not supported or stream is offline.");
                        hls.destroy();
                    }
                }
            });
         } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari
            video.src = url;
            video.play().catch(e => console.error(e));
         } else {
             setError("HLS is not supported in this browser.");
         }
    } else {
        // Native Playback (MP4, MKV, AVI, etc.)
        // We do NOT block any extension. We let the browser try.
        video.src = url;
        video.load();
        video.play().catch(e => {
            console.warn("Native playback error:", e);
            // We don't set error immediately, wait for 'error' event on video tag
        });
    }

    // Native Error Listener
    const handleNativeError = () => {
        if (video.error) {
            const code = video.error.code;
            let msg = "Unknown playback error.";
            if (code === 3) msg = "Playback decoding error. The video format might not be supported by this browser.";
            if (code === 4) msg = "Source not supported. The file format (e.g. MKV/AVI) or codec is incompatible.";
            
            setError(msg);
        }
    };
    video.addEventListener('error', handleNativeError);

    return () => {
      if (hls) hls.destroy();
      if(video) {
          video.removeEventListener('error', handleNativeError);
          video.removeAttribute('src');
          video.load();
      }
    };
  }, [channel, useProxy]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center">
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-center">
        <div className="max-w-[70%]">
            <h2 className="text-xl font-bold text-white truncate">{channel.name}</h2>
            <p className="text-gray-300 text-sm truncate">
                {channel.group} • {channel.contentType.toUpperCase()}
            </p>
        </div>
        <button 
            onClick={onClose}
            className="text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-bold"
        >
            Close
        </button>
      </div>

      <div className="w-full h-full flex items-center justify-center bg-black relative">
        
        {/* Error / Fallback UI */}
        {error && (
            <div className="text-center p-6 bg-gray-900 rounded-xl border border-gray-700 max-w-lg z-20">
                <div className="text-red-500 text-2xl font-bold mb-2">Playback Failed</div>
                <p className="text-gray-300 mb-6 text-sm">{error}</p>
                
                <div className="flex flex-col gap-3">
                    {!useProxy && (
                        <button 
                            onClick={() => setUseProxy(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                        >
                            Try Proxy Mode (Fixes Black Screen/Network)
                        </button>
                    )}
                    
                    <a 
                        href={`vlc://${channel.url}`}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                        </svg>
                        Open in VLC (Last Resort)
                    </a>
                </div>
                <div className="mt-4 text-[10px] text-gray-500 font-mono break-all p-2 bg-black rounded">
                    {channel.url}
                </div>
            </div>
        )}

        {/* Video Element */}
        <video 
            ref={videoRef} 
            controls 
            className={`w-full h-full max-h-screen object-contain ${error ? 'hidden' : 'block'}`}
            autoPlay
            playsInline
            crossOrigin="anonymous"
        />
      </div>
    </div>
  );
};

export default VideoPlayer;