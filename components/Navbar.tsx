import React, { useState, useEffect } from 'react';

interface NavbarProps {
    onOpenSettings: () => void;
    currentView: 'home' | 'live' | 'movies' | 'series';
    onChangeView: (view: 'home' | 'live' | 'movies' | 'series') => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    
    // Override filter
    ignoreLangFilter: boolean;
    onToggleIgnoreLangFilter: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ 
    onOpenSettings, 
    currentView, 
    onChangeView, 
    searchQuery,
    onSearchChange,
    ignoreLangFilter,
    onToggleIgnoreLangFilter
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getLinkClass = (view: string) => {
    return currentView === view 
        ? "cursor-pointer font-bold text-white transition text-base" 
        : "cursor-pointer font-medium text-gray-300 hover:text-gray-400 transition text-base";
  };

  return (
    <nav className={`fixed top-0 w-full z-40 transition-all duration-300 ${isScrolled ? 'bg-[#141414] shadow-md' : 'bg-gradient-to-b from-black/90 to-transparent'}`}>
      <div className="px-4 md:px-12 py-4 flex items-center justify-between gap-4">
        
        {/* Left Side: Logo & Links */}
        <div className="flex items-center gap-4 md:gap-10 flex-shrink-0">
            <h1 onClick={() => onChangeView('home')} className="text-red-600 text-2xl md:text-4xl font-extrabold cursor-pointer tracking-tighter drop-shadow-sm">STREAMFLIX</h1>
            <ul className="hidden md:flex gap-6 text-sm text-gray-200">
                <li onClick={() => onChangeView('home')} className={getLinkClass('home')}>Home</li>
                <li onClick={() => onChangeView('live')} className={getLinkClass('live')}>Live TV</li>
                <li onClick={() => onChangeView('series')} className={getLinkClass('series')}>Series</li>
                <li onClick={() => onChangeView('movies')} className={getLinkClass('movies')}>Movies</li>
            </ul>
        </div>
        
        {/* Right Side: Search, Lang, Profile */}
        <div className="flex items-center gap-4 flex-1 justify-end">
            
            {/* Search Bar */}
            <div className={`flex items-center transition-all duration-300 ${mobileSearchOpen ? 'absolute left-0 top-0 w-full p-4 bg-[#141414] z-50' : 'relative'}`}>
                <div className={`relative flex items-center bg-black/50 border border-white/20 rounded hover:border-white/50 transition focus-within:border-white focus-within:bg-black/80 ${mobileSearchOpen ? 'w-full' : 'w-auto'}`}>
                    <div className="pl-3">
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                    </div>
                    
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Titles, people, genres"
                        className={`
                            bg-transparent text-white text-sm py-2 px-3 outline-none
                            ${mobileSearchOpen ? 'w-full' : 'hidden md:block w-0 focus:w-64 md:w-64'} 
                        `}
                    />

                    {/* Ignore Lang Filter Toggle (Visible when searching) */}
                    {(searchQuery || mobileSearchOpen) && (
                         <div 
                            onClick={onToggleIgnoreLangFilter}
                            className={`mr-2 px-2 py-1 text-[10px] font-bold uppercase rounded cursor-pointer select-none transition ${ignoreLangFilter ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                            title="Search all languages (ignores settings)"
                         >
                            Global
                         </div>
                    )}
                    
                    {/* Mobile Search Toggle */}
                    <button 
                        onClick={() => {
                            if (mobileSearchOpen) {
                                setMobileSearchOpen(false);
                                onSearchChange('');
                            } else {
                                setMobileSearchOpen(true);
                            }
                        }}
                        className="md:hidden p-2 text-white"
                    >
                         {mobileSearchOpen ? '✕' : ''}
                    </button>
                    {!mobileSearchOpen && (
                        <button onClick={() => setMobileSearchOpen(true)} className="md:hidden p-2 text-white absolute inset-0 opacity-0"></button>
                    )}
                </div>
            </div>

            {/* Settings Trigger */}
            <div 
                onClick={onOpenSettings}
                className={`w-8 h-8 md:w-10 md:h-10 rounded cursor-pointer overflow-hidden border border-transparent hover:border-gray-400 transition ${mobileSearchOpen ? 'hidden' : 'block'}`}
            >
                <img src="https://wallpapers.com/images/hd/netflix-profile-pictures-1000-x-1000-qo9h82134t9nv0j0.jpg" alt="Profile" className="w-full h-full object-cover" />
            </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;