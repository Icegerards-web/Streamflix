import React, { useRef, useState, useMemo } from 'react';
import { Category, Channel } from '../types';

interface ContentRowProps {
  category: Category;
  onPlay: (channel: Channel) => void;
  onRemove?: (channelId: string) => void;
  showRemove?: boolean;
}

type SortOption = 'default' | 'name_asc' | 'name_desc';

const ContentRow: React.FC<ContentRowProps> = ({ category, onPlay, onRemove, showRemove }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [sortOption, setSortOption] = useState<SortOption>('default');
  const [isSortOpen, setIsSortOpen] = useState(false);

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - (clientWidth * 0.8) : scrollLeft + (clientWidth * 0.8);
      rowRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  const visibleChannels = useMemo(() => {
      let items = [...category.channels];
      if (sortOption === 'name_asc') {
          items.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortOption === 'name_desc') {
          items.sort((a, b) => b.name.localeCompare(a.name));
      }
      return items.slice(0, 50);
  }, [category.channels, sortOption]);

  const getProxiedImage = (url?: string) => {
      if (!url) return `https://ui-avatars.com/api/?background=333&color=fff&name=CH`;
      return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=400&h=225&fit=cover&output=webp&q=80`;
  };

  return (
    <div className="mb-10 pl-4 md:pl-12 group relative">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl md:text-3xl font-bold text-gray-100 hover:text-white transition tracking-tight">
            {category.name} <span className="text-sm text-gray-500 font-normal align-middle ml-1">({category.channels.length})</span>
        </h2>
        
        {/* Sorting Trigger */}
        <div className="relative">
            <button 
                onClick={() => setIsSortOpen(!isSortOpen)}
                className="text-gray-400 hover:text-white transition p-1.5 rounded hover:bg-white/10"
            >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                 </svg>
            </button>

            {isSortOpen && (
                <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSortOpen(false)}></div>
                <div className="absolute left-0 top-full mt-2 bg-[#181818] border border-gray-700 rounded-lg shadow-xl z-50 w-40 py-2 flex flex-col">
                    <button onClick={() => { setSortOption('default'); setIsSortOpen(false); }} className={`text-left px-4 py-3 text-sm hover:bg-gray-700 ${sortOption === 'default' ? 'text-white font-bold' : 'text-gray-300'}`}>Default</button>
                    <button onClick={() => { setSortOption('name_asc'); setIsSortOpen(false); }} className={`text-left px-4 py-3 text-sm hover:bg-gray-700 ${sortOption === 'name_asc' ? 'text-white font-bold' : 'text-gray-300'}`}>Name (A-Z)</button>
                    <button onClick={() => { setSortOption('name_desc'); setIsSortOpen(false); }} className={`text-left px-4 py-3 text-sm hover:bg-gray-700 ${sortOption === 'name_desc' ? 'text-white font-bold' : 'text-gray-300'}`}>Name (Z-A)</button>
                </div>
                </>
            )}
        </div>
      </div>
      
      <div className="relative group/row">
          {/* Scroll Buttons */}
          <button onClick={() => scroll('left')} className="absolute left-0 top-0 bottom-16 bg-gradient-to-r from-black/80 to-transparent z-20 w-16 hidden md:group-hover/row:flex items-center justify-center transition opacity-0 group-hover/row:opacity-100">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-8 h-8 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <button onClick={() => scroll('right')} className="absolute right-0 top-0 bottom-16 bg-gradient-to-l from-black/80 to-transparent z-20 w-16 hidden md:group-hover/row:flex items-center justify-center transition opacity-0 group-hover/row:opacity-100">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-8 h-8 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
          </button>

          {/* Card Container */}
          <div ref={rowRef} className="flex overflow-x-auto gap-4 md:gap-6 hide-scrollbar scroll-smooth pb-4 px-1">
            {visibleChannels.map((channel) => (
              <div key={channel.id} className="flex-none w-[180px] md:w-[260px] relative group/card">
                  {/* Image Container */}
                  <div 
                    onClick={() => onPlay(channel)}
                    className="aspect-video relative rounded-lg bg-gray-800 cursor-pointer overflow-hidden transition-all duration-300 group-hover/card:scale-105 group-hover/card:ring-2 ring-white/50 shadow-lg"
                  >
                     <img 
                        src={getProxiedImage(channel.logo)} 
                        alt=""
                        className="w-full h-full object-cover transition-opacity duration-500"
                        loading="lazy"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(channel.name)}&background=222&color=555&font-size=0.3`;
                        }}
                     />
                     
                     {/* Remove Button for Recently Watched */}
                     {showRemove && onRemove && (
                         <button 
                            onClick={(e) => { e.stopPropagation(); onRemove(channel.id); }}
                            className="absolute top-2 right-2 bg-black/60 hover:bg-red-600 text-white p-1.5 rounded-full backdrop-blur-sm opacity-0 group-hover/card:opacity-100 transition"
                            title="Remove from History"
                         >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                         </button>
                     )}

                     {/* Play Overlay Icon */}
                     <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition duration-300 bg-black/20">
                        <div className="bg-red-600/90 rounded-full p-3 shadow-xl transform scale-75 group-hover/card:scale-100 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white">
                                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                            </svg>
                        </div>
                     </div>
                  </div>

                  {/* Title Below Image (No Overlap) */}
                  <div className="mt-2 px-1">
                      <h3 className="text-gray-200 font-bold text-sm md:text-base leading-tight line-clamp-2 group-hover/card:text-white transition-colors">
                        {channel.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                         <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800">
                            {channel.contentType === 'live' ? 'LIVE' : (channel.contentType === 'series' ? 'SERIES' : 'MOVIE')}
                         </span>
                         {channel.rating && <span className="text-[10px] text-green-500 font-bold">{channel.rating}</span>}
                      </div>
                  </div>
              </div>
            ))}
          </div>
      </div>
    </div>
  );
};

export default ContentRow;