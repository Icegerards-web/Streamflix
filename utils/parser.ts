import { Channel, Category } from '../types';
import { VALID_LANGUAGES } from '../constants';

// Pre-compile Regex for performance
// We use this to PRIORITIZE loading, not to filter out.
const PRIORITY_REGEX = new RegExp(`\\b(${VALID_LANGUAGES.join('|')})\\b`, 'i');

export const isPriorityMatch = (text: string): boolean => {
  if (!text) return false;
  return PRIORITY_REGEX.test(text);
};

export const detectLanguage = (text: string): string => {
   const lower = text.toLowerCase();
   if (/\b(nl|dutch|netherlands)\b/.test(lower)) return 'Dutch';
   if (/\b(en|english|uk|usa|us)\b/.test(lower)) return 'English';
   if (/\b(de|german|germany)\b/.test(lower)) return 'German';
   if (/\b(fr|french|france)\b/.test(lower)) return 'French';
   if (/\b(tr|turkish|turkey)\b/.test(lower)) return 'Turkish';
   if (/\b(es|spanish|spain)\b/.test(lower)) return 'Spanish';
   if (/\b(it|italian|italy)\b/.test(lower)) return 'Italian';
   if (/\b(pt|portuguese|brazil)\b/.test(lower)) return 'Portuguese';
   if (/\b(ar|arabic)\b/.test(lower)) return 'Arabic';
   return 'Other';
};

// Helper to convert MKV/AVI/MP4 Xtream URLs to HLS (m3u8)
const normalizeXtreamUrl = (url: string): string => {
    // Regex for standard Xtream Codes VOD structure: /movie/user/pass/id.ext
    const xcRegex = /^(https?:\/\/[^/]+)\/(movie|series)\/([^/]+)\/([^/]+)\/(\d+)\.(.+)$/i;
    const match = url.match(xcRegex);
    
    if (match) {
        const ext = match[6].toLowerCase();
        // If it's not m3u8, force it. Browsers can't play MKV/AVI natively.
        // Xtream servers generally support on-the-fly transcoding/remuxing to HLS.
        if (ext !== 'm3u8') {
             return `${match[1]}/${match[2]}/${match[3]}/${match[4]}/${match[5]}.m3u8`;
        }
    }
    return url;
};

export const parseM3U = (content: string): { categories: Category[], allChannels: Channel[] } => {
  const channels: Channel[] = [];
  let currentChannel: Partial<Channel> = {};
  
  let start = 0;
  let end = content.indexOf('\n');
  
  while (end !== -1) {
    const line = content.substring(start, end).trim();
    
    if (line.startsWith('#EXTINF:')) {
      const commaIndex = line.lastIndexOf(',');
      const name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Unknown Channel';

      const attrPart = line.substring(0, commaIndex);
      const logoMatch = attrPart.match(/tvg-logo="([^"]*)"/);
      const groupMatch = attrPart.match(/group-title="([^"]*)"/);

      currentChannel = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        logo: logoMatch ? logoMatch[1] : undefined,
        group: groupMatch ? groupMatch[1] : 'Uncategorized',
      };
    } else if (line && !line.startsWith('#')) {
       if (currentChannel.name) {
         let url = line;
         // Normalize URL for browser compatibility
         url = normalizeXtreamUrl(url);

         // Determine content type (simple heuristic)
         // If we converted to m3u8 from a movie path, it's a movie.
         const isVod = url.includes('/movie/') || url.includes('/series/') || line.match(/\.(mp4|mkv|avi|mov|wmv|flv)$/i);
         
         channels.push({
             ...currentChannel,
             contentType: url.includes('/series/') ? 'series' : (isVod ? 'movie' : 'live'),
             url: url,
             language: detectLanguage(currentChannel.group || '')
         } as Channel);
         
         currentChannel = {};
       }
    }

    start = end + 1;
    end = content.indexOf('\n', start);
  }
  
  // Handle last line
  if (start < content.length) {
      const line = content.substring(start).trim();
      if (line && !line.startsWith('#') && currentChannel.name) {
          let url = line;
          url = normalizeXtreamUrl(url);
          const isVod = url.includes('/movie/') || url.includes('/series/') || line.match(/\.(mp4|mkv|avi|mov|wmv|flv)$/i);

          channels.push({
              ...currentChannel,
              contentType: url.includes('/series/') ? 'series' : (isVod ? 'movie' : 'live'),
              url: url,
              language: detectLanguage(currentChannel.group || '')
          } as Channel);
      }
  }

  return categorizeChannels(channels);
};

export const categorizeChannels = (channels: Channel[]): { categories: Category[], allChannels: Channel[] } => {
  const categoryMap: Record<string, Channel[]> = {};
  for (const ch of channels) {
    const g = ch.group || 'Uncategorized';
    if (!categoryMap[g]) categoryMap[g] = [];
    categoryMap[g].push(ch);
  }

  const categories: Category[] = Object.keys(categoryMap).map(key => ({
    name: key,
    channels: categoryMap[key],
    language: detectLanguage(key)
  }));

  return { categories, allChannels: channels };
};

// --- FETCHING UTILITIES ---

const fetchWithTimeout = async (url: string, timeout = 30000): Promise<Response> => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

const PROXIES = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
];

export const fetchUrlContent = async (url: string, type: 'json' | 'text' = 'text'): Promise<any> => {
    try {
        const res = await fetchWithTimeout(url, 15000); 
        if (res.ok) return type === 'json' ? await res.json() : await res.text();
    } catch (e) { /* ignore */ }

    for (const proxyGen of PROXIES) {
        try {
            const proxyUrl = proxyGen(url);
            const res = await fetchWithTimeout(proxyUrl, 60000); 
            
            if (res.ok) {
                if (type === 'json') {
                    const text = await res.text();
                    try {
                        return JSON.parse(text);
                    } catch (jsonErr) {
                        continue; 
                    }
                }
                return await res.text();
            }
        } catch (e) { /* ignore */ }
    }
    
    throw new Error(`Failed to load content. Please check your URL and internet connection.`);
};

// Xtream Codes Support

export const fetchXtreamPlaylist = async (
  baseUrl: string, 
  username: string, 
  password: string,
  onProgress: (status: string) => void,
  onChunkLoaded: (channels: Channel[]) => void
): Promise<void> => {
  
  let host = baseUrl.trim();
  if (host.endsWith('/')) host = host.slice(0, -1);
  if (!host.startsWith('http')) host = `http://${host}`;

  const authParams = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const apiUrl = `${host}/player_api.php?${authParams}`;

  const catMap = new Map<string, string>();
  
  // Categorized IDs
  const liveCatIds: string[] = [];
  const vodCatIds: string[] = [];
  const seriesCatIds: string[] = [];

  // Helper to parse channels from Xtream Item format
  const parseXtreamItems = (items: any[], type: 'live' | 'movie' | 'series', categoryId?: string): Channel[] => {
      const results: Channel[] = [];
      for (const item of items) {
          const cid = categoryId || String(item.category_id);
          const name = item.name || item.stream_display_name || item.title || 'Unknown';
          
          const streamId = item.stream_id || item.series_id;
          
          // FORCE .m3u8 for better web compatibility (HLS)
          const ext = 'm3u8'; 
          
          let finalUrl = '';
          if (type === 'live') finalUrl = `${host}/live/${username}/${password}/${streamId}.m3u8`;
          else if (type === 'movie') finalUrl = `${host}/movie/${username}/${password}/${streamId}.${ext}`;
          else if (type === 'series') finalUrl = `${host}/series/${username}/${password}/${streamId}.${ext}`; 
          
          const groupName = catMap.get(cid) || (type === 'live' ? 'Live TV' : type === 'movie' ? 'Movies' : 'Series');

          results.push({
              id: `${type}_${streamId}`,
              name: name,
              logo: item.stream_icon || item.cover || item.cover_big,
              group: groupName,
              url: finalUrl,
              contentType: type === 'series' ? 'series' : (type === 'movie' ? 'movie' : 'live'),
              language: detectLanguage(groupName)
          });
      }
      return results;
  };

  // 1. Fetch Categories first
  onProgress("Loading Categories...");
  
  const processCategories = async (action: string, targetArray: string[], typeName: string) => {
      try {
          const data = await fetchUrlContent(`${apiUrl}&action=${action}`, 'json');
          const items = Array.isArray(data) ? data : [];
          for (const item of items) {
              const cid = String(item.category_id);
              const cname = item.category_name;
              catMap.set(cid, cname);
              targetArray.push(cid);
          }
      } catch (e) { console.warn(`Failed to load ${typeName} categories`); }
  };

  await Promise.all([
      processCategories('get_live_categories', liveCatIds, 'Live'),
      processCategories('get_vod_categories', vodCatIds, 'VOD'),
      processCategories('get_series_categories', seriesCatIds, 'Series')
  ]);

  if (liveCatIds.length === 0 && vodCatIds.length === 0) {
      throw new Error("No categories found on server.");
  }

  // --- SORTING ---
  const sortCategories = (ids: string[]) => {
      return ids.sort((a, b) => {
          const nameA = catMap.get(a) || '';
          const nameB = catMap.get(b) || '';
          const matchA = isPriorityMatch(nameA);
          const matchB = isPriorityMatch(nameB);
          
          if (matchA && !matchB) return -1;
          if (!matchA && matchB) return 1;
          return nameA.localeCompare(nameB);
      });
  };

  const sortedLive = sortCategories(liveCatIds);
  const sortedVod = sortCategories(vodCatIds);
  const sortedSeries = sortCategories(seriesCatIds);

  // 2. Fetch Live Streams
  if (sortedLive.length > 0) {
      onProgress("Loading Live TV...");
      try {
          const liveData = await fetchUrlContent(`${apiUrl}&action=get_live_streams`, 'json');
          const liveItems = Array.isArray(liveData) ? liveData : [];
          const liveChannels = parseXtreamItems(liveItems, 'live');
          if (liveChannels.length > 0) onChunkLoaded(liveChannels);
      } catch (e) { console.warn("Live fetch failed"); }
  }

  // 3. OPTIMIZED VOD FETCHING (Batch by Category)
  const MAX_CONCURRENT = 10;

  const fetchBatch = async (ids: string[], type: 'movie' | 'series', action: string) => {
       for (let i = 0; i < ids.length; i += MAX_CONCURRENT) {
          const batch = ids.slice(i, i + MAX_CONCURRENT);
          const promises = batch.map(async (cid) => {
              try {
                  const data = await fetchUrlContent(`${apiUrl}&action=${action}&category_id=${cid}`, 'json');
                  const items = Array.isArray(data) ? data : [];
                  const channels = parseXtreamItems(items, type, cid);
                  if (channels.length > 0) onChunkLoaded(channels);
              } catch (e) { /* ignore */ }
          });
          await Promise.all(promises);
          
          const percent = Math.round(((i + batch.length) / ids.length) * 100);
          onProgress(`Loading ${type === 'movie' ? 'Movies' : 'Series'}... ${percent}%`);
      }
  };

  if (sortedVod.length > 0) {
      await fetchBatch(sortedVod, 'movie', 'get_vod_streams');
  }

  if (sortedSeries.length > 0) {
      await fetchBatch(sortedSeries, 'series', 'get_series');
  }
};