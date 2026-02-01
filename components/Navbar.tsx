import React, { useState, useEffect } from 'react';

interface NavbarProps {
    onOpenSettings: () => void;
    onExportData: () => void;
    currentView: 'home' | 'live' | 'movies' | 'series';
    onChangeView: (view: 'home' | 'live' | 'movies' | 'series') => void;
    currentLanguage: string;
    onLanguageChange: (lang: string) => void;
    isAutoConfig?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ 
    onOpenSettings, 
    onExportData,
    currentView, 
    onChangeView, 
    currentLanguage, 
    onLanguageChange,
    isAutoConfig
}) => {
  const [isScrolled, setIsScrolled] = useState(false);

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
      <div className="px-4 md:px-12 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4 md:gap-8">
            <h1 onClick={() => onChangeView('home')} className="text-red-600 text-2xl md:text-3xl font-bold cursor-pointer tracking-tighter">STREAMFLIX</h1>
            <ul className="hidden md:flex gap-6 text-sm text-gray-200">
                <li onClick={() => onChangeView('home')} className={getLinkClass('home')}>Home</li>
                <li onClick={() => onChangeView('live')} className={getLinkClass('live')}>Live TV</li>
                <li onClick={() => onChangeView('movies')} className={getLinkClass('movies')}>Movies</li>
            </ul>
        </div>
        
        <div className="flex items-center gap-4">
            {/* Language Filter */}
            <div className="relative">
                <select 
                    value={currentLanguage}
                    onChange={(e) => onLanguageChange(e.target.value)}
                    className="appearance-none bg-black/50 text-white text-xs md:text-sm border border-gray-600 rounded px-3 py-1 pr-6 hover:bg-black/70 focus:outline-none"
                >
                    <option value="All">All Languages</option>
                    <option value="English">English</option>
                    <option value="Dutch">Dutch</option>
                    <option value="German">German</option>
                    <option value="French">French</option>
                    <option value="Turkish">Turkish</option>
                    <option value="Spanish">Spanish</option>
                    <option value="Italian">Italian</option>
                    <option value="Portuguese">Portuguese</option>
                    <option value="Arabic">Arabic</option>
                    <option value="Other">Other</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
                    <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
            </div>

            <button 
                onClick={onExportData}
                className="hidden md:block text-xs md:text-sm bg-gray-800/80 hover:bg-gray-700 px-3 py-1 rounded border border-gray-600 transition whitespace-nowrap"
                title="Download playlist.json for server hosting"
            >
                Save Data
            </button>

            <button 
                onClick={onOpenSettings}
                className="text-xs md:text-sm bg-red-600/80 hover:bg-red-700 px-3 py-1 rounded border border-red-600 transition whitespace-nowrap font-semibold"
            >
                {isAutoConfig ? "Reload" : "Logout"}
            </button>
            <div className="w-8 h-8 bg-blue-500 rounded cursor-pointer hidden sm:block"></div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;