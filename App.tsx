import React, { useState, useMemo, useCallback, useEffect } from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import ContentRow from './components/ContentRow';
import VideoPlayer from './components/VideoPlayer';
import SeriesModal from './components/SeriesModal';
import PlaylistSetup from './components/PlaylistSetup';
import SettingsMenu from './components/SettingsMenu';
import { parseM3U, fetchXtreamPlaylist, fetchUrlContent, categorizeChannels, isPriorityMatch } from './utils/parser';
import { saveToDB, loadFromDB, clearDB, getHistory, addToHistory } from './utils/db';
import { Channel, Category } from './types';
import { SERVER_CONFIG, VALID_LANGUAGES } from './constants';

const App: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [featured, setFeatured] = useState<Channel | null>(null);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [seriesDetails, setSeriesDetails] = useState<Channel | null>(null); // Selected series for modal
  
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>(''); 
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'live' | 'movies' | 'series'>('home');
  const [autoConfigured, setAutoConfigured] = useState(false);
  
  // Settings & Search
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Filters
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(VALID_LANGUAGES); // Default all
  const [ignoreLangFilter, setIgnoreLangFilter] = useState(false); // Search override

  // Xtream Credentials (needed for Series Info)
  const [xtreamCreds, setXtreamCreds] = useState<{url:string, user:string, pass:string} | null>(null);

  // History & Recommendations
  const [history, setHistory] = useState<Channel[]>([]);
  const [recommendations, setRecommendations] = useState<Channel[]>([]);

  // --- PERSISTENCE & AUTO-CONFIG ---
  useEffect(() => {
      const localHistory = getHistory();
      setHistory(localHistory);

      // Load Language Prefs
      const savedLangs = localStorage.getItem('streamflix_languages');
      if (savedLangs) {
          try {
              setSelectedLanguages(JSON.parse(savedLangs));
          } catch (e) {}
      }

      // Load Saved Credentials
      const savedCreds = localStorage.getItem('streamflix_creds');
      if (savedCreds) {
          try {
              setXtreamCreds(JSON.parse(savedCreds));
          } catch (e) {}
      }

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
                           setAutoConfigured(true);
                           await processPlaylistData(staticData);
                           setLoading(false);
                           setLoadingStatus('');
                           return;
                      }
                  }
              } catch (e) { }

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
          const res = await fetch('playlist.json', { method: 'HEAD', signal: controller.signal });
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

  // --- INTELLIGENT RECOMMENDATIONS ---
  useEffect(() => {
    if (allChannels.length === 0) return;
    const vodContent = allChannels.filter(c => c.contentType === 'movie' || c.contentType === 'series');
    if (vodContent.length === 0) return;

    let recs: Channel[] = [];
    const existingIds = new Set<string>();

    if (history.length > 0) {
        const relevantHistory = history.filter(h => h.contentType === 'movie' || h.contentType === 'series');
        const recentGroups = new Set(relevantHistory.slice(0, 10).map(h => h.group));
        const historyIds = new Set(history.map(h => h.id));
        const similar = vodContent.filter(c => c.group && recentGroups.has(c.group) && !historyIds.has(c.id));
        
        for (let i = similar.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [similar[i], similar[j]] = [similar[j], similar[i]];
        }
        for (const item of similar) {
            if (recs.length >= 15) break;
            recs.push(item);
            existingIds.add(item.id);
        }
    }

    if (recs.length < 20) {
        const pool = [...vodContent];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        for (const c of pool) {
            if (recs.length >= 20) break;
            if (!existingIds.has(c.id)) {
                recs.push(c);
                existingIds.add(c.id);
            }
        }
    }
    setRecommendations(recs);
  }, [allChannels, history]); 

  const pickFeatured = (channels: Channel[]) => {
    const movies = channels.filter(c => c.contentType === 'movie');
    const featuredPool = movies.length > 0 ? movies : channels;
    if (featuredPool.length > 0) {
        const random = featuredPool[Math.floor(Math.random() * featuredPool.length)];
        setFeatured(random);
    }
  };

  // --- PLAY LOGIC ---
  const handleCardClick = (channel: Channel) => {
      if (channel.contentType === 'series') {
          setSeriesDetails(channel);
      } else {
          setCurrentChannel(channel);
          const newHistory = addToHistory(channel);
          setHistory(newHistory);
      }
  };

  const handlePlayEpisode = (episodeChannel: Channel) => {
      // When playing an episode from the modal, treating it as a 'movie' content type for player
      setCurrentChannel(episodeChannel);
      // Add Series container to history so it appears in "Recently Watched"
      if (seriesDetails) {
          const newHistory = addToHistory(seriesDetails);
          setHistory(newHistory);
      }
  };

  // --- SETTINGS LOGIC ---
  const handleToggleLanguage = (lang: string) => {
      const updated = selectedLanguages.includes(lang) 
        ? selectedLanguages.filter(l => l !== lang)
        : [...selectedLanguages, lang];
      
      setSelectedLanguages(updated);
      localStorage.setItem('streamflix_languages', JSON.stringify(updated));
  };

  const handleRemoveFromHistory = (channelId: string) => {
      const updated = history.filter(h => h.id !== channelId);
      setHistory(updated);
      localStorage.setItem('streamflix_history', JSON.stringify(updated));
  };

  const handleM3UImport = async (input: string) => {
    setLoading(true);
    setLoadingStatus('Initializing...');
    try {
        let content = input;
        if (input.trim().startsWith('http')) {
             setLoadingStatus('Downloading playlist...');
             try { content = await fetchUrlContent(input, 'text'); } 
             catch (fetchErr) { throw new Error("Could not download playlist."); }
        }
        setLoadingStatus('Parsing channels...');
        await new Promise(r => setTimeout(r, 50));
        const { allChannels: parsedChannels } = parseM3U(content);
        await processPlaylistData(parsedChannels);
    } catch (e: any) {
        alert(`Load Failed: ${e.message}`);
    } finally {
        setLoading(false);
        setLoadingStatus('');
    }
  };

  const handleXtreamImport = async (url: string, user: string, pass: string) => {
      setLoading(true);
      setLoadingStatus('Connecting...');
      setAllChannels([]); setCategories([]); setRecommendations([]); await clearDB(); 
      
      // SAVE CREDENTIALS
      const creds = { url, user, pass };
      setXtreamCreds(creds);
      localStorage.setItem('streamflix_creds', JSON.stringify(creds));

      try {
        await fetchXtreamPlaylist(
            url, user, pass, 
            (status) => setLoadingStatus(status),
            handleChunkLoaded 
        );
      } catch (e: any) {
          if (!isSetupComplete) {
             setLoadingStatus(`Connection Failed: ${e.message}`);
             setTimeout(() => { setLoading(false); setLoadingStatus(''); }, 3000);
          }
      } 
  };

  const handleExportData = () => { /* ... existing ... */ };
  const handleImportData = (file: File) => { /* ... existing ... */ };
  const handleSyncToServer = async () => { /* ... existing ... */ };
  
  const handleLogout = async () => {
    if(window.confirm("Log out?")) {
        setLoading(true); setShowSettings(false); await clearDB(); 
        setIsSetupComplete(false); setCategories([]); setAllChannels([]);
        localStorage.removeItem('streamflix_languages');
        localStorage.removeItem('streamflix_creds'); // Clear creds
        setXtreamCreds(null);
        window.location.reload();
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

  // --- SEARCH & FILTER LOGIC ---
  const filteredCategories = useMemo(() => {
    const result: Category[] = [];
    
    // 1. Search Terms
    const searchTerms = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const matchesSearch = (c: Channel) => {
        if (searchTerms.length === 0) return true;
        const text = (c.name + ' ' + (c.group || '')).toLowerCase();
        return searchTerms.every(term => text.includes(term));
    };

    // 2. Language Filter
    // If ignoreLangFilter is true (Search Override), we skip the check.
    const isLangAllowed = (lang?: string) => {
        if (ignoreLangFilter && searchQuery) return true;
        if (!lang) return selectedLanguages.includes('Other');
        // Map common detected langs to keys in VALID_LANGUAGES
        const normalized = lang.toLowerCase();
        // Simple check if any selected lang matches the channel lang
        return selectedLanguages.some(sl => sl.toLowerCase() === normalized);
    };

    // Special Rows for Home
    if (currentView === 'home' && !searchQuery) {
        const vodHistory = history.filter(h => h.contentType === 'movie' || h.contentType === 'series');
        if (vodHistory.length > 0) {
            result.push({ name: 'Recently Watched', channels: vodHistory, language: 'All' });
        }
        if (recommendations.length > 0) {
            result.push({ name: 'Recommended for You', channels: recommendations, language: 'All' });
        }
    }

    const targetType = currentView === 'live' ? 'live' : (currentView === 'series' ? 'series' : 'movie');

    for (const cat of categories) {
        let channelsInCat = cat.channels;
        
        // View Filter
        if (currentView === 'home') {
             channelsInCat = channelsInCat.filter(c => c.contentType === 'movie' || c.contentType === 'series');
        } else {
             channelsInCat = channelsInCat.filter(c => c.contentType === targetType);
        }
        
        // Search Filter
        if (searchQuery) {
             channelsInCat = channelsInCat.filter(c => matchesSearch(c));
        }
        
        // Language Filter (Apply to channels)
        channelsInCat = channelsInCat.filter(c => isLangAllowed(c.language));
        
        if (channelsInCat.length > 0) {
            result.push({ ...cat, channels: channelsInCat });
        }
    }
    return result;
  }, [categories, currentView, selectedLanguages, searchQuery, history, recommendations, ignoreLangFilter]);

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
        <div className="min-h-screen bg-black flex flex-col items-center justify-center">
             <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4"></div>
             <p className="text-white">{loadingStatus}</p>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#141414] overflow-x-hidden font-sans">
      <Navbar 
        onOpenSettings={() => setShowSettings(true)} 
        currentView={currentView}
        onChangeView={setCurrentView}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        ignoreLangFilter={ignoreLangFilter}
        onToggleIgnoreLangFilter={() => setIgnoreLangFilter(!ignoreLangFilter)}
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
        selectedLanguages={selectedLanguages}
        onToggleLanguage={handleToggleLanguage}
      />
      
      {currentView === 'home' && featured && !searchQuery && <Hero channel={featured} onPlay={handleCardClick} />}
      
      <div className={`${currentView === 'home' && !searchQuery ? '-mt-16' : 'mt-24'} relative z-10 pb-20`}>
          {visibleCategories.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                  <p className="text-xl">No content found. Check filters or search.</p>
              </div>
          ) : (
              visibleCategories.map((cat) => (
                  <ContentRow 
                    key={`${cat.name}-${currentView}`} 
                    category={cat} 
                    onPlay={handleCardClick}
                    onRemove={cat.name === 'Recently Watched' ? handleRemoveFromHistory : undefined}
                    showRemove={cat.name === 'Recently Watched'}
                  />
              ))
          )}
      </div>

      {currentChannel && (
        <VideoPlayer 
            channel={currentChannel} 
            onClose={() => setCurrentChannel(null)} 
        />
      )}

      {seriesDetails && (
          <SeriesModal 
            series={seriesDetails}
            onClose={() => setSeriesDetails(null)}
            onPlayEpisode={handlePlayEpisode}
            creds={xtreamCreds}
          />
      )}
    </div>
  );
};

export default App;