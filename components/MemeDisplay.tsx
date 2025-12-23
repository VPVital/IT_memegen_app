
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
    element.style.height = 'auto'; 
    element.style.height = `${element.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    adjustHeight(topInputRef.current);
    adjustHeight(bottomInputRef.current);
  }, [topText, bottomText]);

  const getDynamicFontSize = (text: string, baseSize: number) => {
    if (text.length > 100) return `${baseSize * 0.6}px`;
    if (text.length > 60) return `${baseSize * 0.8}px`;
    return `${baseSize}px`;
  };

  const capture = async () => {
    if (!memeRef.current) return null;
    return await html2canvas(memeRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      onclone: (doc) => {
        doc.querySelectorAll('textarea').forEach((ta) => {
          const div = doc.createElement('div');
          div.innerText = ta.value;
          const style = window.getComputedStyle(ta);
          div.style.font = style.font;
          div.style.fontSize = style.fontSize;
          div.style.fontWeight = style.fontWeight;
          div.style.color = style.color;
          div.style.padding = style.padding;
          div.style.textAlign = style.textAlign;
          div.style.whiteSpace = 'pre-wrap';
          div.style.wordBreak = 'break-word';
          div.style.lineHeight = style.lineHeight;
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
          const url = canvas.toDataURL();
          window.open(url, '_blank');
        }
      });
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-xl animate-fade-in pb-12">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-2 shadow-2xl overflow-hidden">
        <div ref={memeRef} className="bg-white rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="p-4 md:p-6 bg-white min-h-[80px] flex items-center">
            <textarea
              ref={topInputRef}
              value={topText}
              onChange={(e) => setTopText(e.target.value)}
              className="w-full bg-transparent text-left font-sans font-black text-black resize-none focus:outline-none leading-tight border-none overflow-hidden uppercase"
              style={{ fontSize: getDynamicFontSize(topText, 32) }}
              rows={1}
            />
          </div>
          
          <div className="bg-gray-50 flex justify-center border-y border-gray-100 min-h-[250px] items-center overflow-hidden">
            {meme.imageUrl ? (
              <img src={meme.imageUrl} alt="AI visual" className="w-full h-auto object-contain max-h-[500px]" crossOrigin="anonymous" />
            ) : (
              <div className="flex flex-col items-center gap-2 py-12">
                <AlertCircle className="text-gray-300 animate-pulse" size={48} />
                <span className="text-[10px] font-mono text-gray-400 uppercase">Awaiting_Visual_Stream</span>
              </div>
            )}
          </div>

          <div className="p-4 md:p-6 bg-white min-h-[60px] flex items-center">
            <textarea
              ref={bottomInputRef}
              value={bottomText}
              onChange={(e) => setBottomText(e.target.value)}
              className="w-full bg-transparent text-left font-sans font-bold text-gray-800 resize-none focus:outline-none leading-snug border-none overflow-hidden"
              style={{ fontSize: getDynamicFontSize(bottomText, 18) }}
              rows={1}
            />
          </div>
          
          <div className="px-5 pb-3 text-right bg-white">
            <span className="text-[8px] text-gray-300 font-mono tracking-tighter uppercase">IT_MEME_LAB // STABLE_EXPORT_V3</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={handleCopy} className="flex items-center justify-center gap-2 py-3.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold transition-all border border-gray-700 active:scale-95">
          {isCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
          <span className="uppercase text-xs font-mono">Copy_Raw</span>
        </button>
        <button onClick={handleDownload} disabled={isProcessing} className="flex items-center justify-center gap-2 py-3.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50 active:scale-95">
          {isProcessing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Download size={18} />}
          <span className="uppercase text-xs font-mono">Export_PNG</span>
        </button>
      </div>
    </div>
  );
};
