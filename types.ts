export enum GenerationType {
  SINGLE = 'SINGLE',
  COMIC = 'COMIC'
}

export interface MemeData {
  id: string;
  type: GenerationType.SINGLE;
  visualPrompt: string;
  topText: string;
  bottomText: string;
  imageUrl?: string;
  isLoading: boolean;
  timestamp: number;
}

export interface ComicPanel {
  panelNumber: number;
  description: string;
  caption: string;
  imageUrl?: string;
}

export interface ComicData {
  id: string;
  type: GenerationType.COMIC;
  topic: string;
  panels: ComicPanel[];
  isLoading: boolean;
  styleLabel: string;
  timestamp: number;
}

export interface GenerationRequest {
  topic: string;
  type: GenerationType;
  panelCount?: number;
}

export interface ComicStyle {
  id: string;
  label: string;
  promptSuffix: string;
}

export const COMIC_STYLES: ComicStyle[] = [
  {
    id: 'stick',
    label: 'Stick Figure (xkcd style)',
    promptSuffix: 'art style: simple minimalist stick figure, black and white line art, funny webcomic style, white background, rough sketching.'
  },
  {
    id: 'marvel',
    label: 'Marvel / Superhero',
    promptSuffix: 'art style: classic marvel superhero comic book, detailed anatomy, dynamic action poses, dramatic lighting, vibrant colors, jack kirby style, inked outlines, cinematic composition.'
  },
  {
    id: 'cheburashka',
    label: 'Soyuzmultfilm / Cheburashka',
    promptSuffix: 'art style: soviet cartoon animation style, stop motion puppet aesthetic, fuzzy textures, soft warm colors, cute characters, whimsical atmosphere, soyuzmultfilm style, nostalgic.'
  },
  {
    id: 'pixel',
    label: '8-Bit / Pixel Art',
    promptSuffix: 'art style: 8-bit pixel art, retro video game style, vibrant colors, blocky details, arcade aesthetic.'
  },
  {
    id: 'vintage',
    label: 'Vintage Comic Book',
    promptSuffix: 'art style: vintage american comic book, halftone dots (ben-day dots), bold thick outlines, retro color palette, pop art style.'
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk / Neon',
    promptSuffix: 'art style: cyberpunk digital art, neon green and purple lighting, dark hacker room background, futuristic ui elements, detailed anime style.'
  },
  {
    id: 'corp',
    label: 'Corporate Flat Art',
    promptSuffix: 'art style: corporate memphis, flat vector art, exaggerated proportions, solid bright colors, minimalist tech startup illustration style.'
  },
  {
    id: 'noir',
    label: 'Tech Noir / Sin City',
    promptSuffix: 'art style: film noir graphic novel, high contrast black and white with one accent color (red), dramatic shadows, gritty atmosphere.'
  }
];