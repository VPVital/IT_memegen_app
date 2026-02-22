
import React, { useRef, useState, useEffect } from 'react';
import { ComicData } from '../types';
import { Download, Copy, Check, Pencil, Share2 } from 'lucide-react';
// @ts-ignore
import html2canvas from 'html2canvas';

interface ComicDisplayProps {
  comic: ComicData;
}

const MAX_CAPTION_LENGTH = 140;

export const ComicDisplay: React.FC<ComicDisplayProps> = ({ comic }) => {
  const comicRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  const [captions, setCaptions] = useState<string[]>([]);

  useEffect(() => {
    if (comic?.panels) {
      setCaptions(comic.panels.map(p => p.caption || ""));
    }
  }, [comic?.id, comic?.panels]);

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
    const len = text.length;
    if (len > 100) return '9px';
    if (len > 60) return '11px';
    return '13px';
  };

  const generateCanvas = async (element: HTMLElement) => {
    // Wait for images to be decoded before capture
    const images = Array.from(element.getElementsByTagName('img'));
    await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(r => img.onload = r)));

    return await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll('textarea').forEach((textArea) => {
            const div = clonedDoc.createElement('div');
            const ta = textArea as HTMLTextAreaElement;
            div.innerText = ta.value;
            const computed = window.getComputedStyle(textArea);
            div.style.font = computed.font;
            div.style.fontFamily = "'Courier New', Courier, monospace";
            div.style.fontSize = computed.fontSize;
            div.style.fontWeight = "900";
            div.style.lineHeight = "1.2";
            div.style.textAlign = "center";
            div.style.color = "#000000";
            div.style.padding = computed.padding;
            div.style.whiteSpace = 'pre-wrap';
            div.style.wordBreak = 'break-word';
            div.style.width = '100%';
            div.style.height = 'auto';
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
    if (!comicRef.current || isDownloading) return;
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
    if (!comicRef.current || isCopied) return;
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

  const handleShare = async () => {
    if (!comicRef.current) return;
    const canvas = await generateCanvas(comicRef.current);
    if (canvas && navigator.share) {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `it-comic-${Date.now()}.png`, { type: 'image/png' });
        try {
          await navigator.share({
            files: [file],
            title: 'IT Comic',
            text: 'Check out this IT comic I generated!',
          });
        } catch (e) {
          console.error("Share failed", e);
        }
      });
    } else {
      handleCopy();
    }
  };

  if (!comic?.panels || comic.panels.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-6 animate-fade-in pb-16 items-center">
      
      <div className="w-full flex items-center justify-end text-[10px] text-gray-600 font-mono mb-1 gap-1 uppercase tracking-tighter opacity-40 max-w-4xl">
        <Pencil size={10} />
        panel_count: {comic.panels.length} // buffer_stable
      </div>

      <div ref={comicRef} className="bg-white p-6 rounded-none shadow-[20px_20px_0_rgba(0,0,0,0.3)] border-[6px] border-black w-full max-w-4xl flex flex-col">
        <div className="min-h-[70px] flex items-center justify-center border-b-[6px] border-black mb-6 bg-black">
          <h3 className="text-2xl md:text-3xl font-black text-center text-white uppercase tracking-tighter font-mono px-4 py-2 leading-none">
            {comic.topic || "SYS_LOG_HUMOR"}
          </h3>
        </div>
        
        <div className="grid gap-0 grid-cols-1 md:grid-cols-3 border-[6px] border-black bg-black">
          {comic.panels.map((panel, idx) => (
            <div 
              key={`comic-${comic.id}-panel-${idx}`} 
              className="flex flex-col border-b-[6px] md:border-b-0 md:border-r-[6px] border-black last:border-0 overflow-hidden bg-white"
            >
              <div className="relative aspect-square bg-gray-100 overflow-hidden">
                {panel.imageUrl ? (
                  <img 
                    src={panel.imageUrl} 
                    alt={panel.description} 
                    className="w-full h-full object-cover animate-fade-in"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 p-6 text-center">
                    <div className="w-10 h-10 border-4 border-gray-200 border-t-primary-500 rounded-full animate-spin mb-4"></div>
                    <span className="text-[10px] font-mono font-black uppercase animate-pulse">Rendering_P{idx + 1}...</span>
                  </div>
                )}
                 <div className="absolute top-0 left-0 bg-black text-white text-[12px] font-black w-8 h-8 flex items-center justify-center rounded-none z-10">
                  0{idx + 1}
                </div>
              </div>
              
              <div className="p-4 bg-white h-[110px] flex items-center justify-center border-t-[6px] border-black">
                <textarea
                  value={captions[idx] ?? panel.caption ?? ""}
                  onChange={(e) => handleCaptionChange(idx, e.target.value)}
                  maxLength={MAX_CAPTION_LENGTH}
                  className="w-full h-full text-black font-mono leading-tight text-center font-black bg-transparent resize-none focus:outline-none focus:bg-primary-50 p-1 transition-colors overflow-hidden uppercase"
                  style={{ fontSize: getPanelFontSize(captions[idx] || panel.caption || "") }}
                  placeholder="..."
                  spellCheck={false}
                />
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-6 flex justify-between items-center px-1">
           <span className="text-black text-[10px] font-mono font-black uppercase opacity-60">STYLE: {comic.styleLabel}</span>
           <span className="text-black text-[10px] font-mono font-black uppercase opacity-60 tracking-widest">BUILD_0.4.6_COMIC_STRIP</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 w-full max-w-4xl">
        <button onClick={handleCopy} className="flex items-center justify-center gap-3 py-5 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-bold transition-all border border-gray-700 text-xs shadow-2xl active:scale-[0.98]">
          {isCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
          <span className="font-mono uppercase tracking-widest">Copy</span>
        </button>
        <button onClick={handleShare} className="flex items-center justify-center gap-3 py-5 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-bold transition-all border border-gray-700 text-xs shadow-2xl active:scale-[0.98]">
          <Share2 size={18} />
          <span className="font-mono uppercase tracking-widest">Share</span>
        </button>
        <button onClick={handleDownload} disabled={isDownloading || comic.isLoading} className="flex items-center justify-center gap-3 py-5 bg-primary-600 hover:bg-primary-500 text-white rounded-2xl font-bold transition-all shadow-2xl shadow-primary-600/20 disabled:opacity-30 active:scale-[0.98]">
          {isDownloading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Download size={18} />}
          <span className="font-mono uppercase tracking-widest">Export</span>
        </button>
      </div>
    </div>
  );
};
