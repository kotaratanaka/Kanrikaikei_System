
import React, { useMemo, useState } from 'react';
import { useData } from '../context/AppContext';
import { getProjectActualCost, formatCurrency, getMonthlyRevenue, parseLocalDate, getEmployeeMonthlyData, getProjectMonthlyCost, getSeniorEngineerCommission, calculateExactMonths, calculateDayDiff } from '../utils';
import { Project, WorkLog, ProjectStatus } from '../types'; // Added ProjectStatus
import { Info, X, Calculator } from 'lucide-react';

interface ProjectMetric extends Project {
  totalRevenue: number;
  totalCost: number;
  profit: number;
  profitMargin: number;
  laborShare: number;
  avgMonthlyRevenue: number; // New metric: Turnover rate
  salesLeadTime: number | null;
}

const Analytics: React.FC = () => {
  const { projects, employees, settings, workLogs, currentTerm } = useData();
  const [selectedProjectForCost, setSelectedProjectForCost] = useState<ProjectMetric | null>(null);

  // Calculate project metrics based on HYBRID (Actuals + Plan) logic
  const projectMetrics = useMemo(() => {
    return projects
      // Filter: Only Ordered or Delivered projects (exclude PreOrder/Lost)
      .filter(p => p.status === ProjectStatus.Ordered || p.status === ProjectStatus.Delivered)
      .map(p => {
      // Iterate through months of the fiscal term
      // Term starts Dec prev year
      const startYear = currentTerm - 1;
      
      let totalRevenue = 0;
      let totalCost = 0;
      
      const today = new Date();
      const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      for (let i = 0; i < 12; i++) {
        const d = new Date(startYear, 11 + i, 1); // Dec, Jan, Feb...
        
        // Revenue (Tax Excluded by default from getMonthlyRevenue)
        totalRevenue += getMonthlyRevenue(p, d);
        
        // Cost (Hybrid: Past = Actual, Future/Current = Plan)
        if (d < currentMonthStart) {
             totalCost += getProjectActualCost(p, employees, workLogs, d.getFullYear(), d.getMonth());
        } else {
             totalCost += getProjectMonthlyCost(p, employees, d.getFullYear(), d.getMonth());
        }
      }

      // Calculated as Tax Excluded (Zainuki)
      const profit = totalRevenue - totalCost;
      const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
      const laborShare = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;

      // Avg Monthly Revenue (Delivery Velocity) for Flow Projects
      let avgMonthlyRevenue = 0;
      if (p.useFlow && p.flowStartDate && p.flowEndDate && p.flowAmount > 0) {
          const months = calculateExactMonths(p.flowStartDate, p.flowEndDate);
          if (months > 0) {
              avgMonthlyRevenue = p.flowAmount / months;
          }
      }

      // Sales Lead Time
      const salesLeadTime = calculateDayDiff(p.firstMeetingDate, p.contractDate);

      return {
        ...p,
        totalRevenue,
        totalCost,
        profit,
        profitMargin,
        laborShare,
        avgMonthlyRevenue,
        salesLeadTime
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue); // Sort by revenue
  }, [projects, employees, workLogs, currentTerm]);

  // Derive Target Profit Margin from Labor Share settings
  // Labor Share 40-50% -> Profit Margin 50-60%
  const targetMarginMin = 100 - settings.targetLaborShareMax; // e.g. 100 - 50 = 50%
  const targetMarginMax = 100 - settings.targetLaborShareMin; // e.g. 100 - 40 = 60%

  // Helper to generate monthly cost breakdown for a project
  const getCostBreakdown = (project: Project) => {
    const startYear = currentTerm - 1;
    const breakdown = [];
    const today = new Date();
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    for (let i = 0; i < 12; i++) {
        const d = new Date(startYear, 11 + i, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        const isPast = d < currentMonthStart;
        
        let cost = 0;
        let method = '';
        let details = '';

        if (isPast) {
             // Past Month: Look for actual logs
             cost = getProjectActualCost(project, employees, workLogs, year, month);
             const projectLogs = workLogs.filter(log => {
                if (log.projectId !== project.id) return false;
                const logDate = parseLocalDate(log.weekStartDate);
                return logDate.getFullYear() === year && logDate.getMonth() === month;
             });
             
             if (projectLogs.length > 0) {
                 method = '実績 (WorkLog)';
                 let totalHours = 0;
                 projectLogs.forEach(l => totalHours += l.actualHours);
                 details = `${totalHours}時間 (時間単価計算)`;
             } else {
                 method = '実績なし';
                 details = '稼働ログなし (0円)';
             }
        } else {
             // Future/Current Month: Use Plan
             cost = getProjectMonthlyCost(project, employees, year, month);
             if (cost > 0) {
                 method = '予定 (月次)';
                 details = "稼働率に基づく見込";
             } else {
                 method = '予定なし';
                 details = "稼働予定なし";
             }
        }

        // Check for Commission (Bonus) specifically to add to details
        if (project.useFlow && project.flowEndDate) {
            const end = parseLocalDate(project.flowEndDate);
            const accrualMonth = new Date(end.getFullYear(), end.getMonth() + 1, 1);
            
            if (accrualMonth.getFullYear() === year && accrualMonth.getMonth() === month) {
                 const commission = getSeniorEngineerCommission(project, employees);
                 if (commission > 0) {
                     details += details ? `, ` : '';
                     details += `内、シニアエンジニア賞与: ${formatCurrency(commission)}`;
                     // If cost was 0 (no logs) but has commission, ensure label is set
                     if (method === '実績なし' || method === '予定なし') {
                         method = '賞与のみ';
                     }
                 }
            }
        }
        
        breakdown.push({
            monthLabel: `${year}/${month + 1}`,
            cost,
            method,
            details
        });
    }
    return breakdown;
  };

  return (
    <div className="space-y-6 h-full overflow-y-auto pr-2">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-800">プロジェクト別収支分析 ({currentTerm}年11月期)</h2>
          <p className="text-sm text-gray-500 mt-1">※ 受注済(デリバリー中・完了)案件のみ表示しています。売上は税抜、原価はハイブリッド(過去=実績/未来=予定)です。</p>
        </div>
        <div className="text-sm bg-white p-2 rounded border shadow-sm">
          目標粗利率: <span className="font-bold">{targetMarginMin}% - {targetMarginMax}%</span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-[1100px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">案件名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">タイプ</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">営業リードタイム</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">期中売上 (税抜)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">月平均売上 (回転率)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">期中原価 (見込込)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">粗利</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">粗利率</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {projectMetrics.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-gray-900">{p.clientName}</div>
                  <div className="text-xs text-blue-600">{p.projectName}</div>
                  <div className="text-xs text-gray-500">
                    {p.useFlow && '固定報酬 '} 
                    {p.useFlow && p.useStock && '+ '}
                    {p.useStock && 'サブスク'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600">{p.projectType}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                  {p.salesLeadTime !== null ? `${p.salesLeadTime}日` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                  {formatCurrency(p.totalRevenue)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-gray-600">
                  {p.avgMonthlyRevenue > 0 ? formatCurrency(p.avgMonthlyRevenue) : '-'}
                  {p.avgMonthlyRevenue > 0 && <span className="text-[10px] text-gray-400 block">/月</span>}
                </td>
                <td 
                  onClick={() => setSelectedProjectForCost(p)}
                  className="px-6 py-4 whitespace-nowrap text-right text-sm text-blue-600 font-mono cursor-pointer hover:underline hover:bg-blue-50 transition-colors"
                  title="クリックして内訳を確認"
                >
                  {formatCurrency(p.totalCost)}
                  <Calculator className="w-3 h-3 inline ml-1 opacity-50" />
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-bold ${
                  p.profit < 0 ? 'text-red-600' : 'text-gray-900'
                }`}>
                  {formatCurrency(p.profit)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                   <span className={`px-2 py-1 rounded font-bold ${
                     p.profitMargin < targetMarginMin
                       ? 'bg-red-100 text-red-800'  // Low Margin
                       : p.profitMargin > targetMarginMax 
                         ? 'bg-blue-100 text-blue-800' // High Margin
                         : 'bg-green-100 text-green-800' // On Target
                   }`}>
                     {p.profitMargin.toFixed(1)}%
                   </span>
                </td>
              </tr>
            ))}
            {projectMetrics.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-500">条件に一致する案件がありません</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500">
             <h3 className="text-lg font-bold mb-4 text-gray-800">赤字・低利益率プロジェクト</h3>
             <ul className="space-y-3">
                {projectMetrics.filter(p => p.profit < 0 || p.profitMargin < targetMarginMin).length === 0 && (
                  <p className="text-sm text-gray-500">問題のあるプロジェクトはありません。</p>
                )}
                {projectMetrics.filter(p => p.profit < 0 || p.profitMargin < targetMarginMin).map(p => (
                   <li key={p.id} className="flex justify-between items-center p-3 bg-red-50 rounded">
                      <div>
                        <div className="font-bold text-red-800">{p.clientName}</div>
                        <div className="text-xs text-red-600">{p.projectName}</div>
                        <div className="text-xs text-gray-500">粗利: {formatCurrency(p.profit)}</div>
                      </div>
                      <span className="text-sm font-bold text-red-700 bg-white px-2 py-1 rounded border border-red-200">
                        粗利率: {p.profitMargin.toFixed(0)}%
                      </span>
                   </li>
                ))}
             </ul>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
             <h3 className="text-lg font-bold mb-4 text-gray-800">高収益プロジェクト (Top 5)</h3>
             <ul className="space-y-3">
                {projectMetrics
                  .filter(p => p.profit > 0 && p.profitMargin >= targetMarginMin)
                  .sort((a,b) => b.profitMargin - a.profitMargin) // Sort by margin for High Profit list? Or Amount? Usually Margin shows efficiency.
                  .slice(0, 5)
                  .map(p => (
                   <li key={p.id} className="flex justify-between items-center p-3 bg-blue-50 rounded">
                      <div>
                        <div className="font-bold text-blue-800">{p.clientName}</div>
                        <div className="text-xs text-blue-600">{p.projectName}</div>
                        <div className="text-xs text-gray-500">粗利: {formatCurrency(p.profit)}</div>
                      </div>
                      <span className="text-sm font-bold text-blue-700 bg-white px-2 py-1 rounded border border-blue-200">
                        粗利率: {p.profitMargin.toFixed(0)}%
                      </span>
                   </li>
                ))}
             </ul>
          </div>
      </div>

      {/* Cost Breakdown Modal */}
      {selectedProjectForCost && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-lg w-[600px] max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="flex justify-between items-center p-4 border-b bg-gray-50">
                 <div>
                    <h3 className="text-lg font-bold text-gray-800">原価計算内訳</h3>
                    <div className="text-xs text-gray-500">{selectedProjectForCost.clientName} - {selectedProjectForCost.projectName}</div>
                 </div>
                 <button onClick={() => setSelectedProjectForCost(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                 </button>
              </div>
              <div className="p-4 flex-1 overflow-auto">
                 <p className="text-xs text-gray-500 mb-3 bg-blue-50 p-2 rounded">
                    <strong>計算ロジック:</strong><br/>
                    ・過去の月: 実績ログ(WorkLog)に基づく実工数計算<br/>
                    ・当月・未来: アサイン稼働率に基づく予定原価計算 (日割按分あり)<br/>
                    ・賞与: シニアエンジニアの成果報酬(5%)は、案件終了翌月に一括計上されます。
                 </p>
                 <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                       <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">対象月</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">原価</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">計算根拠</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">詳細</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                       {getCostBreakdown(selectedProjectForCost).map((row, idx) => (
                           <tr key={idx} className={row.cost > 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-3 py-2 font-mono text-gray-700">{row.monthLabel}</td>
                              <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(row.cost)}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">
                                 {row.method.includes('実績') && <span className="text-blue-600 font-bold">{row.method}</span>}
                                 {row.method.includes('予定') && <span className="text-orange-600">{row.method}</span>}
                                 {row.method.includes('賞与') && <span className="text-purple-600 font-bold">{row.method}</span>}
                                 {row.method === '予定なし' && <span className="text-gray-400">-</span>}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-500">
                                  {row.details}
                              </td>
                           </tr>
                       ))}
                    </tbody>
                 </table>
                 <div className="mt-4 pt-3 border-t text-right">
                    <span className="text-sm font-bold text-gray-600 mr-3">合計原価:</span>
                    <span className="text-lg font-bold text-blue-700">{formatCurrency(selectedProjectForCost.totalCost)}</span>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
