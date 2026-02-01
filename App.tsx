import React, { useState, useMemo, useCallback, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import ContentRow from './components/ContentRow';
import VideoPlayer from './components/VideoPlayer';
import PlaylistSetup from './components/PlaylistSetup';
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
                  
                  if (SERVER_CONFIG.url || await checkStaticFileExists()) setAutoConfigured(true);
                  
                  setLoading(false);
                  setLoadingStatus('');
                  return;
              }

              // 2. Try Server-Hosted JSON (Static File)
              // This is efficient: You host 'playlist.json' on your server.
              // The app downloads this single file instead of hitting the IPTV API.
              try {
                  const staticResponse = await fetch('playlist.json');
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
                  console.log("No static playlist.json found, continuing...");
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
          const res = await fetch('playlist.json', { method: 'HEAD' });
          return res.ok;
      } catch { return false; }
  };

  // Called when M3U is loaded OR Static JSON is loaded
  const processPlaylistData = async (channels: Channel[]) => {
    // Re-categorize raw channels on the client. 
    // This allows you to update the app logic (sorting/grouping) without changing the data file.
    const { categories: cats } = categorizeChannels(channels);
    
    setCategories(cats);
    setAllChannels(channels);
    pickFeatured(channels);
    setIsSetupComplete(true);
    
    // Save to DB for next time (Local Cache)
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

          // Debounce save or save occasionally
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
      
      // We only export the raw channel list. 
      // Categories are re-calculated on load to allow for app updates.
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

  const handleReset = async () => {
    const msg = autoConfigured 
        ? "Reload content from server?" 
        : "Are you sure you want to log out and clear all cached data?";
        
    if(window.confirm(msg)) {
        setLoading(true);
        await clearDB();
        setIsSetupComplete(false);
        setCategories([]);
        setFeatured(null);
        setAllChannels([]);
        
        // If we have a playlist.json or server config, reloading refreshes from that source
        if (autoConfigured) {
             window.location.reload();
        } else {
            setLoading(false);
        }
    }
  };

  const filteredCategories = useMemo(() => {
    const targetType = currentView === 'live' ? 'live' : (currentView === 'series' ? 'series' : 'movie');
    const result: Category[] = [];
    
    for (const cat of categories) {
        // 1. View Filter
        const channelsInCat = cat.channels.filter(c => c.contentType === targetType);
        
        if (channelsInCat.length > 0) {
            // 2. Language Filter
            if (currentLanguage === 'All' || cat.language === currentLanguage) {
                result.push({ ...cat, channels: channelsInCat });
            }
        }
    }
    return result;
  }, [categories, currentView, currentLanguage]);

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
             <div className="absolute inset-0 bg-[url('https://assets.nflxext.com/ffe/siteui/vlv3/c38a2d52-138e-48a3-ab68-36787ece46b3/eeb03fc9-99c6-438e-824d-32917ce55783/NL-en-20240101-popsignuptwoweeks-perspective_alpha_website_large.jpg')] bg-cover bg-center blur-md opacity-50"></div>
             
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
        onOpenSettings={handleReset} 
        onExportData={handleExportData}
        currentView={currentView}
        onChangeView={setCurrentView}
        currentLanguage={currentLanguage}
        onLanguageChange={setCurrentLanguage}
        isAutoConfig={autoConfigured}
      />
      
      {currentView === 'home' && featured && <Hero channel={featured} onPlay={setCurrentChannel} />}
      
      <div className={`${currentView === 'home' ? '-mt-16' : 'mt-24'} relative z-10 pb-20`}>
          
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
                      {loadingStatus ? 'Loading content...' : `No content found for ${currentView} in ${currentLanguage}.`}
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