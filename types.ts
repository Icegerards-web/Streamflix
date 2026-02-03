export interface Channel {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  url: string;
  language?: string; // inferred
  contentType: 'live' | 'movie' | 'series';
  seriesId?: string; // specific for Xtream series
  rating?: string;
  year?: string;
}

export interface Category {
  name: string;
  channels: Channel[];
  language: string; // 'English', 'Dutch', 'German', 'Other'
}

export interface StreamData {
  categories: Category[];
  featured: Channel | null;
}

export interface SeriesDetailsData {
    info: {
        name: string;
        cover: string;
        plot: string;
        cast: string;
        director: string;
        genre: string;
        releaseDate: string;
        rating: string;
    };
    episodes: Record<string, SeriesEpisode[]>; // Keyed by season number
}

export interface SeriesEpisode {
    id: string;
    episode_num: string;
    title: string;
    container_extension: string;
    info: {
        duration: string;
    };
    season: number;
}

// Global Hls type definition for the CDN version
declare global {
  interface Window {
    Hls: any;
  }
}