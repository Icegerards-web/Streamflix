import React, { useEffect, useState } from 'react';
import { Channel, SeriesDetailsData, SeriesEpisode } from '../types';
import { fetchXtreamSeriesDetails } from '../utils/parser';

interface SeriesModalProps {
    series: Channel;
    onClose: () => void;
    onPlayEpisode: (episode: Channel) => void;
    creds: { url: string; user: string; pass: string } | null;
}

const SeriesModal: React.FC<SeriesModalProps> = ({ series, onClose, onPlayEpisode, creds }) => {
    const [details, setDetails] = useState<SeriesDetailsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedSeason, setSelectedSeason] = useState<string>('1');
    const [activeCreds, setActiveCreds] = useState<{ url: string; user: string; pass: string } | null>(creds);

    useEffect(() => {
        const load = async () => {
            let effectiveCreds = creds;

            // FALLBACK: Try to extract credentials from the URL if not provided globally
            // URL Structure: http://host:port/series/user/pass/id.ext
            if (!effectiveCreds && series.url) {
                try {
                    // Regex to find /series/username/password/
                    const match = series.url.match(/^(https?:\/\/[^/]+)\/series\/([^/]+)\/([^/]+)\//);
                    if (match) {
                        effectiveCreds = {
                            url: match[1],
                            user: match[2],
                            pass: match[3]
                        };
                        setActiveCreds(effectiveCreds);
                    }
                } catch (e) {
                    console.warn("Could not extract creds from URL", e);
                }
            }

            if (effectiveCreds && series.seriesId) {
                const data = await fetchXtreamSeriesDetails(effectiveCreds.url, effectiveCreds.user, effectiveCreds.pass, series.seriesId);
                setDetails(data);
                
                // Select first available season
                if (data?.episodes) {
                    const seasons = Object.keys(data.episodes);
                    if (seasons.length > 0) setSelectedSeason(seasons[0]);
                }
            } else if (!effectiveCreds && series.seriesId) {
                 // Try parsing series ID from URL if not explicitly set (common in M3U)
                 // If we have creds but no seriesId (rare), or neither.
            }

            setLoading(false);
        };
        load();
    }, [series, creds]);

    // Handle missing creds or API failure
    if (!activeCreds && !loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
                <div className="bg-[#181818] p-6 rounded-lg text-center border border-gray-700 shadow-xl max-w-sm w-full">
                    <h3 className="text-xl font-bold text-white mb-2">Metadata Unavailable</h3>
                    <p className="mb-6 text-gray-400 text-sm">
                        We couldn't connect to the API to fetch episodes. This usually happens with basic M3U playlists.
                    </p>
                    <button 
                        onClick={() => onPlayEpisode(series)} 
                        className="w-full bg-red-600 hover:bg-red-700 px-4 py-3 rounded text-white font-bold mb-3 transition"
                    >
                        Play Direct Stream
                    </button>
                    <button 
                        onClick={onClose} 
                        className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-white font-medium transition"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    const seasons = details ? Object.keys(details.episodes).sort((a,b) => parseInt(a) - parseInt(b)) : [];
    const currentEpisodes = details ? details.episodes[selectedSeason] : [];

    const handleEpisodeClick = (ep: SeriesEpisode) => {
        if (!activeCreds) return;
        // Construct a Channel object for the player
        const streamUrl = `${activeCreds.url}/series/${activeCreds.user}/${activeCreds.pass}/${ep.id}.${ep.container_extension}`;
        const epChannel: Channel = {
            id: `ep_${ep.id}`,
            name: `${ep.episode_num}. ${ep.title}`,
            url: streamUrl,
            contentType: 'movie', // Treat as movie/vod for player
            group: series.name,
            logo: details?.info.cover
        };
        onPlayEpisode(epChannel);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md overflow-y-auto p-4 md:p-8">
            <div className="relative w-full max-w-6xl bg-[#141414] rounded-xl shadow-2xl border border-gray-800 flex flex-col md:flex-row overflow-hidden min-h-[60vh]">
                
                <button onClick={onClose} className="absolute top-4 right-4 z-20 bg-black/50 p-2 rounded-full text-white hover:bg-white hover:text-black transition">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Left: Cover & Info */}
                <div className="w-full md:w-[400px] relative flex-shrink-0 bg-[#0a0a0a]">
                    <div className="absolute inset-0">
                         <img 
                            src={details?.info.cover || series.logo} 
                            alt={series.name} 
                            className="w-full h-full object-cover opacity-50 md:opacity-70"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent md:bg-gradient-to-r md:via-[#141414]/50 md:to-transparent"></div>
                    </div>
                    
                    <div className="relative p-6 md:p-8 flex flex-col justify-end h-full z-10">
                         <span className="text-red-500 font-bold tracking-widest text-xs uppercase mb-2">Series</span>
                         <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-3 leading-tight drop-shadow-md">{details?.info.name || series.name}</h2>
                         
                         <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300 mb-6">
                            {details?.info.rating && (
                                <span className="text-green-400 font-bold flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                                    {details.info.rating}
                                </span>
                            )}
                            {details?.info.releaseDate && <span>{details.info.releaseDate.split('-')[0]}</span>}
                            {details?.info.genre && <span className="border border-gray-600 px-2 py-0.5 rounded text-xs bg-black/50">{details.info.genre}</span>}
                         </div>
                         
                         <p className="text-gray-200 text-sm leading-relaxed mb-4 line-clamp-5 md:line-clamp-none">
                            {details?.info.plot || "No description available."}
                         </p>
                         
                         <div className="mt-2 pt-4 border-t border-gray-700">
                             <p className="text-gray-400 text-xs"><strong className="text-gray-300">Cast:</strong> {details?.info.cast || "N/A"}</p>
                             <p className="text-gray-400 text-xs mt-1"><strong className="text-gray-300">Director:</strong> {details?.info.director || "N/A"}</p>
                         </div>
                    </div>
                </div>

                {/* Right: Episodes */}
                <div className="flex-1 bg-[#141414] flex flex-col h-[500px] md:h-auto border-l border-gray-800">
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="flex flex-col items-center">
                                <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <p className="text-gray-500 text-sm">Loading episodes...</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Season Tabs */}
                            <div className="flex overflow-x-auto border-b border-gray-800 p-4 gap-2 hide-scrollbar bg-[#0f0f0f]">
                                {seasons.map(s => (
                                    <button 
                                        key={s}
                                        onClick={() => setSelectedSeason(s)}
                                        className={`px-5 py-2 rounded text-sm font-bold whitespace-nowrap transition-all ${
                                            selectedSeason === s 
                                            ? 'bg-red-600 text-white shadow-lg scale-105' 
                                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                                        }`}
                                    >
                                        Season {s}
                                    </button>
                                ))}
                            </div>

                            {/* Episode List */}
                            <div className="flex-1 overflow-y-auto p-0 md:p-2 custom-scrollbar">
                                <div className="space-y-1">
                                    {currentEpisodes?.map(ep => (
                                        <div 
                                            key={ep.id}
                                            onClick={() => handleEpisodeClick(ep)}
                                            className="flex items-center gap-4 p-4 hover:bg-[#1f1f1f] cursor-pointer group transition border-b border-gray-800/50 last:border-0"
                                        >
                                            <div className="relative flex-shrink-0">
                                                <div className="w-24 h-14 bg-gray-800 rounded overflow-hidden">
                                                    {/* Placeholder for episode thumb if we had one, using cover for now */}
                                                     <img src={details?.info.cover} className="w-full h-full object-cover opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition" />
                                                </div>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition transform scale-75 group-hover:scale-100" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                                </div>
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-gray-300 group-hover:text-white truncate text-sm md:text-base">
                                                    <span className="text-red-500 mr-2">{ep.episode_num}.</span>
                                                    {ep.title}
                                                </h4>
                                                {ep.info.duration && <span className="text-xs text-gray-500 mt-1 block">{ep.info.duration} min</span>}
                                            </div>
                                        </div>
                                    ))}
                                    {currentEpisodes?.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-500 py-20">
                                            <svg className="w-12 h-12 mb-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            <p>No episodes found for Season {selectedSeason}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SeriesModal;