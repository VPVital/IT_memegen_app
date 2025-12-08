import React, { useState, useRef, useEffect, ReactNode, ErrorInfo } from 'react';
import { Image, Columns, Zap, Sparkles, Terminal, Code2, Coffee, Palette, Skull, Dices, FileText, Trash2, History, Hourglass, AlertTriangle } from 'lucide-react';
import { TabButton } from './components/TabButton';
import { MemeDisplay } from './components/MemeDisplay';
import { ComicDisplay } from './components/ComicDisplay';
import { TerminalLoader } from './components/TerminalLoader';
import { generateMemeText, generateImageFromPrompt, generateComicScript, ImageGenerationResult } from './services/geminiService';
import { GenerationType, MemeData, ComicData, ComicStyle, COMIC_STYLES } from './types';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// --- Error Boundary Component ---
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center text-red-400 bg-gray-950 border border-red-900/30 rounded-xl m-4">
          <AlertTriangle size={48} className="mb-4 text-red-500" />
          <h2 className="text-xl font-bold mb-2">Software Failure. Guru Meditation.</h2>
          <p className="text-sm text-gray-500 mb-4">The application crashed unexpectedly.</p>
          <pre className="text-[10px] bg-black/50 p-4 rounded text-left overflow-auto max-w-lg mx-auto border border-red-900/20 mb-6 font-mono text-red-300">
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-6 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg transition-colors font-mono text-xs uppercase tracking-widest"
          >
            System Reboot
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Random prompts for "I'm feeling lucky" feature
const RANDOM_PROMPTS = [
  "Джуниор удалил базу данных на проде в пятницу вечером",
  "Слияние веток в Git с конфликтами на 3 часа",
  "CSS: попытка отцентровать div по вертикали",
  "На моем компьютере работает, а на сервере нет",
  "Копипаст кода со StackOverflow без чтения",
  "Проджект менеджер просит 'одну маленькую правку' перед релизом",
  "Легаси код, написанный уволившимся сеньором 5 лет назад",
  "Бесконечный цикл в useEffect",
  "Попытка выйти из Vim",
  "ИИ заменит программистов в 2025 году",
  "Разница между Java и JavaScript",
  "Деплой упал за 5 минут до демо с заказчиком",
  "Когда бэкенд прислал JSON с другим форматом"
];

// Constants
const MAX_PROMPT_LENGTH = 300;

// Union type for history items
type HistoryItem = MemeData | ComicData;

// Helper function for artificial delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Timeout wrapper for API calls to prevent hanging
const withTimeout = <T,>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => {
        console.warn(`Operation timed out after ${ms}ms`);
        resolve(fallbackValue);
    }, ms))
  ]);
};

function App() {
  const [activeTab, setActiveTab] = useState<GenerationType>(GenerationType.SINGLE);
  const [topic, setTopic] = useState('');
  const [selectedStyleId, setSelectedStyleId] = useState<string>(COMIC_STYLES[0].id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('System Idle');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [coolDownSeconds, setCoolDownSeconds] = useState(0);
  
  // Ref for aborting operations
  const abortControllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  
  // State for Single Meme
  const [currentMeme, setCurrentMeme] = useState<MemeData | null>(null);

  // State for Comic
  const [currentComic, setCurrentComic] = useState<ComicData | null>(null);

  // Load history from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('it-memegen-history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to local storage whenever it changes with robust error handling
  useEffect(() => {
    const saveToStorage = (data: HistoryItem[]) => {
      try {
        localStorage.setItem('it-memegen-history', JSON.stringify(data));
      } catch (e: any) {
        // Check for quota exceeded error (storage full)
        if (
          e.name === 'QuotaExceededError' ||
          e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          e.code === 22 ||
          e.code === 1014
        ) {
          console.warn("LocalStorage full. Trimming history...");
          if (data.length > 0) {
             // Keep only the newest half of items
             const trimmed = data.slice(0, Math.floor(data.length / 2));
             setHistory(trimmed); // This will trigger effect again
          } else {
             // Emergency clear if somehow empty array fails
             localStorage.removeItem('it-memegen-history');
          }
        } else {
          console.error("Failed to save history to LocalStorage", e);
        }
      }
    };

    saveToStorage(history);
  }, [history]);

  const addToHistory = (item: HistoryItem) => {
    setHistory(prev => {
       // Avoid duplicates based on ID
       const filtered = prev.filter(i => i.id !== item.id);
       // Keep max 20 items to reduce storage pressure
       return [item, ...filtered].slice(0, 20);
    });
  };

  const clearHistory = () => {
    if(confirm('Очистить историю генераций?')) {
      setHistory([]);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setTopic(item.type === GenerationType.SINGLE ? item.visualPrompt : item.topic);
    
    if (item.type === GenerationType.SINGLE) {
      setActiveTab(GenerationType.SINGLE);
      setCurrentMeme(item as MemeData);
      setCurrentComic(null);
    } else {
      setActiveTab(GenerationType.COMIC);
      setCurrentComic(item as ComicData);
      setCurrentMeme(null);
      // Try to find matching style ID based on label
      const style = COMIC_STYLES.find(s => s.label === (item as ComicData).styleLabel);
      if (style) setSelectedStyleId(style.id);
    }

    // On mobile, scroll to results when loading history
    setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleRandomize = () => {
    const randomTopic = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
    setTopic(randomTopic);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    setCoolDownSeconds(0);
    setStatusMessage('Aborted by user');
  };

  const handleLogoClick = () => {
    // Scroll Main Window (Mobile)
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Scroll Results Panel (Desktop)
    if (resultsRef.current) {
        resultsRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Scroll Sidebar Content (Desktop)
    if (sidebarContentRef.current) {
        sidebarContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || isGenerating) return;

    setIsGenerating(true);
    setStatusMessage('Compiling humor...');
    
    // Auto scroll to results on mobile
    if (window.innerWidth < 1024) {
        setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
    
    // Initialize AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    try {
      if (activeTab === GenerationType.SINGLE) {
        setCurrentMeme(null); 

        // 1. Generate Text content
        if (signal.aborted) return;
        setStatusMessage('Generating witty captions...');
        const textData = await withTimeout(generateMemeText(topic), 40000, {
             type: GenerationType.SINGLE,
             visualPrompt: "Error generating prompt",
             topText: "Error",
             bottomText: "Timeout"
        });
        
        if (signal.aborted) return;
        
        // 2. Generate Image
        if (signal.aborted) return;
        setStatusMessage('Rendering meme image...');
        
        // Increase timeout to 3 minutes to handle long rate-limit backoffs
        const imageResult = await withTimeout(
            generateImageFromPrompt(textData.visualPrompt + " high quality, funny meme image style"),
            180000, 
            { error: "Timeout" }
        );
        
        if (signal.aborted) return;
        
        let finalImageUrl = imageResult.imageUrl;
        // If failed, use placeholder with specific error message
        if (!finalImageUrl) {
            const errorReason = imageResult.error || "Render Failed";
            // URL encode the error to show in placeholder
            finalImageUrl = `https://placehold.co/800x800/1f2937/ffffff?text=${encodeURIComponent(errorReason.slice(0, 30))}&font=roboto`;
        }
        
        const newMeme: MemeData = {
           id: Date.now().toString(),
           type: GenerationType.SINGLE,
           ...textData,
           imageUrl: finalImageUrl,
           isLoading: false,
           timestamp: Date.now()
        };

        setCurrentMeme(newMeme);
        addToHistory(newMeme);

      } else {
        // Comic Logic
        const panelCount = 3;
        const selectedStyle = COMIC_STYLES.find(s => s.id === selectedStyleId) || COMIC_STYLES[0];
        
        // Initial comic object structure
        const initialComic: ComicData = {
          id: Date.now().toString(),
          type: GenerationType.COMIC,
          topic: topic,
          panels: [],
          isLoading: true,
          styleLabel: selectedStyle.label,
          timestamp: Date.now()
        };

        setCurrentComic(initialComic);

        // 1. Generate Script
        if (signal.aborted) return;
        setStatusMessage('Writing comic script...');
        const scriptData = await withTimeout(
            generateComicScript(topic, panelCount),
            40000,
            { type: GenerationType.COMIC, topic, panels: [] }
        );
        
        if (signal.aborted) return;

        if (scriptData.panels.length === 0) {
           throw new Error("Failed to generate script. Please try again.");
        }
        
        // Initialize panels
        const initialPanels = scriptData.panels.slice(0, panelCount).map(p => ({...p, imageUrl: undefined}));
        
        const comicWithScript: ComicData = {
           ...initialComic,
           panels: initialPanels,
           isLoading: false
        };
        
        setCurrentComic(comicWithScript);

        // 2. Generate Images for each panel
        const updatedPanels = [...initialPanels];
        let currentComicState = { ...comicWithScript };

        // Initial delay
        await delay(1000);

        for (let i = 0; i < updatedPanels.length; i++) {
          if (signal.aborted) break;

          // Artificial delay to prevent API Rate Limits (429)
          // Increased to 12s to guarantee a refill for 5 RPM limit
          if (i > 0) {
            let timeLeft = 12; 
            while (timeLeft > 0) {
               if (signal.aborted) break;
               setCoolDownSeconds(timeLeft);
               setStatusMessage(`Cooling down AI... resuming in ${timeLeft}s`);
               await delay(1000);
               timeLeft--;
            }
            setCoolDownSeconds(0);
          }
          
          if (signal.aborted) break;

          const panel = updatedPanels[i];
          setStatusMessage(`Rendering panel ${i+1}/${updatedPanels.length}...`);
          const fullPrompt = `${panel.description}. ${selectedStyle.promptSuffix}`;
          
          let imageResult: ImageGenerationResult = { error: 'Unknown' };
          
          try {
            // High timeout for each panel
            imageResult = await withTimeout(
                generateImageFromPrompt(fullPrompt),
                180000, 
                { error: "Timeout" }
            );
          } catch (err) {
            console.error(`Panel ${i} error`, err);
          }
          
          if (signal.aborted) break; 

          // Fallback image with error text
          let panelImageUrl = imageResult.imageUrl;
          if (!panelImageUrl) {
             const errorText = imageResult.error || `Panel ${i+1} Error`;
             console.warn(`Panel ${i+1} failed: ${errorText}`);
             panelImageUrl = `https://placehold.co/600x600/ffffff/000000?text=${encodeURIComponent(errorText.slice(0, 20))}&font=roboto`;
          }

          // Update local state safely
          updatedPanels[i] = { ...panel, imageUrl: panelImageUrl };
          currentComicState = { ...currentComicState, panels: [...updatedPanels] };
          
          // Force new object reference for React reconciliation
          setCurrentComic({ ...currentComicState });
        }
        
        if (!signal.aborted) {
           addToHistory(currentComicState);
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        console.log("Process SIGKILL by user");
      } else {
        console.error("Generation failed", error);
        setStatusMessage("Error: Generation Failed");
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsGenerating(false);
        if (statusMessage !== "Error: Generation Failed") {
           setStatusMessage('System Idle');
        }
        setCoolDownSeconds(0);
      }
    }
  };

  return (
    <ErrorBoundary>
      {/* Container: min-h-[100dvh] ensures full height on mobile browsers including address bar accounting */}
      <div className="min-h-[100dvh] lg:h-screen bg-gray-950 text-gray-100 flex flex-col font-sans selection:bg-primary-500 selection:text-white">
        
        {/* Background Tech Grid */}
        <div className="absolute inset-0 z-0 bg-grid-pattern bg-grid opacity-20 pointer-events-none fixed"></div>

        {/* Header */}
        <header className="flex-none border-b border-gray-800 bg-gray-950/90 backdrop-blur-md z-50 sticky top-0 lg:static">
          <div className="w-full px-4 lg:px-6 h-14 lg:h-16 flex items-center justify-between">
            <div 
                onClick={handleLogoClick}
                className="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80 group"
                title="Scroll to Top"
            >
              <div className="w-7 h-7 lg:w-8 lg:h-8 bg-primary-600 rounded flex items-center justify-center shadow-[0_0_10px_rgba(37,99,235,0.5)] border border-primary-500 group-hover:shadow-[0_0_15px_rgba(37,99,235,0.8)] transition-shadow">
                <Terminal className="text-white" size={16} />
              </div>
              <h1 className="text-base lg:text-lg font-bold tracking-tight bg-gradient-to-r from-white via-gray-200 to-gray-500 bg-clip-text text-transparent font-mono">
                IT_MemeGen_v3
              </h1>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 bg-gray-900 px-3 py-1 rounded-full border border-gray-800 transition-all min-w-[100px] lg:min-w-[150px] justify-center relative overflow-hidden">
              {coolDownSeconds > 0 && (
                <div 
                  className="absolute inset-0 bg-primary-900/20 z-0 transition-all duration-1000 ease-linear"
                  style={{ width: `${(coolDownSeconds / 12) * 100}%` }}
                ></div>
              )}
              <div className={`w-1.5 h-1.5 rounded-full ${isGenerating ? (coolDownSeconds > 0 ? 'bg-blue-400' : 'bg-yellow-500 animate-ping') : 'bg-green-500'} relative z-10`}></div>
              <span className="relative z-10 truncate max-w-[150px]">{statusMessage}</span>
            </div>
          </div>
        </header>

        {/* Split View Content - Mobile: Column (scroll), Desktop: Row (split) */}
        <main className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden relative z-10">
          
          {/* LEFT COLUMN: Controls & History */}
          <aside className="w-full lg:w-[450px] flex-none border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-950/80 backdrop-blur-sm flex flex-col z-20">
            
            {/* Scrollable controls area */}
            <div 
                ref={sidebarContentRef}
                className="lg:flex-1 lg:overflow-y-auto p-4 lg:p-6 space-y-6 lg:space-y-8 scrollbar-hide"
            >
              
              {/* Intro Snippet - Hide on small mobile to save space */}
              <div className="hidden sm:block">
                <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded-md bg-gray-900 border border-gray-700 text-[10px] text-primary-400 mb-3 font-mono">
                  <Code2 size={10} />
                  <span>git commit -m "fix: production crash"</span>
                </div>
                <h2 className="text-xl lg:text-2xl font-black mb-2 tracking-tight">
                  Генератор <span className="text-primary-500">IT-Юмора</span>
                </h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Превращаем баги, легаси и дедлайны в мемы.
                </p>
              </div>

              {/* Controls Container */}
              <div className="bg-gray-900/40 rounded-xl border border-gray-800 overflow-hidden ring-1 ring-white/5 shadow-lg">
                
                {/* Tabs */}
                <div className="flex p-1 gap-1 bg-gray-950/50 border-b border-gray-800/50">
                  <TabButton 
                    active={activeTab === GenerationType.SINGLE} 
                    onClick={() => setActiveTab(GenerationType.SINGLE)} 
                    label="Мем"
                    icon={<Image size={16} />}
                  />
                  <TabButton 
                    active={activeTab === GenerationType.COMIC} 
                    onClick={() => setActiveTab(GenerationType.COMIC)} 
                    label="Комикс"
                    icon={<Columns size={16} />}
                  />
                </div>

                {/* Form */}
                <form onSubmit={handleGenerate} className="p-4 lg:p-5 flex flex-col gap-4 lg:gap-5">
                  
                  {/* Comic Style Selector */}
                  {activeTab === GenerationType.COMIC && (
                    <div className="animate-fade-in">
                      <label className="block text-xs font-semibold text-gray-400 mb-2 font-mono uppercase tracking-wider flex items-center gap-2">
                        <Palette size={12} /> Стиль рисовки:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {COMIC_STYLES.map(style => (
                          <button
                            key={style.id}
                            type="button"
                            onClick={() => setSelectedStyleId(style.id)}
                            className={`text-[10px] lg:text-xs px-2 lg:px-3 py-2 rounded-lg border text-left transition-all ${
                              selectedStyleId === style.id 
                                ? 'bg-primary-900/30 border-primary-500 text-primary-300' 
                                : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-600'
                            }`}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <label htmlFor="topic" className="text-xs font-semibold text-gray-400 font-mono uppercase tracking-wider">
                        &gt; Ситуация / Баг:
                      </label>
                      <button 
                        type="button" 
                        onClick={handleRandomize}
                        className="text-[10px] text-primary-400 hover:text-primary-300 flex items-center gap-1 hover:underline decoration-dashed underline-offset-4 bg-primary-900/20 px-2 py-0.5 rounded border border-primary-900/50 transition-colors"
                      >
                        <Dices size={12} /> sudo random
                      </button>
                    </div>
                    <div className="relative group">
                      <textarea
                        id="topic"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder={activeTab === GenerationType.SINGLE ? "Джун удалил базу данных..." : "Диалог между PM и разработчиком..."}
                        className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 pl-10 pb-6 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all shadow-inner text-sm resize-none h-24 lg:h-28"
                        required
                        disabled={isGenerating}
                        maxLength={MAX_PROMPT_LENGTH}
                      />
                      <Sparkles className="absolute left-3 top-3.5 text-gray-500 group-focus-within:text-primary-500 transition-colors" size={16} />
                      <div className={`absolute bottom-2 right-3 text-[10px] font-mono transition-colors ${topic.length > MAX_PROMPT_LENGTH * 0.9 ? 'text-red-400' : 'text-gray-600'}`}>
                        {topic.length}/{MAX_PROMPT_LENGTH}
                      </div>
                    </div>
                  </div>

                  {isGenerating ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(220,38,38,0.5)] text-sm bg-red-600 hover:bg-red-500 hover:shadow-[0_0_25px_rgba(220,38,38,0.7)] active:scale-95 border border-red-500 animate-pulse-fast"
                    >
                      <Skull size={18} className="fill-current" />
                      <span className="font-mono tracking-widest">SIGKILL -9</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="w-full py-3 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg text-sm bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 hover:shadow-primary-500/20 active:translate-y-0.5 border border-primary-500/20"
                    >
                      <Zap size={16} className="fill-current" />
                      Сгенерировать
                    </button>
                  )}
                </form>
              </div>

              {/* Session History Log - Hidden on very small screens or moved to bottom via scroll */}
              {history.length > 0 && (
                <div className="animate-fade-in border-t border-gray-800/50 pt-4">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="text-xs font-semibold text-gray-500 font-mono uppercase tracking-wider flex items-center gap-2">
                      <History size={12} /> Session Logs
                    </h3>
                    <button onClick={clearHistory} className="text-[10px] text-red-500/70 hover:text-red-500 flex items-center gap-1 transition-colors">
                      <Trash2 size={10} /> clear
                    </button>
                  </div>
                  <div className="border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden max-h-[200px] lg:max-h-[300px] overflow-y-auto">
                    <ul className="divide-y divide-gray-800/50">
                      {history.map((item) => (
                        <li 
                          key={item.id} 
                          onClick={() => loadFromHistory(item)}
                          className={`group px-3 py-2 text-xs cursor-pointer hover:bg-gray-800 transition-colors flex items-center gap-3 ${
                            (currentMeme?.id === item.id || currentComic?.id === item.id) ? 'bg-gray-800/80 border-l-2 border-primary-500' : 'border-l-2 border-transparent'
                          }`}
                        >
                          <div className="text-gray-500 group-hover:text-primary-400">
                            {item.type === GenerationType.SINGLE ? <Image size={14} /> : <Columns size={14} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-gray-300 font-medium block truncate">
                              {item.type === GenerationType.SINGLE ? item.visualPrompt : item.topic}
                            </span>
                            <span className="text-gray-600 font-mono text-[10px]">
                              {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              
            </div>

            <div className="flex-none p-3 lg:p-4 border-t border-gray-800 text-center bg-gray-950 hidden lg:block">
              <p className="text-[10px] text-gray-600 font-mono">Powered by Google Gemini 2.0 Flash</p>
            </div>
          </aside>

          {/* RIGHT COLUMN: Results Preview */}
          <section 
            ref={resultsRef}
            className="flex-1 bg-gray-900/30 overflow-y-auto p-2 lg:p-4 flex flex-col items-center relative scrollbar-thin min-h-[500px]"
          >
            
            <div className="w-full max-w-4xl mx-auto flex justify-center py-2 lg:py-4">
              
              {/* Show Terminal Loader */}
              {isGenerating && activeTab === GenerationType.SINGLE && !currentMeme?.imageUrl && (
                <TerminalLoader />
              )}

              {/* Show Meme */}
              {activeTab === GenerationType.SINGLE && currentMeme && !isGenerating && (
                <div className="animate-fade-in-up w-full flex justify-center">
                  <MemeDisplay meme={currentMeme} />
                </div>
              )}
              
              {/* Show Comic */}
              {activeTab === GenerationType.COMIC && currentComic && (
                <div className="animate-fade-in-up w-full">
                  <ComicDisplay comic={currentComic} />
                </div>
              )}

              {/* Empty State */}
              {!currentMeme && !currentComic && !isGenerating && (
                <div className="flex flex-col items-center justify-center text-gray-600 border-2 border-dashed border-gray-800 rounded-xl p-8 lg:p-12 bg-gray-950/50 mt-10">
                  <div className="w-16 h-16 lg:w-20 lg:h-20 bg-gray-900 rounded-full flex items-center justify-center mb-4 lg:mb-6 shadow-inner">
                    <Coffee size={32} className="text-gray-700 lg:w-10 lg:h-10" />
                  </div>
                  <h3 className="text-base lg:text-lg font-bold text-gray-500 mb-2">Область предпросмотра</h3>
                  <p className="font-mono text-[10px] lg:text-xs text-gray-600 max-w-xs text-center">
                    Результат генерации появится здесь. Заполните форму {window.innerWidth < 1024 ? 'выше' : 'слева'}, чтобы начать.
                  </p>
                </div>
              )}
            </div>

          </section>

        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;