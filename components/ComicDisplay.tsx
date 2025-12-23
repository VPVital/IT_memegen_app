
import React, { useRef, useState, useEffect, useMemo } from 'react';
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
  
  const [captions, setCaptions] = useState<string[]>([]);

  useEffect(() => {
    if (comic && Array.isArray(comic.panels)) {
      setCaptions(comic.panels.map(p => p.caption || ""));
    }
  }, [comic?.id]);

  const handleCaptionChange = (index: number, newText: string) => {
    setCaptions(prev => {
      const next = [...prev];
      if (index >= 0 && index < next.length) {
        next[index] = newText;
      }
      return next;
    });
  };

  const getPanelFontSize = (text: string) => {
    if (text.length > 80) return '9px';
    if (text.length > 50) return '10px';
    return '11px';
  };

  const generateCanvas = async (element: HTMLElement) => {
    return await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll('textarea').forEach((textArea) => {
            const div = clonedDoc.createElement('div');
            div.innerText = (textArea as HTMLTextAreaElement).value;
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
            div.style.height = 'auto';
            div.style.minHeight = computed.height;
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'center';
            div.style.background = 'transparent';
            if (textArea.parentNode) {
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
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `it-comic-${Date.now()}.png`;
      link.click();
    } catch (error) {
      console.error("[QA-Export-Error]", error);
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
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        } catch (e) {
          const url = canvas.toDataURL();
          window.open(url, '_blank');
        }
      });
    } catch (error) {
      console.error("Copy failed", error);
    }
  };

  if (!comic || !Array.isArray(comic.panels) || comic.panels.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-4 animate-fade-in pb-12 items-center">
      
      <div className="w-full flex items-center justify-end text-[10px] text-gray-500 font-mono mb-1 gap-1 uppercase tracking-tighter opacity-50 max-w-4xl">
        <Pencil size={10} />
        safe_render_enabled
      </div>

      <div ref={comicRef} className="bg-white p-4 md:p-6 rounded-sm shadow-2xl border border-gray-200 w-full max-w-4xl flex flex-col">
        <div className="min-h-[60px] flex items-center justify-center border-b-4 border-black mb-6">
          <h3 className="text-xl md:text-2xl font-black text-center text-black uppercase tracking-tighter font-mono px-2 py-1 leading-none">
            {comic.topic || "IT_UNIVERSE_LOG"}
          </h3>
        </div>
        
        <div className="grid gap-0 grid-cols-1 md:grid-cols-3 border-4 border-black bg-black">
          {comic.panels.map((panel, idx) => (
            <div 
              key={`${comic.id}-panel-static-${idx}`} 
              className="flex flex-col border-b-4 md:border-b-0 md:border-r-4 border-black last:border-0 overflow-hidden bg-white"
            >
              <div className="relative aspect-square bg-gray-50 overflow-hidden">
                {panel.imageUrl ? (
                  <img 
                    src={panel.imageUrl} 
                    alt={panel.description} 
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 p-4">
                    <div className="w-8 h-8 border-4 border-gray-100 border-t-primary-500 rounded-full animate-spin mb-3"></div>
                    <span className="text-[9px] font-mono font-bold uppercase animate-pulse">Sync_In_Progress...</span>
                  </div>
                )}
                 <div className="absolute top-2 left-2 bg-black text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-none z-10 shadow-lg">
                  {idx + 1}
                </div>
              </div>
              
              <div className="p-3 bg-white h-[85px] flex items-center justify-center border-t-4 border-black">
                <textarea
                  value={captions[idx] ?? panel.caption ?? ""}
                  onChange={(e) => handleCaptionChange(idx, e.target.value)}
                  maxLength={MAX_CAPTION_LENGTH}
                  className="w-full h-full text-black font-mono leading-tight text-center font-black bg-transparent resize-none focus:outline-none focus:bg-yellow-50 p-1 transition-colors overflow-hidden uppercase"
                  style={{ fontSize: getPanelFontSize(captions[idx] || panel.caption || "") }}
                  placeholder="..."
                />
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-4 flex justify-between items-center px-1">
           <span className="text-black text-[8px] font-mono font-black uppercase opacity-40">STYLE: {comic.styleLabel}</span>
           <span className="text-black text-[8px] font-mono font-black uppercase opacity-40 tracking-widest">IT_MEME_LAB // PRODUCTION_BUILD_STABLE</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-4xl">
        <button onClick={handleCopy} className="flex items-center justify-center gap-3 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold transition-all border border-gray-700 text-xs shadow-xl active:scale-95">
          {isCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
          <span className="font-mono uppercase tracking-widest">Copy_Buffer</span>
        </button>
        <button onClick={handleDownload} disabled={isDownloading || comic.isLoading} className="flex items-center justify-center gap-3 py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-bold transition-all shadow-xl disabled:opacity-30 active:scale-95">
          {isDownloading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Download size={16} />}
          <span className="font-mono uppercase tracking-widest">Export_Strip</span>
        </button>
      </div>
    </div>
  );
};
