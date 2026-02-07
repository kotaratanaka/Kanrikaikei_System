
import React, { useMemo, useState } from 'react';
import { useData } from '../context/AppContext';
import { generateProjections, formatCurrency, getTermDateRange, getMonthlyRevenue, calculateExactMonths, getTotalDays } from '../utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, ComposedChart, Area, AreaChart, PieChart, Pie, Cell
} from 'recharts';
import { Target, Activity, Settings, CalendarClock, TrendingUp, AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { RevenueRecognitionMethod } from '../types';

const Dashboard: React.FC = () => {
  const { projects, employees, settings, workLogs, currentTerm, updateSettings } = useData();
  const [showTargetModal, setShowTargetModal] = useState(false);
  
  // Breakdown Modal State
  const [breakdownPeriod, setBreakdownPeriod] = useState<{ label: string, startIdx: number, endIdx: number } | null>(null);

  const today = new Date();
  const { start, end } = useMemo(() => getTermDateRange(currentTerm), [currentTerm]);
  const data = useMemo(() => generateProjections(projects, employees, workLogs, start, settings), [projects, employees, workLogs, start, settings]);

  // Calculations
  const annualRevenue = data.reduce((acc, curr) => acc + curr.revenue, 0);
  const annualTarget = data.reduce((acc, curr) => acc + curr.target, 0);
  const annualDiff = annualRevenue - annualTarget;
  const revenueAchievement = annualTarget > 0 ? (annualRevenue / annualTarget) * 100 : 0;

  // --- Dynamic Period Calculation ---
  
  // Calculate index of "Today" within the term (0 = Dec, 11 = Nov)
  // If today is outside the term, clamp to 0 or 11 to show relevant data for that term
  let currentMonthIndex = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  
  if (currentMonthIndex < 0) currentMonthIndex = 0; // Future term viewed -> Show start
  if (currentMonthIndex > 11) currentMonthIndex = 11; // Past term viewed -> Show end

  // Helper to get Label Range (e.g., "12月-5月")
  const getPeriodLabel = (sIdx: number, eIdx: number) => {
      const s = new Date(start.getFullYear(), start.getMonth() + sIdx, 1);
      const e = new Date(start.getFullYear(), start.getMonth() + eIdx - 1, 1);
      return `${s.getMonth() + 1}月-${e.getMonth() + 1}月`;
  };

  // 1. Half-Year (6 months)
  // Index 0-5 = H1, 6-11 = H2
  const hIndex = Math.floor(currentMonthIndex / 6);
  const hStart = hIndex * 6;
  const hEnd = hStart + 6; // slice is exclusive
  const hLabel = hIndex === 0 ? '上期 (H1)' : '下期 (H2)';
  const hPeriodLabel = getPeriodLabel(hStart, hEnd);
  const hData = data.slice(hStart, hEnd);
  const hRevenue = hData.reduce((acc, c) => acc + c.revenue, 0);
  const hTarget = hData.reduce((acc, c) => acc + c.target, 0);
  const hDiff = hRevenue - hTarget;
  const hRate = hTarget > 0 ? (hRevenue / hTarget) * 100 : 0;

  // 2. Trimester (4 months) "3分期" (Matches Quarter "四半期")
  // Index 0-3 = T1, 4-7 = T2, 8-11 = T3
  const tIndex = Math.floor(currentMonthIndex / 4);
  const tStart = tIndex * 4;
  const tEnd = tStart + 4;
  const tLabel = `第${tIndex + 1}三分期 (T${tIndex + 1})`;
  const tPeriodLabel = getPeriodLabel(tStart, tEnd);
  const tData = data.slice(tStart, tEnd);
  const tRevenue = tData.reduce((acc, c) => acc + c.revenue, 0);
  const tTarget = tData.reduce((acc, c) => acc + c.target, 0);
  const tDiff = tRevenue - tTarget;
  const tRate = tTarget > 0 ? (tRevenue / tTarget) * 100 : 0;

  // 3. Quarter (3 months)
  // Index 0-2 = Q1, 3-5 = Q2, 6-8 = Q3, 9-11 = Q4
  const qIndex = Math.floor(currentMonthIndex / 3);
  const qStart = qIndex * 3;
  const qEnd = qStart + 3;
  const qLabel = `第${qIndex + 1}四半期 (Q${qIndex + 1})`;
  const qPeriodLabel = getPeriodLabel(qStart, qEnd);
  const qData = data.slice(qStart, qEnd);
  const qRevenue = qData.reduce((acc, c) => acc + c.revenue, 0);
  const qTarget = qData.reduce((acc, c) => acc + c.target, 0);
  const qDiff = qRevenue - qTarget;
  const qRate = qTarget > 0 ? (qRevenue / qTarget) * 100 : 0;


  // Local state for target editing (Monthly)
  const [monthlyTargets, setMonthlyTargets] = useState<Record<string, number>>({});

  const initModal = () => {
    const targets: Record<string, number> = {};
    data.forEach(d => {
       const key = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}`;
       targets[key] = settings.salesTargets?.[key] || 0;
    });
    setMonthlyTargets(targets);
    setShowTargetModal(true);
  };

  const handleSaveTargets = () => {
    updateSettings({
      ...settings,
      salesTargets: {
        ...settings.salesTargets,
        ...monthlyTargets
      }
    });
    setShowTargetModal(false);
  };

  const renderDiff = (diff: number) => {
    const isPositive = diff >= 0;
    return (
      <span className={`text-sm font-bold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
        {isPositive ? '+' : ''}{formatCurrency(diff)}
      </span>
    );
  };

  // Lead Source Data Preparation
  const leadSourceData = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach(p => {
      // Only count if not Lost or Archived? Or count all? Usually count active or all.
      // Let's count all to see full lead generation history.
      const category = p.leadSourceCategory || '不明・未設定';
      counts[category] = (counts[category] || 0) + 1;
    });
    return Object.keys(counts).map(name => ({ name, value: counts[name] }));
  }, [projects]);

  // Breakdown Calculation Logic
  const getBreakdownData = (startIdx: number, endIdx: number) => {
    // If startIdx equals endIdx (single month view requested from click), adjust endIdx
    const actualEndIdx = (endIdx <= startIdx) ? startIdx + 1 : endIdx;

    const breakdown = projects.map(p => {
        let periodRevenue = 0;
        // Iterate through the months in the selected period
        for (let i = startIdx; i < actualEndIdx; i++) {
             // Reconstruct date from index relative to term start
             const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
             periodRevenue += getMonthlyRevenue(p, d);
        }
        return {
            ...p,
            periodRevenue
        };
    }).filter(p => p.periodRevenue > 0).sort((a,b) => b.periodRevenue - a.periodRevenue);
    
    return breakdown;
  };

  // Handle Chart Click
  const handleChartClick = (state: any) => {
    if (state && state.activePayload && state.activePayload.length > 0) {
        const payload = state.activePayload[0].payload;
        // Find index of this month in data
        const index = data.findIndex(d => d.month === payload.month);
        if (index !== -1) {
            setBreakdownPeriod({
                label: `${payload.month} 単月`,
                startIdx: index,
                endIdx: index + 1
            });
        }
    }
  };


  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#d0ed57'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2 text-gray-500 bg-white px-4 py-2 rounded-full shadow-sm text-sm">
           <CalendarClock className="w-4 h-4" />
           <span>本日: {today.toLocaleDateString('ja-JP')}</span>
        </div>
        <button onClick={initModal} className="flex items-center text-sm text-gray-600 hover:text-blue-600 bg-white px-4 py-2 rounded shadow-sm border border-gray-100 font-medium transition-colors">
           <Settings className="w-4 h-4 mr-2"/> 月次売上目標設定
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Annual */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 relative overflow-hidden group">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm text-gray-500 mb-1 font-medium">年間売上 (全体)</p>
              <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(annualRevenue)}</h3>
            </div>
            <div className={`p-2 rounded-full ${revenueAchievement >= 100 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
              <Target className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
             <div className="flex justify-between text-xs text-gray-500">
               <span>目標: {formatCurrency(annualTarget)}</span>
               <span>{revenueAchievement.toFixed(1)}%</span>
             </div>
             <div className="flex justify-between items-center pt-2 border-t border-gray-100">
               <span className="text-xs text-gray-400">目標乖離</span>
               {renderDiff(annualDiff)}
             </div>
          </div>
           {/* Breakdown Button */}
           <button 
             onClick={() => setBreakdownPeriod({ label: `年間 (${currentTerm}年11月期)`, startIdx: 0, endIdx: 12 })}
             className="absolute top-2 right-2 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
           >
             <Info className="w-4 h-4" />
           </button>
        </div>

        {/* Half-Year (Dynamic) */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center text-sm text-gray-500 mb-1 font-medium">
                  {hLabel}
                  <span className="ml-2 text-xs bg-gray-100 px-1 rounded text-gray-400 font-normal">({hPeriodLabel})</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(hRevenue)}</h3>
            </div>
            <div className="bg-blue-50 text-blue-600 p-2 rounded-full">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
             <div className="flex justify-between text-xs text-gray-500">
               <span>目標: {formatCurrency(hTarget)}</span>
               <span className={hRate >= 100 ? 'text-blue-600 font-bold' : ''}>{hRate.toFixed(1)}%</span>
             </div>
             <div className="flex justify-between items-center pt-2 border-t border-gray-100">
               <span className="text-xs text-gray-400">目標乖離</span>
               {renderDiff(hDiff)}
             </div>
          </div>
          {/* Breakdown Button */}
          <button 
            onClick={() => setBreakdownPeriod({ label: hLabel, startIdx: hStart, endIdx: hEnd })}
            className="absolute top-2 right-2 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
           >
             <Info className="w-4 h-4" />
           </button>
        </div>

        {/* Trimester (Dynamic) */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center text-sm text-gray-500 mb-1 font-medium">
                  {tLabel}
                  <span className="ml-2 text-xs bg-gray-100 px-1 rounded text-gray-400 font-normal">({tPeriodLabel})</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(tRevenue)}</h3>
            </div>
            <div className="bg-purple-50 text-purple-600 p-2 rounded-full">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
             <div className="flex justify-between text-xs text-gray-500">
               <span>目標: {formatCurrency(tTarget)}</span>
               <span className={tRate >= 100 ? 'text-purple-600 font-bold' : ''}>{tRate.toFixed(1)}%</span>
             </div>
             <div className="flex justify-between items-center pt-2 border-t border-gray-100">
               <span className="text-xs text-gray-400">目標乖離</span>
               {renderDiff(tDiff)}
             </div>
          </div>
           <button 
            onClick={() => setBreakdownPeriod({ label: tLabel, startIdx: tStart, endIdx: tEnd })}
            className="absolute top-2 right-2 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
           >
             <Info className="w-4 h-4" />
           </button>
        </div>

         {/* Quarter (Dynamic) */}
         <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center text-sm text-gray-500 mb-1 font-medium">
                  {qLabel}
                  <span className="ml-2 text-xs bg-gray-100 px-1 rounded text-gray-400 font-normal">({qPeriodLabel})</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(qRevenue)}</h3>
            </div>
            <div className="bg-orange-50 text-orange-600 p-2 rounded-full">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
             <div className="flex justify-between text-xs text-gray-500">
               <span>目標: {formatCurrency(qTarget)}</span>
               <span className={qRate >= 100 ? 'text-orange-600 font-bold' : ''}>{qRate.toFixed(1)}%</span>
             </div>
             <div className="flex justify-between items-center pt-2 border-t border-gray-100">
               <span className="text-xs text-gray-400">目標乖離</span>
               {renderDiff(qDiff)}
             </div>
          </div>
          <button 
            onClick={() => setBreakdownPeriod({ label: qLabel, startIdx: qStart, endIdx: qEnd })}
            className="absolute top-2 right-2 text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
           >
             <Info className="w-4 h-4" />
           </button>
        </div>
      </div>

      {/* Main Charts & Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Revenue Forecast (Stacked Bar: Confirmed + Potential) */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 lg:col-span-2">
          <h3 className="text-lg font-bold text-gray-800 mb-4">売上予測 vs 目標 ({currentTerm}年11月期)</h3>
          <p className="text-xs text-gray-500 mb-2">※ グラフをクリックすると月ごとの内訳を確認できます。</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} onClick={handleChartClick} className="cursor-pointer">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(val) => `${val/10000}万`} />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Legend />
                {/* Stacked Bars */}
                <Bar dataKey="confirmedRevenue" name="売上見込 (受注済)" stackId="a" fill="#3b82f6" barSize={30} />
                <Bar dataKey="potentialRevenue" name="売上見込 (提案中)" stackId="a" fill="#bfdbfe" barSize={30} />
                <Line type="monotone" dataKey="target" name="目標" stroke="#ef4444" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stock/Flow Split (Stacked Bar Chart) */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4">ストック/フロー 売上推移</h3>
           <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(val) => `${val/10000}万`} />
                <Tooltip formatter={(val: number) => formatCurrency(val)} />
                <Legend />
                <Bar dataKey="stockRevenue" name="ストック (Sub)" stackId="a" fill="#8884d8" />
                <Bar dataKey="flowRevenue" name="フロー (Fixed/Time)" stackId="a" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lead Source Distribution */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
           <h3 className="text-lg font-bold text-gray-800 mb-4">リード獲得経路 (案件数割合)</h3>
           <div className="h-72 flex items-center justify-center">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={leadSourceData}
                   cx="50%"
                   cy="50%"
                   labelLine={false}
                   label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                   outerRadius={80}
                   fill="#8884d8"
                   dataKey="value"
                 >
                   {leadSourceData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                   ))}
                 </Pie>
                 <Tooltip />
                 <Legend />
               </PieChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* Target Setting Modal */}
      {showTargetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[600px] max-h-[80vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4 border-b pb-2">{currentTerm}年11月期 月次売上目標設定</h3>
            <p className="text-sm text-gray-500 mb-4">各月の売上目標を入力してください。未入力の月は0として扱われます。</p>
            
            <div className="grid grid-cols-2 gap-4">
              {data.map((d, i) => {
                 const key = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}`;
                 const value = monthlyTargets[key] !== undefined ? monthlyTargets[key] : 0;
                 return (
                   <div key={key}>
                      <label className="block text-xs font-bold text-gray-600 mb-1">{d.month}</label>
                      <div className="relative">
                        <span className="absolute left-2 top-2 text-gray-400 text-xs">¥</span>
                        <input 
                          type="text" 
                          className="w-full border p-2 pl-6 rounded text-right" 
                          value={value.toLocaleString()} 
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            const val = raw === '' ? 0 : Number(raw);
                            setMonthlyTargets({...monthlyTargets, [key]: val});
                          }}
                          placeholder="0"
                        />
                      </div>
                   </div>
                 );
              })}
            </div>

            <div className="flex justify-end gap-2 mt-6 border-t pt-4">
              <button onClick={() => setShowTargetModal(false)} className="px-4 py-2 text-gray-500 text-sm hover:text-gray-700">キャンセル</button>
              <button onClick={handleSaveTargets} className="bg-blue-600 text-white px-6 py-2 rounded text-sm font-bold hover:bg-blue-700 shadow-sm">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Modal */}
      {breakdownPeriod && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className="bg-white p-6 rounded-lg w-[700px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                 <div>
                   <h3 className="text-lg font-bold text-gray-800">売上内訳: {breakdownPeriod.label}</h3>
                   <p className="text-xs text-gray-500">
                     固定報酬案件は、選択されたロジック(期間按分または請求基準)に基づいて計算されます。
                   </p>
                 </div>
                 <button onClick={() => setBreakdownPeriod(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                 </button>
              </div>
              
              <div className="flex-1 overflow-auto">
                 <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                       <tr>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">案件名</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">タイプ</th>
                         <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">期間内売上</th>
                         <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">計算ロジック</th>
                       </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                       {getBreakdownData(breakdownPeriod.startIdx, breakdownPeriod.endIdx).map(p => {
                           const isFlow = p.useFlow;
                           const isMilestone = p.revenueMethod === RevenueRecognitionMethod.Milestone;
                           return (
                             <tr key={p.id}>
                               <td className="px-4 py-2 text-sm">
                                  <div className="font-bold text-gray-800">{p.clientName}</div>
                                  <div className="text-xs text-gray-500">{p.projectName}</div>
                                  {p.status === 'PreOrder' && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1 rounded ml-1">提案中</span>}
                               </td>
                               <td className="px-4 py-2 text-xs">
                                 {p.useFlow && <span className="mr-1">フロー</span>}
                                 {p.useStock && <span className="mr-1">ストック</span>}
                                 {p.useTimeCharge && <span>Time</span>}
                               </td>
                               <td className="px-4 py-2 text-right text-sm font-mono font-bold text-blue-700">
                                  {formatCurrency(p.periodRevenue)}
                               </td>
                               <td className="px-4 py-2 text-xs text-gray-500">
                                  {p.useTimeCharge ? '月次従量入力' : (
                                    isFlow ? (
                                        isMilestone ? (
                                            <span className="text-orange-600 font-medium">請求基準</span>
                                        ) : (
                                            <span>月割按分</span>
                                        )
                                    ) : (
                                        <span>月額固定 × 月数</span>
                                    )
                                  )}
                               </td>
                             </tr>
                           );
                       })}
                    </tbody>
                 </table>
                 <div className="p-4 text-right border-t bg-gray-50 mt-2">
                    <span className="text-sm font-bold text-gray-600 mr-2">合計:</span>
                    <span className="text-lg font-bold text-gray-900">
                        {formatCurrency(
                            getBreakdownData(breakdownPeriod.startIdx, breakdownPeriod.endIdx).reduce((sum, p) => sum + p.periodRevenue, 0)
                        )}
                    </span>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
