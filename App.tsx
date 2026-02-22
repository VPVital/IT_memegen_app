
import React, { Component, useState, useRef, useEffect, ReactNode, ErrorInfo } from 'react';
import { Image, Columns, Zap, Sparkles, Terminal, Trash2, History, Skull, Dices, Bug, AlertTriangle } from 'lucide-react';
import { TabButton } from './components/TabButton';
import { MemeDisplay } from './components/MemeDisplay';
import { ComicDisplay } from './components/ComicDisplay';
import { TerminalLoader } from './components/TerminalLoader';
import { generateMemeText, generateImageFromPrompt, generateComicScript, generateTrendingTopic } from './services/geminiService';
import { GenerationType, MemeData, ComicData, COMIC_STYLES, ComicPanel } from './types';

interface ErrorBoundaryProps { children?: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

// Use React.Component and explicit state property declaration to resolve "Property does not exist" errors in strict TS environments.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  
  componentDidCatch(error: Error, info: ErrorInfo) { 
    console.error("[QA-Critical-Crash]", error, info); 
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
          <Bug size={64} className="text-red-500 mb-6 animate-bounce" />
          <h1 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase font-mono">Kernel_Panic</h1>
          <p className="text-red-400 font-mono mb-8 max-w-md opacity-70">
            {this.state.error?.name === 'QuotaExceededError' 
              ? "Storage full: History cannot be saved. Please wipe history." 
              : `Error: ${this.state.error?.message || "Memory Overload"}`}
          </p>
          <button onClick={() => {
            localStorage.removeItem('it-meme-history-v3');
            window.location.reload();
          }} className="px-10 py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-primary-600/20 uppercase tracking-widest text-sm">
            Wipe_History_&_Restart
          </button>
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
  const [terminalLogs, setTerminalLogs] = useState<string[]>(['> BIOS v4.5 initialized', '> Waiting for user input...']);
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
    // We delay the save to ensure UI rendering is complete
    setTimeout(() => {
      setHistory(prev => {
        const filtered = prev.filter(i => i.id !== item.id);
        // CRITICAL: 5 items limit to stay within 5MB localStorage limit
        const updated = [item, ...filtered].slice(0, 5); 
        
        try {
          localStorage.setItem('it-meme-history-v3', JSON.stringify(updated));
        } catch (e) {
          console.warn("[QA-Storage] LocalStorage limit reached. Cleaning history...");
          // If quota exceeded, try saving just the current item or clear history
          const reduced = [item];
          try {
             localStorage.setItem('it-meme-history-v3', JSON.stringify(reduced));
          } catch (innerE) {
             localStorage.removeItem('it-meme-history-v3');
          }
        }
        return updated;
      });
    }, 1500); 
  };

  const addLog = (msg: string) => {
    setTerminalLogs(prev => [...prev.slice(-4), `> ${msg}`]);
  };

  const handleTrendingTopic = async () => {
    setIsGenerating(true);
    setStatus('FETCHING_TRENDS...');
    addLog('Accessing global developer trends...');
    try {
      const newTopic = await generateTrendingTopic();
      setTopic(newTopic);
      addLog(`New topic acquired: ${newTopic}`);
    } catch (e) {
      addLog('Failed to fetch trends. Using local cache.');
    } finally {
      setIsGenerating(false);
      setStatus('SYSTEM_IDLE');
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || isGenerating) return;

    setIsGenerating(true);
    setTerminalLogs([]);
    addLog(`Initializing generation for: ${topic}`);
    setStatus('INITIALIZING...');
    resultsRef.current?.scrollIntoView({ behavior: 'smooth' });

    try {
      if (activeTab === GenerationType.SINGLE) {
        setCurrentMeme(null);
        setCurrentComic(null);
        setStatus('ANALYZING_HUMOR...');
        addLog('Running humor analysis algorithms...');
        const textData = await generateMemeText(topic);
        addLog('Text script generated successfully.');
        setStatus('RENDERING_PIXELS...');
        addLog('Synthesizing visual components...');
        const image = await generateImageFromPrompt(textData.visualPrompt + " high quality technical meme style");
        
        if (image.isQuotaError) {
          addLog('CRITICAL: API Quota exceeded.');
          setStatus('LIMIT_REACHED');
          throw new Error("Лимит API. Подождите 1 минуту.");
        }

        addLog('Meme rendering complete.');

        const res: MemeData = {
          id: Date.now().toString(),
          ...textData,
          imageUrl: image.imageUrl || 'https://placehold.co/800x600?text=Render_Error',
          isLoading: false,
          timestamp: Date.now()
        };
        setCurrentMeme(res);
        saveToHistory(res);
      } else {
        setStatus('COMIC_SCRIPTING...');
        addLog('Drafting multi-panel scenario...');
        setCurrentMeme(null);
        setCurrentComic(null);
        
        const style = COMIC_STYLES.find(s => s.id === selectedStyleId) || COMIC_STYLES[0];
        const script = await generateComicScript(topic, 3);
        
        if (!script.panels || script.panels.length === 0) {
          addLog('ERROR: Script compilation failed.');
          throw new Error("Не удалось создать сценарий.");
        }

        addLog(`Script ready. Style: ${style.label}`);
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

        let accumulatedPanels = [...initialPanels];
        
        for (let i = 0; i < accumulatedPanels.length; i++) {
          setStatus(`RENDERING_PANEL_${i+1}_OF_3...`);
          addLog(`Rendering panel ${i+1}/3...`);
          const img = await generateImageFromPrompt(`${accumulatedPanels[i].description}. ${style.promptSuffix}`);
          
          if (img.isQuotaError) {
             addLog('CRITICAL: Image API limit reached.');
             setStatus('QUOTA_LIMIT');
             setCurrentComic(prev => prev ? {...prev, isLoading: false} : null);
             throw new Error("Лимит запросов API. Пауза 60с.");
          }

          accumulatedPanels[i] = { 
            ...accumulatedPanels[i], 
            imageUrl: img.imageUrl || `https://placehold.co/600x600?text=Error_P${i+1}` 
          };
          
          const isLast = i === accumulatedPanels.length - 1;
          const updatedComic: ComicData = {
            ...initialComic,
            panels: [...accumulatedPanels],
            isLoading: !isLast
          };

          // Individual step updates
          setCurrentComic(updatedComic);

          if (!isLast) {
            addLog('Throttling for API stability...');
            for (let s = 5; s > 0; s--) { 
              setCoolDown(s); 
              await new Promise(r => setTimeout(r, 1000)); 
            }
            setCoolDown(0);
          } else {
            addLog('Comic strip finalized.');
            // Final stability pause before any storage operations
            await new Promise(r => setTimeout(r, 800));
            saveToHistory(updatedComic);
          }
        }
      }
    } catch (err: any) {
      console.error("[QA-Engine-Failure]", err);
      setStatus('BUILD_FAILED');
      alert(err.message || "Ошибка системы генерации.");
    } finally {
      setIsGenerating(false);
      setCoolDown(0);
      setStatus('SYSTEM_IDLE');
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans selection:bg-primary-500/30">
        <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-10 pointer-events-none fixed"></div>

        <header className="h-16 border-b border-gray-800 bg-gray-950/95 backdrop-blur-xl sticky top-0 z-50 flex items-center px-6 justify-between">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center shadow-lg shadow-primary-600/20 border border-primary-400/20">
              <Terminal size={18} className="text-white" />
            </div>
            <h1 className="text-lg font-black font-mono tracking-tighter uppercase">IT_MEME_LAB</h1>
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-gray-900 border border-gray-800 rounded-full">
               <span className={`w-1.5 h-1.5 rounded-full ${isGenerating ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></span>
               <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{status}</span>
             </div>
             {coolDown > 0 && <span className="text-primary-400 font-mono text-[10px] animate-pulse">THROTTLING_{coolDown}S</span>}
          </div>
        </header>

        <main className="flex-1 max-w-6xl mx-auto w-full p-4 md:p-10 flex flex-col lg:flex-row gap-10">
          
          <aside className="w-full lg:w-[360px] space-y-8 lg:sticky lg:top-24 h-fit">
            <div className="space-y-6 bg-gray-900/40 p-6 rounded-3xl border border-gray-800/50 backdrop-blur-md">
              <div className="flex p-1 bg-gray-950 rounded-2xl border border-gray-800">
                <TabButton active={activeTab === GenerationType.SINGLE} onClick={() => setActiveTab(GenerationType.SINGLE)} label="MEME" icon={<Image size={16} />} />
                <TabButton active={activeTab === GenerationType.COMIC} onClick={() => setActiveTab(GenerationType.COMIC)} label="COMIC" icon={<Columns size={16} />} />
              </div>

              <form onSubmit={handleGenerate} className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] ml-1">Core_Topic</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleTrendingTopic} className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 font-mono">
                        <Zap size={12} /> TRENDING
                      </button>
                      <button type="button" onClick={() => setTopic(RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)])} className="text-[10px] text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-1 font-mono">
                        <Dices size={12} /> SHUFFLE
                      </button>
                    </div>
                  </div>
                  <textarea 
                    value={topic} 
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Опишите ситуацию или баг..."
                    className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 outline-none transition-all text-sm h-32 resize-none placeholder:opacity-30"
                    maxLength={250}
                  />
                </div>

                {activeTab === GenerationType.COMIC && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em] ml-1">Art_Style</label>
                    <select 
                      value={selectedStyleId} 
                      onChange={(e) => setSelectedStyleId(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-primary-500/50 appearance-none cursor-pointer hover:border-gray-700 transition-colors"
                    >
                      {COMIC_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={isGenerating || !topic.trim()}
                  className="group relative w-full bg-primary-600 hover:bg-primary-500 disabled:opacity-30 text-white font-black py-5 rounded-2xl shadow-2xl shadow-primary-600/20 transition-all active:scale-[0.97] overflow-hidden"
                >
                  <div className="relative z-10 flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs">
                    {isGenerating ? <Zap className="animate-spin text-white" size={16} /> : <Sparkles size={16} />}
                    {isGenerating ? 'Compiling...' : 'Execute_Build'}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
                </button>

                {/* Terminal Logs */}
                <div className="bg-black/80 rounded-xl p-4 border border-gray-800 font-mono text-[10px] space-y-1 min-h-[100px]">
                  {terminalLogs.map((log, i) => (
                    <div key={i} className={i === terminalLogs.length - 1 ? "text-primary-400 animate-pulse" : "text-gray-500"}>
                      {log}
                    </div>
                  ))}
                </div>
              </form>
            </div>

            {history.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-gray-800/50">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-[10px] font-mono text-gray-500 uppercase tracking-widest flex items-center gap-2"><History size={14} /> Buffer_History</h3>
                  <button onClick={() => { if(confirm('Wipe history?')) { setHistory([]); localStorage.removeItem('it-meme-history-v3'); } }} className="text-gray-600 hover:text-red-500 p-2 rounded-lg transition-colors"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                  {history.map(item => (
                    <div 
                      key={item.id} 
                      onClick={() => {
                        if (item.type === GenerationType.SINGLE) {
                          setCurrentMeme(item); setCurrentComic(null);
                        } else {
                          setCurrentComic(item); setCurrentMeme(null);
                        }
                        resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="p-3 bg-gray-900/30 border border-gray-800 rounded-xl cursor-pointer hover:border-primary-500/50 hover:bg-gray-900/50 transition-all flex items-center gap-3 group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-950 flex items-center justify-center text-gray-600 group-hover:text-primary-500">
                        {item.type === GenerationType.SINGLE ? <Image size={14} /> : <Columns size={14} />}
                      </div>
                      <span className="text-[10px] truncate text-gray-400 font-mono flex-1 group-hover:text-gray-200">{item.topic || item.topText}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <section ref={resultsRef} className="flex-1 flex flex-col items-center justify-start min-h-[60vh]">
            {isGenerating && !currentMeme && !currentComic && <div className="mt-20"><TerminalLoader /></div>}
            
            {activeTab === GenerationType.SINGLE && currentMeme && <MemeDisplay meme={currentMeme} />}
            {activeTab === GenerationType.COMIC && currentComic && <ComicDisplay comic={currentComic} />}
            
            {!currentMeme && !currentComic && !isGenerating && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-6 animate-fade-in">
                <div className="relative">
                  <Bug size={80} className="text-gray-800 opacity-20" />
                  <div className="absolute -top-2 -right-2 bg-primary-500/20 p-2 rounded-full animate-pulse">
                    <Zap size={24} className="text-primary-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-gray-700 uppercase tracking-tighter">System_Standby</h3>
                  <p className="text-xs font-mono text-gray-500 max-w-xs leading-relaxed uppercase opacity-50">Feed the neural network with your professional pain...</p>
                </div>
              </div>
            )}
          </section>
        </main>

        <footer className="h-20 border-t border-gray-900 flex items-center justify-center px-10 gap-10 opacity-30 grayscale hover:grayscale-0 transition-all">
           <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest"><Skull size={14} /> Built_For_Developers</div>
           <div className="hidden md:block w-px h-4 bg-gray-800"></div>
           <div className="text-[10px] font-mono uppercase tracking-widest">© 2025 IT_MEME_LAB_0.4.7_STABLE</div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

export default App;
