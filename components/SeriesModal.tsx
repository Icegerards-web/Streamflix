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

    useEffect(() => {
        const load = async () => {
            if (creds && series.seriesId) {
                const data = await fetchXtreamSeriesDetails(creds.url, creds.user, creds.pass, series.seriesId);
                setDetails(data);
                
                // Select first available season
                if (data?.episodes) {
                    const seasons = Object.keys(data.episodes);
                    if (seasons.length > 0) setSelectedSeason(seasons[0]);
                }
            }
            setLoading(false);
        };
        load();
    }, [series, creds]);

    // Handle missing creds or M3U source (no extended info available)
    if (!creds && !loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
                <div className="bg-[#181818] p-6 rounded text-center">
                    <p className="mb-4">Details not available for this playlist type.</p>
                    <button onClick={() => onPlayEpisode(series)} className="bg-red-600 px-4 py-2 rounded text-white font-bold">Play Stream</button>
                    <button onClick={onClose} className="block mt-4 text-gray-400 mx-auto">Close</button>
                </div>
            </div>
        );
    }

    const seasons = details ? Object.keys(details.episodes).sort((a,b) => parseInt(a) - parseInt(b)) : [];
    const currentEpisodes = details ? details.episodes[selectedSeason] : [];

    const handleEpisodeClick = (ep: SeriesEpisode) => {
        if (!creds) return;
        // Construct a Channel object for the player
        const streamUrl = `${creds.url}/series/${creds.user}/${creds.pass}/${ep.id}.${ep.container_extension}`;
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md overflow-y-auto">
            <div className="relative w-full max-w-5xl bg-[#141414] rounded-xl shadow-2xl border border-gray-800 flex flex-col md:flex-row overflow-hidden min-h-[60vh] m-4">
                
                <button onClick={onClose} className="absolute top-4 right-4 z-10 bg-black/50 p-2 rounded-full text-white hover:bg-white hover:text-black transition">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Left: Cover & Info */}
                <div className="w-full md:w-1/3 relative">
                    <div className="absolute inset-0">
                         <img 
                            src={details?.info.cover || series.logo} 
                            alt={series.name} 
                            className="w-full h-full object-cover opacity-60"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-[#141414] via-[#141414]/80 to-transparent"></div>
                    </div>
                    
                    <div className="relative p-8 flex flex-col justify-end h-full">
                         <h2 className="text-3xl md:text-4xl font-bold text-white mb-2 leading-tight">{details?.info.name || series.name}</h2>
                         <div className="flex items-center gap-3 text-sm text-gray-300 mb-4">
                            {details?.info.rating && <span className="text-green-400 font-bold">{details.info.rating}/10</span>}
                            {details?.info.releaseDate && <span>{details.info.releaseDate}</span>}
                            {details?.info.genre && <span className="border border-gray-600 px-2 py-0.5 rounded text-xs">{details.info.genre}</span>}
                         </div>
                         <p className="text-gray-300 text-sm line-clamp-6 mb-4">{details?.info.plot}</p>
                         <p className="text-gray-500 text-xs">Cast: {details?.info.cast}</p>
                    </div>
                </div>

                {/* Right: Episodes */}
                <div className="w-full md:w-2/3 bg-[#141414] flex flex-col max-h-[80vh] md:max-h-auto">
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <>
                            {/* Season Tabs */}
                            <div className="flex overflow-x-auto border-b border-gray-800 p-4 gap-4 hide-scrollbar">
                                {seasons.map(s => (
                                    <button 
                                        key={s}
                                        onClick={() => setSelectedSeason(s)}
                                        className={`px-4 py-2 rounded font-bold whitespace-nowrap transition ${
                                            selectedSeason === s 
                                            ? 'bg-red-600 text-white' 
                                            : 'bg-gray-800 text-gray-400 hover:text-white'
                                        }`}
                                    >
                                        Season {s}
                                    </button>
                                ))}
                            </div>

                            {/* Episode List */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {currentEpisodes?.map(ep => (
                                    <div 
                                        key={ep.id}
                                        onClick={() => handleEpisodeClick(ep)}
                                        className="flex items-center gap-4 p-4 rounded hover:bg-gray-800 cursor-pointer group transition border border-transparent hover:border-gray-700"
                                    >
                                        <div className="text-gray-500 font-mono text-xl w-8 text-center group-hover:text-white">{ep.episode_num}</div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-gray-200 group-hover:text-white">{ep.title}</h4>
                                            {ep.info.duration && <span className="text-xs text-gray-500">{ep.info.duration}</span>}
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 bg-white text-black rounded-full p-2 transition">
                                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                                             </svg>
                                        </div>
                                    </div>
                                ))}
                                {currentEpisodes?.length === 0 && (
                                    <div className="text-gray-500 text-center py-10">No episodes found for this season.</div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SeriesModal;