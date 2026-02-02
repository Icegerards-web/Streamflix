import React, { useState, useMemo, useCallback, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import ContentRow from './components/ContentRow';
import VideoPlayer from './components/VideoPlayer';
import PlaylistSetup from './components/PlaylistSetup';
import SettingsMenu from './components/SettingsMenu';
import { parseM3U, fetchXtreamPlaylist, fetchUrlContent, categorizeChannels } from './utils/parser';
import { saveToDB, loadFromDB, clearDB } from './utils/db';
import { Channel, Category } from './types';
import { SERVER_CONFIG } from './constants';

const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [featured, setFeatured] = useState<Channel | null>(null);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>(''); 
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'live' | 'movies' | 'series'>('home');
  const [currentLanguage, setCurrentLanguage] = useState<string>('All');
  const [autoConfigured, setAutoConfigured] = useState(false);
  
  // New State for Settings & Search
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // --- PERSISTENCE & AUTO-CONFIG ---
  useEffect(() => {
      const initLoad = async () => {
          setLoading(true);
          setLoadingStatus('Checking library...');
          
          try {
              // 1. Try Local Cache first
              const cached = await loadFromDB();
              if (cached && cached.allChannels.length > 0) {
                  const { categories: recategorized } = categorizeChannels(cached.allChannels);
                  setCategories(recategorized);
                  setAllChannels(cached.allChannels);
                  pickFeatured(cached.allChannels);
                  setIsSetupComplete(true);
                  
                  checkStaticFileExists().then(exists => {
                      if (exists || SERVER_CONFIG.url) setAutoConfigured(true);
                  });
                  
                  setLoading(false);
                  setLoadingStatus('');
                  return;
              }

              // 2. Try Server-Hosted JSON
              try {
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 5000);
                  
                  const staticResponse = await fetch('playlist.json', { signal: controller.signal });
                  clearTimeout(timeoutId);

                  if (staticResponse.ok) {
                      setLoadingStatus('Downloading server content...');
                      const staticData = await staticResponse.json();
                      if (Array.isArray(staticData) && staticData.length > 0) {
                           console.log("Loaded from playlist.json");
                           setAutoConfigured(true);
                           await processPlaylistData(staticData);
                           setLoading(false);
                           setLoadingStatus('');
                           return;
                      }
                  }
              } catch (e) {
                  console.log("No static playlist.json found or server unreachable, continuing...");
              }

              // 3. Server Config
              if (SERVER_CONFIG.url && SERVER_CONFIG.username && SERVER_CONFIG.password) {
                  setAutoConfigured(true);
                  handleXtreamImport(SERVER_CONFIG.url, SERVER_CONFIG.username, SERVER_CONFIG.password);
              } else {
                  setLoading(false);
                  setLoadingStatus('');
              }
          } catch (e) {
              console.error("Initialization failed", e);
              setLoading(false);
          }
      };
      initLoad();
  }, []);

  const checkStaticFileExists = async () => {
      try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const res = await fetch('playlist.json', { 
              method: 'HEAD', 
              signal: controller.signal 
          });
          clearTimeout(timeoutId);
          return res.ok;
      } catch { return false; }
  };

  const processPlaylistData = async (channels: Channel[]) => {
    const { categories: cats } = categorizeChannels(channels);
    setCategories(cats);
    setAllChannels(channels);
    pickFeatured(channels);
    setIsSetupComplete(true);
    await saveToDB(cats, channels);
  };

  const handleChunkLoaded = useCallback((newChannels: Channel[]) => {
      setAllChannels(prev => {
          const updated = [...prev, ...newChannels];
          const { categories: newCats } = categorizeChannels(updated);
          setCategories(newCats);
          
          if (updated.length > 0 && !featured) {
               const movies = updated.filter(c => c.contentType === 'movie');
               if (movies.length > 0) setFeatured(movies[Math.floor(Math.random() * movies.length)]);
               else setFeatured(updated[Math.floor(Math.random() * updated.length)]);
          }

          if (updated.length % 500 === 0 || newChannels.length > 100) {
              saveToDB(newCats, updated); 
          }
          
          return updated;
      });

      setIsSetupComplete(true);
      setLoading(false); 
  }, [featured]);

  const pickFeatured = (channels: Channel[]) => {
    const movies = channels.filter(c => c.contentType === 'movie');
    const featuredPool = movies.length > 0 ? movies : channels;
    if (featuredPool.length > 0) {
        const random = featuredPool[Math.floor(Math.random() * featuredPool.length)];
        setFeatured(random);
    }
  };

  const handleM3UImport = async (input: string) => {
    setLoading(true);
    setLoadingStatus('Initializing...');
    try {
        let content = input;
        if (input.trim().startsWith('http')) {
             setLoadingStatus('Downloading playlist...');
             try {
                 content = await fetchUrlContent(input, 'text');
             } catch (fetchErr) {
                 throw new Error("Could not download playlist. The URL might be blocked or invalid.");
             }
        }
        
        setLoadingStatus('Parsing channels...');
        await new Promise(r => setTimeout(r, 50));
        
        const { allChannels: parsedChannels } = parseM3U(content);
        if (parsedChannels.length === 0) {
            alert("Playlist loaded but no channels found.");
        } else {
            await processPlaylistData(parsedChannels);
        }
    } catch (e: any) {
        console.error(e);
        alert(`Load Failed: ${e.message}`);
    } finally {
        setLoading(false);
        setLoadingStatus('');
    }
  };

  const handleXtreamImport = async (url: string, user: string, pass: string) => {
      setLoading(true);
      setLoadingStatus('Connecting to server...');
      setAllChannels([]);
      setCategories([]);
      await clearDB(); 

      try {
        await fetchXtreamPlaylist(
            url, 
            user, 
            pass, 
            (status) => setLoadingStatus(status),
            handleChunkLoaded 
        );
      } catch (e: any) {
          console.error(e);
          if (!isSetupComplete) {
             setLoadingStatus(`Connection Failed: ${e.message}`);
             setTimeout(() => {
                 setLoading(false);
                 setLoadingStatus('');
             }, 3000);
          }
      } 
  };

  const handleExportData = () => {
      if (allChannels.length === 0) {
          alert("No data to export.");
          return;
      }
      const jsonString = JSON.stringify(allChannels);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = "playlist.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  const handleImportData = (file: File) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const text = e.target?.result as string;
              const data = JSON.parse(text);
              if (Array.isArray(data) && data.length > 0) {
                  setLoading(true);
                  setLoadingStatus('Restoring backup...');
                  await processPlaylistData(data);
                  setLoading(false);
                  setLoadingStatus('');
                  setShowSettings(false);
                  alert("Backup restored locally!");
              } else {
                  alert("Invalid backup file. Expected a list of channels.");
              }
          } catch (err) {
              console.error(err);
              alert("Failed to parse backup file.");
          }
      };
      reader.readAsText(file);
  };

  // --- UPLOAD LOGIC ---
  const performUpload = async (channels: Channel[]) => {
      const jsonString = JSON.stringify(channels);
      // Disable compression for reliability
      const blob = new Blob([jsonString], { type: 'application/json' });

      const TOTAL_SIZE = blob.size;
      const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB Chunks (Reduced overhead)
      const TOTAL_CHUNKS = Math.ceil(TOTAL_SIZE / CHUNK_SIZE);
      const UPLOAD_ID = Date.now().toString() + "_" + Math.floor(Math.random() * 1000);

      console.log(`Uploading ${TOTAL_CHUNKS} chunks. Size: ${(TOTAL_SIZE / 1024 / 1024).toFixed(2)} MB`);

      for (let i = 0; i < TOTAL_CHUNKS; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, TOTAL_SIZE);
          const chunk = blob.slice(start, end);

          let attempts = 0;
          let success = false;
          let lastErr;

          while (attempts < 3 && !success) {
              try {
                  // No compressed param needed
                  const res = await fetch(`/api/upload-chunk?id=${UPLOAD_ID}&index=${i}&total=${TOTAL_CHUNKS}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/octet-stream' },
                      body: chunk
                  });

                  if (!res.ok) throw new Error(await res.text());
                  success = true;
              } catch (e: any) {
                  lastErr = e;
                  attempts++;
                  console.warn(`Chunk ${i} retry ${attempts}/3`);
                  await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts - 1)));
              }
          }

          if (!success) throw new Error(`Upload failed at chunk ${i}: ${lastErr?.message}`);
          setUploadProgress(Math.round(((i + 1) / TOTAL_CHUNKS) * 100));
      }
  };

  const handleSyncToServer = async () => {
      if (allChannels.length === 0) return;
      setIsSyncing(true);
      setUploadProgress(0);

      try {
          // 1. Check Health
          try {
             const h = await fetch('/api/health');
             if (!h.ok) throw new Error("Server storage not writable");
          } catch (e) {
             throw new Error("Server not reachable");
          }

          // 2. Perform Standard Upload (Uncompressed)
          await performUpload(allChannels);
          setAutoConfigured(true);
          alert("Sync successful!");

      } catch (e: any) {
          console.error(e);
          if (window.confirm(`Sync failed: ${e.message}\n\nSave local backup?`)) {
              handleExportData();
          }
      } finally {
          setIsSyncing(false);
          setUploadProgress(0);
      }
  };

  const handleLogout = async () => {
    if(window.confirm(autoConfigured ? "Reload content from server?" : "Log out and clear data?")) {
        setLoading(true);
        setShowSettings(false);
        await clearDB();
        setIsSetupComplete(false);
        setCategories([]);
        setFeatured(null);
        setAllChannels([]);
        
        if (autoConfigured) window.location.reload();
        else setLoading(false);
    }
  };

  const libraryStats = useMemo(() => {
      return {
          live: allChannels.filter(c => c.contentType === 'live').length,
          movies: allChannels.filter(c => c.contentType === 'movie').length,
          series: allChannels.filter(c => c.contentType === 'series').length,
          total: allChannels.length
      };
  }, [allChannels]);

  const filteredCategories = useMemo(() => {
    const targetType = currentView === 'live' ? 'live' : (currentView === 'series' ? 'series' : 'movie');
    const result: Category[] = [];
    const query = searchQuery.toLowerCase().trim();
    
    const matches = (str: string) => str.toLowerCase().includes(query);

    for (const cat of categories) {
        let channelsInCat = cat.channels.filter(c => c.contentType === targetType);
        
        if (query) {
             channelsInCat = channelsInCat.filter(c => matches(c.name) || matches(c.group || ''));
        }
        
        if (channelsInCat.length > 0) {
            if (query || currentLanguage === 'All' || cat.language === currentLanguage) {
                result.push({ ...cat, channels: channelsInCat });
            }
        }
    }
    return result;
  }, [categories, currentView, currentLanguage, searchQuery]);

  const visibleCategories = filteredCategories.slice(0, 50);

  if (!isSetupComplete && !loading) {
      return (
          <PlaylistSetup 
            onImportM3U={handleM3UImport}
            onImportXtream={handleXtreamImport}
            onLoadDemo={(content) => handleM3UImport(content)}
            loading={loading}
            loadingStatus={loadingStatus}
          />
      );
  }

  if (loading && !isSetupComplete) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black"></div>
             
             <div className="z-10 text-center p-8">
                 <h1 className="text-red-600 text-5xl font-bold mb-8 animate-pulse tracking-tighter">STREAMFLIX</h1>
                 <div className="flex justify-center mb-6">
                     <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                 </div>
                 <p className="text-white text-xl font-medium">{loadingStatus}</p>
                 <p className="text-gray-400 text-sm mt-2">Connecting to library...</p>
             </div>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#141414] overflow-x-hidden font-sans">
      <Navbar 
        onOpenSettings={() => setShowSettings(true)} 
        currentView={currentView}
        onChangeView={setCurrentView}
        currentLanguage={currentLanguage}
        onLanguageChange={setCurrentLanguage}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      
      <SettingsMenu 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        stats={libraryStats}
        onExport={handleExportData}
        onImport={handleImportData}
        onSync={handleSyncToServer}
        onLogout={handleLogout}
        isAutoConfig={autoConfigured}
        isSyncing={isSyncing}
        uploadProgress={uploadProgress}
      />
      
      {currentView === 'home' && featured && !searchQuery && <Hero channel={featured} onPlay={setCurrentChannel} />}
      
      <div className={`${currentView === 'home' && !searchQuery ? '-mt-16' : 'mt-24'} relative z-10 pb-20`}>
          
          {loadingStatus && (
              <div className="fixed bottom-4 right-4 bg-blue-900/80 text-white px-4 py-2 rounded-full text-xs font-bold animate-pulse z-50 backdrop-blur shadow-lg border border-blue-500">
                 <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                    {loadingStatus}
                 </div>
              </div>
          )}

          {visibleCategories.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                  <p className="text-xl">
                      {loadingStatus ? 'Loading content...' : (
                          searchQuery ? `No results found for "${searchQuery}"` : `No content found for ${currentView} in ${currentLanguage}.`
                      )}
                  </p>
              </div>
          ) : (
              visibleCategories.map((cat) => (
                  <ContentRow key={cat.name} category={cat} onPlay={setCurrentChannel} />
              ))
          )}
      </div>

      {currentChannel && (
        <VideoPlayer 
            channel={currentChannel} 
            onClose={() => setCurrentChannel(null)} 
        />
      )}
    </div>
  );
};

export default App;