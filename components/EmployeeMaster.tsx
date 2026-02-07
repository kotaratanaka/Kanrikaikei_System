import React, { useState } from 'react';
import { useData } from '../context/AppContext';
import { ContractType, Employee, MonthlyEmployeeData } from '../types';
import { formatCurrency, getTermDateRange, getEmployeeMonthlyData, generateId } from '../utils';
import { Plus, Trash2, X, Settings, User, Edit2, Check } from 'lucide-react';
import { NumberInput } from './NumberInput';

const EmployeeMaster: React.FC = () => {
  const { employees, addEmployee, updateEmployee, deleteEmployee, currentTerm } = useData();
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  
  // State for Monthly Edit Mode
  const [isEditingMonthlyMode, setIsEditingMonthlyMode] = useState(false);
  const [tempMonthlyData, setTempMonthlyData] = useState<Record<string, MonthlyEmployeeData> | null>(null);

  // Today's context for display
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  const handleCreateNew = () => {
    const newEmp: Employee = {
      id: generateId(),
      name: '',
      contractType: ContractType.Contractor,
      defaultMonthlyCost: 0,
      defaultMonthlyHours: 160,
      monthlyData: {}
    };
    setEditingEmp(newEmp);
    setIsEditingMonthlyMode(false);
    setTempMonthlyData(null);
  };

  const handleOpenEdit = (emp: Employee) => {
    // Clone to avoid direct mutation
    setEditingEmp({ ...emp, monthlyData: { ...emp.monthlyData } });
    setIsEditingMonthlyMode(false);
    setTempMonthlyData(null);
  };

  const handleSave = () => {
    if (!editingEmp || !editingEmp.name) return;
    
    // Check if it's a new employee (id check against existing list)
    const exists = employees.some(e => e.id === editingEmp.id);
    
    if (exists) {
      updateEmployee(editingEmp);
    } else {
      addEmployee(editingEmp);
    }
    setEditingEmp(null);
  };

  // --- Monthly Edit Handlers ---
  const startMonthlyEdit = () => {
    if (!editingEmp) return;
    // Backup current data for cancel
    setTempMonthlyData(JSON.parse(JSON.stringify(editingEmp.monthlyData)));
    setIsEditingMonthlyMode(true);
  };

  const saveMonthlyEdit = () => {
    setIsEditingMonthlyMode(false);
    setTempMonthlyData(null);
  };

  const cancelMonthlyEdit = () => {
    if (editingEmp && tempMonthlyData) {
        setEditingEmp({ ...editingEmp, monthlyData: tempMonthlyData });
    }
    setIsEditingMonthlyMode(false);
    setTempMonthlyData(null);
  };

  const renderSettingsModal = () => {
    if (!editingEmp) return null;
    const { start } = getTermDateRange(currentTerm);
    const months = [];
    // Generate 12 months for the current term
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      months.push({ 
        label: `${d.getFullYear()}/${d.getMonth()+1}`, 
        key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` 
      });
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg w-[700px] max-h-[90vh] overflow-auto shadow-xl">
          <div className="flex justify-between items-center mb-6 border-b pb-4">
             <h3 className="font-bold text-xl text-gray-800 flex items-center">
               <Settings className="w-5 h-5 mr-2 text-gray-500"/>
               従業員設定
             </h3>
             <button onClick={() => setEditingEmp(null)} className="text-gray-400 hover:text-gray-600">
               <X className="w-6 h-6"/>
             </button>
          </div>

          <div className="space-y-6">
            {/* Basic Info Section */}
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
              <h4 className="text-sm font-bold text-gray-700 mb-3 border-b border-gray-200 pb-1">基本情報</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 mb-1">名前</label>
                  <input 
                    className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder="氏名を入力" 
                    value={editingEmp.name} 
                    onChange={e => setEditingEmp({...editingEmp, name: e.target.value})} 
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 mb-1">契約形態</label>
                  <select 
                    className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
                    value={editingEmp.contractType} 
                    onChange={e => setEditingEmp({...editingEmp, contractType: e.target.value as ContractType})}
                  >
                    <option value={ContractType.Contractor}>{ContractType.Contractor}</option>
                    <option value={ContractType.FullTime}>{ContractType.FullTime}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">基本報酬 (月額)</label>
                  <div className="relative">
                    <span className="absolute left-2 top-2 text-gray-400 text-xs">¥</span>
                    <NumberInput
                      className="w-full border border-gray-300 rounded p-2 pl-6 text-right focus:ring-2 focus:ring-blue-500 outline-none"
                      value={editingEmp.defaultMonthlyCost}
                      onChange={val => setEditingEmp({...editingEmp, defaultMonthlyCost: val})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">基本稼働 (月h)</label>
                  <div className="relative">
                     <NumberInput 
                      className="w-full border border-gray-300 rounded p-2 pr-8 text-right focus:ring-2 focus:ring-blue-500 outline-none" 
                      value={editingEmp.defaultMonthlyHours}
                      onChange={val => setEditingEmp({...editingEmp, defaultMonthlyHours: val})}
                    />
                    <span className="absolute right-3 top-2 text-gray-400 text-xs">h</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Overrides Section */}
            <div>
              <div className="flex justify-between items-end mb-2">
                 <div>
                    <h4 className="text-sm font-bold text-gray-700">月次詳細設定 ({currentTerm}年11月期)</h4>
                    <p className="text-xs text-gray-500 mt-1">
                       月ごとに報酬や稼働時間が異なる場合に入力してください。
                    </p>
                 </div>
                 
                 {isEditingMonthlyMode ? (
                   <div className="flex gap-2">
                      <button 
                        onClick={cancelMonthlyEdit}
                        className="flex items-center text-xs px-3 py-1.5 rounded bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                      >
                         <X className="w-3 h-3 mr-1" /> 保存しない
                      </button>
                      <button 
                        onClick={saveMonthlyEdit}
                        className="flex items-center text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                      >
                         <Check className="w-3 h-3 mr-1" /> 完了
                      </button>
                   </div>
                 ) : (
                   <button 
                     onClick={startMonthlyEdit}
                     className="flex items-center text-xs px-3 py-1.5 rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                   >
                     <Edit2 className="w-3 h-3 mr-1" /> 編集
                   </button>
                 )}
              </div>
              
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-2 px-3 text-left font-medium text-gray-600">対象月</th>
                      <th className="py-2 px-3 text-right font-medium text-gray-600">報酬 (月額)</th>
                      <th className="py-2 px-3 text-right font-medium text-gray-600">想定稼働 (月h)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {months.map(m => {
                      const data = editingEmp.monthlyData[m.key] || {};
                      const costOverride = data.cost;
                      const hoursOverride = data.monthlyHours;
                      
                      // Values to display: use override if present, otherwise default
                      const displayCost = costOverride ?? editingEmp.defaultMonthlyCost;
                      const displayHours = hoursOverride ?? editingEmp.defaultMonthlyHours;
                      
                      const isCostOverridden = costOverride !== undefined;
                      const isHoursOverridden = hoursOverride !== undefined;
                      const isOverridden = isCostOverridden || isHoursOverridden;

                      return (
                        <tr key={m.key} className={isOverridden && isEditingMonthlyMode ? 'bg-blue-50' : 'bg-white'}>
                          <td className="py-2 px-3 font-mono text-gray-700">{m.label}</td>
                          <td className="py-2 px-3 text-right">
                            {isEditingMonthlyMode ? (
                                <NumberInput 
                                  className={`w-full p-1 border rounded text-right focus:ring-2 focus:ring-blue-500 outline-none ${isCostOverridden ? 'border-blue-300 font-bold text-blue-900' : 'border-gray-200 text-gray-600'}`}
                                  value={displayCost}
                                  onChange={(val) => {
                                     const newData = { ...editingEmp.monthlyData };
                                     // Ensure we store the number, allowing it to be 0 or distinct from default
                                     newData[m.key] = { 
                                        cost: val, 
                                        monthlyHours: hoursOverride ?? editingEmp.defaultMonthlyHours 
                                     };
                                     setEditingEmp({ ...editingEmp, monthlyData: newData });
                                  }}
                                />
                            ) : (
                                <span className={`${isCostOverridden ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                                    {formatCurrency(displayCost)}
                                </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                             {isEditingMonthlyMode ? (
                                 <NumberInput 
                                  className={`w-full p-1 border rounded text-right focus:ring-2 focus:ring-blue-500 outline-none ${isHoursOverridden ? 'border-blue-300 font-bold text-blue-900' : 'border-gray-200 text-gray-600'}`}
                                  value={displayHours}
                                  onChange={(val) => {
                                     const newData = { ...editingEmp.monthlyData };
                                     newData[m.key] = { 
                                        cost: costOverride ?? editingEmp.defaultMonthlyCost, 
                                        monthlyHours: val 
                                     };
                                     setEditingEmp({ ...editingEmp, monthlyData: newData });
                                  }}
                                />
                             ) : (
                                <span className={`${isHoursOverridden ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                                    {displayHours}
                                </span>
                             )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6 gap-3 border-t pt-4">
            <button onClick={() => setEditingEmp(null)} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">キャンセル</button>
            <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 shadow-sm">
              設定を保存
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-700">従業員マスタ ({currentTerm}年11月期)</h2>
        <button onClick={handleCreateNew} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-bold shadow-sm">
          <Plus className="w-4 h-4 mr-1"/> 新規従業員登録
        </button>
      </div>

      <div className="bg-white rounded shadow overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">氏名</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">契約形態</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">基本報酬</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">標準稼働</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {employees.map(emp => (
              <tr key={emp.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 flex items-center">
                  <div className="bg-blue-100 p-2 rounded-full mr-3 text-blue-600">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-gray-700">{emp.name}</span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <span className="px-2 py-1 bg-gray-100 rounded text-xs border border-gray-200">{emp.contractType}</span>
                </td>
                <td className="px-6 py-4 text-right text-sm font-mono text-gray-900">
                  {formatCurrency(emp.defaultMonthlyCost)}
                </td>
                <td className="px-6 py-4 text-right text-sm font-mono text-gray-900">
                  {emp.defaultMonthlyHours}h
                </td>
                <td className="px-6 py-4 text-center">
                   <div className="flex justify-center gap-4">
                     <button onClick={() => handleOpenEdit(emp)} className="text-blue-600 hover:text-blue-800 font-bold text-sm flex items-center">
                       <Settings className="w-4 h-4 mr-1" /> 設定
                     </button>
                     <button onClick={() => deleteEmployee(emp.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">従業員が登録されていません</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {renderSettingsModal()}
    </div>
  );
};

export default EmployeeMaster;