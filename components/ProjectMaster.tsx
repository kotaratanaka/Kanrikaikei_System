
import React, { useState } from 'react';
import { useData } from '../context/AppContext';
import { Project, ProjectType, ProjectStatus, RevenueRecognitionMethod } from '../types';
import { formatCurrency, getTermDateRange, calculateExactMonths } from '../utils';
import { Plus, Search, Filter, X, Archive, ArrowLeft, Tag } from 'lucide-react';
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

    return { flowStart, flowEnd: flowEndStr, stockStart: stockStartStr };
  };

  const { flowStart, flowEnd, stockStart } = getInitialDates();

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
    
    useFlow: true,
    useStock: true, // Default for Dev
    useTimeCharge: false,
    revenueMethod: RevenueRecognitionMethod.Duration, // Default
    
    flowAmount: 0,
    flowStartDate: flowStart,
    flowEndDate: flowEnd,
    
    stockAmount: 0,
    stockStartDate: stockStart,

    timeChargePrices: {},
    
    billingConfig: {
      flowSplit: false,
      flowStartRatio: 50,
      flowStartDelay: 1, 
      flowStartPayDay: 99, // End of Month
      flowEndDelay: 1, 
      flowEndPayDay: 99,
      stockDelay: 1,
      stockPayDay: 99
    }
  };
  const [form, setForm] = useState<Partial<Project>>(initialFormState);

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
       updates.stockStartDate = getNextDay(newDate);
    }
    setForm(prev => ({ ...prev, ...updates }));
  };

  // Handler for Stock Checkbox - Auto-draft Date when enabled
  const handleUseStockChange = (checked: boolean) => {
    let updates: Partial<Project> = { useStock: checked };
    if (checked && form.useFlow && form.flowEndDate) {
        updates.stockStartDate = getNextDay(form.flowEndDate);
    }
    setForm(prev => ({ ...prev, ...updates }));
  };


  // Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  
  const filteredProjects = projects.filter(p => {
    // 1. View Mode Filter (Lost vs Active)
    if (showLostList) {
        if (p.status !== ProjectStatus.Lost) return false;
    } else {
        // Standard View: Show PreOrder, Ordered (Delivery), Delivered
        // Exclude Lost
        if (p.status === ProjectStatus.Lost) return false;
    }

    const matchesSearch = 
      p.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (p.projectName && p.projectName.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesType = filterType === 'all' || p.projectType === filterType;
    
    // Term filter check (Overlap Logic)
    // Show if project duration overlaps with the fiscal term
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
        // Stock has no definite end usually, assume it extends to term end or future
        // If stock is active, set pEnd to termEnd to ensure overlap returns true
        if (pStart) {
             pEnd = new Date(termEnd); 
             pEnd.setFullYear(pEnd.getFullYear() + 1); // Future
        }
    }
    if (p.useTimeCharge) {
        // Assume overlapping if set, usually active
        pStart = termStart;
        pEnd = termEnd;
    }

    // If no date set, assume it's a draft and might show up if just created? 
    // Or strictly hide. Let's hide if absolutely no date, but pre-filled defaults usually prevent this.
    if (!pStart) return false;
    if (!pEnd) pEnd = pStart;

    // Overlap Check: (StartA <= EndB) and (EndA >= StartB)
    const overlaps = (pStart <= termEnd) && (pEnd >= termStart);

    return matchesSearch && matchesType && overlaps;
  });

  const handleOpenCreate = () => {
    setEditingId(null);
    // Re-calculate initial dates based on CURRENT TERM for new open
    const { flowStart, flowEnd, stockStart } = getInitialDates();
    setForm({
        ...initialFormState,
        flowStartDate: flowStart,
        flowEndDate: flowEnd,
        stockStartDate: stockStart,
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
    // Validation
    if (!form.clientName) {
       alert('クライアント名を入力してください。');
       return;
    }
    if (!form.useFlow && !form.useStock && !form.useTimeCharge) {
       alert('少なくとも1つの契約形態(固定報酬, サブスク, タイムチャージ)を選択してください。');
       return;
    }

    const projectData = form as Project;
    if (editingId) {
      updateProject(projectData);
    } else {
      addProject(projectData);
    }
    
    // Reset View State to show the saved project
    setShowModal(false);
    setShowLostList(false); // Switch to active list
    setSearchTerm(''); // Clear search
    setFilterType('all'); // Clear filters
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
                            className="w-full text-right border-b border-gray-200 focus:border-purple-500 focus:outline-none text-sm font-mono"
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
        className="w-1/2 border p-2 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500"
        value={delayValue}
        onChange={e => onDelayChange(Number(e.target.value))}
      >
        <option value={0}>当月 (0ヶ月)</option>
        <option value={1}>翌月 (1ヶ月後)</option>
        <option value={2}>翌々月 (2ヶ月後)</option>
        <option value={3}>3ヶ月後</option>
        <option value={4}>4ヶ月後</option>
      </select>
      <select
        className="w-1/2 border p-2 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500"
        value={payDayValue || 99}
        onChange={e => onPayDayChange(Number(e.target.value))}
      >
        <option value={99}>末日払い</option>
        <option value={5}>5日払い</option>
        <option value={10}>10日払い</option>
        <option value={15}>15日払い</option>
        <option value={20}>20日払い</option>
        <option value={25}>25日払い</option>
      </select>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-700">
            {showLostList ? `案件マスタ - 失注リスト (${currentTerm}年11月期)` : `案件マスタ (${currentTerm}年11月期)`}
        </h2>
        <div className="flex gap-2">
          {showLostList ? (
             <button onClick={() => setShowLostList(false)} className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm font-bold shadow-sm">
               <ArrowLeft className="w-4 h-4 mr-1"/> 案件一覧に戻る
             </button>
          ) : (
            <>
               <button onClick={() => setShowLostList(true)} className="flex items-center px-4 py-2 bg-white border border-red-200 text-red-600 rounded hover:bg-red-50 text-sm font-bold shadow-sm transition-colors">
                 <Archive className="w-4 h-4 mr-1"/> 失注案件リスト
               </button>
               <button onClick={handleOpenCreate} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-bold shadow-sm">
                 <Plus className="w-4 h-4 mr-1"/> 新規案件登録
               </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 bg-white p-4 rounded shadow-sm border border-gray-100">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
          <input 
            className="w-full pl-10 pr-4 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" 
            placeholder="クライアント名、案件名で検索..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-gray-500" />
          <select className="border p-2 rounded text-sm bg-gray-50" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">全タイプ</option>
            {Object.values(ProjectType).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded shadow overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase w-1/5">クライアント名</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase w-1/5">案件名</th>
              <th className="px-2 py-3 text-left text-xs font-bold text-gray-500 uppercase w-24">タイプ</th>
              <th className="px-2 py-3 text-left text-xs font-bold text-gray-500 uppercase w-32">リード経路</th>
              <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase w-28">ステータス</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase w-32">金額</th>
              <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase w-40">開始/期間</th>
              <th className="px-2 py-3 text-right w-20">操作</th>
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
                    <td className="px-4 py-3 text-right">
                       {p.useFlow && <div className="text-sm font-mono text-gray-900 whitespace-nowrap">{formatCurrency(p.flowAmount)} <span className="text-[10px] text-gray-400">(固)</span></div>}
                       {p.useStock && <div className="text-sm font-mono text-gray-700 whitespace-nowrap">{formatCurrency(p.stockAmount)} <span className="text-[10px] text-gray-400">/月</span></div>}
                       {p.useTimeCharge && <div className="text-sm font-mono text-purple-700 whitespace-nowrap">Time <span className="text-[10px] text-gray-400">(従量)</span></div>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500 whitespace-nowrap">
                      {p.useFlow ? (
                          <>
                            {p.flowStartDate} ~ {p.flowEndDate}
                            <div className="text-[10px] text-gray-400">({durationLabel}ヶ月)</div>
                          </>
                      ) : (
                          <>{p.stockStartDate} ~</>
                      )}
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
                <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                   {showLostList ? '失注案件はありません' : '該当する案件がありません'}
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
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
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
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 outline-none" 
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
                           className="flex-1 border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
                           className="flex-1 border p-2 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
                               <label className="flex items-center cursor-pointer">
                                  <input 
                                    type="radio" 
                                    name="revenueMethod" 
                                    className="mr-1"
                                    checked={form.revenueMethod === RevenueRecognitionMethod.Duration || !form.revenueMethod}
                                    onChange={() => setForm({...form, revenueMethod: RevenueRecognitionMethod.Duration})}
                                  />
                                  期間按分 (月次平準化)
                               </label>
                               <label className="flex items-center cursor-pointer">
                                  <input 
                                    type="radio" 
                                    name="revenueMethod" 
                                    className="mr-1"
                                    checked={form.revenueMethod === RevenueRecognitionMethod.Milestone}
                                    onChange={() => setForm({...form, revenueMethod: RevenueRecognitionMethod.Milestone})}
                                  />
                                  請求基準 (着手・完了月のみ計上)
                               </label>
                             </div>
                             <p className="text-[10px] text-blue-600 mt-1 pl-20">
                                {form.revenueMethod === RevenueRecognitionMethod.Milestone 
                                   ? "※ 作業期間中の月は売上0円となり、着手金・完了金の請求月のみに売上が立ちます。" 
                                   : "※ 契約金額を作業期間で割り、毎月均等に売上を計上します(デフォルト)。"}
                             </p>
                          </div>
                          
                          <div className="col-span-4">
                            <label className="block text-xs font-bold text-gray-600 mb-1">契約総額</label>
                            <div className="relative">
                                <span className="absolute left-2 top-2 text-gray-400 text-xs">¥</span>
                                <NumberInput
                                  className="w-full border p-2 pl-6 rounded text-right font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                                  value={form.flowAmount || 0}
                                  onChange={val => setForm({...form, flowAmount: val})}
                                />
                            </div>
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs font-bold text-gray-600 mb-1">開始日</label>
                            <input type="date" className="w-full border p-2 rounded" value={form.flowStartDate} onChange={e => setForm({...form, flowStartDate: e.target.value})} />
                          </div>
                          <div className="col-span-1 flex items-center justify-center pt-5 text-gray-400">
                             ～
                          </div>
                          <div className="col-span-3">
                            <label className="block text-xs font-bold text-gray-600 mb-1">終了日</label>
                            <input 
                              type="date" 
                              className="w-full border p-2 rounded" 
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
                                  className="w-full border p-2 pl-6 rounded text-right font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                                  value={form.stockAmount || 0}
                                  onChange={val => setForm({...form, stockAmount: val})}
                                />
                            </div>
                          </div>
                          <div className="col-span-4">
                            <label className="block text-xs font-bold text-gray-600 mb-1">開始日</label>
                            <input type="date" className="w-full border p-2 rounded" value={form.stockStartDate} onChange={e => setForm({...form, stockStartDate: e.target.value})} />
                          </div>
                          <div className="col-span-4 flex items-center pt-4 text-xs text-gray-500">
                             ※ 終了日が決まっている場合は、終了時に手動で完了に変更してください。
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
                
                {/* Flow Billing */}
                {form.useFlow && (
                   <div className="mb-6">
                      <h5 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                         <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                         固定報酬の請求条件
                      </h5>
                      
                      <div className="flex items-center justify-between mb-3 bg-gray-50 p-2 rounded border border-gray-200">
                         <span className="text-xs font-bold text-gray-600">分割請求 (着手金・完了金など)</span>
                         <label className="inline-flex items-center cursor-pointer">
                           <input type="checkbox" className="sr-only peer" 
                              checked={form.billingConfig?.flowSplit}
                              onChange={e => setForm({
                                ...form,
                                billingConfig: { ...form.billingConfig!, flowSplit: e.target.checked }
                              })}
                           />
                           <div className="relative w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                         </label>
                      </div>

                      {form.billingConfig?.flowSplit ? (
                         <div className="grid grid-cols-2 gap-6 bg-white border p-4 rounded">
                            {/* Start Payment */}
                            <div className="p-3 bg-gray-50 rounded border border-gray-100">
                               <div className="text-xs font-bold text-gray-500 mb-2 border-b pb-1">開始時 (着手金)</div>
                               <div className="space-y-3">
                                  <div>
                                     <label className="text-[10px] text-gray-400 block mb-1">金額 (円)</label>
                                     <div className="relative">
                                        <span className="absolute left-2 top-2 text-gray-400 text-xs">¥</span>
                                        <NumberInput 
                                            className="w-full border p-2 pl-6 rounded text-right text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none" 
                                            value={Math.round((form.flowAmount || 0) * ((form.billingConfig.flowStartRatio || 0) / 100))}
                                            onChange={val => {
                                                // Constrain amount to total flow amount
                                                const amount = Math.min(val, form.flowAmount || 0);
                                                const ratio = (form.flowAmount && form.flowAmount > 0) ? (amount / form.flowAmount) * 100 : 0;
                                                setForm({
                                                   ...form,
                                                   billingConfig: { ...form.billingConfig!, flowStartRatio: ratio }
                                                });
                                            }}
                                        />
                                     </div>
                                     <div className="text-right text-[10px] text-gray-400 mt-1">
                                         割合: {form.billingConfig.flowStartRatio?.toFixed(1)}% (自動計算)
                                     </div>
                                  </div>
                                  <div>
                                     <label className="text-[10px] text-gray-400 block mb-1">入金サイト</label>
                                     <PaymentTermInput 
                                        delayValue={form.billingConfig.flowStartDelay}
                                        payDayValue={form.billingConfig.flowStartPayDay}
                                        onDelayChange={v => setForm({...form, billingConfig: {...form.billingConfig!, flowStartDelay: v}})}
                                        onPayDayChange={v => setForm({...form, billingConfig: {...form.billingConfig!, flowStartPayDay: v}})}
                                     />
                                  </div>
                                </div>
                            </div>
                            
                            {/* End Payment */}
                            <div className="p-3 bg-gray-50 rounded border border-gray-100">
                               <div className="text-xs font-bold text-gray-500 mb-2 border-b pb-1">完了時 (残金)</div>
                               <div className="space-y-3">
                                  <div>
                                     <label className="text-[10px] text-gray-400 block mb-1">金額 (円)</label>
                                     <div className="relative">
                                         <span className="absolute left-2 top-2 text-gray-400 text-xs">¥</span>
                                         <input 
                                            type="text"
                                            className="w-full border p-2 pl-6 rounded text-right text-sm font-mono bg-gray-100 text-gray-500" 
                                            value={Math.round((form.flowAmount || 0) * ((100 - (form.billingConfig.flowStartRatio || 0)) / 100)).toLocaleString()} 
                                            readOnly
                                         />
                                     </div>
                                     <div className="text-right text-[10px] text-gray-400 mt-1">
                                         割合: {(100 - (form.billingConfig.flowStartRatio || 0)).toFixed(1)}%
                                     </div>
                                  </div>
                                  <div>
                                     <label className="text-[10px] text-gray-400 block mb-1">入金サイト</label>
                                     <PaymentTermInput 
                                        delayValue={form.billingConfig.flowEndDelay}
                                        payDayValue={form.billingConfig.flowEndPayDay}
                                        onDelayChange={v => setForm({...form, billingConfig: {...form.billingConfig!, flowEndDelay: v}})}
                                        onPayDayChange={v => setForm({...form, billingConfig: {...form.billingConfig!, flowEndPayDay: v}})}
                                     />
                                  </div>
                               </div>
                            </div>
                         </div>
                      ) : (
                         <div className="p-4 border rounded bg-white">
                            <label className="block text-xs font-bold text-gray-600 mb-2">一括入金サイト (完了時)</label>
                            <PaymentTermInput 
                                delayValue={form.billingConfig?.flowEndDelay}
                                payDayValue={form.billingConfig?.flowEndPayDay}
                                onDelayChange={v => setForm({...form, billingConfig: {...form.billingConfig!, flowEndDelay: v}})}
                                onPayDayChange={v => setForm({...form, billingConfig: {...form.billingConfig!, flowEndPayDay: v}})}
                            />
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
                                className="w-16 border rounded p-1 text-right mr-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
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
