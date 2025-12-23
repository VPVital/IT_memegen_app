
import React, { Component, useState, useRef, useEffect, ReactNode, ErrorInfo } from 'react';
import { Image, Columns, Zap, Sparkles, Terminal, Trash2, History, Skull, Dices, Bug } from 'lucide-react';
import { TabButton } from './components/TabButton';
import { MemeDisplay } from './components/MemeDisplay';
import { ComicDisplay } from './components/ComicDisplay';
import { TerminalLoader } from './components/TerminalLoader';
import { generateMemeText, generateImageFromPrompt, generateComicScript } from './services/geminiService';
import { GenerationType, MemeData, ComicData, COMIC_STYLES, ComicPanel } from './types';

interface ErrorBoundaryProps { children: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[QA-Crash]", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
          <Bug size={64} className="text-red-500 mb-6 animate-bounce" />
          <h1 className="text-3xl font-black text-white mb-2">CRITICAL_EXCEPTION</h1>
          <p className="text-red-400 font-mono mb-8 max-w-md">{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all">REBOOT SYSTEM</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const RANDOM_PROMPTS = [
  "Джун удалил базу данных на проде в пятницу",
  "Слияние веток в Git: 150 конфликтов",
  "CSS: попытка отцентровать div",
  "Когда код работает только на твоем ПК",
  "Правки в легаси коде от 2012 года",
  "Бесконечный ререндер в React",
  "Попытка выйти из Vim спустя неделю",
  "PM просит 'быструю фичу' за 5 минут до релиза"
];

function App() {
  const [activeTab, setActiveTab] = useState<GenerationType>(GenerationType.SINGLE);
  const [topic, setTopic] = useState('');
  const [selectedStyleId, setSelectedStyleId] = useState<string>(COMIC_STYLES[0].id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState('SYSTEM_IDLE');
  const [history, setHistory] = useState<any[]>([]);
  const [coolDown, setCoolDown] = useState(0);
  
  const resultsRef = useRef<HTMLDivElement>(null);
  const [currentMeme, setCurrentMeme] = useState<MemeData | null>(null);
  const [currentComic, setCurrentComic] = useState<ComicData | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('it-meme-history-v3');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem('it-meme-history-v3');
      }
    }
  }, []);

  const saveToHistory = (item: any) => {
    setHistory(prev => {
      const updated = [item, ...prev.filter(i => i.id !== item.id)].slice(0, 15);
      localStorage.setItem('it-meme-history-v3', JSON.stringify(updated));
      return updated;
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || isGenerating) return;

    setIsGenerating(true);
    setStatus('INITIALIZING...');
    resultsRef.current?.scrollIntoView({ behavior: 'smooth' });

    try {
      if (activeTab === GenerationType.SINGLE) {
        setCurrentMeme(null);
        setStatus('ANALYZING_HUMOR...');
        const textData = await generateMemeText(topic);
        setStatus('RENDERING_PIXELS...');
        const image = await generateImageFromPrompt(textData.visualPrompt + " viral meme style, high quality digital art");
        
        const res: MemeData = {
          id: Date.now().toString(),
          type: GenerationType.SINGLE,
          ...textData,
          imageUrl: image.imageUrl || 'https://placehold.co/800x600?text=Render_Error',
          isLoading: false,
          timestamp: Date.now()
        };
        setCurrentMeme(res);
        saveToHistory(res);
      } else {
        setStatus('COMIC_SCRIPTING...');
        const style = COMIC_STYLES.find(s => s.id === selectedStyleId) || COMIC_STYLES[0];
        const script = await generateComicScript(topic, 3);
        
        if (!script || !script.panels) throw new Error("INVALID_SCRIPT_DATA");

        const initialPanels: ComicPanel[] = script.panels.map(p => ({ ...p, imageUrl: undefined }));
        const comicId = Date.now().toString();
        
        const initialComic: ComicData = {
          id: comicId,
          type: GenerationType.COMIC,
          topic: script.topic || topic,
          panels: initialPanels,
          isLoading: true,
          styleLabel: style.label,
          timestamp: Date.now()
        };
        
        setCurrentComic(initialComic);
        setCurrentMeme(null);

        let accumulatedPanels = [...initialPanels];
        
        for (let i = 0; i < accumulatedPanels.length; i++) {
          setStatus(`PANEL_${i+1}_OF_${accumulatedPanels.length}...`);
          const isLast = i === accumulatedPanels.length - 1;
          
          const img = await generateImageFromPrompt(`${accumulatedPanels[i].description}. ${style.promptSuffix}`);
          const newImageUrl = img.imageUrl || `https://placehold.co/600x600?text=Panel_${i+1}_Failed`;
          
          // Atomic update of the panel to avoid partial render issues
          accumulatedPanels[i] = { ...accumulatedPanels[i], imageUrl: newImageUrl };
          
          const updatedComic: ComicData = {
            ...initialComic,
            panels: [...accumulatedPanels],
            isLoading: !isLast
          };

          setCurrentComic(updatedComic);

          if (isLast) {
            // Final settle update
            saveToHistory(updatedComic);
          } else {
            // Cooldown between panels to prevent rate limits and allow UI to breathe
            for (let s = 2; s > 0; s--) { 
              setCoolDown(s); 
              await new Promise(r => setTimeout(r, 1000)); 
            }
            setCoolDown(0);
          }
        }
      }
    } catch (err) {
      console.error("[QA-Global-Error]", err);
      setStatus('PROCESS_HALTED');
    } finally {
      // Delay disabling generation state to allow DOM transitions to finish
      setTimeout(() => {
        setIsGenerating(false);
        setStatus('SYSTEM_READY');
        setCoolDown(0);
      }, 500);
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans selection:bg-primary-500">
        <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-10 pointer-events-none fixed"></div>

        <header className="h-16 border-b border-gray-800 bg-gray-950/95 backdrop-blur sticky top-0 z-50 flex items-center px-6 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/20 border border-primary-500">
              <Terminal size={20} className="text-white" />
            </div>
            <h1 className="text-xl font-bold font-mono tracking-tighter cursor-default">IT_MEME_LAB</h1>
          </div>
          <div className="flex items-center gap-3 px-4 py-1.5 rounded-full border border-gray-800 bg-gray-900 font-mono text-[10px]">
            <span className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></span>
            <span className="text-gray-400">{status}</span>
            {coolDown > 0 && <span className="text-primary-400 ml-1">PAUSE: {coolDown}S</span>}
          </div>
        </header>

        <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <aside className="w-full lg:w-[400px] border-r border-gray-800 bg-gray-950/50 p-6 space-y-8 overflow-y-auto z-10">
            <div className="space-y-4">
              <div className="flex p-1 bg-gray-900 rounded-xl border border-gray-800">
                <TabButton active={activeTab === GenerationType.SINGLE} onClick={() => setActiveTab(GenerationType.SINGLE)} label="Мем" icon={<Image size={18} />} />
                <TabButton active={activeTab === GenerationType.COMIC} onClick={() => setActiveTab(GenerationType.COMIC)} label="Комикс" icon={<Columns size={18} />} />
              </div>

              <form onSubmit={handleGenerate} className="space-y-6">
                {activeTab === GenerationType.COMIC && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-gray-500 uppercase px-1">Стиль отрисовки</label>
                    <div className="relative">
                      <select value={selectedStyleId} onChange={(e) => setSelectedStyleId(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500 transition-all appearance-none cursor-pointer">
                        {COMIC_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                        <Zap size={14} />
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Тема шутки</label>
                    <button type="button" onClick={() => setTopic(RANDOM_PROMPTS[Math.floor(Math.random()*RANDOM_PROMPTS.length)])} className="text-[10px] text-primary-500 flex items-center gap-1 hover:text-primary-400 transition-colors"><Dices size={12} /> RANDOM</button>
                  </div>
                  <textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Опишите боль разработчика..." className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-4 text-sm focus:ring-2 focus:ring-primary-500 outline-none h-32 resize-none transition-all" maxLength={300} />
                </div>
                <button type="submit" disabled={isGenerating} className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all ${isGenerating ? 'bg-red-600/50 cursor-not-allowed opacity-70' : 'bg-primary-600 hover:bg-primary-500 shadow-lg shadow-primary-500/20'}`}>
                  {isGenerating ? <Skull size={20} className="animate-pulse" /> : <Zap size={20} />}
                  <span className="uppercase tracking-widest font-mono">{isGenerating ? 'Rendering...' : 'Execute_Build'}</span>
                </button>
              </form>
            </div>

            {history.length > 0 && (
              <div className="pt-8 border-t border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-mono text-gray-500 uppercase flex items-center gap-2"><History size={14} /> Buffer History</h3>
                  <button onClick={() => { if(confirm('Clear history?')) { setHistory([]); localStorage.removeItem('it-meme-history-v3'); } }} className="text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-all" title="Clear History"><Trash2 size={14} /></button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2 scrollbar-hide">
                  {history.map(item => (
                    <div key={item.id} onClick={() => item.type === GenerationType.SINGLE ? (setCurrentMeme(item), setActiveTab(GenerationType.SINGLE), setCurrentComic(null)) : (setCurrentComic(item), setActiveTab(GenerationType.COMIC), setCurrentMeme(null))} className="p-3 bg-gray-900/50 border border-gray-800 rounded-xl cursor-pointer hover:border-primary-500 transition-all flex items-center gap-3 group">
                      <span className="text-gray-600 group-hover:text-primary-500 transition-colors">{item.type === GenerationType.SINGLE ? <Image size={14} /> : <Columns size={14} />}</span>
                      <span className="text-[10px] truncate text-gray-400 font-mono flex-1 group-hover:text-gray-200">{item.type === GenerationType.SINGLE ? (item.topText || 'Meme') : (item.topic || 'Comic')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <section ref={resultsRef} className="flex-1 bg-gray-900/10 overflow-y-auto p-4 lg:p-12 flex flex-col items-center custom-scrollbar">
            {isGenerating && activeTab === GenerationType.SINGLE && !currentMeme && <TerminalLoader />}
            {activeTab === GenerationType.SINGLE && currentMeme && <MemeDisplay meme={currentMeme} />}
            {activeTab === GenerationType.COMIC && currentComic && <ComicDisplay comic={currentComic} />}
            {!currentMeme && !currentComic && !isGenerating && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-20">
                <Sparkles size={64} />
                <p className="font-mono text-sm tracking-widest uppercase">Null pointer exception: Input needed</p>
              </div>
            )}
          </section>
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;
