import React from 'react';
import { Channel } from '../types';

interface HeroProps {
  channel: Channel | null;
  onPlay: (channel: Channel) => void;
}

const Hero: React.FC<HeroProps> = ({ channel, onPlay }) => {
  if (!channel) return null;

  // Fallback image if no logo
  const bgImage = channel.logo || 'https://picsum.photos/1920/1080?blur=2';

  return (
    <div className="relative h-[56.25vw] max-h-[80vh] w-full">
      <div className="absolute top-0 left-0 w-full h-full">
        <img 
            src={bgImage} 
            alt={channel.name}
            className="w-full h-full object-cover brightness-[0.6]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent"></div>
      </div>

      <div className="absolute top-[30%] md:top-[40%] left-4 md:left-12 max-w-xl">
        <span className="text-red-600 font-bold tracking-widest uppercase text-sm md:text-base mb-2 block">
            {channel.group}
        </span>
        <h1 className="text-3xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
            {channel.name}
        </h1>
        <p className="text-white text-base md:text-lg mb-6 drop-shadow-md line-clamp-3 w-3/4">
            Watch this amazing content now. Stream in high definition. 
            Available in your selected language preferences.
        </p>
        
        <div className="flex gap-4">
            <button 
                onClick={() => onPlay(channel)}
                className="bg-white text-black px-6 md:px-8 py-2 md:py-3 rounded font-bold flex items-center gap-2 hover:bg-opacity-80 transition"
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                </svg>
                Play
            </button>
            <button className="bg-[rgba(109,109,110,0.7)] text-white px-6 md:px-8 py-2 md:py-3 rounded font-bold flex items-center gap-2 hover:bg-[rgba(109,109,110,0.4)] transition">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
                More Info
            </button>
        </div>
      </div>
    </div>
  );
};

export default Hero;