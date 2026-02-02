import React, { useState } from 'react';
import { DEMO_PLAYLIST } from '../constants';

interface PlaylistSetupProps {
  onImportM3U: (url: string) => void;
  onImportXtream: (url: string, user: string, pass: string) => void;
  onLoadDemo: (content: string) => void;
  loading: boolean;
  loadingStatus?: string;
}

const PlaylistSetup: React.FC<PlaylistSetupProps> = ({ onImportM3U, onImportXtream, onLoadDemo, loading, loadingStatus }) => {
  const [activeTab, setActiveTab] = useState<'m3u' | 'xtream'>('xtream');
  
  // M3U State
  const [m3uInput, setM3uInput] = useState('');
  
  // Xtream State
  const [xtreamUrl, setXtreamUrl] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPass, setXtreamPass] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (activeTab === 'm3u') {
      if (!m3uInput.trim()) return;
      onImportM3U(m3uInput);
    } else {
      if (!xtreamUrl || !xtreamUser || !xtreamPass) return;
      onImportXtream(xtreamUrl, xtreamUser, xtreamPass);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center relative overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-gray-900 to-[#141414] z-0"></div>
      
      <div className="relative z-10 w-full max-w-md bg-black/75 p-8 md:p-12 rounded shadow-2xl backdrop-blur-sm border border-gray-800">
        <h1 className="text-3xl font-bold text-white mb-8 text-center">Sign In</h1>
        
        {/* Tabs */}
        <div className="flex mb-8 border-b border-gray-600">
           <button 
             onClick={() => setActiveTab('xtream')}
             className={`flex-1 pb-3 text-sm font-medium transition ${activeTab === 'xtream' ? 'text-white border-b-2 border-red-600' : 'text-gray-400 hover:text-white'}`}
           >
             Xtream Codes
           </button>
           <button 
             onClick={() => setActiveTab('m3u')}
             className={`flex-1 pb-3 text-sm font-medium transition ${activeTab === 'm3u' ? 'text-white border-b-2 border-red-600' : 'text-gray-400 hover:text-white'}`}
           >
             M3U Playlist
           </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {activeTab === 'xtream' ? (
            <>
              <div>
                <input 
                  type="text" 
                  placeholder="Server URL (http://example.com:8080)" 
                  className="w-full bg-[#333] text-white rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-600 placeholder-gray-500"
                  value={xtreamUrl}
                  onChange={e => setXtreamUrl(e.target.value)}
                />
              </div>
              <div>
                <input 
                  type="text" 
                  placeholder="Username" 
                  className="w-full bg-[#333] text-white rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-600 placeholder-gray-500"
                  value={xtreamUser}
                  onChange={e => setXtreamUser(e.target.value)}
                />
              </div>
              <div>
                <input 
                  type="password" 
                  placeholder="Password" 
                  className="w-full bg-[#333] text-white rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-600 placeholder-gray-500"
                  value={xtreamPass}
                  onChange={e => setXtreamPass(e.target.value)}
                />
              </div>
            </>
          ) : (
             <div>
                <textarea 
                  placeholder="Paste M3U URL or Content here..." 
                  className="w-full bg-[#333] text-white rounded px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-600 placeholder-gray-500 h-32"
                  value={m3uInput}
                  onChange={e => setM3uInput(e.target.value)}
                />
              </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded transition flex items-center justify-center flex-col"
          >
            {loading ? (
              <>
                 <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mb-1"></div>
                 {loadingStatus && <span className="text-xs font-normal">{loadingStatus}</span>}
              </>
            ) : (
              activeTab === 'xtream' ? 'Connect' : 'Load Playlist'
            )}
          </button>
        </form>

        <div className="mt-6 text-gray-400 text-sm">
            <p className="mb-4">New to StreamFlix?</p>
            <button 
                onClick={() => onLoadDemo(DEMO_PLAYLIST)}
                className="text-white hover:underline cursor-pointer"
            >
                Try Demo Content
            </button>
            <p className="mt-4 text-xs text-gray-500">
                Only content in Dutch, English, German, or Lingo languages will be loaded.
            </p>
        </div>
      </div>
    </div>
  );
};

export default PlaylistSetup;