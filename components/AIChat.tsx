
import React, { useState, useRef, useEffect } from 'react';
import { useData } from '../context/AppContext';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Send, Trash2, Bot, User, Loader2, History } from 'lucide-react';
import { generateId } from '../utils';

const AIChat: React.FC = () => {
  const { chatHistory, addChatMessage, clearChatHistory } = useData();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, streamingText]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessageText = input.trim();
    setInput('');
    setIsLoading(true);
    setStreamingText('');

    // 1. Add User Message to History
    addChatMessage({
      id: generateId(),
      role: 'user',
      text: userMessageText,
      timestamp: Date.now()
    });

    try {
      // 2. Initialize Gemini
      // Assuming process.env.API_KEY is available as per instruction.
      // If running locally without env, this might fail unless configured.
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
          throw new Error("API Key not found in process.env.API_KEY");
      }
      
      const ai = new GoogleGenAI({ apiKey });

      // 3. Prepare History for Context
      // Gemini expects history in specific format for chat, but here we just use generateContent for simplicity
      // or chat.sendMessage if we want to maintain session object. 
      // Since we want to support "Restoring" history from stored state, we construct the chat each time.
      const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        history: chatHistory.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.text }]
        }))
      });

      // 4. Stream Response
      const result = await chat.sendMessageStream({ message: userMessageText });
      
      let fullResponseText = '';
      for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        const text = c.text;
        if (text) {
          fullResponseText += text;
          setStreamingText(prev => prev + text);
        }
      }

      // 5. Add Model Message to History
      addChatMessage({
        id: generateId(),
        role: 'model',
        text: fullResponseText,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Gemini API Error:', error);
      addChatMessage({
        id: generateId(),
        role: 'model',
        text: "申し訳ありません。エラーが発生しました。\nAPIキーの設定やネットワーク接続を確認してください。",
        timestamp: Date.now()
      });
    } finally {
      setIsLoading(false);
      setStreamingText('');
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("会話履歴をすべて消去しますか？\nこの操作は取り消せません。")) {
        clearChatHistory();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
        <div>
           <h2 className="text-xl font-bold text-gray-800 flex items-center">
             <Bot className="w-6 h-6 mr-2 text-blue-600" />
             AI アシスタント
           </h2>
           <p className="text-xs text-gray-500">
             経営・財務に関する質問や、データの分析サポートを行います。履歴は自動的に保存されます。
           </p>
        </div>
        <button 
          onClick={handleClearHistory}
          className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-gray-100"
          title="履歴を消去"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
        {chatHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4 opacity-50">
                <History className="w-16 h-16" />
                <p>会話履歴はありません。何か質問してください。</p>
            </div>
        )}

        {chatHistory.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`p-2 rounded-full flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-600' : 'bg-green-600'}`}>
               {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
            </div>
            
            <div className={`max-w-[80%] p-4 rounded-lg shadow-sm text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'
            }`}>
               {msg.text}
            </div>
          </div>
        ))}

        {/* Streaming Message Display */}
        {isLoading && streamingText && (
           <div className="flex items-start gap-3">
             <div className="p-2 rounded-full flex-shrink-0 bg-green-600">
                <Bot className="w-4 h-4 text-white" />
             </div>
             <div className="max-w-[80%] p-4 rounded-lg shadow-sm text-sm whitespace-pre-wrap leading-relaxed bg-white text-gray-800 border border-gray-200 rounded-tl-none animate-pulse">
                {streamingText}
                <span className="inline-block w-2 h-4 bg-gray-400 ml-1 animate-blink align-middle"></span>
             </div>
           </div>
        )}
        
        {/* Loading Indicator (before stream starts) */}
        {isLoading && !streamingText && (
             <div className="flex justify-center py-4">
                 <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
             </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t bg-white">
        <div className="flex gap-2">
           <textarea
             className="flex-1 border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none bg-gray-50 focus:bg-white transition-colors"
             rows={2}
             placeholder="メッセージを入力... (例: 今月の売上予測はどうですか？)"
             value={input}
             onChange={(e) => setInput(e.target.value)}
             onKeyDown={(e) => {
                 if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleSend();
                 }
             }}
           />
           <button 
             onClick={handleSend}
             disabled={isLoading || !input.trim()}
             className={`px-6 rounded-lg font-bold flex items-center transition-all ${
                 isLoading || !input.trim() 
                   ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                   : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
             }`}
           >
             <Send className="w-5 h-5" />
           </button>
        </div>
        <p className="text-[10px] text-center text-gray-400 mt-2">
            AIは間違いを犯す可能性があります。重要な情報は必ず確認してください。
        </p>
      </div>
    </div>
  );
};

export default AIChat;
