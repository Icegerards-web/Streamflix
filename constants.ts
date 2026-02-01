export const VALID_LANGUAGES = [
  'nl', 'dutch', 'netherlands', 
  'en', 'english', 'uk', 'usa', 'us', 
  'de', 'german', 'germany', 
  'lingo'
];

// --- SERVER CONFIGURATION ---
// Fill these details to host the app with a pre-loaded playlist.
// If these are set, the app will automatically load this content for any visitor.
export const SERVER_CONFIG = {
    url: "",      // e.g. "http://line.my-iptv.com"
    username: "", // e.g. "user123"
    password: ""  // e.g. "pass123"
};

// A safe, legal public domain playlist for demonstration purposes
export const DEMO_PLAYLIST = `
#EXTM3U

#EXTINF:-1 group-title="Action [EN]" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg",Big Buck Bunny
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8

#EXTINF:-1 group-title="Sci-Fi [NL]" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/d/dc/Sintel_poster.jpg",Sintel (Dutch Dub)
https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8

#EXTINF:-1 group-title="Animation [DE]" tvg-logo="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Elephants_Dream_poster.jpg/800px-Elephants_Dream_poster.jpg",Elephants Dream
https://test-streams.mux.dev/test_001/stream.m3u8

#EXTINF:-1 group-title="Documentary [EN]" tvg-logo="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg",Tears of Steel
https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8

#EXTINF:-1 group-title="Lingo Originals",Lingo Test Stream
https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8
`;

export const NETFLIX_RED = '#E50914';