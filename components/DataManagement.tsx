
import React, { useRef, useState } from 'react';
import { useData } from '../context/AppContext';
import { Download, Upload, AlertTriangle, FileJson, Copy, Check } from 'lucide-react';

const DataManagement: React.FC = () => {
  const { employees, projects, workLogs, settings, currentTerm, importData } = useData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const handleExport = () => {
    const now = new Date();
    const data = {
      employees,
      projects,
      workLogs,
      settings,
      currentTerm,
      version: '3.0',
      exportedAt: now.toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Format filename with date and time: irwin_backup_YYYY-MM-DD_HHmmss.json
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    a.download = `irwin_backup_${year}-${month}-${day}_${hours}${minutes}${seconds}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = () => {
    const data = {
      employees,
      projects,
      workLogs,
      settings,
      currentTerm
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => alert('コピーに失敗しました: ' + err));
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = event.target?.result as string;
        const parsed = JSON.parse(json);
        
        // Basic validation
        if (!parsed.employees || !parsed.projects) {
            alert('無効なデータ形式です。');
            return;
        }

        if (window.confirm('現在のデータを上書きしてインポートしますか？この操作は取り消せません。\n※念のため、現在のデータをエクスポートしてから実行することをお勧めします。')) {
            await importData(parsed);
            alert('インポートが完了しました。');
            // No reload needed as we updated context state
        }
      } catch (err) {
        console.error(err);
        alert('ファイルの読み込みに失敗しました。JSONファイルを確認してください。');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 h-full overflow-y-auto pr-2">
      <div>
         <h2 className="text-xl font-bold text-gray-800 mb-2">データ管理 (バックアップ)</h2>
         <p className="text-gray-600 text-sm">
            データのバックアップや復元を行います。<br/>
            サーバー接続時は自動的にクラウドに保存されますが、オフライン時はブラウザ内に保存されます。
         </p>
      </div>

      {/* Copy for AI Section */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-lg shadow-sm border border-blue-100">
         <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-white text-purple-600 rounded-full shadow-sm">
               <Copy className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-800">AI連携用データコピー</h3>
              <p className="text-xs text-gray-500">開発AI (Google AI Studio) に現在の設定を反映させるために使用します。</p>
            </div>
         </div>
         <button 
           onClick={handleCopyToClipboard}
           className={`w-full py-4 rounded-md font-bold transition flex items-center justify-center gap-2 shadow-sm ${
             copied 
               ? 'bg-green-600 text-white' 
               : 'bg-white border-2 border-purple-600 text-purple-700 hover:bg-purple-50'
           }`}
         >
           {copied ? (
             <>
               <Check className="w-5 h-5" /> コピーしました！チャットに貼り付けてください
             </>
           ) : (
             <>
               <Copy className="w-5 h-5" /> 現在のデータをクリップボードにコピー
             </>
           )}
         </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
           <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
                 <Download className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-gray-800">データをダウンロード</h3>
           </div>
           <p className="text-sm text-gray-500 mb-6 min-h-[3em]">
             現在のすべての登録データ（従業員、案件、実績、設定）をJSONファイルとして保存します。
           </p>
           <button 
             onClick={handleExport}
             className="w-full py-3 bg-blue-600 text-white rounded-md font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2"
           >
             <FileJson className="w-5 h-5" /> バックアップを保存
           </button>
        </div>

        {/* Import */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
           <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-orange-100 text-orange-600 rounded-full">
                 <Upload className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-gray-800">データを復元 (インポート)</h3>
           </div>
           <p className="text-sm text-gray-500 mb-6 min-h-[3em]">
             バックアップファイル(.json)を読み込んでデータを復元します。<br/>
             <span className="text-red-500 font-bold">※現在のデータは上書きされます。</span>
           </p>
           <input 
             type="file" 
             accept=".json" 
             ref={fileInputRef} 
             className="hidden" 
             onChange={handleFileChange}
           />
           <button 
             onClick={handleImportClick}
             className="w-full py-3 bg-white border-2 border-orange-500 text-orange-600 rounded-md font-bold hover:bg-orange-50 transition flex items-center justify-center gap-2"
           >
             <Upload className="w-5 h-5" /> ファイルを選択して復元
           </button>
        </div>
      </div>

      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
         <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5" />
            <div>
               <h4 className="font-bold text-yellow-800 text-sm">注意点</h4>
               <ul className="list-disc list-inside text-xs text-yellow-700 mt-1 space-y-1">
                  <li>本システムはオフライン(サーバー未接続)でも動作しますが、その場合はブラウザに保存されます。</li>
                  <li>ブラウザの履歴削除などを行うと、サーバー未保存のデータが消える可能性があります。</li>
                  <li>定期的なバックアップを推奨します。</li>
               </ul>
            </div>
         </div>
      </div>
    </div>
  );
};

export default DataManagement;
