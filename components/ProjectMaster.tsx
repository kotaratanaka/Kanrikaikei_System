
import React, { useState } from 'react';
import { useData } from '../context/AppContext';
import { Project, ProjectType, ProjectStatus, RevenueRecognitionMethod, BillingMilestone } from '../types';
import { formatCurrency, getTermDateRange, calculateExactMonths, generateId, calculateDayDiff } from '../utils';
import { Plus, X, Archive, ArrowLeft, Tag, Trash2, Lock, Search } from 'lucide-react';
import { NumberInput } from './NumberInput';

const ProjectMaster: React.FC = () => {
  const { projects, employees, addProject, updateProject, currentTerm, settings, updateSettings } = useData();
  
  // Added: Lead Source Options from Settings
  const leadSourceOptions = settings.leadSourceOptions || {};

  // View State
  const [showLostList, setShowLostList] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Dynamic Lead Source Editing State
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingDetail, setIsAddingDetail] = useState(false);
  const [newDetailName, setNewDetailName] = useState('');

  // Autosuggest Data
  const uniqueClients = Array.from(new Set(projects.map(p => p.clientName))).sort();

  // Helper to generate default dates based on CURRENT TERM
  const getInitialDates = () => {
    // Get term range
    const { start: termStart, end: termEnd } = getTermDateRange(currentTerm);
    const today = new Date();
    
    // If today is inside the term, use today.
    // If today is outside (e.g. next year), use term start so it appears in list.
    let baseDate = new Date();
    if (today < termStart || today > termEnd) {
        baseDate = new Date(termStart);
    }

    const flowStart = baseDate.toISOString().split('T')[0];
    
    // Default 3 months duration
    const flowEnd = new Date(baseDate);
    flowEnd.setMonth(baseDate.getMonth() + 3);
    const flowEndStr = flowEnd.toISOString().split('T')[0];

    // Stock starts the day after Flow ends
    const stockStart = new Date(flowEnd);
    stockStart.setDate(stockStart.getDate() + 1);
    const stockStartStr = stockStart.toISOString().split('T')[0];

    // Stock ends 2 years after stock start (Tentative default)
    const stockEnd = new Date(stockStart);
    stockEnd.setFullYear(stockEnd.getFullYear() + 2);
    stockEnd.setDate(stockEnd.getDate() - 1);
    const stockEndStr = stockEnd.toISOString().split('T')[0];

    return { flowStart, flowEnd: flowEndStr, stockStart: stockStartStr, stockEnd: stockEndStr };
  };

  const { flowStart, flowEnd, stockStart, stockEnd } = getInitialDates();

  // Form State
  const initialFormState: Partial<Project> = {
    clientName: '',
    projectName: '',
    projectType: ProjectType.Dev,
    status: ProjectStatus.PreOrder,
    leadSourceCategory: '',
    leadSourceDetail: '',
    assignments: [],
    projectTasks: [],
    
    firstMeetingDate: '',
    contractDate: '',

    useFlow: true,
    useStock: true, // Default for Dev
    useTimeCharge: false,
    revenueMethod: RevenueRecognitionMethod.Milestone, // FORCE MILESTONE DEFAULT
    
    flowAmount: 0,
    flowStartDate: flowStart,
    flowEndDate: flowEnd,
    
    stockAmount: 0,
    stockStartDate: stockStart,
    stockEndDate: stockEnd, // Default: 2 years

    timeChargePrices: {},
    
    billingConfig: {
      flowSplit: false,
      flowMilestones: [], // New structure
      stockDelay: 1,
      stockPayDay: 99
    }
  };
  const [form, setForm] = useState<Partial<Project>>(initialFormState);

  // --- Auto Calculation Helper ---
  // Ensure the LAST milestone always balances the total amount
  const recalculateMilestones = (milestones: BillingMilestone[], totalFlowAmount: number): BillingMilestone[] => {
     if (milestones.length === 0) return [];
     
     // Deep copy
     const newMs = milestones.map(m => ({...m}));
     const lastIdx = newMs.length - 1;
     
     // 1. Sum all amounts EXCEPT the last one
     let sumOthers = 0;
     for(let i=0; i<lastIdx; i++) {
         sumOthers += newMs[i].amount;
     }
     
     // 2. Set the last milestone's amount to the remainder
     // Allow negative if over-budget, to show user the error visually
     newMs[lastIdx].amount = totalFlowAmount - sumOthers;
     
     // 3. Update Ratios for ALL
     newMs.forEach(m => {
         m.ratio = totalFlowAmount > 0 ? (m.amount / totalFlowAmount * 100) : 0;
     });
     
     return newMs;
  };

  // Added: Handlers for Dynamic Lead Source
  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    if (leadSourceOptions[newCategoryName.trim()]) {
        alert('既に存在します');
        return;
    }
    const newOptions = { ...leadSourceOptions, [newCategoryName.trim()]: [] };
    updateSettings({ ...settings, leadSourceOptions: newOptions });
    setForm(prev => ({ ...prev, leadSourceCategory: newCategoryName.trim(), leadSourceDetail: '' }));
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  const handleAddDetail = () => {
    if (!newDetailName.trim() || !form.leadSourceCategory) return;
    const category = form.leadSourceCategory;
    const currentDetails = leadSourceOptions[category] || [];
    if (currentDetails.includes(newDetailName.trim())) {
        alert('既に存在します');
        return;
    }
    const newDetails = [...currentDetails, newDetailName.trim()];
    const newOptions = { ...leadSourceOptions, [category]: newDetails };
    
    updateSettings({ ...settings, leadSourceOptions: newOptions });
    setForm(prev => ({ ...prev, leadSourceDetail: newDetailName.trim() }));
    setNewDetailName('');
    setIsAddingDetail(false);
  };

  // Logic to handle default settings when Project Type changes
  const handleTypeChange = (type: ProjectType) => {
     let useFlow = true;
     let useStock = false;
     let useTimeCharge = false;

     if (type === ProjectType.Dev) {
         useStock = true;
     } 
     // For Consulting, Seminar, BPO -> Flow=True, Stock=False (default)

     setForm(prev => ({
         ...prev,
         projectType: type,
         useFlow,
         useStock,
         useTimeCharge
     }));
  };

  // Helper to calculate the next day
  const getNextDay = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  // Handler for Flow End Date Change - Auto-update Stock Start Date if appropriate
  const handleFlowEndDateChange = (newDate: string) => {
    let updates: Partial<Project> = { flowEndDate: newDate };
    
    // Auto-draft Stock Start Date: if both Flow & Stock are used, set Stock Start to Flow End + 1 day
    if (form.useFlow && form.useStock) {
       const newStockStart = getNextDay(newDate);
       updates.stockStartDate = newStockStart;

       // Also update Stock End Date to 2 years from new start
       const d = new Date(newStockStart);
       d.setFullYear(d.getFullYear() + 2);
       d.setDate(d.getDate() - 1);
       updates.stockEndDate = d.toISOString().split('T')[0];
    }
    setForm(prev => ({ ...prev, ...updates }));
  };

  // Handler for Stock Checkbox - Auto-draft Date when enabled
  const handleUseStockChange = (checked: boolean) => {
    let updates: Partial<Project> = { useStock: checked };
    if (checked) {
        let currentStockStart = form.stockStartDate;
        
        // If Flow is enabled, align with Flow End
        if (form.useFlow && form.flowEndDate) {
            currentStockStart = getNextDay(form.flowEndDate);
            updates.stockStartDate = currentStockStart;
        }

        // Calculate 2 years from stock start
        if (currentStockStart) {
            const d = new Date(currentStockStart);
            d.setFullYear(d.getFullYear() + 2);
            d.setDate(d.getDate() - 1);
            updates.stockEndDate = d.toISOString().split('T')[0];
        }
    }
    setForm(prev => ({ ...prev, ...updates }));
  };

  // Handler for Contract Date - Auto-sync Start Date
  const handleContractDateChange = (date: string) => {
    setForm(prev => {
        const updates: Partial<Project> = { contractDate: date };
        
        // Logic: Sync "Start Date" to "Contract Date"
        // If Flow is enabled, Flow Start Date = Contract Date
        if (prev.useFlow) {
            updates.flowStartDate = date;
        } 
        // If Flow is disabled but Stock is enabled, Stock Start Date = Contract Date
        else if (prev.useStock) {
            updates.stockStartDate = date;
            
            // Also maintain the 2-year default duration for stock
            const d = new Date(date);
            d.setFullYear(d.getFullYear() + 2);
            d.setDate(d.getDate() - 1);
            updates.stockEndDate = d.toISOString().split('T')[0];
        }
        
        return { ...prev, ...updates };
    });
  };

  // --- Milestone Handlers ---

  // When Contract Total changes, recalculate the last milestone (Completion Money)
  const handleFlowAmountChange = (val: number) => {
      setForm(prev => {
          const milestones = prev.billingConfig?.flowMilestones || [];
          const updatedMilestones = recalculateMilestones(milestones, val);
          return {
              ...prev,
              flowAmount: val,
              billingConfig: {
                  ...prev.billingConfig!,
                  flowMilestones: updatedMilestones
              }
          };
      });
  };

  const handleToggleSplit = (checked: boolean) => {
      setForm(prev => {
          let newMilestones = prev.billingConfig?.flowMilestones || [];
          const total = prev.flowAmount || 0;

          // If enabling split and no milestones exist, create defaults [Start 50%, End 50%]
          if (checked && newMilestones.length === 0) {
              const half = Math.floor(total / 2);
              newMilestones = [
                  {
                      id: generateId(),
                      name: '着手金',
                      targetDate: prev.flowStartDate || '',
                      amount: half,
                      ratio: 50,
                      payDelay: 1,
                      payDay: 99
                  },
                  {
                      id: generateId(),
                      name: '完了金',
                      targetDate: prev.flowEndDate || '',
                      amount: total - half,
                      ratio: 50,
                      payDelay: 1,
                      payDay: 99
                  }
              ];
              // Ensure perfect calc
              newMilestones = recalculateMilestones(newMilestones, total);
          }

          // Always RevenueRecognitionMethod.Milestone (Billing Basis) now
          return {
              ...prev,
              revenueMethod: RevenueRecognitionMethod.Milestone,
              billingConfig: {
                  ...prev.billingConfig!,
                  flowSplit: checked,
                  flowMilestones: newMilestones
              }
          };
      });
  };

  const handleAddMilestone = () => {
    const currentMilestones = form.billingConfig?.flowMilestones || [];
    const total = form.flowAmount || 0;

    const newM: BillingMilestone = {
      id: generateId(),
      name: '中間金',
      targetDate: form.flowEndDate || '',
      amount: 0,
      ratio: 0,
      payDelay: 1,
      payDay: 99
    };
    
    // Logic: Insert BEFORE the last item (Completion Money) so user adds "Middle Money"
    // If list is empty (shouldn't happen if initialized), just push.
    const newList = [...currentMilestones];
    const insertIdx = Math.max(0, newList.length - 1);
    
    if (newList.length === 0) {
        newM.name = '完了金'; // First item acts as completion
        newList.push(newM);
    } else {
        newList.splice(insertIdx, 0, newM);
    }

    const updated = recalculateMilestones(newList, total);

    setForm(prev => ({
      ...prev,
      billingConfig: {
        ...prev.billingConfig!,
        flowMilestones: updated
      }
    }));
  };

  const handleUpdateMilestone = (id: string, updates: Partial<BillingMilestone>) => {
    setForm(prev => {
        const total = prev.flowAmount || 0;
        let ms = (prev.billingConfig!.flowMilestones || []).map(m => 
            m.id === id ? { ...m, ...updates } : m
        );
        
        // If amount changed, we must recalculate the last milestone to balance the total
        // Note: The UI prevents editing the last milestone's amount directly, 
        // but this logic ensures consistency if we edit any previous milestone.
        if (updates.amount !== undefined) {
            ms = recalculateMilestones(ms, total);
        }

        return { ...prev, billingConfig: { ...prev.billingConfig!, flowMilestones: ms } };
    });
  };

  const handleDeleteMilestone = (id: string) => {
    setForm(prev => {
      const filtered = (prev.billingConfig!.flowMilestones || []).filter(m => m.id !== id);
      const updated = recalculateMilestones(filtered, prev.flowAmount || 0);
      return {
          ...prev,
          billingConfig: {
            ...prev.billingConfig!,
            flowMilestones: updated
          }
      };
    });
  };

  // --- Filtering Logic ---
  const [filters, setFilters] = useState({
      client: '',
      project: '',
      type: '',
      lead: '',
      status: '',
      amountMin: 0,
      amountMax: 0,
      dateFrom: '',
      dateTo: ''
  });
  
  const filteredProjects = projects.filter(p => {
    // 1. View Mode Filter (Lost vs Active)
    if (showLostList) {
        if (p.status !== ProjectStatus.Lost) return false;
    } else {
        // Standard View: Show PreOrder, Ordered (Delivery), Delivered
        // Exclude Lost
        if (p.status === ProjectStatus.Lost) return false;
    }

    // 2. Term Overlap
    const { start: termStart, end: termEnd } = getTermDateRange(currentTerm);
    
    // Determine Project Start and End for filtering
    let pStart: Date | null = null;
    let pEnd: Date | null = null;

    if (p.useFlow) {
        if (p.flowStartDate) {
            const d = new Date(p.flowStartDate);
            if (!pStart || d < pStart) pStart = d;
        }
        if (p.flowEndDate) {
            const d = new Date(p.flowEndDate);
            if (!pEnd || d > pEnd) pEnd = d;
        }
    }
    if (p.useStock) {
        if (p.stockStartDate) {
            const d = new Date(p.stockStartDate);
            if (!pStart || d < pStart) pStart = d;
        }
        if (pStart) {
             // If stockEndDate exists, use it. Else assume future.
             if (p.stockEndDate) {
                 const d = new Date(p.stockEndDate);
                 if (!pEnd || d > pEnd) pEnd = d;
             } else {
                 pEnd = new Date(termEnd); 
                 pEnd.setFullYear(pEnd.getFullYear() + 1); // Future
             }
        }
    }
    if (p.useTimeCharge) {
        pStart = termStart;
        pEnd = termEnd;
    }

    if (!pStart) return false;
    if (!pEnd) pEnd = pStart;

    const overlaps = (pStart <= termEnd) && (pEnd >= termStart);
    if (!overlaps) return false;

    // 3. Column Screening
    if (filters.client && !p.clientName.toLowerCase().includes(filters.client.toLowerCase())) return false;
    if (filters.project && !p.projectName?.toLowerCase().includes(filters.project.toLowerCase())) return false;
    if (filters.type && p.projectType !== filters.type) return false;
    if (filters.lead && p.leadSourceCategory !== filters.lead) return false;
    if (filters.status && p.status !== filters.status) return false;

    // Amount Range Filter
    // Logic: If Flow exists, check Flow Amount. If only Stock, check Stock Amount.
    const amountVal = p.useFlow ? p.flowAmount : (p.useStock ? p.stockAmount : 0);
    
    if (filters.amountMin > 0 && amountVal < filters.amountMin) return false;
    if (filters.amountMax > 0 && amountVal > filters.amountMax) return false;

    // Date Range Filter (Start Date)
    const startDate = pStart ? pStart.toISOString().split('T')[0] : '';
    if (startDate) {
        if (filters.dateFrom && startDate < filters.dateFrom) return false;
        if (filters.dateTo && startDate > filters.dateTo) return false;
    } else {
        if (filters.dateFrom || filters.dateTo) return false;
    }

    return true;
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    const { flowStart, flowEnd, stockStart, stockEnd } = getInitialDates();
    setForm({
        ...initialFormState,
        flowStartDate: flowStart,
        flowEndDate: flowEnd,
        stockStartDate: stockStart,
        stockEndDate: stockEnd,
        timeChargePrices: {}
    });
    setShowModal(true);
  };

  const handleOpenEdit = (project: Project) => {
    setEditingId(project.id);
    setForm({ ...project, projectTasks: project.projectTasks || [] });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.clientName) {
       alert('クライアント名を入力してください。');
       return;
    }
    if (!form.useFlow && !form.useStock && !form.useTimeCharge) {
       alert('少なくとも1つの契約形態(固定報酬, サブスク, タイムチャージ)を選択してください。');
       return;
    }
    // Validation: Milestones
    if (form.useFlow && form.billingConfig?.flowSplit) {
       const milestones = form.billingConfig.flowMilestones || [];
       if (milestones.length === 0) {
           alert('分割請求を選択していますが、マイルストーンが登録されていません。');
           return;
       }
       const total = milestones.reduce((sum, m) => sum + m.amount, 0);
       // Strict check, but allow small floating point diff
       if (Math.abs(total - (form.flowAmount || 0)) > 1) { 
           if(!confirm(`マイルストーン合計額(${formatCurrency(total)})と契約総額(${formatCurrency(form.flowAmount || 0)})が一致しません。自動計算が正しく行われていない可能性がありますが、保存しますか？`)) {
               return;
           }
       }
    }

    const projectData = form as Project;
    if (editingId) {
      updateProject(projectData);
    } else {
      addProject(projectData);
    }
    
    setShowModal(false);
    setShowLostList(false);
    // Filters reset optional, but keeping filters active might be better UX
  };

  // Time Charge Monthly Grid generator
  const renderTimeChargeInputs = () => {
      const { start } = getTermDateRange(currentTerm);
      const months = [];
      for (let i = 0; i < 12; i++) {
          const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
          months.push({ 
            label: `${d.getFullYear()}/${d.getMonth()+1}`, 
            key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` 
          });
      }

      return (
          <div className="bg-purple-50 p-4 rounded border border-purple-100 relative mt-4">
               <span className="absolute -top-2.5 left-4 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">タイムチャージ (従量) 設定</span>
               <p className="text-xs text-purple-700 mb-2 mt-2">
                   対象月の売上見込額を入力してください。
               </p>
               <div className="grid grid-cols-3 gap-2">
                  {months.map(m => (
                      <div key={m.key} className="flex items-center gap-2 bg-white p-2 rounded border border-purple-100">
                          <span className="text-xs font-bold text-gray-500 w-16">{m.label}</span>
                          <NumberInput
                            className="w-full text-right border-b border-gray-200 focus:border-purple-500 focus:outline-none text-sm font-mono bg-white"
                            value={form.timeChargePrices?.[m.key] || 0}
                            onChange={(val) => {
                                const newPrices = { ...(form.timeChargePrices || {}) };
                                if (val === 0) delete newPrices[m.key];
                                else newPrices[m.key] = val;
                                setForm({ ...form, timeChargePrices: newPrices });
                            }}
                          />
                      </div>
                  ))}
               </div>
          </div>
      );
  };

  const PaymentTermInput = ({ 
    delayValue, 
    payDayValue,
    onDelayChange, 
    onPayDayChange 
  }: { 
    delayValue?: number, 
    payDayValue?: number,
    onDelayChange: (v: number) => void,
    onPayDayChange: (v: number) => void
  }) => (
    <div className="flex gap-2">
      <select 
        className="w-1/2 border p-2 rounded text-xs bg-white focus:ring-2 focus:ring-blue-500"
        value={delayValue}
        onChange={e => onDelayChange(Number(e.target.value))}
      >
        <option value={0}>当月</option>
        <option value={1}>翌月</option>
        <option value={2}>翌々月</option>
        <option value={3}>3ヶ月後</option>
      </select>
      <select
        className="w-1/2 border p-2 rounded text-xs bg-white focus:ring-2 focus:ring-blue-500"
        value={payDayValue || 99}
        onChange={e => onPayDayChange(Number(e.target.value))}
      >
        <option value={99}>末日</option>
        <option value={5}>5日</option>
        <option value={10}>10日</option>
        <option value={15}>15日</option>
        <option value={20}>20日</option>
        <option value={25}>25日</option>
      </select>
    </div>
  );

  return (
    <div className="space-y-6 h-full overflow-y-auto pr-2 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-wrap">
        <h2 className="text-xl font-bold text-gray-700 whitespace-nowrap">
            {showLostList ? `案件マスタ - 失注リスト (${currentTerm}年11月期)` : `案件マスタ (${currentTerm}年11月期)`}
        </h2>
        <div className="flex gap-2 flex-wrap">
          {showLostList ? (
             <button onClick={() => setShowLostList(false)} className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm font-bold shadow-sm whitespace-nowrap">
               <ArrowLeft className="w-4 h-4 mr-1"/> 案件一覧に戻る
             </button>
          ) : (
            <>
               <button onClick={() => setShowLostList(true)} className="flex items-center px-4 py-2 bg-white border border-red-200 text-red-600 rounded hover:bg-red-50 text-sm font-bold shadow-sm transition-colors whitespace-nowrap">
                 <Archive className="w-4 h-4 mr-1"/> 失注案件リスト
               </button>
               <button onClick={handleOpenCreate} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-bold shadow-sm whitespace-nowrap">
                 <Plus className="w-4 h-4 mr-1"/> 新規案件登録
               </button>
            </>
          )}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded shadow overflow-x-auto border border-gray-200">
        <table className="min-w-[1100px] w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase w-1/5">クライアント名</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase w-1/5">案件名</th>
              <th className="px-2 py-3 text-left text-xs font-bold text-gray-500 uppercase w-20">タイプ</th>
              <th className="px-2 py-3 text-left text-xs font-bold text-gray-500 uppercase w-28">リード経路</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase w-24">ステータス</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase w-28">初回商談日</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase w-28">契約日</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase w-28">金額</th>
              <th className="px-2 py-3 text-right w-16">操作</th>
            </tr>
            {/* Filter Row */}
            <tr className="bg-gray-100 border-t border-gray-200">
              <td className="px-4 py-2">
                 <div className="relative">
                   <Search className="w-3 h-3 absolute left-2 top-2.5 text-gray-400" />
                   <input 
                     className="w-full pl-7 pr-2 py-1 text-xs border rounded focus:outline-none focus:border-blue-500 bg-white"
                     placeholder="検索..."
                     value={filters.client}
                     onChange={e => setFilters({...filters, client: e.target.value})}
                   />
                 </div>
              </td>
              <td className="px-4 py-2">
                 <input 
                   className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:border-blue-500 bg-white"
                   placeholder="案件名検索..."
                   value={filters.project}
                   onChange={e => setFilters({...filters, project: e.target.value})}
                 />
              </td>
              <td className="px-2 py-2">
                 <select 
                   className="w-full px-1 py-1 text-xs border rounded focus:outline-none bg-white"
                   value={filters.type}
                   onChange={e => setFilters({...filters, type: e.target.value})}
                 >
                    <option value="">全タイプ</option>
                    {Object.values(ProjectType).map(t => <option key={t} value={t}>{t}</option>)}
                 </select>
              </td>
              <td className="px-2 py-2">
                 <select 
                   className="w-full px-1 py-1 text-xs border rounded focus:outline-none bg-white"
                   value={filters.lead}
                   onChange={e => setFilters({...filters, lead: e.target.value})}
                 >
                    <option value="">全経路</option>
                    {Object.keys(leadSourceOptions).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                 </select>
              </td>
              <td className="px-2 py-2">
                 <select 
                   className="w-full px-1 py-1 text-xs border rounded focus:outline-none bg-white"
                   value={filters.status}
                   onChange={e => setFilters({...filters, status: e.target.value})}
                   disabled={showLostList} // Lock if in Lost List view
                 >
                    <option value="">{showLostList ? '失注のみ' : '全ステータス'}</option>
                    {!showLostList && (
                        <>
                            <option value={ProjectStatus.PreOrder}>受注前</option>
                            <option value={ProjectStatus.Ordered}>デリバリー中</option>
                            <option value={ProjectStatus.Delivered}>完了</option>
                        </>
                    )}
                 </select>
              </td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2"></td>
              <td className="px-4 py-2">
                 <div className="flex gap-1">
                   <NumberInput 
                     className="w-1/2 px-1 py-1 text-[10px] border rounded focus:outline-none focus:border-blue-500 text-right bg-white"
                     placeholder="Min"
                     value={filters.amountMin}
                     onChange={val => setFilters({...filters, amountMin: val})}
                   />
                   <NumberInput 
                     className="w-1/2 px-1 py-1 text-[10px] border rounded focus:outline-none focus:border-blue-500 text-right bg-white"
                     placeholder="Max"
                     value={filters.amountMax}
                     onChange={val => setFilters({...filters, amountMax: val})}
                   />
                 </div>
              </td>
              <td className="px-2 py-2 text-center">
                 <button 
                   onClick={() => setFilters({ client: '', project: '', type: '', lead: '', status: '', amountMin: 0, amountMax: 0, dateFrom: '', dateTo: '' })}
                   className="text-xs text-gray-500 hover:text-gray-700 underline"
                   title="条件クリア"
                 >
                    クリア
                 </button>
              </td>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredProjects.map(p => {
                const durationLabel = calculateExactMonths(p.flowStartDate, p.flowEndDate).toFixed(1);
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 truncate" title={p.clientName}>
                      {p.clientName}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-blue-600 truncate" title={p.projectName}>
                       {p.projectName || '-'}
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-600">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs border border-gray-200 whitespace-nowrap">{p.projectType}</span>
                    </td>
                    <td className="px-2 py-3 text-sm text-gray-600">
                      {p.leadSourceCategory ? (
                        <div className="inline-flex items-center bg-gray-50 text-gray-600 text-xs px-2 py-1 rounded border border-gray-200 max-w-full truncate" title={`${p.leadSourceCategory} ${p.leadSourceDetail ? '/ '+p.leadSourceDetail : ''}`}>
                           <Tag className="w-3 h-3 mr-1 flex-shrink-0" />
                           <span className="truncate">{p.leadSourceCategory}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs pl-2">-</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-bold rounded-full border whitespace-nowrap ${
                        p.status === ProjectStatus.Ordered ? 'bg-green-50 text-green-700 border-green-200' : 
                        p.status === ProjectStatus.Delivered ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                        p.status === ProjectStatus.Lost ? 'bg-red-50 text-red-700 border-red-200' :
                        p.status === ProjectStatus.PreOrder ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                        'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-center text-xs text-gray-500 font-mono whitespace-nowrap">
                       {p.firstMeetingDate || '-'}
                    </td>
                    <td className="px-2 py-3 text-center text-xs text-gray-500 font-mono whitespace-nowrap">
                       {p.contractDate || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                       {p.useFlow && <div className="text-sm font-mono text-gray-900 whitespace-nowrap">{formatCurrency(p.flowAmount)} <span className="text-[10px] text-gray-400">(固)</span></div>}
                       {p.useStock && <div className="text-sm font-mono text-gray-700 whitespace-nowrap">{formatCurrency(p.stockAmount)} <span className="text-[10px] text-gray-400">/月</span></div>}
                       {p.useTimeCharge && <div className="text-sm font-mono text-purple-700 whitespace-nowrap">Time <span className="text-[10px] text-gray-400">(従量)</span></div>}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <button onClick={() => handleOpenEdit(p)} className="text-blue-600 hover:text-blue-800 font-bold text-sm whitespace-nowrap">
                        編集
                      </button>
                    </td>
                  </tr>
                );
            })}
            {filteredProjects.length === 0 && (
                <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-400">
                        条件に一致する案件はありません
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal code */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-[900px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b bg-gray-50">
              <div>
                <h3 className="text-xl font-bold text-gray-800">{editingId ? '案件詳細・編集' : '新規案件登録'}</h3>
                <p className="text-xs text-gray-500 mt-1">CF・収益分析・予実管理に必要な情報を網羅的に入力してください。</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-6 space-y-8">
              
              {/* 1. Basic Info */}
              <section>
                <h4 className="flex items-center text-sm font-bold text-blue-900 mb-4 pb-1 border-b border-blue-100">
                  <span className="bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs">1</span>
                  基本情報
                </h4>
                <div className="grid grid-cols-2 gap-6">
                  {/* ... Existing Inputs (Client, ProjectName, Type, Status) ... */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">クライアント名 <span className="text-red-500">*</span></label>
                    <input 
                      list="client-suggestions"
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
                      placeholder="例: 株式会社Irwin" 
                      value={form.clientName} 
                      onChange={e => setForm({...form, clientName: e.target.value})} 
                      autoFocus
                    />
                    <datalist id="client-suggestions">
                        {uniqueClients.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">案件名 (アップセル等の識別用)</label>
                    <input 
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
                      placeholder="例: フェーズ2開発, 保守運用2025" 
                      value={form.projectName} 
                      onChange={e => setForm({...form, projectName: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">案件タイプ</label>
                    <select 
                      className="w-full border p-2 rounded bg-white" 
                      value={form.projectType} 
                      onChange={e => handleTypeChange(e.target.value as ProjectType)}
                    >
                      {Object.values(ProjectType).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">ステータス</label>
                    <select 
                      className="w-full border p-2 rounded bg-white" 
                      value={form.status} 
                      onChange={e => setForm({...form, status: e.target.value as ProjectStatus})}
                    >
                       <option value={ProjectStatus.PreOrder}>受注前 (Draft)</option>
                       <option value={ProjectStatus.Ordered}>デリバリー中 (Active)</option>
                       <option value={ProjectStatus.Delivered}>デリバリー完了 (Completed)</option>
                       <option value={ProjectStatus.Lost}>失注 (Lost)</option>
                    </select>
                  </div>
                  
                  {/* Lead Source Inputs */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-gray-600">リード獲得経路 (大項目)</label>
                      {!isAddingCategory ? (
                        <button onClick={() => setIsAddingCategory(true)} className="text-[10px] text-blue-600 hover:underline flex items-center">
                          <Plus className="w-3 h-3 mr-0.5" /> 追加
                        </button>
                      ) : (
                         <button onClick={() => setIsAddingCategory(false)} className="text-[10px] text-gray-400 hover:text-gray-600">
                           キャンセル
                         </button>
                      )}
                    </div>
                    
                    {isAddingCategory ? (
                      <div className="flex gap-2">
                         <input 
                           className="flex-1 border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                           placeholder="新しいカテゴリー名"
                           value={newCategoryName}
                           onChange={e => setNewCategoryName(e.target.value)}
                           autoFocus
                           onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                         />
                         <button onClick={handleAddCategory} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold">追加</button>
                      </div>
                    ) : (
                      <select 
                        className="w-full border p-2 rounded bg-white" 
                        value={form.leadSourceCategory} 
                        onChange={e => setForm({
                            ...form, 
                            leadSourceCategory: e.target.value,
                            leadSourceDetail: '' 
                        })}
                      >
                         <option value="">選択してください</option>
                         {Object.keys(leadSourceOptions).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-gray-600">詳細・媒体名 (小項目)</label>
                       {!isAddingDetail && form.leadSourceCategory && (
                        <button onClick={() => setIsAddingDetail(true)} className="text-[10px] text-blue-600 hover:underline flex items-center">
                          <Plus className="w-3 h-3 mr-0.5" /> 追加
                        </button>
                      )}
                      {isAddingDetail && (
                         <button onClick={() => setIsAddingDetail(false)} className="text-[10px] text-gray-400 hover:text-gray-600">
                           キャンセル
                         </button>
                      )}
                    </div>

                    {isAddingDetail ? (
                       <div className="flex gap-2">
                         <input 
                           className="flex-1 border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                           placeholder="新しい項目名"
                           value={newDetailName}
                           onChange={e => setNewDetailName(e.target.value)}
                           autoFocus
                           onKeyDown={e => e.key === 'Enter' && handleAddDetail()}
                         />
                         <button onClick={handleAddDetail} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold">追加</button>
                      </div>
                    ) : (
                      <>
                        {form.leadSourceCategory && (leadSourceOptions[form.leadSourceCategory] || []).length > 0 ? (
                           <select 
                             className="w-full border p-2 rounded bg-white"
                             value={form.leadSourceDetail}
                             onChange={e => setForm({...form, leadSourceDetail: e.target.value})}
                           >
                             <option value="">選択してください</option>
                             {leadSourceOptions[form.leadSourceCategory]?.map(d => <option key={d} value={d}>{d}</option>)}
                           </select>
                        ) : (
                           <input 
                             className="w-full border p-2 rounded bg-gray-100 text-gray-500 cursor-not-allowed"
                             placeholder={form.leadSourceCategory ? "選択肢がありません (自由入力不可)" : "先に大項目を選択"}
                             value={form.leadSourceDetail}
                             readOnly
                           />
                        )}
                      </>
                    )}
                  </div>

                  {/* New Sales Dates */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">初回商談日</label>
                    <input 
                      type="date"
                      className="w-full border p-2 rounded bg-white"
                      value={form.firstMeetingDate || ''}
                      onChange={e => setForm({...form, firstMeetingDate: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">契約締結日</label>
                    <input 
                      type="date"
                      className="w-full border p-2 rounded bg-white"
                      value={form.contractDate || ''}
                      onChange={e => handleContractDateChange(e.target.value)}
                    />
                    {form.firstMeetingDate && form.contractDate && (
                        <div className="text-[10px] text-gray-500 mt-1 text-right">
                            リードタイム: {calculateDayDiff(form.firstMeetingDate, form.contractDate)}日
                        </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 2. Contract & Financials (Hybrid) */}
              <section>
                 <h4 className="flex items-center text-sm font-bold text-blue-900 mb-4 pb-1 border-b border-blue-100">
                  <span className="bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs">2</span>
                  契約形態・金額・スケジュール
                </h4>
                
                 {/* Contract Types Selector */}
                 <div className="flex gap-4 mb-6">
                   <label className="flex items-center cursor-pointer border p-3 rounded-md hover:bg-gray-50 transition-colors bg-white shadow-sm flex-1">
                     <input type="checkbox" className="w-5 h-5 text-blue-600 rounded mr-3"
                       checked={form.useFlow}
                       onChange={e => setForm({...form, useFlow: e.target.checked})}
                     />
                     <div>
                       <span className="block font-bold text-sm text-gray-800">固定報酬 (フロー)</span>
                       <span className="text-xs text-gray-500">受託開発・コンサル等</span>
                     </div>
                   </label>
                   <label className="flex items-center cursor-pointer border p-3 rounded-md hover:bg-gray-50 transition-colors bg-white shadow-sm flex-1">
                     <input type="checkbox" className="w-5 h-5 text-blue-600 rounded mr-3"
                       checked={form.useStock}
                       onChange={e => handleUseStockChange(e.target.checked)}
                     />
                     <div>
                       <span className="block font-bold text-sm text-gray-800">サブスク (ストック)</span>
                       <span className="text-xs text-gray-500">保守運用・顧問契約等</span>
                     </div>
                   </label>
                   <label className="flex items-center cursor-pointer border p-3 rounded-md hover:bg-gray-50 transition-colors bg-white shadow-sm flex-1">
                     <input type="checkbox" className="w-5 h-5 text-blue-600 rounded mr-3"
                       checked={form.useTimeCharge}
                       onChange={e => setForm({...form, useTimeCharge: e.target.checked})}
                     />
                     <div>
                       <span className="block font-bold text-sm text-gray-800">タイムチャージ (従量)</span>
                       <span className="text-xs text-gray-500">時間精算・スポット等</span>
                     </div>
                   </label>
                </div>

                <div className="space-y-6">
                  {/* Flow Settings */}
                  {form.useFlow && (
                    <div className="bg-blue-50 p-4 rounded border border-blue-100 relative">
                       <span className="absolute -top-2.5 left-4 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">固定報酬 (フロー) 設定</span>
                       <div className="grid grid-cols-12 gap-4 mt-1">
                          <div className="col-span-12 mb-2">
                             <div className="flex items-center gap-4 text-xs">
                               <label className="font-bold text-gray-600">売上計上ロジック:</label>
                               <span className="font-bold text-blue-700 bg-white px-2 py-1 rounded border border-blue-200 shadow-sm">
                                  請求基準 (マイルストーン/一括)
                               </span>
                             </div>
                             <p className="text-[10px] text-blue-600 mt-1 pl-20">
                                ※ 売上はすべて請求日基準で計上されます（分割時は各マイルストーン日、一括時は終了日）。
                             </p>
                          </div>
                          
                          <div className="col-span-4">
                            <label className="block text-xs font-bold text-gray-600 mb-1">契約総額</label>
                            <div className="relative">
                                <span className="absolute left-2 top-2 text-gray-400 text-xs">¥</span>
                                <NumberInput
                                  className="w-full border p-2 pl-6 rounded text-right font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                  value={form.flowAmount || 0}
                                  onChange={handleFlowAmountChange}
                                />
                            </div>
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs font-bold text-gray-600 mb-1">開始日</label>
                            <input type="date" className="w-full border p-2 rounded bg-white" value={form.flowStartDate} onChange={e => setForm({...form, flowStartDate: e.target.value})} />
                          </div>
                          <div className="col-span-1 flex items-center justify-center pt-5 text-gray-400">
                             ～
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs font-bold text-gray-600 mb-1">終了日</label>
                            <input 
                              type="date" 
                              className="w-full border p-2 rounded bg-white" 
                              value={form.flowEndDate} 
                              onChange={e => handleFlowEndDateChange(e.target.value)} 
                            />
                          </div>
                          <div className="col-span-1 flex items-center pt-5">
                             <span className="text-xs bg-white border px-2 py-1 rounded font-bold text-gray-700">
                                {calculateExactMonths(form.flowStartDate, form.flowEndDate).toFixed(1)}ヶ月
                             </span>
                          </div>
                       </div>
                    </div>
                  )}

                  {/* Stock Settings */}
                  {form.useStock && (
                     <div className="bg-orange-50 p-4 rounded border border-orange-100 relative">
                       <span className="absolute -top-2.5 left-4 bg-orange-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">サブスク (ストック) 設定</span>
                       <div className="grid grid-cols-12 gap-4 mt-1">
                          <div className="col-span-4">
                            <label className="block text-xs font-bold text-gray-600 mb-1">月額単価</label>
                            <div className="relative">
                                <span className="absolute left-2 top-2 text-gray-400 text-xs">¥</span>
                                <NumberInput
                                  className="w-full border p-2 pl-6 rounded text-right font-mono focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                  value={form.stockAmount || 0}
                                  onChange={val => setForm({...form, stockAmount: val})}
                                />
                            </div>
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs font-bold text-gray-600 mb-1">開始日</label>
                            <input type="date" className="w-full border p-2 rounded bg-white" value={form.stockStartDate} onChange={e => setForm({...form, stockStartDate: e.target.value})} />
                          </div>
                          <div className="col-span-1 flex items-center justify-center pt-5 text-gray-400">
                             ～
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs font-bold text-gray-600 mb-1">終了日 (任意)</label>
                            <input 
                              type="date" 
                              className="w-full border p-2 rounded bg-white" 
                              value={form.stockEndDate || ''} 
                              onChange={e => setForm({...form, stockEndDate: e.target.value})} 
                            />
                          </div>
                          <div className="col-span-1 flex items-center pt-5">
                             {form.stockStartDate && form.stockEndDate ? (
                                <span className="text-xs bg-white border px-2 py-1 rounded font-bold text-gray-700">
                                    {calculateExactMonths(form.stockStartDate, form.stockEndDate).toFixed(1)}ヶ月
                                </span>
                             ) : (
                                <span className="text-xs text-gray-400">継続</span>
                             )}
                          </div>
                       </div>
                     </div>
                  )}

                  {/* Time Charge Settings */}
                  {form.useTimeCharge && renderTimeChargeInputs()}
                </div>
              </section>

              {/* 3. Billing & Cash Flow */}
              <section>
                <h4 className="flex items-center text-sm font-bold text-blue-900 mb-4 pb-1 border-b border-blue-100">
                  <span className="bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs">3</span>
                  請求・キャッシュフロー設定
                </h4>
                
                {/* Flow Billing (Milestones) */}
                {form.useFlow && (
                   <div className="mb-6">
                      <div className="flex justify-between items-center mb-3">
                         <h5 className="text-sm font-bold text-gray-700 flex items-center">
                            <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                            固定報酬の請求条件 (マイルストーン)
                         </h5>
                         
                         <div className="flex items-center gap-3">
                            <div className="text-xs text-gray-500">
                               分割請求: 
                            </div>
                            <label className="inline-flex items-center cursor-pointer">
                               <input type="checkbox" className="sr-only peer" 
                                  checked={form.billingConfig?.flowSplit}
                                  onChange={e => handleToggleSplit(e.target.checked)}
                               />
                               <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                         </div>
                      </div>

                      {!form.billingConfig?.flowSplit ? (
                         <div className="p-4 border rounded bg-white bg-gray-50 text-center">
                            <p className="text-xs text-gray-500 mb-2">分割しない場合、完了日(終了日)に一括計上され、翌月末に請求されます。</p>
                            <div className="inline-block text-left bg-white p-3 border rounded">
                                <label className="block text-xs font-bold text-gray-600 mb-2">一括入金サイト</label>
                                <PaymentTermInput 
                                    delayValue={form.billingConfig?.flowEndDelay}
                                    payDayValue={form.billingConfig?.flowEndPayDay}
                                    onDelayChange={v => setForm({...form, billingConfig: {...form.billingConfig!, flowEndDelay: v}})}
                                    onPayDayChange={v => setForm({...form, billingConfig: {...form.billingConfig!, flowEndPayDay: v}})}
                                />
                            </div>
                         </div>
                      ) : (
                         <div className="bg-white border rounded p-4">
                            <table className="w-full text-xs mb-3">
                               <thead className="bg-gray-50">
                                  <tr>
                                     <th className="p-2 text-left text-gray-500 w-32">名目 (着手金等)</th>
                                     <th className="p-2 text-left text-gray-500 w-32">請求基準日 (売上計上)</th>
                                     <th className="p-2 text-right text-gray-500 w-32">金額 (円)</th>
                                     <th className="p-2 text-right text-gray-500 w-16">割合</th>
                                     <th className="p-2 text-left text-gray-500">入金サイト</th>
                                     <th className="p-2 w-8"></th>
                                  </tr>
                               </thead>
                               <tbody>
                                  {(form.billingConfig?.flowMilestones || []).map((m, idx) => {
                                     const isLast = idx === (form.billingConfig?.flowMilestones || []).length - 1;
                                     return (
                                     <tr key={m.id} className="border-b">
                                        <td className="p-2">
                                           <input 
                                             className="w-full border p-1 rounded bg-white"
                                             placeholder="着手金"
                                             value={m.name}
                                             onChange={e => handleUpdateMilestone(m.id, { name: e.target.value })}
                                           />
                                        </td>
                                        <td className="p-2">
                                           <input 
                                             type="date"
                                             className="w-full border p-1 rounded bg-white"
                                             value={m.targetDate}
                                             onChange={e => handleUpdateMilestone(m.id, { targetDate: e.target.value })}
                                           />
                                        </td>
                                        <td className="p-2 relative">
                                           <NumberInput 
                                              className={`w-full border p-1 rounded text-right ${isLast ? 'bg-gray-100 text-gray-700 border-gray-300' : 'bg-white'}`}
                                              value={m.amount}
                                              onChange={val => handleUpdateMilestone(m.id, { amount: val })}
                                              readOnly={isLast}
                                           />
                                           {isLast && <Lock className="w-3 h-3 text-gray-400 absolute left-3 top-3.5" />}
                                        </td>
                                        <td className="p-2 text-right text-gray-500">
                                           {m.ratio.toFixed(1)}%
                                        </td>
                                        <td className="p-2">
                                           <PaymentTermInput 
                                              delayValue={m.payDelay}
                                              payDayValue={m.payDay}
                                              onDelayChange={v => handleUpdateMilestone(m.id, { payDelay: v })}
                                              onPayDayChange={v => handleUpdateMilestone(m.id, { payDay: v })}
                                           />
                                        </td>
                                        <td className="p-2 text-center">
                                           {/* Prevent deleting if it's the only one, though we usually maintain 1 */}
                                           <button onClick={() => handleDeleteMilestone(m.id)} className="text-red-400 hover:text-red-600">
                                              <Trash2 className="w-4 h-4" />
                                           </button>
                                        </td>
                                     </tr>
                                  )})}
                               </tbody>
                            </table>
                            <div className="flex justify-between items-center border-t pt-2">
                               <button 
                                 onClick={handleAddMilestone}
                                 className="flex items-center text-xs text-blue-600 font-bold hover:bg-blue-50 px-3 py-1.5 rounded"
                               >
                                  <Plus className="w-3 h-3 mr-1" /> 行を追加
                               </button>
                               <div className="text-right text-xs">
                                  <span className="text-gray-500 mr-2">合計:</span>
                                  <span className={`font-mono text-sm font-bold ${(form.billingConfig?.flowMilestones?.reduce((s, m) => s + m.amount, 0) || 0) === (form.flowAmount || 0) ? 'text-green-600' : 'text-red-500'}`}>
                                     {formatCurrency(form.billingConfig?.flowMilestones?.reduce((s, m) => s + m.amount, 0) || 0)}
                                  </span>
                                  <span className="text-gray-400 mx-1">/</span>
                                  <span className="text-gray-600">{formatCurrency(form.flowAmount || 0)}</span>
                               </div>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-2 flex items-start">
                               <span className="bg-gray-200 text-gray-600 rounded px-1 mr-1 text-[10px]">Auto</span>
                               最後の行(完了金等)は、契約総額との差額として自動計算されます。金額を直接編集したい場合は、上の行を調整してください。
                            </div>
                         </div>
                      )}
                   </div>
                )}

                {/* Stock Billing */}
                {(form.useStock || form.useTimeCharge) && (
                   <div>
                      <h5 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                         <div className="w-2 h-2 bg-orange-500 rounded-full mr-2"></div>
                         サブスク・タイムチャージの請求条件
                      </h5>
                      <div className="p-4 border rounded bg-white">
                            <label className="block text-xs font-bold text-gray-600 mb-2">毎月の入金サイト</label>
                            <PaymentTermInput 
                                delayValue={form.billingConfig?.stockDelay}
                                payDayValue={form.billingConfig?.stockPayDay}
                                onDelayChange={v => setForm({...form, billingConfig: {...form.billingConfig!, stockDelay: v}})}
                                onPayDayChange={v => setForm({...form, billingConfig: {...form.billingConfig!, stockPayDay: v}})}
                            />
                         </div>
                   </div>
                )}
              </section>

              {/* 4. Assignments */}
              <section>
                 <h4 className="flex items-center text-sm font-bold text-blue-900 mb-4 pb-1 border-b border-blue-100">
                  <span className="bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs">4</span>
                  アサイン計画 (リソース稼働率)
                </h4>
                <div className="bg-gray-50 p-4 rounded border">
                   <p className="text-xs text-gray-500 mb-3">従業員の月次リソースに対する割合(%)を入力してください。(例: 50% = 週2.5日相当)</p>
                   <div className="grid grid-cols-2 gap-3 max-h-40 overflow-y-auto">
                      {employees.map(emp => {
                        const assign = form.assignments?.find(a => a.employeeId === emp.id);
                        return (
                          <div key={emp.id} className="flex justify-between items-center p-2 bg-white rounded border shadow-sm">
                            <span className="text-sm">{emp.name}</span>
                            <div className="flex items-center">
                              <label className="text-xs text-gray-400 mr-1">稼働率:</label>
                              <NumberInput
                                className="w-16 border rounded p-1 text-right mr-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                value={assign?.utilizationRate || 0}
                                onChange={(val) => {
                                  const currentAssigns = form.assignments || [];
                                  const newAssigns = currentAssigns.filter(a => a.employeeId !== emp.id);
                                  if (val > 0) newAssigns.push({ employeeId: emp.id, utilizationRate: val });
                                  setForm({...form, assignments: newAssigns});
                                }}
                              />
                              <span className="text-xs text-gray-600">%</span>
                            </div>
                          </div>
                        );
                      })}
                   </div>
                </div>
              </section>

            </div>

            {/* Footer */}
            <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
               <button onClick={() => setShowModal(false)} className="px-6 py-2 border rounded text-gray-600 hover:bg-gray-100 font-medium">キャンセル</button>
               <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 shadow">保存</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProjectMaster;
