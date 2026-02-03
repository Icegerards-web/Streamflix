import React, { useState, useEffect } from 'react';

interface NavbarProps {
    onOpenSettings: () => void;
    currentView: 'home' | 'live' | 'movies' | 'series';
    onChangeView: (view: 'home' | 'live' | 'movies' | 'series') => void;
    currentLanguage: string;
    onLanguageChange: (lang: string) => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
}

const Navbar: React.FC<NavbarProps> = ({ 
    onOpenSettings, 
    currentView, 
    onChangeView, 
    currentLanguage, 
    onLanguageChange,
    searchQuery,
    onSearchChange
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
        ? "cursor-pointer font-bold text-white transition" 
        : "cursor-pointer font-medium text-gray-300 hover:text-gray-400 transition";
  };

  return (
    <nav className={`fixed top-0 w-full z-40 transition-colors duration-300 ${isScrolled ? 'bg-[#141414]' : 'bg-gradient-to-b from-black/80 to-transparent'}`}>
      <div className="px-4 md:px-12 py-4 flex items-center justify-between gap-4">
        
        {/* Left Side: Logo & Links */}
        <div className="flex items-center gap-4 md:gap-8 flex-shrink-0">
            <h1 onClick={() => onChangeView('home')} className="text-red-600 text-2xl md:text-3xl font-bold cursor-pointer tracking-tighter">STREAMFLIX</h1>
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
                <div className={`relative flex items-center ${mobileSearchOpen ? 'w-full' : ''}`}>
                    <svg 
                        onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
                        xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" 
                        className={`w-5 h-5 text-white absolute left-3 cursor-pointer md:cursor-default z-10 ${mobileSearchOpen ? 'text-gray-400' : ''}`}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Titles, people, genres"
                        className={`
                            bg-black/50 border border-white/30 text-white text-sm py-1 rounded transition focus:bg-black focus:border-white 
                            pl-10 outline-none
                            ${mobileSearchOpen ? 'w-full pr-10' : 'hidden md:block w-0 focus:w-64 md:w-64'} 
                        `}
                    />

                    {mobileSearchOpen && (
                        <button 
                            onClick={() => { setMobileSearchOpen(false); onSearchChange(''); }}
                            className="absolute right-3 text-white"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Language Filter (Hidden on search open in mobile) */}
            <div className={`relative ${mobileSearchOpen ? 'hidden' : 'block'}`}>
                <select 
                    value={currentLanguage}
                    onChange={(e) => onLanguageChange(e.target.value)}
                    className="appearance-none bg-black/50 text-white text-xs md:text-sm border border-gray-600 rounded px-3 py-1 pr-6 hover:bg-black/70 focus:outline-none max-w-[100px] md:max-w-none"
                >
                    <option value="All">All</option>
                    <option value="English">EN</option>
                    <option value="Dutch">NL</option>
                    <option value="German">DE</option>
                    <option value="French">FR</option>
                    <option value="Turkish">TR</option>
                    <option value="Spanish">ES</option>
                    <option value="Italian">IT</option>
                    <option value="Portuguese">PT</option>
                    <option value="Arabic">AR</option>
                    <option value="Other">Other</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
                    <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
            </div>

            {/* Settings Trigger */}
            <div 
                onClick={onOpenSettings}
                className={`w-8 h-8 rounded cursor-pointer overflow-hidden border border-transparent hover:border-gray-400 transition ${mobileSearchOpen ? 'hidden' : 'block'}`}
            >
                <img src="https://wallpapers.com/images/hd/netflix-profile-pictures-1000-x-1000-qo9h82134t9nv0j0.jpg" alt="Profile" className="w-full h-full object-cover" />
            </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;