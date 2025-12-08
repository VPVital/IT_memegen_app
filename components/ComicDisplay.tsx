import React, { useRef, useState, useEffect } from 'react';
import { ComicData } from '../types';
import { Download, Copy, Check, Pencil } from 'lucide-react';
// @ts-ignore
import html2canvas from 'html2canvas';

interface ComicDisplayProps {
  comic: ComicData;
}

const MAX_CAPTION_LENGTH = 120;

export const ComicDisplay: React.FC<ComicDisplayProps> = ({ comic }) => {
  const comicRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  // Local state for editing captions
  const [captions, setCaptions] = useState<string[]>([]);

  // Update captions ONLY when the comic ID changes or initial load.
  // This prevents overwriting user edits when images update (which changes the 'comic' object props).
  useEffect(() => {
    if (comic.panels.length > 0) {
      setCaptions(prev => {
         // If prev is empty (first load) or we switched to a new comic ID
         if (prev.length === 0 || prev.length !== comic.panels.length) {
             return comic.panels.map(p => p.caption);
         }
         return prev;
      });
    }
  }, [comic.id, comic.panels.length]);

  // Safety: If props update with new default captions (e.g. from history load), we might want to force update.
  const lastIdRef = useRef(comic.id);
  if (lastIdRef.current !== comic.id) {
     lastIdRef.current = comic.id;
     setCaptions(comic.panels.map(p => p.caption));
  }

  const handleCaptionChange = (index: number, newText: string) => {
    const newCaptions = [...captions];
    newCaptions[index] = newText;
    setCaptions(newCaptions);
  };

  // Helper function to handle html2canvas capture with text preservation
  const generateCanvas = async (element: HTMLElement) => {
    return await html2canvas(element, {
      scale: 2,
      backgroundColor: null,
      useCORS: true,
      logging: false,
      onclone: (clonedDoc) => {
        // Critical Fix for Textareas:
        // Replace textareas with divs in the cloned document so html2canvas renders full text.
        const textAreas = clonedDoc.querySelectorAll('textarea');
        textAreas.forEach((textArea) => {
            const div = clonedDoc.createElement('div');
            div.innerText = textArea.value;
            
            // Copy computed styles to match appearance exactly
            const computed = window.getComputedStyle(textArea);
            div.style.font = computed.font;
            div.style.fontFamily = computed.fontFamily;
            div.style.fontSize = computed.fontSize;
            div.style.fontWeight = computed.fontWeight;
            div.style.lineHeight = computed.lineHeight;
            div.style.textAlign = computed.textAlign;
            div.style.color = computed.color;
            div.style.padding = computed.padding;
            div.style.whiteSpace = 'pre-wrap';
            div.style.wordBreak = 'break-word';
            div.style.width = '100%';
            div.style.height = 'auto'; // Allow expansion
            div.style.minHeight = computed.height; // Maintain minimum layout size
            div.style.display = 'flex';
            div.style.alignItems = 'center'; // Center vertically like the textarea parent
            div.style.justifyContent = 'center';
            div.style.background = 'transparent';
            div.style.border = 'none';
            div.style.overflow = 'visible';
            
            if (textArea.parentNode) {
                // Ensure the parent container allows expansion if needed, or matches layout
                (textArea.parentNode as HTMLElement).style.height = 'auto';
                (textArea.parentNode as HTMLElement).style.minHeight = computed.height;
                textArea.parentNode.replaceChild(div, textArea);
            }
        });
      }
    });
  };

  const handleDownload = async () => {
    if (!comicRef.current) return;
    setIsDownloading(true);
    try {
      const canvas = await generateCanvas(comicRef.current);
      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `it-comic-${Date.now()}.png`;
      link.click();
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopy = async () => {
    if (!comicRef.current) return;
    try {
      const canvas = await generateCanvas(comicRef.current);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      });
    } catch (error) {
      console.error("Copy failed", error);
    }
  };

  if (comic.panels.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-4 animate-fade-in pb-4">
      
      <div className="flex items-center justify-end text-xs text-gray-500 font-mono mb-1 gap-1">
        <Pencil size={12} />
        Click text to edit
      </div>

      {/* The Comic Strip "Paper" */}
      <div ref={comicRef} className="bg-white p-2 lg:p-4 rounded-sm shadow-2xl border-2 border-gray-800">
        
        {/* Title within the strip */}
        <h3 className="text-base md:text-xl font-bold text-center text-black mb-3 uppercase tracking-widest font-meme border-b-4 border-black pb-2">
          {comic.topic}
        </h3>
        
        {/* Strip Grid - Single Column on Mobile */}
        <div className={`grid gap-0 grid-cols-1 sm:grid-cols-3 border-4 border-black`}>
          {comic.panels.map((panel, idx) => (
            <div key={idx} className="flex flex-col relative group border-b-4 sm:border-b-0 sm:border-r-4 border-black last:border-0 sm:last:border-r-0">
              {/* Image Area */}
              <div className="relative aspect-square bg-gray-100 overflow-hidden">
                {panel.imageUrl ? (
                  <img 
                    src={panel.imageUrl} 
                    alt={panel.description} 
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400 p-4 font-mono">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin mb-2"></div>
                    <span className="text-[10px]">render_pass_{idx}.png</span>
                  </div>
                )}
                 <div className="absolute top-2 left-2 bg-black text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full z-10 shadow-md">
                  {idx + 1}
                </div>
              </div>
              
              {/* Editable Caption Area */}
              <div className="p-2 bg-white h-[70px] sm:h-[90px] flex items-center justify-center border-t-4 border-black relative group-hover:bg-gray-50 transition-colors">
                <textarea
                  aria-label={`Текст панели ${idx + 1}`}
                  value={captions[idx] || ""}
                  onChange={(e) => handleCaptionChange(idx, e.target.value)}
                  maxLength={MAX_CAPTION_LENGTH}
                  className="w-full h-full text-black font-sans text-xs sm:text-[10px] leading-snug text-center font-medium bg-transparent resize-none focus:outline-none focus:bg-yellow-50 p-1 rounded scrollbar-hide"
                  rows={4}
                />
                 <div className={`absolute bottom-1 right-1 text-[8px] font-mono opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 px-1 rounded pointer-events-none ${ (captions[idx]?.length || 0) > MAX_CAPTION_LENGTH * 0.9 ? 'text-red-500 opacity-100' : 'text-gray-400' }`}>
                   {(captions[idx]?.length || 0)}/{MAX_CAPTION_LENGTH}
                 </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-2 text-right flex justify-between items-end">
           <span className="text-black text-[9px] font-mono opacity-40">Style: {comic.styleLabel}</span>
           <span className="text-black text-[9px] font-mono opacity-40">generated by it-memegen</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-center gap-3">
        <button 
          onClick={handleCopy}
          aria-label="Скопировать изображение"
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition-all border border-gray-700 w-full sm:w-auto"
          title="Copy to Clipboard"
        >
          {isCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
          <span className="sm:hidden">Скопировать</span>
        </button>
        <button 
          onClick={handleDownload}
          aria-label="Скачать изображение"
          disabled={isDownloading}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-bold transition-all shadow-lg hover:shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-sm w-full sm:w-auto"
        >
          {isDownloading ? (
             <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
             <Download size={16} />
          )}
          <span>{isDownloading ? 'Сохранение...' : 'Скачать Стрип'}</span>
        </button>
      </div>
    </div>
  );
};