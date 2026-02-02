import React, { useRef, useState, useEffect } from 'react';

interface SettingsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  stats: {
    live: number;
    movies: number;
    series: number;
    total: number;
  };
  onExport: () => void;
  onImport: (file: File) => void;
  onSync: () => void;
  onLogout: () => void;
  isAutoConfig: boolean;
  isSyncing: boolean;
  uploadProgress?: number;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ 
  isOpen, onClose, stats, onExport, onImport, onSync, onLogout, isAutoConfig, isSyncing, uploadProgress = 0
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [serverHealth, setServerHealth] = useState<'checking' | 'online' | 'offline' | 'readonly'>('checking');
  const [healthMsg, setHealthMsg] = useState('Checking connection...');

  useEffect(() => {
    if (isOpen) {
        checkServer();
    }
  }, [isOpen]);

  const checkServer = async () => {
      setServerHealth('checking');
      setHealthMsg('Ping...');
      
      try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 8000); 
          
          // 1. Ping Check
          const pingRes = await fetch('/api/ping', { signal: controller.signal });
          clearTimeout(id);

          if (!pingRes.ok) throw new Error(`Status: ${pingRes.status} ${pingRes.statusText}`);

          // Critical: Check if we actually got JSON (and not HTML/Index page)
          const contentType = pingRes.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
              throw new Error("Invalid API Response (Likely HTML)");
          }

          // 2. Health/Write Check
          const healthRes = await fetch('/api/health');
          const healthData = await healthRes.json();

          if (healthData.writable) {
              setServerHealth('online');
              setHealthMsg('Connected');
          } else {
              setServerHealth('readonly');
              setHealthMsg('Read-Only');
          }

      } catch (e: any) {
          console.error("Connection Check Failed:", e);
          setServerHealth('offline');
          
          // Map technical errors to user-friendly messages
          let msg = e.message || 'Unknown Error';
          
          if (msg.includes('Failed to fetch')) msg = 'Network Error';
          if (msg.includes('AbortError') || msg.includes('aborted')) msg = 'Timeout';
          if (msg.includes('HTML')) msg = 'API Route Missing';
          if (msg.includes('500')) msg = 'Server Error (500)';
          if (msg.includes('502')) msg = 'Bad Gateway (502)';
          if (msg.includes('404')) msg = 'API Not Found (404)';
          
          setHealthMsg(msg);
      }
  };

  if (!isOpen) return null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#181818] w-full max-w-md p-6 rounded-lg shadow-2xl border border-gray-800 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white bg-gray-800 rounded-full p-1 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-white">Settings</h2>
            
            {/* Server Status Badge */}
            <div 
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${
                    serverHealth === 'online' ? 'bg-green-900/30 border-green-800 text-green-400' :
                    serverHealth === 'checking' ? 'bg-blue-900/30 border-blue-800 text-blue-400' :
                    serverHealth === 'readonly' ? 'bg-yellow-900/30 border-yellow-800 text-yellow-400' :
                    'bg-red-900/30 border-red-800 text-red-400'
                }`}
                title={healthMsg}
            >
                <div className={`w-2 h-2 rounded-full ${
                    serverHealth === 'online' ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' :
                    serverHealth === 'checking' ? 'bg-blue-500 animate-pulse' :
                    serverHealth === 'readonly' ? 'bg-yellow-500' :
                    'bg-red-500'
                }`}></div>
                <span className="max-w-[180px] truncate">{healthMsg}</span>
                {serverHealth === 'offline' && (
                    <button onClick={checkServer} className="ml-1 hover:text-white" title="Retry">↻</button>
                )}
            </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#222] p-4 rounded border border-gray-700">
            <h3 className="text-gray-400 text-xs font-bold uppercase mb-4 tracking-wider">Library Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col p-2 bg-[#2a2a2a] rounded">
                <span className="text-xl font-bold text-white">{stats.live}</span>
                <span className="text-[10px] text-gray-400 uppercase">Live Channels</span>
              </div>
              <div className="flex flex-col p-2 bg-[#2a2a2a] rounded">
                <span className="text-xl font-bold text-white">{stats.movies}</span>
                <span className="text-[10px] text-gray-400 uppercase">Movies</span>
              </div>
              <div className="flex flex-col p-2 bg-[#2a2a2a] rounded">
                <span className="text-xl font-bold text-white">{stats.series}</span>
                <span className="text-[10px] text-gray-400 uppercase">Episodes</span>
              </div>
              <div className="flex flex-col p-2 bg-[#2a2a2a] rounded border border-red-900/30">
                <span className="text-xl font-bold text-red-500">{stats.total}</span>
                <span className="text-[10px] text-gray-400 uppercase">Total Assets</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
             <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

             <div className="w-full">
                <button 
                    onClick={onSync}
                    disabled={isSyncing || serverHealth !== 'online'}
                    className={`w-full font-bold py-3 rounded flex items-center justify-center gap-2 transition text-sm shadow-lg ${
                        serverHealth === 'online' 
                            ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-900/20' 
                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    {isSyncing ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                        </svg>
                    )}
                    {isSyncing ? "Uploading..." : "Upload to Server"}
                </button>
                
                {serverHealth !== 'online' && !isSyncing && (
                    <p className="text-[10px] text-red-400 text-center mt-1">
                        {healthMsg === 'API Route Missing' 
                           ? "Error: Frontend running without Backend. Check Docker command." 
                           : "Connection failed. Check server logs."}
                    </p>
                )}

                {isSyncing && (
                    <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2">
                        <div className="bg-red-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                )}
             </div>

             <div className="grid grid-cols-2 gap-2">
                 <button onClick={onExport} className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 rounded flex items-center justify-center gap-2 transition text-xs">
                    Save JSON
                 </button>
                 <button onClick={() => fileInputRef.current?.click()} className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 rounded flex items-center justify-center gap-2 transition text-xs">
                    Load JSON
                 </button>
             </div>

             <button onClick={onLogout} className="w-full bg-transparent border border-gray-600 text-gray-300 hover:border-red-600 hover:text-red-500 font-medium py-3 rounded transition text-sm mt-2">
                {isAutoConfig ? "Reload Server Content" : "Logout & Clear Data"}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsMenu;