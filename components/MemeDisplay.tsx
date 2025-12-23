
import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { MemeData } from '../types';
import { Download, Copy, Check, AlertCircle } from 'lucide-react';
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
    element.style.height = '0px'; 
    const scrollHeight = element.scrollHeight;
    element.style.height = `${scrollHeight}px`;
  };

  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      adjustHeight(topInputRef.current);
      adjustHeight(bottomInputRef.current);
    }, 10);
    return () => clearTimeout(timer);
  }, [topText, bottomText]);

  const capture = async () => {
    if (!memeRef.current) return null;
    return await html2canvas(memeRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      onclone: (doc) => {
        // Convert textareas to divs for high-quality export
        doc.querySelectorAll('textarea').forEach((ta) => {
          const div = doc.createElement('div');
          div.innerText = ta.value;
          const style = window.getComputedStyle(ta);
          div.style.font = style.font;
          div.style.fontSize = style.fontSize;
          div.style.fontWeight = style.fontWeight;
          div.style.color = style.color;
          div.style.padding = style.padding;
          div.style.whiteSpace = 'pre-wrap';
          div.style.wordBreak = 'break-word';
          ta.parentNode?.replaceChild(div, ta);
        });
      }
    });
  };

  const handleDownload = async () => {
    setIsProcessing(true);
    const canvas = await capture();
    if (canvas) {
      const link = document.createElement('a');
      link.download = `meme-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
    setIsProcessing(false);
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
          // Fallback if Clipboard API restricted
          const url = canvas.toDataURL();
          window.open(url, '_blank');
        }
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-xl animate-fade-in pb-12">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-2 shadow-2xl overflow-hidden ring-1 ring-white/5">
        <div ref={memeRef} className="bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="p-5">
            <textarea
              ref={topInputRef}
              value={topText}
              onChange={(e) => setTopText(e.target.value)}
              className="w-full bg-transparent text-left text-2xl md:text-3xl font-sans font-black text-black resize-none focus:outline-none leading-tight border-none overflow-hidden"
              rows={1}
            />
          </div>
          
          <div className="bg-gray-100 flex justify-center border-y border-gray-100 min-h-[300px] items-center">
            {meme.imageUrl ? (
              <img src={meme.imageUrl} alt="AI visual" className="w-full h-auto object-contain max-h-[500px]" crossOrigin="anonymous" />
            ) : (
              <AlertCircle className="text-gray-300" size={48} />
            )}
          </div>

          <div className="p-5">
            <textarea
              ref={bottomInputRef}
              value={bottomText}
              onChange={(e) => setBottomText(e.target.value)}
              className="w-full bg-transparent text-left text-lg md:text-xl font-sans font-bold text-gray-700 resize-none focus:outline-none leading-snug border-none overflow-hidden"
              rows={1}
            />
          </div>
          
          <div className="px-5 pb-3 text-right bg-white">
            <span className="text-[10px] text-gray-400 font-mono tracking-widest uppercase opacity-60">IT_MEME_LAB_DEBUG_MODE</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={handleCopy} className="flex items-center justify-center gap-2 py-3.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold transition-all border border-gray-700">
          {isCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
          <span>Копировать</span>
        </button>
        <button onClick={handleDownload} disabled={isProcessing} className="flex items-center justify-center gap-2 py-3.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50">
          {isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Download size={18} />}
          <span>Скачать PNG</span>
        </button>
      </div>
    </div>
  );
};
