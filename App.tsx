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

  // --- PERSISTENCE & AUTO-CONFIG ---
  useEffect(() => {
      const initLoad = async () => {
          setLoading(true);
          setLoadingStatus('Checking library...');
          
          try {
              // 1. Try Local Cache first (Fastest - Instant Resume)
              const cached = await loadFromDB();
              if (cached && cached.allChannels.length > 0) {
                  // We re-run categorization here to ensure any code updates to sorting/filtering apply to cached data
                  const { categories: recategorized } = categorizeChannels(cached.allChannels);
                  setCategories(recategorized);
                  setAllChannels(cached.allChannels);
                  pickFeatured(cached.allChannels);
                  setIsSetupComplete(true);
                  
                  // Background check for server file
                  checkStaticFileExists().then(exists => {
                      if (exists || SERVER_CONFIG.url) setAutoConfigured(true);
                  });
                  
                  setLoading(false);
                  setLoadingStatus('');
                  return;
              }

              // 2. Try Server-Hosted JSON (From "Sync to Server")
              try {
                  // Add a timeout to prevent hanging if server is down
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 3000);
                  
                  const staticResponse = await fetch('playlist.json', { signal: controller.signal });
                  clearTimeout(timeoutId);

                  if (staticResponse.ok) {
                      setLoadingStatus('Downloading server content...');
                      const staticData = await staticResponse.json();
                      if (Array.isArray(staticData) && staticData.length > 0) {
                           console.log("Loaded from playlist.json");
                           setAutoConfigured(true);
                           await processPlaylistData(staticData); // Process and Cache
                           setLoading(false);
                           setLoadingStatus('');
                           return;
                      }
                  }
              } catch (e) {
                  console.log("No static playlist.json found or server unreachable, continuing...");
              }

              // 3. If no cache and no static file, check Server Config (Auto-Connect to IPTV)
              if (SERVER_CONFIG.url && SERVER_CONFIG.username && SERVER_CONFIG.password) {
                  console.log("Auto-connecting using Server Config...");
                  setAutoConfigured(true);
                  handleXtreamImport(SERVER_CONFIG.url, SERVER_CONFIG.username, SERVER_CONFIG.password);
              } else {
                  // 4. Manual Login required
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

  // Called when M3U is loaded OR Static JSON is loaded
  const processPlaylistData = async (channels: Channel[]) => {
    const { categories: cats } = categorizeChannels(channels);
    setCategories(cats);
    setAllChannels(channels);
    pickFeatured(channels);
    setIsSetupComplete(true);
    await saveToDB(cats, channels);
  };

  // Called incrementally when Xtream chunks arrive
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

  // --- NEW: SYNC TO SERVER ---
  const handleSyncToServer = async () => {
      if (allChannels.length === 0) return;
      
      setIsSyncing(true);
      try {
          // Use AbortController to timeout the request if server hangs
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
          
          const res = await fetch('/api/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(allChannels),
              signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (res.ok) {
              setAutoConfigured(true);
              alert("Sync successful! Open StreamFlix on your iPad or TV, and it will load this content automatically.");
          } else {
              throw new Error("Server returned " + res.status);
          }
      } catch (e) {
          console.error(e);
          const confirmLocal = window.confirm(
              "Sync failed (Server unreachable). Would you like to save a local Backup file instead?"
          );
          if (confirmLocal) {
              handleExportData();
          }
      } finally {
          setIsSyncing(false);
      }
  };

  const handleLogout = async () => {
    const msg = autoConfigured 
        ? "Reload content from server?" 
        : "Are you sure you want to log out and clear all cached data?";
        
    if(window.confirm(msg)) {
        setLoading(true);
        setShowSettings(false);
        await clearDB();
        setIsSetupComplete(false);
        setCategories([]);
        setFeatured(null);
        setAllChannels([]);
        
        if (autoConfigured) {
             window.location.reload();
        } else {
            setLoading(false);
        }
    }
  };

  // Calculate Stats for Settings Menu
  const libraryStats = useMemo(() => {
      return {
          live: allChannels.filter(c => c.contentType === 'live').length,
          movies: allChannels.filter(c => c.contentType === 'movie').length,
          series: allChannels.filter(c => c.contentType === 'series').length,
          total: allChannels.length
      };
  }, [allChannels]);

  // Filter Logic with Search
  const filteredCategories = useMemo(() => {
    const targetType = currentView === 'live' ? 'live' : (currentView === 'series' ? 'series' : 'movie');
    const result: Category[] = [];
    const query = searchQuery.toLowerCase().trim();
    
    // Helper to check if string matches query
    const matches = (str: string) => str.toLowerCase().includes(query);

    for (const cat of categories) {
        // 1. View Filter
        let channelsInCat = cat.channels.filter(c => c.contentType === targetType);
        
        // 2. Search Filter
        if (query) {
             channelsInCat = channelsInCat.filter(c => matches(c.name) || matches(c.group || ''));
        }
        
        if (channelsInCat.length > 0) {
            // 3. Language Filter (Keep active unless searching specific things, usually better to ignore lang if searching)
            // If searching, we relax the language filter to find content in other langs
            if (query || currentLanguage === 'All' || cat.language === currentLanguage) {
                result.push({ ...cat, channels: channelsInCat });
            }
        }
    }
    return result;
  }, [categories, currentView, currentLanguage, searchQuery]);

  // Pagination for infinite scroll effect (simple slice for now)
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
             {/* Use CSS Gradient instead of external image to prevent 404s */}
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
      
      {/* Settings Modal */}
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
      />
      
      {/* Hero only on Home and when not searching */}
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