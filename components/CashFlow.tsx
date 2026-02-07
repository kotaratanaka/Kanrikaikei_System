
import React, { useMemo, useState } from 'react';
import { useData } from '../context/AppContext';
import { generateProjections, formatCurrency, getTermDateRange, generateId, generateDailyCashFlow } from '../utils';
import { CashFlowCategory, CashFlowItem } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ComposedChart, Line
} from 'recharts';
import { Settings, Plus, Trash2, Wallet, Calendar, ArrowRight } from 'lucide-react';
import { NumberInput } from './NumberInput';

const CashFlow: React.FC = () => {
  const { projects, employees, workLogs, currentTerm, settings, updateSettings } = useData();
  const { start } = useMemo(() => getTermDateRange(currentTerm), [currentTerm]);
  const data = useMemo(() => generateProjections(projects, employees, workLogs, start, settings), [projects, employees, workLogs, start, settings]);

  const [showSettings, setShowSettings] = useState(false);
  const [newItem, setNewItem] = useState<Partial<CashFlowItem>>({
    name: '',
    category: CashFlowCategory.OperatingExpense,
    amount: 0,
    isRecurring: true,
    // Default to Full Term
    periodStart: `${currentTerm}-01`, // Rough default
    periodEnd: '',
    payDay: 25, // Common payment day
    paymentDate: new Date().toISOString().slice(0, 10)
  });

  // Daily View State
  const [dailyViewDate, setDailyViewDate] = useState<Date>(new Date());
  
  // Daily Data Generation
  const dailyData = useMemo(() => {
     // Find the starting balance for the selected month
     // This is the closing balance of the previous month from the 'data' projection
     const viewYear = dailyViewDate.getFullYear();
     const viewMonth = dailyViewDate.getMonth();
     
     // Find index in 'data'
     const dataIdx = data.findIndex(d => d.date.getFullYear() === viewYear && d.date.getMonth() === viewMonth);
     
     let initialBalance = settings.initialCashBalance || 0;
     if (dataIdx > 0) {
         initialBalance = data[dataIdx - 1].cashBalance;
     } else if (dataIdx === 0) {
         // It's the first month of term, use initial settings
         initialBalance = settings.initialCashBalance || 0;
     } else {
         // Out of range (future/past beyond projection), fallback to last known or 0
         // Use the last month's balance if it's future
         if (data.length > 0 && dailyViewDate > data[data.length-1].date) {
             initialBalance = data[data.length-1].cashBalance;
         }
     }

     return generateDailyCashFlow(dailyViewDate, projects, settings, initialBalance);
  }, [dailyViewDate, data, projects, settings]);

  // Calculate global max value for shared Y-axis domain to synchronize scales
  const maxValue = useMemo(() => {
    let max = 0;
    data.forEach(d => {
      max = Math.max(max, d.totalCashIn, d.totalCashOut, d.cashBalance);
    });
    // Add 10% padding and round up to nice number
    return Math.ceil((max * 1.1) / 100000) * 100000;
  }, [data]);

  const handleAddItem = () => {
    if (!newItem.name || !newItem.amount) return;
    
    const item: CashFlowItem = {
      id: generateId(),
      name: newItem.name,
      category: newItem.category!,
      amount: Number(newItem.amount),
      isRecurring: newItem.isRecurring!,
    };

    if (item.isRecurring) {
        item.periodStart = newItem.periodStart;
        item.periodEnd = newItem.periodEnd;
        item.payDay = newItem.payDay;
    } else {
        item.paymentDate = newItem.paymentDate;
    }

    updateSettings({
      ...settings,
      cashFlowItems: [...(settings.cashFlowItems || []), item]
    });
    
    // Reset form
    setNewItem({
      name: '',
      category: CashFlowCategory.OperatingExpense,
      amount: 0,
      isRecurring: true,
      periodStart: `${currentTerm}-01`,
      periodEnd: '',
      payDay: 25,
      paymentDate: new Date().toISOString().slice(0, 10)
    });
  };

  const handleDeleteItem = (id: string) => {
    updateSettings({
      ...settings,
      cashFlowItems: settings.cashFlowItems.filter(i => i.id !== id)
    });
  };

  const handleInitialBalanceChange = (val: number) => {
    updateSettings({ ...settings, initialCashBalance: val });
  };

  // Custom Tooltip for Detailed Breakdown
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload; 
      
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xl text-sm z-50 overflow-hidden w-64">
           <div className="bg-gray-50 px-3 py-2 border-b font-bold text-gray-700 flex justify-between items-center">
             <span>{d.date.getFullYear()}/{d.date.getMonth() + 1}</span>
             <span className={`text-xs px-2 py-0.5 rounded-full border ${d.cashBalanceChange >= 0 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                {d.cashBalanceChange >= 0 ? '+' : ''}{formatCurrency(d.cashBalanceChange)}
             </span>
           </div>
           
           <div className="p-3 space-y-4">
               {/* Inflow */}
               <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1 font-bold">
                     <span>入金 (In)</span>
                     <span className="text-green-600">{formatCurrency(d.totalCashIn)}</span>
                  </div>
                  <div className="space-y-1 bg-green-50/50 p-2 rounded">
                      <div className="flex justify-between text-xs">
                         <span className="text-gray-600">売上</span>
                         <span className="font-mono text-gray-800">{formatCurrency(d.cashIn)}</span>
                      </div>
                      {d.financialIn > 0 && (
                          <div className="flex justify-between text-xs">
                             <span className="text-green-600 font-medium">調達等</span>
                             <span className="font-mono text-green-700 font-bold">{formatCurrency(d.financialIn)}</span>
                          </div>
                      )}
                  </div>
               </div>

               {/* Outflow */}
               <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1 font-bold">
                     <span>支出 (Out)</span>
                     <span className="text-red-600">{formatCurrency(d.totalCashOut)}</span>
                  </div>
                  <div className="space-y-1 bg-red-50/50 p-2 rounded">
                      <div className="flex justify-between text-xs">
                         <span className="text-gray-600">人件費</span>
                         <span className="font-mono text-gray-800">{formatCurrency(d.cost)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                         <span className="text-gray-600">販管費</span>
                         <span className="font-mono text-gray-800">{formatCurrency(d.sga)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                         <span className="text-gray-600">財務・税</span>
                         <span className="font-mono text-red-700 font-medium">{formatCurrency(d.taxRepayment)}</span>
                      </div>
                      {d.investment > 0 && (
                          <div className="flex justify-between text-xs border-t border-red-100 pt-1 mt-1">
                             <span className="text-gray-500">投資</span>
                             <span className="font-mono text-gray-600">{formatCurrency(d.investment)}</span>
                          </div>
                      )}
                  </div>
               </div>
               
               {/* Balance */}
               <div className="pt-2 border-t flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-500">月末残高</span>
                  <span className="font-bold text-blue-700 text-base">{formatCurrency(d.cashBalance)}</span>
               </div>
           </div>
        </div>
      );
    }
    return null;
  };

  const DailyTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
          const d = payload[0].payload;
          return (
             <div className="bg-white border border-gray-200 rounded p-2 shadow-lg text-xs">
                 <div className="font-bold text-gray-700 mb-1">{dailyViewDate.getMonth()+1}月{d.day}日</div>
                 <div className="text-blue-600 font-bold">残高: {formatCurrency(d.balance)}</div>
                 {d.change !== 0 && (
                     <div className={d.change > 0 ? 'text-green-600' : 'text-red-600'}>
                         変動: {d.change > 0 ? '+' : ''}{formatCurrency(d.change)}
                     </div>
                 )}
             </div>
          );
      }
      return null;
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 h-full flex flex-col overflow-y-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">キャッシュフローシミュレーション</h2>
          <p className="text-sm text-gray-500">営業CFだけでなく、借入返済・税金等の財務CFを含めた資金繰り推移</p>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          className="flex items-center px-4 py-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 text-sm font-bold shadow-sm"
        >
          <Settings className="w-4 h-4 mr-2" /> CF設定 (家賃・税・返済)
        </button>
      </div>

      <div className="min-h-[350px] mb-8">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" fontSize={12} />
            {/* Sync Y-Axis Domains */}
            <YAxis 
                yAxisId="left" 
                fontSize={12} 
                tickFormatter={(val) => `${val/10000}万`} 
                domain={[0, maxValue]}
            />
            <YAxis 
                yAxisId="right" 
                orientation="right" 
                fontSize={12} 
                tickFormatter={(val) => `${val/10000}万`} 
                domain={[0, maxValue]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '10px' }}/>
            <ReferenceLine y={0} yAxisId="left" stroke="#000" />
            
            {/* Stacked Outflows */}
            <Bar yAxisId="left" dataKey="cost" name="人件費 (労務)" stackId="out" fill="#fca5a5" />
            <Bar yAxisId="left" dataKey="sga" name="販管費 (家賃等)" stackId="out" fill="#fb923c" />
            <Bar yAxisId="left" dataKey="taxRepayment" name="財務支出 (税・返済)" stackId="out" fill="#ef4444" />
            <Bar yAxisId="left" dataKey="investment" name="投資" stackId="out" fill="#9ca3af" />

            {/* Inflows */}
            <Bar yAxisId="left" dataKey="totalCashIn" name="入金計 (売上+調達)" fill="#10b981" />

            {/* Cash Balance Line */}
            <Line yAxisId="right" type="monotone" dataKey="cashBalance" name="現預金残高" stroke="#2563eb" strokeWidth={3} dot={{r: 4}} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Daily Chart Section */}
      <div className="border-t pt-6">
         <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-bold text-gray-700 flex items-center">
                 <Calendar className="w-5 h-5 mr-2" />
                 月次詳細推移 (日次キャッシュフロー)
             </h3>
             <input 
               type="month" 
               className="border rounded p-1 text-sm bg-gray-50"
               value={dailyViewDate.toISOString().slice(0, 7)}
               onChange={(e) => {
                   if (e.target.value) setDailyViewDate(new Date(`${e.target.value}-01`));
               }}
             />
         </div>
         <div className="h-48 w-full bg-gray-50 rounded border border-gray-100 p-2">
             <ResponsiveContainer width="100%" height="100%">
                 <ComposedChart data={dailyData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                       dataKey="day" 
                       fontSize={10} 
                       ticks={[1, 5, 10, 15, 20, 25, dailyData.length]} 
                       tickFormatter={(val) => `${val}日`}
                    />
                    <YAxis fontSize={10} tickFormatter={(val) => `${val/10000}万`} />
                    <Tooltip content={<DailyTooltip />} />
                    <Line type="stepAfter" dataKey="balance" stroke="#2563eb" strokeWidth={2} dot={false} />
                 </ComposedChart>
             </ResponsiveContainer>
         </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="p-3 bg-blue-50 rounded border border-blue-100 flex items-center">
           <Wallet className="w-5 h-5 text-blue-600 mr-3" />
           <div>
             <div className="font-bold text-blue-900">現預金残高 (ランウェイ)</div>
             <div className="text-xs text-blue-700">期首残高から毎月の収支を累積。これが0を下回ると資金ショートです。</div>
           </div>
        </div>
        <div className="p-3 bg-orange-50 rounded border border-orange-100">
           <div className="font-bold text-orange-900 mb-1">営業支出 (販管費)</div>
           <div className="text-xs text-orange-700">
             人件費以外の固定費（家賃、通信費など）。CF設定から登録できます。
           </div>
        </div>
        <div className="p-3 bg-red-50 rounded border border-red-100">
           <div className="font-bold text-red-900 mb-1">財務支出 (税金・返済)</div>
           <div className="text-xs text-red-700">
             PL(損益計算書)の費用ではないが、キャッシュが出ていく項目（借入金の元本返済、法人税の中間納付など）。
           </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[900px] max-h-[90vh] overflow-auto shadow-2xl">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h3 className="text-xl font-bold text-gray-800">キャッシュフロー設定</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-gray-700 font-bold">閉じる</button>
            </div>

            <div className="mb-8 p-4 bg-blue-50 rounded border border-blue-100">
               <label className="block text-sm font-bold text-blue-900 mb-2">期首 現預金残高 ({currentTerm}年期首時点)</label>
               <div className="flex items-center gap-2">
                 <NumberInput 
                   className="border p-2 rounded w-48 text-right font-mono text-lg" 
                   value={settings.initialCashBalance || 0}
                   onChange={val => handleInitialBalanceChange(val)}
                 />
                 <span className="text-blue-800 font-bold">円</span>
               </div>
               <p className="text-xs text-blue-600 mt-2">※ この金額をスタート地点として、毎月の収支を積み上げ計算します。</p>
            </div>

            <div className="mb-6">
              <h4 className="font-bold text-gray-700 mb-2">営業外・固定費アイテム登録</h4>
              <div className="bg-gray-50 p-4 rounded border grid grid-cols-12 gap-4 items-end">
                {/* Row 1: Basic Info */}
                <div className="col-span-4">
                  <label className="text-xs font-bold text-gray-500 block mb-1">項目名</label>
                  <input className="w-full border p-2 rounded text-sm" placeholder="家賃, 返済など" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                </div>
                <div className="col-span-4">
                  <label className="text-xs font-bold text-gray-500 block mb-1">カテゴリー</label>
                  <select className="w-full border p-2 rounded text-sm" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value as CashFlowCategory})}>
                    {Object.values(CashFlowCategory).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-4">
                  <label className="text-xs font-bold text-gray-500 block mb-1">金額</label>
                  <NumberInput className="w-full border p-2 rounded text-sm text-right" value={newItem.amount || 0} onChange={val => setNewItem({...newItem, amount: val})} />
                </div>

                {/* Row 2: Timing & Period */}
                <div className="col-span-3">
                    <label className="text-xs font-bold text-gray-500 block mb-1">頻度</label>
                    <select 
                      className="w-full border p-2 rounded text-sm bg-white" 
                      value={newItem.isRecurring ? 'monthly' : 'onetime'} 
                      onChange={e => setNewItem({...newItem, isRecurring: e.target.value === 'monthly'})}
                    >
                      <option value="monthly">毎月 (期間指定)</option>
                      <option value="onetime">スポット (単発)</option>
                    </select>
                </div>

                {newItem.isRecurring ? (
                    <>
                       <div className="col-span-3">
                           <label className="text-xs font-bold text-gray-500 block mb-1">発生期間 (開始月)</label>
                           <input 
                             type="month" 
                             className="w-full border p-2 rounded text-sm"
                             value={newItem.periodStart}
                             onChange={e => setNewItem({...newItem, periodStart: e.target.value})}
                           />
                       </div>
                       <div className="col-span-3">
                           <label className="text-xs font-bold text-gray-500 block mb-1">終了月 (任意)</label>
                           <input 
                             type="month" 
                             className="w-full border p-2 rounded text-sm"
                             placeholder="未入力なら継続"
                             value={newItem.periodEnd}
                             onChange={e => setNewItem({...newItem, periodEnd: e.target.value})}
                           />
                       </div>
                       <div className="col-span-2">
                           <label className="text-xs font-bold text-gray-500 block mb-1">支払日</label>
                           <select 
                             className="w-full border p-2 rounded text-sm"
                             value={newItem.payDay}
                             onChange={e => setNewItem({...newItem, payDay: Number(e.target.value)})}
                           >
                              <option value={99}>末日</option>
                              <option value={5}>5日</option>
                              <option value={10}>10日</option>
                              <option value={15}>15日</option>
                              <option value={20}>20日</option>
                              <option value={25}>25日</option>
                              {/* Add all days if needed, simplifying for UI */}
                           </select>
                       </div>
                    </>
                ) : (
                    <div className="col-span-5">
                       <label className="text-xs font-bold text-gray-500 block mb-1">発生日 (年月日)</label>
                       <input 
                          type="date" 
                          className="w-full border p-2 rounded text-sm"
                          value={newItem.paymentDate}
                          onChange={e => setNewItem({...newItem, paymentDate: e.target.value})}
                       />
                    </div>
                )}

                <div className="col-span-1">
                  <button onClick={handleAddItem} className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 flex justify-center">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-gray-700 mb-2">登録済みアイテム</h4>
              <table className="min-w-full divide-y divide-gray-200 border">
                <thead className="bg-gray-50">
                   <tr>
                     <th className="px-4 py-2 text-left text-xs text-gray-500">項目名</th>
                     <th className="px-4 py-2 text-left text-xs text-gray-500">カテゴリ</th>
                     <th className="px-4 py-2 text-right text-xs text-gray-500">金額</th>
                     <th className="px-4 py-2 text-center text-xs text-gray-500">発生タイミング</th>
                     <th className="px-4 py-2 text-center text-xs text-gray-500">操作</th>
                   </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(settings.cashFlowItems || []).map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-2 text-sm font-medium">{item.name}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 bg-gray-50 rounded inline-block m-1">{item.category}</td>
                      <td className="px-4 py-2 text-sm text-right font-mono">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-2 text-sm text-center text-gray-500">
                        {item.isRecurring ? (
                            <div className="text-xs">
                                毎月 {item.payDay === 99 ? '末' : item.payDay}日払い
                                <div className="text-[10px] text-gray-400">
                                   {item.periodStart || '開始未定'} ~ {item.periodEnd || '継続'}
                                </div>
                            </div>
                        ) : (
                            <span className="text-xs">{item.paymentDate || item.targetMonth} (スポット)</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => handleDeleteItem(item.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(settings.cashFlowItems || []).length === 0 && (
                     <tr><td colSpan={5} className="text-center py-4 text-gray-400">登録された項目はありません</td></tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlow;
