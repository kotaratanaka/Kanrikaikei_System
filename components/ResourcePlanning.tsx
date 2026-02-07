
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useData } from '../context/AppContext';
import { getTermMonthsWithWeeks, generateId } from '../utils';
import { User, ChevronRight, CheckCircle2, CircleDashed, ListTodo, Plus, X } from 'lucide-react';
import { Project, ProjectStatus } from '../types';

const ResourcePlanning: React.FC = () => {
  const { employees, projects, workLogs, currentTerm, updateWorkLog, updateProject } = useData();
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  // Scroll Container Ref for auto-scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Task Creation Modal State
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [targetProject, setTargetProject] = useState<Project | null>(null);
  const [newTaskName, setNewTaskName] = useState('');

  // Grouped weeks structure
  const termMonths = useMemo(() => getTermMonthsWithWeeks(currentTerm), [currentTerm]);
  
  const selectedEmployee = employees.find(e => e.id === selectedEmpId);

  // Auto-scroll to current month on mount or term change OR when employee is selected
  useEffect(() => {
    if (scrollContainerRef.current) {
      const today = new Date();
      // Construct key like "2025-01" matching the utils format
      const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const targetEl = document.getElementById(`month-header-${currentMonthKey}`);
      
      if (targetEl) {
        // Sticky columns width: 240px (Project) + 80px (Type) = 320px
        // We subtract this offset so the target month appears right next to the sticky columns
        const stickyOffset = 320;
        scrollContainerRef.current.scrollLeft = targetEl.offsetLeft - stickyOffset;
      }
    }
  }, [termMonths, selectedEmpId]);

  // Helper to check if project is completed (EndDate < Today)
  const isProjectCompleted = (p: Project) => {
    // Determine the latest end date between flow and stock
    let endDate: Date | null = null;
    
    if (p.useFlow && p.flowEndDate) {
        const flowEnd = new Date(p.flowEndDate);
        if (!endDate || flowEnd > endDate) endDate = flowEnd;
    }
    
    if (p.useStock) {
        return false;
    }

    if (endDate) {
        return endDate < new Date();
    }
    return false;
  };

  // Filter projects relevant to the selected employee AND the active/completed state
  const empProjects = useMemo(() => {
    if (!selectedEmpId) return [];
    
    const relevantProjects = projects.filter(p => 
      p.assignments.some(a => a.employeeId === selectedEmpId) || 
      workLogs.some(l => l.employeeId === selectedEmpId && l.projectId === p.id)
    );

    return relevantProjects.filter(p => {
        // Exclude Lost projects from Resource Planning
        if (p.status === ProjectStatus.Lost) return false;

        const completed = isProjectCompleted(p);
        
        // Active Tab: Show 'Ordered' (Delivery in Progress) AND 'PreOrder' (Before Order/Draft)
        if (activeTab === 'active') {
             return p.status === ProjectStatus.Ordered || p.status === ProjectStatus.PreOrder;
        } else {
             // Completed Tab
             return p.status === ProjectStatus.Delivered || (p.status === ProjectStatus.Ordered && completed);
        }
    });
  }, [projects, workLogs, selectedEmpId, activeTab]);

  const openAddTaskModal = (project: Project) => {
    setTargetProject(project);
    setNewTaskName('');
    setShowTaskModal(true);
  };

  const handleAddTask = () => {
    if (!targetProject || !newTaskName) return;
    
    const updatedProject: Project = {
      ...targetProject,
      projectTasks: [
        ...(targetProject.projectTasks || []),
        { id: generateId(), name: newTaskName }
      ]
    };
    
    updateProject(updatedProject);
    setShowTaskModal(false);
  };

  return (
    <div className="flex h-full gap-4 relative">
      {/* Left Sidebar: Employee List */}
      <div className="w-64 bg-white rounded-lg shadow-sm border border-gray-200 overflow-y-auto flex flex-col">
        <div className="p-4 bg-gray-50 border-b">
          <h3 className="font-bold text-gray-700">従業員一覧</h3>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {employees.map(emp => (
            <li 
              key={emp.id}
              onClick={() => setSelectedEmpId(emp.id)}
              className={`p-4 border-b cursor-pointer hover:bg-blue-50 transition-colors flex justify-between items-center ${
                selectedEmpId === emp.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="bg-gray-200 p-2 rounded-full">
                  <User className="w-4 h-4 text-gray-600" />
                </div>
                <span className="font-medium text-gray-700">{emp.name}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </li>
          ))}
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden">
        {!selectedEmployee ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            左側のリストから従業員を選択してください
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
             {/* Header Info & Tabs */}
             <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
               <div>
                 <h3 className="text-lg font-bold text-gray-800">{selectedEmployee.name} - 稼働計画 ({currentTerm}年11月期)</h3>
                 <p className="text-xs text-gray-500">標準稼働(月): {selectedEmployee.defaultMonthlyHours}h</p>
               </div>
               
               <div className="flex bg-gray-200 p-1 rounded-lg">
                 <button 
                   onClick={() => setActiveTab('active')}
                   className={`flex items-center px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'active' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                 >
                   <CircleDashed className="w-4 h-4 mr-2" />
                   デリバリー中・受注前
                 </button>
                 <button 
                   onClick={() => setActiveTab('completed')}
                   className={`flex items-center px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === 'completed' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                 >
                   <CheckCircle2 className="w-4 h-4 mr-2" />
                   完了案件
                 </button>
               </div>
             </div>
             
             {/* Grid */}
             <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
               <table className="min-w-full divide-y divide-gray-200 border-collapse">
                 <thead className="bg-gray-100 sticky top-0 z-20">
                   {/* Row 1: Months */}
                   <tr>
                     <th className="p-2 border text-left min-w-[240px] font-medium text-gray-600 text-sm bg-gray-100 sticky left-0 z-30" rowSpan={2}>案件 / タスク</th>
                     <th className="p-2 border text-center font-medium text-gray-600 text-sm min-w-[80px] sticky left-[240px] bg-gray-100 z-30" rowSpan={2}>区分</th>
                     {termMonths.map((month) => (
                       <th 
                        key={month.label} 
                        id={`month-header-${month.yearMonth}`} // ID for scroll targeting
                        colSpan={month.weeks.length} 
                        className="p-2 border text-center font-bold text-gray-700 bg-gray-200"
                       >
                         {month.label}
                       </th>
                     ))}
                   </tr>
                   {/* Row 2: Weeks */}
                   <tr>
                     {termMonths.map(month => (
                       month.weeks.map((week: any) => (
                         <th key={week.startDate} className="p-1 border text-center min-w-[60px] text-xs font-medium text-gray-600 bg-gray-50">
                           <div className="font-bold">{week.weekNum}w</div>
                           <div className="text-[10px] text-gray-400">{week.label}</div>
                         </th>
                       ))
                     ))}
                   </tr>
                 </thead>
                 <tbody className="bg-white">
                    {/* Summary Row for Employee */}
                    <tr className="bg-blue-50 font-bold border-b-2 border-blue-100">
                       <td className="p-2 border sticky left-0 bg-blue-50 z-10 text-sm text-blue-900">合計稼働 (消化率)</td>
                       <td className="p-2 border text-center sticky left-[240px] bg-blue-50 z-10 text-xs">-</td>
                       {termMonths.map(month => 
                         month.weeks.map((week: any) => {
                           const totalActual = workLogs
                             .filter(l => l.employeeId === selectedEmployee.id && l.weekStartDate === week.startDate)
                             .reduce((sum, l) => sum + l.actualHours, 0);
                           
                           // Approx weekly standard
                           const standardWeekly = selectedEmployee.defaultMonthlyHours / 4.33; 
                           const utilization = (totalActual / standardWeekly) * 100;
                           
                           return (
                             <td key={week.startDate} className="p-2 border text-center text-xs">
                               <div className={utilization > 100 ? 'text-red-600' : 'text-blue-800'}>
                                 {totalActual}h<br/>
                                 <span className="text-[10px] opacity-75">({utilization.toFixed(0)}%)</span>
                               </div>
                             </td>
                           );
                         })
                       )}
                    </tr>

                    {/* Project Rows */}
                    {empProjects.map(proj => {
                      const assignment = proj.assignments.find(a => a.employeeId === selectedEmployee.id);
                      const utilizationRate = assignment?.utilizationRate || 0;
                      // Calculate planned hours from utilization rate
                      // E.g., 50% of 160h = 80h/month. Weekly approx = 80/4.33 = ~18.5
                      const monthlyHours = selectedEmployee.defaultMonthlyHours * (utilizationRate / 100);
                      const basePlannedWeekly = Math.round((monthlyHours / 4.33) * 10) / 10;
                      
                      const hasTasks = proj.projectTasks && proj.projectTasks.length > 0;
                      
                      const isHybrid = proj.useFlow && proj.useStock;

                      return (
                        <React.Fragment key={proj.id}>
                          {/* Project Header & Planned Row */}
                          <tr className="hover:bg-gray-50 border-t-2 border-gray-100">
                            <td className="p-2 border text-sm font-medium text-gray-800 sticky left-0 bg-white z-10 truncate max-w-[240px]" title={`${proj.clientName} ${proj.projectName || ''}`}>
                              <div>{proj.clientName}</div>
                              <div className="text-xs text-blue-600 font-normal truncate mb-1">
                                {proj.status === ProjectStatus.PreOrder && (
                                    <span className="bg-yellow-100 text-yellow-700 text-[10px] px-1 py-0.5 rounded border border-yellow-300 mr-1">受注前</span>
                                )}
                                {proj.projectName}
                              </div>
                              <button 
                                onClick={() => openAddTaskModal(proj)}
                                className="inline-flex items-center text-[10px] bg-white border border-blue-200 text-blue-600 px-2 py-0.5 rounded-full hover:bg-blue-50 transition-colors shadow-sm"
                              >
                                <Plus className="w-3 h-3 mr-1" /> タスク追加
                              </button>
                            </td>
                            <td className="p-2 border text-center text-[10px] text-gray-500 bg-gray-50 sticky left-[240px] z-10 leading-tight">
                              MAX<br/>稼働時間
                            </td>
                            {termMonths.map(month => 
                              month.weeks.map((week: any) => {
                                // Determine if this week is in the "Stock Phase" of a hybrid project
                                // If so, planned hours should be 0 (manual actuals only)
                                let plannedWeekly = basePlannedWeekly;
                                
                                if (isHybrid && proj.flowEndDate) {
                                   const weekDate = new Date(week.startDate);
                                   const flowEnd = new Date(proj.flowEndDate);
                                   if (weekDate > flowEnd) {
                                       plannedWeekly = 0;
                                   }
                                }

                                return (
                                  <td key={week.startDate} className="p-2 border text-center text-xs text-gray-400 bg-gray-50">
                                    {plannedWeekly > 0 ? plannedWeekly : '-'}
                                  </td>
                                );
                              })
                            )}
                          </tr>

                          {/* Task Actuals Rows */}
                          {hasTasks ? (
                              proj.projectTasks.map(task => (
                                <tr key={task.id}>
                                  <td className="p-2 border text-xs text-gray-600 sticky left-0 bg-white z-10 pl-6 flex items-center">
                                    <ListTodo className="w-3 h-3 mr-2 text-gray-400" />
                                    {task.name}
                                  </td>
                                  <td className="p-2 border text-center text-xs text-blue-600 font-medium sticky left-[240px] bg-white z-10">実績</td>
                                  {termMonths.map(month => 
                                    month.weeks.map((week: any) => {
                                      const log = workLogs.find(l => 
                                        l.projectId === proj.id && 
                                        l.taskId === task.id &&
                                        l.employeeId === selectedEmployee.id && 
                                        l.weekStartDate === week.startDate
                                      );
                                      const actual = log?.actualHours ?? 0;

                                      return (
                                        <td key={week.startDate} className="p-0 border text-center">
                                          <input 
                                            type="number"
                                            className={`w-full h-full text-center p-2 text-xs focus:bg-blue-50 focus:outline-none ${actual > 0 ? 'text-blue-800 font-bold' : 'text-gray-400'}`}
                                            value={actual || ''}
                                            placeholder="-"
                                            onChange={(e) => updateWorkLog({
                                              id: log?.id || '',
                                              projectId: proj.id,
                                              taskId: task.id,
                                              employeeId: selectedEmployee.id,
                                              weekStartDate: week.startDate,
                                              actualHours: Number(e.target.value)
                                            })}
                                            onFocus={(e) => e.target.select()}
                                          />
                                        </td>
                                      );
                                    })
                                  )}
                                </tr>
                              ))
                          ) : (
                             /* Default Actual Row if no tasks defined */
                             <tr>
                                <td className="p-2 border text-xs text-gray-400 sticky left-0 bg-white z-10 pl-6 italic">
                                  (タスク未定義)
                                </td>
                                <td className="p-2 border text-center text-xs text-blue-600 font-medium sticky left-[240px] bg-white z-10">実績</td>
                                {termMonths.map(month => 
                                  month.weeks.map((week: any) => {
                                    const log = workLogs.find(l => 
                                      l.projectId === proj.id && 
                                      !l.taskId && 
                                      l.employeeId === selectedEmployee.id && 
                                      l.weekStartDate === week.startDate
                                    );
                                    const actual = log?.actualHours ?? 0;

                                    return (
                                      <td key={week.startDate} className="p-0 border text-center">
                                        <input 
                                          type="number"
                                          className={`w-full h-full text-center p-2 text-xs focus:bg-blue-50 focus:outline-none ${actual > basePlannedWeekly ? 'text-red-600 font-bold' : 'text-gray-800'}`}
                                          value={actual || ''}
                                          placeholder="-"
                                          onChange={(e) => updateWorkLog({
                                            id: log?.id || '',
                                            projectId: proj.id,
                                            employeeId: selectedEmployee.id,
                                            weekStartDate: week.startDate,
                                            actualHours: Number(e.target.value)
                                          })}
                                          onFocus={(e) => e.target.select()}
                                        />
                                      </td>
                                    );
                                  })
                                )}
                             </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    
                    {empProjects.length === 0 && (
                        <tr>
                            <td colSpan={termMonths.reduce((acc, m) => acc + m.weeks.length, 0) + 2} className="p-8 text-center text-gray-400">
                                表示する案件がありません ({activeTab === 'active' ? 'デリバリー中・受注前' : '終了'}の案件なし)
                            </td>
                        </tr>
                    )}
                 </tbody>
               </table>
             </div>
          </div>
        )}
      </div>

      {/* Task Creation Modal */}
      {showTaskModal && (
        <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-xl w-80 border border-gray-200">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-bold text-gray-800 text-sm">タスク(中項目)の追加</h4>
              <button onClick={() => setShowTaskModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {targetProject?.clientName} - {targetProject?.projectName}
            </p>
            <input 
              autoFocus
              className="w-full border p-2 rounded text-sm mb-3 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="タスク名 (例: 要件定義, 開発)"
              value={newTaskName}
              onChange={e => setNewTaskName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTask()}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowTaskModal(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded">キャンセル</button>
              <button onClick={handleAddTask} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded font-bold hover:bg-blue-700">追加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourcePlanning;
