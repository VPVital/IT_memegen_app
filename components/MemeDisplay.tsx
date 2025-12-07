import React, { useRef, useState, useEffect } from 'react';
import { MemeData } from '../types';
import { Download, Copy, Check } from 'lucide-react';
// @ts-ignore
import html2canvas from 'html2canvas';

interface MemeDisplayProps {
  meme: MemeData;
}

export const MemeDisplay: React.FC<MemeDisplayProps> = ({ meme }) => {
  const memeRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  // Local state for editing text
  const [topText, setTopText] = useState(meme.topText);
  const [bottomText, setBottomText] = useState(meme.bottomText);

  // Sync state if prop changes (new generation)
  useEffect(() => {
    setTopText(meme.topText);
    setBottomText(meme.bottomText);
  }, [meme]);

  // Helper function to handle html2canvas capture with text preservation
  const generateCanvas = async (element: HTMLElement) => {
    return await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff', // Force white background for modern look
      logging: false,
      onclone: (clonedDoc) => {
        // Critical Fix: Replace textareas with divs in the cloned document.
        // Textareas often have scrollbars or fixed heights that html2canvas clips.
        // Divs will expand naturally to fit all text.
        const textAreas = clonedDoc.querySelectorAll('textarea');
        textAreas.forEach((textArea) => {
            const div = clonedDoc.createElement('div');
            div.innerText = textArea.value;
            
            // Copy computed styles to match appearance
            const computed = window.getComputedStyle(textArea);
            div.style.font = computed.font;
            div.style.fontFamily = computed.fontFamily;
            div.style.fontSize = computed.fontSize;
            div.style.fontWeight = computed.fontWeight;
            div.style.lineHeight = computed.lineHeight;
            div.style.textAlign = computed.textAlign;
            div.style.color = computed.color;
            div.style.padding = computed.padding;
            div.style.whiteSpace = 'pre-wrap'; // Preserve line breaks
            div.style.wordBreak = 'break-word';
            div.style.width = '100%';
            div.style.height = 'auto'; // Allow height to grow to fit text
            div.style.minHeight = computed.height; // Keep minimum height
            div.style.background = 'transparent';
            div.style.border = 'none';
            div.style.outline = 'none';
            div.style.overflow = 'visible';
            
            if (textArea.parentNode) {
                textArea.parentNode.replaceChild(div, textArea);
            }
        });
      }
    });
  };

  const handleDownload = async () => {
    if (!memeRef.current) return;
    setIsDownloading(true);
    try {
      const canvas = await generateCanvas(memeRef.current);
      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `it-meme-${Date.now()}.png`;
      link.click();
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopy = async () => {
    if (!memeRef.current) return;
    try {
      const canvas = await generateCanvas(memeRef.current);
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

  if (!meme.imageUrl) return null;

  return (
    <div className="flex flex-col gap-4 lg:gap-6 w-full max-w-xl animate-fade-in pb-12">
      
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-2 lg:p-3 shadow-2xl">
        {/* Wrapper for capture */}
        {/* Removed overflow-hidden to allow text areas to be fully captured even if they overflow visually during edit (though resize-y helps prevent that) */}
        <div 
          ref={memeRef} 
          className="relative group rounded-sm bg-white"
        >
          
          {/* Top Text Area (The Setup) */}
          <div className="p-4 lg:p-6 pb-2 bg-white">
             <textarea
              value={topText}
              onChange={(e) => setTopText(e.target.value)}
              className="w-full bg-transparent text-left text-xl md:text-3xl font-sans font-extrabold text-black resize-y focus:outline-none focus:bg-gray-50 rounded leading-tight border-none overflow-hidden"
              // Auto-resize height logic
              style={{ minHeight: '60px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
              }}
              rows={Math.max(2, topText.split('\n').length)}
              placeholder="Текст шутки..."
            />
          </div>

          {/* The Image Container */}
          <div className="relative w-full">
            <img 
              src={meme.imageUrl} 
              alt={meme.visualPrompt} 
              className="w-full h-auto object-cover"
              crossOrigin="anonymous" 
            />
          </div>
          
          {/* Bottom Text Area (The Punchline/Context) */}
           {bottomText && (
            <div className="px-4 lg:px-6 py-4 bg-white">
               <textarea
                value={bottomText}
                onChange={(e) => setBottomText(e.target.value)}
                className="w-full bg-transparent text-left text-base md:text-xl font-sans text-gray-700 resize-y focus:outline-none focus:bg-gray-50 rounded leading-tight border-none overflow-hidden"
                onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                }}
                rows={Math.max(1, bottomText.split('\n').length)}
                placeholder="Дополнительный текст..."
              />
            </div>
          )}

          {/* Watermark for branding */}
           <div className="px-4 pb-3 bg-white text-right">
              <span className="text-[10px] text-gray-400 font-mono">generated by IT_MemeGen</span>
           </div>

        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-center gap-3">
        <button 
          onClick={handleCopy}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition-all border border-gray-700 w-full sm:w-auto"
          title="Скопировать в буфер"
        >
          {isCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
          <span className="sm:hidden">Скопировать</span>
        </button>
        <button 
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-bold transition-all shadow-lg hover:shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed group w-full sm:w-auto"
        >
           {isDownloading ? (
             <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
             <Download size={18} className="group-hover:scale-110 transition-transform" />
          )}
          <span>{isDownloading ? 'Рендеринг...' : 'Скачать Мем'}</span>
        </button>
      </div>
    </div>
  );
};