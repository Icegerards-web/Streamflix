import React, { useRef, useState, useEffect } from 'react';
import { VALID_LANGUAGES } from '../constants';

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
  
  // Language settings
  selectedLanguages: string[];
  onToggleLanguage: (lang: string) => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ 
  isOpen, onClose, stats, onExport, onImport, onSync, onLogout, isAutoConfig, isSyncing, uploadProgress = 0,
  selectedLanguages, onToggleLanguage
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
          const pingRes = await fetch('/api/ping', { signal: controller.signal });
          clearTimeout(id);
          if (!pingRes.ok) throw new Error(`Status: ${pingRes.status}`);
          const contentType = pingRes.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) throw new Error("Invalid API Response");

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
          setServerHealth('offline');
          setHealthMsg('Offline');
      }
  };

  if (!isOpen) return null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
    }
  };

  // Capitalize helper
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#181818] w-full max-w-2xl p-6 rounded-xl shadow-2xl border border-gray-800 relative max-h-[90vh] overflow-y-auto">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white bg-gray-800 rounded-full p-2 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-3xl font-bold text-white mb-6">Settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Column 1: Library & System */}
            <div className="space-y-6">
                
                {/* Stats */}
                <div className="bg-[#222] p-4 rounded-lg border border-gray-700">
                    <h3 className="text-gray-400 text-xs font-bold uppercase mb-4 tracking-wider">Library Stats</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#1a1a1a] p-2 rounded text-center">
                            <span className="block text-xl font-bold text-white">{stats.live}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Live</span>
                        </div>
                        <div className="bg-[#1a1a1a] p-2 rounded text-center">
                            <span className="block text-xl font-bold text-white">{stats.movies}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Movies</span>
                        </div>
                        <div className="bg-[#1a1a1a] p-2 rounded text-center">
                            <span className="block text-xl font-bold text-white">{stats.series}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Series</span>
                        </div>
                        <div className="bg-[#1a1a1a] p-2 rounded text-center border border-red-900/50">
                            <span className="block text-xl font-bold text-red-500">{stats.total}</span>
                            <span className="text-[10px] text-gray-500 uppercase">Total</span>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                    <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                    
                    <button 
                        onClick={onSync}
                        disabled={isSyncing || serverHealth !== 'online'}
                        className={`w-full font-bold py-3 rounded flex items-center justify-center gap-2 transition text-sm ${
                            serverHealth === 'online' 
                                ? 'bg-red-600 hover:bg-red-700 text-white' 
                                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {isSyncing ? "Syncing..." : "Sync to Server"}
                    </button>
                    {isSyncing && <div className="h-1 bg-gray-700 w-full"><div className="h-full bg-red-600" style={{width: `${uploadProgress}%`}}></div></div>}
                    
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={onExport} className="bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-xs font-bold">Backup JSON</button>
                        <button onClick={() => fileInputRef.current?.click()} className="bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-xs font-bold">Restore JSON</button>
                    </div>

                    <button onClick={onLogout} className="w-full text-red-500 hover:bg-red-900/20 py-3 rounded text-sm font-bold border border-transparent hover:border-red-900 transition">
                        {isAutoConfig ? "Reload Server Data" : "Log Out & Clear Data"}
                    </button>
                </div>
            </div>

            {/* Column 2: Language Filters */}
            <div>
                <h3 className="text-gray-400 text-xs font-bold uppercase mb-4 tracking-wider">Content Languages</h3>
                <p className="text-xs text-gray-500 mb-4">Select the languages you want to see in your library.</p>
                
                <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {VALID_LANGUAGES.map(lang => (
                        <label key={lang} className="flex items-center space-x-3 bg-[#222] p-3 rounded cursor-pointer hover:bg-[#2a2a2a] transition border border-transparent hover:border-gray-600">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedLanguages.includes(lang) ? 'bg-red-600 border-red-600' : 'border-gray-500'}`}>
                                {selectedLanguages.includes(lang) && (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-white">
                                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </div>
                            <span className="text-sm text-gray-200 font-medium capitalize">{cap(lang)}</span>
                            <input 
                                type="checkbox" 
                                className="hidden"
                                checked={selectedLanguages.includes(lang)}
                                onChange={() => onToggleLanguage(lang)}
                            />
                        </label>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsMenu;