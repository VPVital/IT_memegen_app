
import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { MemeData } from '../types';
import { Download, Copy, Check, Zap } from 'lucide-react';
// @ts-ignore
import html2canvas from 'html2canvas';

interface MemeDisplayProps {
  meme: MemeData;
}

export const MemeDisplay: React.FC<MemeDisplayProps> = ({ meme }) => {
  const memeRef = useRef<HTMLDivElement>(null);
  const topInputRef = useRef<HTMLTextAreaElement>(null);
  const bottomInputRef = useRef<HTMLTextAreaElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [topText, setTopText] = useState(meme.topText);
  const [bottomText, setBottomText] = useState(meme.bottomText);

  useEffect(() => {
    setTopText(meme.topText);
    setBottomText(meme.bottomText);
  }, [meme]);

  const adjustHeight = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = 'auto'; 
    element.style.height = `${element.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    adjustHeight(topInputRef.current);
    adjustHeight(bottomInputRef.current);
  }, [topText, bottomText]);

  const getDynamicFontSize = (text: string, isTop: boolean) => {
    const len = text.length;
    const baseSize = isTop ? 48 : 36;
    if (len > 100) return `${baseSize * 0.5}px`;
    if (len > 60) return `${baseSize * 0.7}px`;
    if (len > 30) return `${baseSize * 0.85}px`;
    return `${baseSize}px`;
  };

  const capture = async () => {
    if (!memeRef.current) return null;
    
    // Ensure all images are loaded
    const images = memeRef.current.getElementsByTagName('img');
    // Fix: Explicitly cast elements in Array.from to HTMLImageElement to avoid 'unknown' type errors during build
    await Promise.all(Array.from(images as HTMLCollectionOf<HTMLImageElement>).map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
    }));

    return await html2canvas(memeRef.current, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#000000',
      logging: false,
      onclone: (doc) => {
        doc.querySelectorAll('textarea').forEach((ta) => {
          const div = doc.createElement('div');
          div.innerText = (ta as HTMLTextAreaElement).value;
          const style = window.getComputedStyle(ta);
          div.style.font = style.font;
          div.style.fontFamily = "'Anton', 'Impact', sans-serif";
          div.style.fontSize = style.fontSize;
          div.style.fontWeight = style.fontWeight;
          div.style.color = 'white';
          div.style.padding = style.padding;
          div.style.textAlign = 'center';
          div.style.whiteSpace = 'pre-wrap';
          div.style.wordBreak = 'break-word';
          div.style.lineHeight = '1.1';
          div.style.display = 'block';
          div.style.width = '100%';
          div.style.textShadow = '4px 4px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000';
          div.style.textTransform = 'uppercase';
          ta.parentNode?.replaceChild(div, ta);
        });
      }
    });
  };

  const handleDownload = async () => {
    setIsProcessing(true);
    try {
      const canvas = await capture();
      if (canvas) {
        const link = document.createElement('a');
        link.download = `it-meme-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } catch (e) {
      console.error("[QA-Export-Fail]", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async () => {
    const canvas = await capture();
    if (canvas) {
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
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-xl animate-fade-in pb-12">
      <div className="bg-gray-950 border border-gray-800 rounded-3xl p-3 shadow-2xl shadow-black overflow-hidden">
        {/* memeRef encompasses EVERYTHING to ensure nothing is cut off during capture */}
        <div ref={memeRef} className="bg-black rounded-2xl overflow-hidden shadow-sm flex flex-col">
          
          {/* Top Text Block - Stacked, not absolute */}
          <div className="p-6 pb-2 min-h-[80px] flex items-center justify-center">
            <textarea
              ref={topInputRef}
              value={topText}
              onChange={(e) => setTopText(e.target.value)}
              className="w-full bg-transparent text-center meme-text resize-none focus:outline-none border-none overflow-hidden transition-all placeholder:opacity-20"
              style={{ fontSize: getDynamicFontSize(topText, true) }}
              rows={1}
              spellCheck={false}
              placeholder="TOP_TEXT"
            />
          </div>
          
          <div className="bg-black flex justify-center items-center min-h-[300px] overflow-hidden">
            {meme.imageUrl ? (
              <img 
                src={meme.imageUrl} 
                alt="Meme visual" 
                className="w-full h-auto object-contain max-h-[600px] animate-fade-in" 
                crossOrigin="anonymous" 
              />
            ) : (
              <div className="flex flex-col items-center gap-4 py-24">
                <Zap className="text-primary-500 animate-bounce" size={48} />
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Compiling_Pixels...</span>
              </div>
            )}
          </div>

          {/* Bottom Text Block - Stacked. Guaranteed to display fully. */}
          <div className="p-6 pt-2 min-h-[80px] flex items-center justify-center">
            <textarea
              ref={bottomInputRef}
              value={bottomText}
              onChange={(e) => setBottomText(e.target.value)}
              className="w-full bg-transparent text-center meme-text resize-none focus:outline-none border-none overflow-hidden transition-all placeholder:opacity-20"
              style={{ fontSize: getDynamicFontSize(bottomText, false) }}
              rows={1}
              spellCheck={false}
              placeholder="BOTTOM_TEXT"
            />
          </div>
          
          <div className="pb-3 pr-5 text-right opacity-30">
            <span className="text-[7px] text-white font-mono tracking-widest uppercase">IT_MEME_LAB_v4.5</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button onClick={handleCopy} className="flex items-center justify-center gap-2 py-4 bg-gray-900 hover:bg-gray-800 text-white rounded-2xl font-bold transition-all border border-gray-800 active:scale-95 text-[10px] font-mono uppercase tracking-widest">
          {isCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
          {isCopied ? 'Buffer_Saved' : 'Copy_to_Buffer'}
        </button>
        <button onClick={handleDownload} disabled={isProcessing} className="flex items-center justify-center gap-3 py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-primary-600/20 disabled:opacity-50 active:scale-95 text-[10px] font-mono uppercase tracking-widest">
          {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Download size={16} />}
          Export_PNG
        </button>
      </div>
    </div>
  );
};
