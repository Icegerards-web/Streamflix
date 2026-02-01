export interface Channel {
  id: string;
  name: string;
  logo?: string;
  group?: string;
  url: string;
  language?: string; // inferred
  contentType: 'live' | 'movie' | 'series';
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

// Global Hls type definition for the CDN version
declare global {
  interface Window {
    Hls: any;
  }
}