import React, { useRef, useState, useMemo } from 'react';
import { Category, Channel } from '../types';

interface ContentRowProps {
  category: Category;
  onPlay: (channel: Channel) => void;
}

type SortOption = 'default' | 'name_asc' | 'name_desc';

const ContentRow: React.FC<ContentRowProps> = ({ category, onPlay }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [isSortOpen, setIsSortOpen] = useState(false);

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      rowRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  // Sorting Logic
  const visibleChannels = useMemo(() => {
      let items = [...category.channels];
      
      if (sortOption === 'name_asc') {
          items.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortOption === 'name_desc') {
          items.sort((a, b) => b.name.localeCompare(a.name));
      }
      // 'default' uses the original order (often server order or grouping order)

      // Performance: Limit to 50 items for DOM performance
      return items.slice(0, 50);
  }, [category.channels, sortOption]);

  // Helper to proxy images safely
  const getProxiedImage = (url?: string) => {
      if (!url) return `https://ui-avatars.com/api/?background=333&color=fff&name=CH`;
      return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=400&h=225&fit=cover&output=webp&q=80`;
  };

  return (
    <div className="mb-8 pl-4 md:pl-12 group relative">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-xl md:text-2xl font-bold text-gray-100 hover:text-white transition cursor-pointer">
            {category.name} <span className="text-xs text-gray-500 font-normal">({category.channels.length})</span>
        </h2>
        
        {/* Sorting Dropdown Trigger */}
        <div className="relative">
            <button 
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="text-gray-400 hover:text-white transition p-1 rounded hover:bg-white/10"
                title="Sort content"
            >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                 </svg>
            </button>

            {isSortOpen && (
                <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)}></div>
                <div className="absolute left-0 top-full mt-2 bg-[#181818] border border-gray-700 rounded shadow-xl z-50 w-32 py-1 flex flex-col">
                    <button 
                        onClick={() => { setSortOption('default'); setIsSortOpen(false); }}
                        className={`text-left px-4 py-2 text-xs hover:bg-gray-700 ${sortOption === 'default' ? 'text-white font-bold' : 'text-gray-300'}`}
                    >
                        Default
                    </button>
                    <button 
                        onClick={() => { setSortOption('name_asc'); setIsSortOpen(false); }}
                        className={`text-left px-4 py-2 text-xs hover:bg-gray-700 ${sortOption === 'name_asc' ? 'text-white font-bold' : 'text-gray-300'}`}
                    >
                        Name (A-Z)
                    </button>
                    <button 
                        onClick={() => { setSortOption('name_desc'); setIsSortOpen(false); }}
                        className={`text-left px-4 py-2 text-xs hover:bg-gray-700 ${sortOption === 'name_desc' ? 'text-white font-bold' : 'text-gray-300'}`}
                    >
                        Name (Z-A)
                    </button>
                </div>
                </>
            )}
        </div>
      </div>
      
      <div className="relative">
          {/* Left Arrow */}
          <button 
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 bg-black/50 z-20 w-12 hidden group-hover:flex items-center justify-center hover:bg-black/80 transition opacity-0 group-hover:opacity-100 h-full"
          >
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
             </svg>
          </button>

          <div 
            ref={rowRef}
            className="flex overflow-x-scroll gap-2 md:gap-4 hide-scrollbar scroll-smooth py-4"
          >
            {visibleChannels.map((channel) => (
              <div 
                key={channel.id} 
                onClick={() => onPlay(channel)}
                className="flex-none w-[160px] md:w-[240px] aspect-video relative rounded bg-gray-800 cursor-pointer transition-transform duration-300 hover:scale-105 hover:z-10 group/card"
              >
                 <img 
                    src={getProxiedImage(channel.logo)} 
                    alt={channel.name}
                    className="w-full h-full object-cover rounded bg-[#222]"
                    loading="lazy"
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        // Fallback to simple avatar
                        target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.name)}&background=333&color=fff`;
                    }}
                 />
                 <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/card:opacity-100 transition flex flex-col justify-end p-2 rounded">
                    <p className="text-white font-bold text-sm truncate">{channel.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                         {channel.contentType === 'live' ? (
                            <span className="bg-red-600 text-white text-[10px] px-1 rounded font-bold uppercase">LIVE</span>
                         ) : (
                            <span className="bg-gray-600 text-white text-[10px] px-1 rounded font-bold uppercase">VOD</span>
                         )}
                    </div>
                 </div>
              </div>
            ))}
          </div>

          {/* Right Arrow */}
          <button 
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 bg-black/50 z-20 w-12 hidden group-hover:flex items-center justify-center hover:bg-black/80 transition opacity-0 group-hover:opacity-100 h-full"
          >
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-6 h-6 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
             </svg>
          </button>
      </div>
    </div>
  );
};

export default ContentRow;