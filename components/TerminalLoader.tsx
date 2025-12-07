import React, { useEffect, useState, useRef } from 'react';
import { Terminal } from 'lucide-react';

const LOADING_LOGS = [
  "Initializing humor sub-routines...",
  "Loading neural networks...",
  "Fetching coffee for the AI...",
  "Resolving git conflicts in plot...",
  "Compiling visual assets...",
  "Optimizing punchlines...",
  "Debug mode: OFF...",
  "Generating hilarious content...",
  "Checking for infinite loops...",
  "Deploying to production...",
];

export const TerminalLoader: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let currentIndex = 0;
    setLogs(["> " + LOADING_LOGS[0]]);

    const interval = setInterval(() => {
      currentIndex++;
      if (currentIndex < LOADING_LOGS.length) {
        setLogs(prev => [...prev, "> " + LOADING_LOGS[currentIndex]]);
      } else {
        // Loop random messages at the end
        const randomMsg = ["Processing...", "Still thinking...", "Allocating memory..."][Math.floor(Math.random() * 3)];
        setLogs(prev => [...prev, "> " + randomMsg]);
      }
    }, 800);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-full max-w-lg bg-gray-950 rounded-lg overflow-hidden border border-gray-800 shadow-2xl font-mono text-xs md:text-sm">
      <div className="bg-gray-900 px-4 py-2 flex items-center gap-2 border-b border-gray-800">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
        </div>
        <div className="ml-2 text-gray-500 flex items-center gap-1">
          <Terminal size={12} />
          <span>build_log.log</span>
        </div>
      </div>
      <div 
        ref={scrollRef}
        className="p-4 h-64 overflow-y-auto text-green-500 space-y-1"
      >
        {logs.map((log, idx) => (
          <div key={idx} className="opacity-90 animate-fade-in">
            <span className="text-gray-600 mr-2">
              [{new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute:"2-digit", second:"2-digit" })}]
            </span>
            {log}
          </div>
        ))}
        <div className="animate-pulse">_</div>
      </div>
    </div>
  );
};