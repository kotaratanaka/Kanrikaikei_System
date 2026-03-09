
import React, { useMemo, useState } from 'react';
import { useData } from '../context/AppContext';
import { generateProjections, formatCurrency, getTermDateRange, generateId, generateDailyCashFlow, getEmployeeMonthlyData } from '../utils';
import { CashFlowCategory, CashFlowItem, CashFlowType, ProjectStatus, ContractType } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ComposedChart, Line
} from 'recharts';
import { Settings, Plus, Trash2, Wallet, Calendar, ArrowRight, ArrowUpCircle, ArrowDownCircle, Lock, ExternalLink } from 'lucide-react';
import { NumberInput } from './NumberInput';

interface CashFlowProps {
  onNavigate?: (tab: string) => void;
}

const CashFlow: React.FC<CashFlowProps> = ({ onNavigate }) => {
  const { projects, employees, workLogs, currentTerm, settings, updateSettings } = useData();
  const { start } = useMemo(() => getTermDateRange(currentTerm), [currentTerm]);
  const data = useMemo(() => generateProjections(projects, employees, workLogs, start, settings), [projects, employees, workLogs, start, settings]);

  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'inflow' | 'outflow'>('outflow'); // Default to outflow (expenses) as it's more common to edit
  
  // New Item State with expanded Type support
  const [newItem, setNewItem] = useState<Partial<CashFlowItem>>({
    name: '',
    category: CashFlowCategory.OperatingExpense,
    type: CashFlowType.Recurring, // Default
    amount: 0,
    isRecurring: true, // Legacy compat
    
    // Recurring / Variable Defaults
    periodStart: `${currentTerm}-01`, 
    periodEnd: '',
    payDay: 25, 
    
    // OneTime Defaults
    paymentDate: new Date().toISOString().slice(0, 10),

    // Variable Defaults
    variableAmounts: {}
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

     return generateDailyCashFlow(dailyViewDate, projects, employees, workLogs, settings, initialBalance);
  }, [dailyViewDate, data, projects, employees, workLogs, settings]);

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
    if (!newItem.name) return;
    
    const item: CashFlowItem = {
      id: generateId(),
      name: newItem.name,
      category: newItem.category!,
      type: newItem.type,
      amount: Number(newItem.amount) || 0,
      isRecurring: newItem.type === CashFlowType.Recurring, // Legacy compat
      variableAmounts: newItem.variableAmounts || {}
    };

    // Map specific fields based on Type
    if (newItem.type === CashFlowType.Recurring) {
        item.periodStart = newItem.periodStart;
        item.periodEnd = newItem.periodEnd;
        item.payDay = newItem.payDay;
    } else if (newItem.type === CashFlowType.Variable) {
        item.payDay = newItem.payDay;
        // variableAmounts is already copied above
    } else {
        // OneTime
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
      type: CashFlowType.Recurring,
      amount: 0,
      isRecurring: true,
      periodStart: `${currentTerm}-01`,
      periodEnd: '',
      payDay: 25,
      paymentDate: new Date().toISOString().slice(0, 10),
      variableAmounts: {}
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

  // --- Helper to categorize items for List View ---
  const isInflow = (cat: CashFlowCategory) => cat === CashFlowCategory.LoanIn || cat === CashFlowCategory.Investment; // Investment can be out, but treating "Fundraising" as in.
  
  // Categorize Manual Items
  const manualInflows = (settings.cashFlowItems || []).filter(i => i.category === CashFlowCategory.LoanIn);
  const manualOutflows = (settings.cashFlowItems || []).filter(i => i.category !== CashFlowCategory.LoanIn);

  // Categorize Projects (Inflows)
  const activeProjects = projects.filter(p => p.status === ProjectStatus.Ordered || p.status === ProjectStatus.Delivered || p.status === ProjectStatus.PreOrder);

  // Categorize Labor (Outflows - System Estimate)
  // Calculate a representative monthly cost (e.g., current month)
  const currentMonthDate = new Date();
  let currentMonthlyLaborTotal = 0;
  employees.forEach(emp => {
      const { cost } = getEmployeeMonthlyData(emp, currentMonthDate.getFullYear(), currentMonthDate.getMonth());
      const taxRate = emp.contractType === ContractType.Contractor ? 1.1 : 1.0;
      currentMonthlyLaborTotal += Math.floor(cost * taxRate);
  });

  // Variable Amount Input Generator
  const renderVariableInputs = () => {
    const months = [];
    const { start } = getTermDateRange(currentTerm);
    // Generate 12 months for current term + 3 months buffer
    for (let i = 0; i < 15; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        months.push({ 
          label: `${d.getFullYear()}/${d.getMonth()+1}`, 
          key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` 
        });
    }

    return (
        <div className="bg-white p-3 rounded border border-purple-100 mt-2">
           <p className="text-xs text-purple-700 mb-2">
               各月の支払額を入力してください。入力がない月は0円として扱われます。
           </p>
           <div className="grid grid-cols-4 gap-2">
              {months.map(m => (
                  <div key={m.key} className="flex flex-col bg-gray-50 p-2 rounded border border-gray-100">
                      <span className="text-[10px] font-bold text-gray-500 mb-1">{m.label}</span>
                      <NumberInput
                        className="w-full text-right border-b border-gray-200 focus:border-purple-500 focus:outline-none text-xs font-mono bg-white"
                        value={newItem.variableAmounts?.[m.key] || 0}
                        onChange={(val) => {
                            const newVars = { ...(newItem.variableAmounts || {}) };
                            if (val === 0) delete newVars[m.key];
                            else newVars[m.key] = val;
                            setNewItem({ ...newItem, variableAmounts: newVars });
                        }}
                      />
                  </div>
              ))}
           </div>
        </div>
    );
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
                          <>
                              <div className="flex justify-between text-xs border-t border-green-100 pt-1 mt-1">
                                 <span className="text-green-600 font-medium">調達等 計</span>
                                 <span className="font-mono text-green-700 font-bold">{formatCurrency(d.financialIn)}</span>
                              </div>
                              {d.financialInItems && d.financialInItems.map((item: any, idx: number) => (
                                  <div key={idx} className="flex justify-between text-[10px] pl-2">
                                      <span className="text-gray-500 truncate max-w-[100px]">{item.name}</span>
                                      <span className="font-mono text-green-600">{formatCurrency(item.amount)}</span>
                                  </div>
                              ))}
                          </>
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
                         <span className="text-gray-600">人件費 (翌末・税込)</span>
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

  // Render a Unified Table Row
  const renderItemRow = (
    name: string, 
    badge: { text: string, color: string }, 
    amount: React.ReactNode, 
    details: React.ReactNode,
    action: React.ReactNode,
    isSystem: boolean = false,
    key?: string | number
  ) => (
      <tr key={key} className="hover:bg-gray-50">
        <td className="px-4 py-3">
            <div className="flex items-center">
                {isSystem && <Lock className="w-3 h-3 text-gray-400 mr-2" />}
                <div className="text-sm font-bold text-gray-800">{name}</div>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge.color}`}>{badge.text}</span>
        </td>
        <td className="px-4 py-3 text-right text-sm font-mono">
            {amount}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 text-center">
            {details}
        </td>
        <td className="px-4 py-3 text-center">
            {action}
        </td>
      </tr>
  );

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
          <Settings className="w-4 h-4 mr-2" /> CF設定・登録アイテム
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
               className="border rounded p-1 text-sm bg-gray-50 bg-white"
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
          <div className="bg-white p-6 rounded-lg w-[900px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6 border-b pb-4 bg-gray-50 -m-6 m-0 p-6">
              <h3 className="text-xl font-bold text-gray-800">キャッシュフロー設定</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-gray-700 font-bold">閉じる</button>
            </div>

            <div className="overflow-y-auto flex-1 p-1">
              {/* Initial Balance */}
              <div className="mb-8 p-4 bg-blue-50 rounded border border-blue-100">
                 <label className="block text-sm font-bold text-blue-900 mb-2">期首 現預金残高 ({currentTerm}年期首時点)</label>
                 <div className="flex items-center gap-2">
                   <NumberInput 
                     className="border p-2 rounded w-48 text-right font-mono text-lg bg-white" 
                     value={settings.initialCashBalance || 0}
                     onChange={val => handleInitialBalanceChange(val)}
                   />
                   <span className="text-blue-800 font-bold">円</span>
                 </div>
                 <p className="text-xs text-blue-600 mt-2">※ この金額をスタート地点として、毎月の収支を積み上げ計算します。</p>
              </div>

              {/* Tabs */}
              <div className="flex border-b mb-4">
                 <button 
                   onClick={() => setActiveTab('inflow')}
                   className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'inflow' ? 'border-green-500 text-green-700 bg-green-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                 >
                    <ArrowUpCircle className="w-4 h-4" /> 入金項目 (＋)
                 </button>
                 <button 
                   onClick={() => setActiveTab('outflow')}
                   className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${activeTab === 'outflow' ? 'border-red-500 text-red-700 bg-red-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                 >
                    <ArrowDownCircle className="w-4 h-4" /> 出金項目 (－)
                 </button>
              </div>

              {/* Add New Item Form (Context Aware) */}
              <div className="mb-6 bg-gray-50 p-4 rounded border">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">
                    {activeTab === 'inflow' ? '手動入金の登録 (借入・増資等)' : '手動出金の登録 (販管費・税・返済)'}
                </h4>
                
                {/* 1. Basic Item Info */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">項目名</label>
                        <input className="w-full border p-2 rounded text-sm bg-white" placeholder={activeTab === 'inflow' ? "公庫借入, 増資など" : "家賃, サーバー代, 返済など"} value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">カテゴリー</label>
                        <select className="w-full border p-2 rounded text-sm bg-white" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value as CashFlowCategory})}>
                            {Object.values(CashFlowCategory).filter(c => {
                                // Filter categories based on tab
                                if (activeTab === 'inflow') return c === CashFlowCategory.LoanIn || c === CashFlowCategory.Investment || c === CashFlowCategory.Other;
                                return c !== CashFlowCategory.LoanIn && c !== CashFlowCategory.Investment;
                            }).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>

                {/* 2. Type Selection */}
                <div className="mb-4">
                    <label className="text-xs font-bold text-gray-500 block mb-2">発生タイプ</label>
                    <div className="flex gap-4">
                        <label className={`flex-1 flex items-center cursor-pointer border p-3 rounded-md transition-colors shadow-sm ${newItem.type === CashFlowType.OneTime ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-white hover:bg-gray-50'}`}>
                            <input type="radio" className="sr-only" 
                                checked={newItem.type === CashFlowType.OneTime} 
                                onChange={() => setNewItem({...newItem, type: CashFlowType.OneTime})} 
                            />
                            <div>
                                <span className="block font-bold text-sm text-gray-800">単発 (フロー)</span>
                                <span className="text-xs text-gray-500">一時的な支出・収入</span>
                            </div>
                        </label>

                        <label className={`flex-1 flex items-center cursor-pointer border p-3 rounded-md transition-colors shadow-sm ${newItem.type === CashFlowType.Recurring ? 'bg-orange-50 border-orange-300 ring-1 ring-orange-300' : 'bg-white hover:bg-gray-50'}`}>
                            <input type="radio" className="sr-only" 
                                checked={newItem.type === CashFlowType.Recurring} 
                                onChange={() => setNewItem({...newItem, type: CashFlowType.Recurring})} 
                            />
                            <div>
                                <span className="block font-bold text-sm text-gray-800">サブスク (ストック)</span>
                                <span className="text-xs text-gray-500">毎月定額の支出・収入</span>
                            </div>
                        </label>

                        <label className={`flex-1 flex items-center cursor-pointer border p-3 rounded-md transition-colors shadow-sm ${newItem.type === CashFlowType.Variable ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-300' : 'bg-white hover:bg-gray-50'}`}>
                            <input type="radio" className="sr-only" 
                                checked={newItem.type === CashFlowType.Variable} 
                                onChange={() => setNewItem({...newItem, type: CashFlowType.Variable})} 
                            />
                            <div>
                                <span className="block font-bold text-sm text-gray-800">変動 (タイムチャージ)</span>
                                <span className="text-xs text-gray-500">月ごとに金額が異なる</span>
                            </div>
                        </label>
                    </div>
                </div>

                {/* 3. Conditional Inputs based on Type */}
                <div className="p-4 bg-white border rounded-md">
                    {newItem.type === CashFlowType.OneTime && (
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">金額</label>
                                <NumberInput className="w-full border p-2 rounded text-sm text-right bg-white" value={newItem.amount || 0} onChange={val => setNewItem({...newItem, amount: val})} />
                             </div>
                             <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">発生日 (支払日)</label>
                                <input type="date" className="w-full border p-2 rounded text-sm bg-white" value={newItem.paymentDate} onChange={e => setNewItem({...newItem, paymentDate: e.target.value})} />
                             </div>
                        </div>
                    )}

                    {newItem.type === CashFlowType.Recurring && (
                        <div className="grid grid-cols-3 gap-4">
                             <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">月額</label>
                                <NumberInput className="w-full border p-2 rounded text-sm text-right bg-white" value={newItem.amount || 0} onChange={val => setNewItem({...newItem, amount: val})} />
                             </div>
                             <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">開始月</label>
                                <input type="month" className="w-full border p-2 rounded text-sm bg-white" value={newItem.periodStart} onChange={e => setNewItem({...newItem, periodStart: e.target.value})} />
                             </div>
                             <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">終了月 (任意)</label>
                                <input type="month" className="w-full border p-2 rounded text-sm bg-white" value={newItem.periodEnd} onChange={e => setNewItem({...newItem, periodEnd: e.target.value})} placeholder="継続" />
                             </div>
                             <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">毎月の支払日</label>
                                <select className="w-full border p-2 rounded text-sm bg-white" value={newItem.payDay || 25} onChange={e => setNewItem({...newItem, payDay: Number(e.target.value)})}>
                                    <option value={99}>末日</option>
                                    {[5,10,15,20,25].map(d => <option key={d} value={d}>{d}日</option>)}
                                </select>
                             </div>
                        </div>
                    )}

                    {newItem.type === CashFlowType.Variable && (
                        <div>
                             <div className="mb-3 w-1/3">
                                <label className="text-xs font-bold text-gray-500 block mb-1">毎月の支払日</label>
                                <select className="w-full border p-2 rounded text-sm bg-white" value={newItem.payDay || 25} onChange={e => setNewItem({...newItem, payDay: Number(e.target.value)})}>
                                    <option value={99}>末日</option>
                                    {[5,10,15,20,25].map(d => <option key={d} value={d}>{d}日</option>)}
                                </select>
                             </div>
                             {renderVariableInputs()}
                        </div>
                    )}
                </div>

                <div className="mt-4 flex justify-end">
                  <button onClick={handleAddItem} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 font-bold flex items-center shadow">
                    <Plus className="w-4 h-4 mr-2" /> 追加
                  </button>
                </div>
              </div>

              {/* LIST VIEW */}
              <div>
                <h4 className="font-bold text-gray-700 mb-2">登録済みアイテム一覧</h4>
                <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs text-gray-500 w-1/4">項目名</th>
                          <th className="px-4 py-2 text-right text-xs text-gray-500 w-1/6">金額 (目安)</th>
                          <th className="px-4 py-2 text-center text-xs text-gray-500">詳細・期間</th>
                          <th className="px-4 py-2 text-center text-xs text-gray-500 w-16">操作</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        
                        {/* INFLOW TAB LIST */}
                        {activeTab === 'inflow' && (
                            <>
                                {/* Projects (System) */}
                                {activeProjects.map(p => {
                                    const amountLabel = p.useFlow 
                                        ? formatCurrency(p.flowAmount) + (p.useStock ? ' + Sub' : '')
                                        : (p.useStock ? formatCurrency(p.stockAmount) + '/月' : '従量');
                                    
                                    return renderItemRow(
                                        p.clientName + ' (' + p.projectName + ')',
                                        { text: '案件(売上)', color: 'bg-green-100 text-green-800' },
                                        amountLabel,
                                        <div className="text-xs text-gray-500">
                                            {p.status} - 案件マスタで管理
                                        </div>,
                                        <button onClick={() => onNavigate?.('projects')} className="text-blue-500 hover:text-blue-700" title="案件マスタへ移動">
                                            <ExternalLink className="w-4 h-4 mx-auto" />
                                        </button>,
                                        true,
                                        p.id
                                    );
                                })}

                                {/* Manual Inflows */}
                                {manualInflows.map(item => {
                                    const isVariable = item.type === CashFlowType.Variable;
                                    const isRecurring = item.type === CashFlowType.Recurring || (item.type === undefined && item.isRecurring);
                                    
                                    return renderItemRow(
                                        item.name,
                                        { text: item.category, color: 'bg-blue-100 text-blue-800' },
                                        isVariable ? '月次指定' : formatCurrency(item.amount),
                                        <div className="text-xs text-gray-500">
                                            {isRecurring ? 'サブスク (毎月)' : (isVariable ? '変動' : item.paymentDate)}
                                        </div>,
                                        <button onClick={() => handleDeleteItem(item.id)} className="text-red-400 hover:text-red-600">
                                            <Trash2 className="w-4 h-4 mx-auto" />
                                        </button>,
                                        false,
                                        item.id
                                    );
                                })}

                                {activeProjects.length === 0 && manualInflows.length === 0 && (
                                     <tr><td colSpan={4} className="text-center py-4 text-gray-400">登録された入金項目はありません</td></tr>
                                )}
                            </>
                        )}

                        {/* OUTFLOW TAB LIST */}
                        {activeTab === 'outflow' && (
                            <>
                                {/* Labor Cost (System) */}
                                {renderItemRow(
                                    '人件費 (全従業員)',
                                    { text: '労務費', color: 'bg-red-100 text-red-800' },
                                    formatCurrency(currentMonthlyLaborTotal) + '/月 (概算)',
                                    <div className="text-xs text-gray-500 flex flex-col items-center">
                                        <span>従業員マスタ設定に基づく ({employees.length}名)</span>
                                        <span className="text-[10px] text-gray-400">※業務委託は消費税(10%)加算</span>
                                    </div>,
                                    <button onClick={() => onNavigate?.('employees')} className="text-blue-500 hover:text-blue-700" title="従業員マスタへ移動">
                                         <ExternalLink className="w-4 h-4 mx-auto" />
                                    </button>,
                                    true,
                                    'labor-cost'
                                )}
                                
                                {/* Manual Outflows */}
                                {manualOutflows.map(item => {
                                    const isVariable = item.type === CashFlowType.Variable;
                                    const isRecurring = item.type === CashFlowType.Recurring || (item.type === undefined && item.isRecurring);
                                    
                                    return renderItemRow(
                                        item.name,
                                        { text: item.category, color: 'bg-orange-100 text-orange-800' },
                                        isVariable ? '月次指定' : formatCurrency(item.amount),
                                        <div className="text-xs text-gray-500">
                                            {isRecurring ? 'サブスク (毎月)' : (isVariable ? '変動' : item.paymentDate)}
                                        </div>,
                                        <button onClick={() => handleDeleteItem(item.id)} className="text-red-400 hover:text-red-600">
                                            <Trash2 className="w-4 h-4 mx-auto" />
                                        </button>,
                                        false,
                                        item.id
                                    );
                                })}
                                {manualOutflows.length === 0 && (
                                     <tr><td colSpan={4} className="text-center py-4 text-gray-400">登録された出金項目はありません</td></tr>
                                )}
                            </>
                        )}

                      </tbody>
                    </table>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlow;
