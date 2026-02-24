
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { Employee, Project, WorkLog, AppSettings, DataContextType, ContractType, ProjectType, ProjectStatus, CashFlowCategory, RevenueRecognitionMethod, EmployeeRole, CashFlowType, ChatMessage } from '../types';
import { generateId } from '../utils';

const AppContext = createContext<DataContextType | undefined>(undefined);

const STORAGE_KEY = 'irwin_manager_db_v4';

const defaultSettings: AppSettings = {
  targetLaborShareMin: 40,
  targetLaborShareMax: 50,
  salesTargets: {},
  monthlySalesTarget: 5000000,
  initialCashBalance: 10000000, 
  cashFlowItems: [
    {
      id: 'cf-1',
      name: 'オフィス家賃',
      category: CashFlowCategory.OperatingExpense,
      type: CashFlowType.Recurring,
      amount: 200000,
      isRecurring: true,
      periodStart: '2024-12',
      payDay: 25
    },
    {
      id: 'cf-2',
      name: '法人税中間納付',
      category: CashFlowCategory.Tax,
      type: CashFlowType.OneTime,
      amount: 1500000,
      isRecurring: false,
      paymentDate: '2025-05-31',
    },
    {
      id: 'cf-3',
      name: '公庫返済',
      category: CashFlowCategory.LoanRepayment,
      type: CashFlowType.Recurring,
      amount: 150000,
      isRecurring: true,
      periodStart: '2024-12',
      payDay: 10
    }
  ],
  leadSourceOptions: {
    "交流会": ["V三田会", "不動産三田会", "エアトリCXOサロン", "JCI"],
    "紹介": ["アルサーガパートナーズ"],
    "展示会": ["JSSA"],
    "飛び込み": [],
    "問い合わせ（アウトバウンド）": ["アイダマ"],
    "問い合わせ（インバウンド）": ["プレスリリース", "建設ITワールド"],
    "テレアポ": ["アイダマ"],
    "ピッチ": ["JSSA", "Gen AI Sumイベント"],
    "継続": []
  },
  allowedDomains: ["irwin-and-co.com"]
};

const seedEmployees: Employee[] = [
  { 
    id: '1', 
    name: '林', 
    role: EmployeeRole.PM,
    contractType: ContractType.FullTime, 
    defaultMonthlyCost: 600000, 
    defaultMonthlyHours: 160,
    monthlyData: {} 
  },
  { 
    id: '2', 
    name: 'アンドリューズ', 
    role: EmployeeRole.SeniorEngineer, 
    contractType: ContractType.Contractor, 
    defaultMonthlyCost: 400000, 
    defaultMonthlyHours: 120,
    monthlyData: {} 
  },
];

const getInitialTerm = () => {
  const today = new Date();
  return today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
};

const seedProjects: Project[] = [
  {
    id: '101',
    clientName: '日本予防医療研究所',
    projectName: 'Amulet・ヘルスケアチャットアプリ',
    projectType: ProjectType.Dev,
    status: ProjectStatus.Ordered,
    leadSourceCategory: '交流会',
    leadSourceDetail: 'V三田会',
    useFlow: true,
    useStock: true,
    flowAmount: 3636364,
    flowStartDate: `2026-01-28`,
    flowEndDate: `2026-03-31`,
    revenueMethod: RevenueRecognitionMethod.Milestone,
    stockAmount: 36000,
    stockStartDate: `2026-04-01`, 
    projectTasks: [],
    billingConfig: {
      flowSplit: true,
      flowMilestones: [
          { id: 'm1', name: '着手金', targetDate: '2026-01-31', amount: 1000000, ratio: 27.5, payDelay: 1, payDay: 99 },
          { id: 'm2', name: '中間金', targetDate: '2026-02-28', amount: 1600000, ratio: 44.0, payDelay: 1, payDay: 99 },
          { id: 'm3', name: '完了金', targetDate: '2026-03-31', amount: 1036364, ratio: 28.5, payDelay: 1, payDay: 99 }
      ],
      stockDelay: 1,
      stockPayDay: 99
    },
    assignments: [{ employeeId: '1', utilizationRate: 40 }, { employeeId: '2', utilizationRate: 50 }],
  },
];

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [currentTerm, setCurrentTermState] = useState<number>(getInitialTerm()); 
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]); // Chat History State

  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Ref to track if the change is from user interaction (to trigger save) vs initial load
  const isFirstLoad = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Persistence Helper Functions (Hybrid: Server + LocalStorage) ---
  
  const loadData = async () => {
    // 1. Try Server first
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const serverData = await res.json();
        if (serverData) {
          console.log('Loaded data from server');
          return { data: serverData, source: 'server' };
        }
      }
    } catch (error) {
      console.warn('Server connection failed, falling back to local storage.');
    }

    // 2. Fallback to LocalStorage
    try {
      const localData = localStorage.getItem(STORAGE_KEY);
      if (localData) {
        console.log('Loaded data from local storage');
        return { data: JSON.parse(localData), source: 'local' };
      }
    } catch (error) {
      console.error('Local storage error', error);
    }

    // 3. Nothing found
    return null;
  };

  const saveData = async (data: any) => {
    setIsSaving(true);
    
    // 1. Save to LocalStorage (Immediate backup)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Local storage save failed', e);
    }

    // 2. Save to Server (Async)
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Server save failed');
    } catch (error) {
      console.warn('Failed to save to server (running offline mode?)', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Initial Load
  useEffect(() => {
    const init = async () => {
      const result = await loadData();
      const data = result?.data;
      const source = result?.source;
      
      if (data) {
        setEmployees(data.employees || seedEmployees);
        setProjects(data.projects || seedProjects);
        setWorkLogs(data.workLogs || []);
        setSettings({ ...defaultSettings, ...(data.settings || {}) });
        setCurrentTermState(data.currentTerm || getInitialTerm());
        setChatHistory(data.chatHistory || []); // Load Chat History

        // Self-healing: If we loaded from LocalStorage but Server was empty/failed (and we are now online),
        // push LocalStorage data to Server to re-hydrate it.
        if (source === 'local') {
             console.log('Re-hydrating server from local storage...');
             setTimeout(() => {
                 saveData({
                    employees: data.employees || [],
                    projects: data.projects || [],
                    workLogs: data.workLogs || [],
                    settings: { ...defaultSettings, ...(data.settings || {}) },
                    currentTerm: data.currentTerm || getInitialTerm(),
                    chatHistory: data.chatHistory || []
                 });
             }, 1000);
        }

      } else {
        // Fallback to seeds if empty
        setEmployees(seedEmployees);
        setProjects(seedProjects);
        setSettings(defaultSettings);
        setCurrentTermState(getInitialTerm());
        setChatHistory([]);
      }
      setIsLoaded(true);
      setTimeout(() => { isFirstLoad.current = false; }, 500);
    };
    init();
  }, []);

  // Auto-Save with Debounce
  useEffect(() => {
    if (!isLoaded || isFirstLoad.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      const dataToSave = {
        employees,
        projects,
        workLogs,
        settings,
        currentTerm,
        chatHistory
      };
      saveData(dataToSave);
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [employees, projects, workLogs, settings, currentTerm, chatHistory, isLoaded]);

  // Public Actions
  
  const importData = async (data: any) => {
      setIsLoaded(false); // block saves temporarily
      if (data) {
        setEmployees(data.employees || []);
        setProjects(data.projects || []);
        setWorkLogs(data.workLogs || []);
        setSettings({ ...defaultSettings, ...(data.settings || {}) });
        setCurrentTermState(data.currentTerm || getInitialTerm());
        setChatHistory(data.chatHistory || []);
        
        // Save immediately
        const dataToSave = {
           employees: data.employees || [],
           projects: data.projects || [],
           workLogs: data.workLogs || [],
           settings: { ...defaultSettings, ...(data.settings || {}) },
           currentTerm: data.currentTerm || getInitialTerm(),
           chatHistory: data.chatHistory || []
        };
        await saveData(dataToSave);
      }
      setIsLoaded(true);
  };

  const setCurrentTerm = (year: number) => {
    setCurrentTermState(year);
  };

  const addEmployee = (emp: Omit<Employee, 'id'>) => {
    const newEmp: Employee = { ...emp, id: generateId() };
    setEmployees(prev => [...prev, newEmp]);
  };

  const updateEmployee = (emp: Employee) => {
    setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));
  };

  const deleteEmployee = (id: string) => {
    setEmployees(prev => prev.filter(e => e.id !== id));
    setProjects(prev => prev.map(p => ({
      ...p,
      assignments: p.assignments.filter(a => a.employeeId !== id)
    })));
  };

  const addProject = (proj: Omit<Project, 'id'>) => {
    const newProj = { ...proj, id: generateId() };
    setProjects(prev => [...prev, newProj]);
  };

  const updateProject = (proj: Project) => {
    setProjects(prev => prev.map(p => p.id === proj.id ? proj : p));
  };

  const deleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  const updateWorkLog = (log: WorkLog) => {
    setWorkLogs(prev => {
        const existingIndex = prev.findIndex(l => 
          l.projectId === log.projectId && 
          l.taskId === log.taskId &&
          l.employeeId === log.employeeId && 
          l.weekStartDate === log.weekStartDate
        );

        if (existingIndex >= 0) {
          const newLogs = [...prev];
          newLogs[existingIndex] = { ...newLogs[existingIndex], actualHours: log.actualHours };
          return newLogs;
        } else {
          return [...prev, { ...log, id: generateId() }];
        }
    });
  };

  const updateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  const addChatMessage = (msg: ChatMessage) => {
    setChatHistory(prev => [...prev, msg]);
  };

  const clearChatHistory = () => {
    setChatHistory([]);
  };

  return (
    <AppContext.Provider value={{
      employees,
      projects,
      workLogs,
      settings,
      currentTerm,
      chatHistory,
      setCurrentTerm,
      addEmployee,
      updateEmployee,
      deleteEmployee,
      addProject,
      updateProject,
      deleteProject,
      updateWorkLog,
      updateSettings,
      addChatMessage,
      clearChatHistory,
      importData
    }}>
      {/* Visual Save Indicator */}
      {isSaving && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white text-xs px-3 py-1 rounded-full shadow-lg z-50 opacity-80 pointer-events-none transition-opacity">
          保存中...
        </div>
      )}
      {children}
    </AppContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useData must be used within an AppProvider');
  }
  return context;
};
