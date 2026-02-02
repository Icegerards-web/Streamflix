import React, { useRef } from 'react';

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
  onLogout: () => void;
  isAutoConfig: boolean;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ 
  isOpen, onClose, stats, onExport, onImport, onLogout, isAutoConfig 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>

        <div className="space-y-6">
          {/* Stats Section */}
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

          {/* Actions Section */}
          <div className="space-y-3 pt-2">
             <input 
               type="file" 
               accept=".json" 
               ref={fileInputRef}
               onChange={handleFileChange}
               className="hidden"
             />

             <button 
                onClick={onExport}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 rounded flex items-center justify-center gap-2 transition text-sm"
             >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Save Data (JSON)
             </button>

             <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 rounded flex items-center justify-center gap-2 transition text-sm"
             >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                Upload Backup
             </button>

             <button 
                onClick={onLogout}
                className="w-full bg-transparent border border-gray-600 text-gray-300 hover:border-red-600 hover:text-red-500 font-medium py-3 rounded transition text-sm"
             >
                {isAutoConfig ? "Reload Server Config" : "Logout & Clear Data"}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsMenu;