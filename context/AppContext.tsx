
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Employee, Project, WorkLog, AppSettings, DataContextType, ContractType, ProjectType, ProjectStatus, CashFlowCategory, RevenueRecognitionMethod } from '../types';
import { generateId } from '../utils';

const AppContext = createContext<DataContextType | undefined>(undefined);

const STORAGE_KEY = 'irwin_manager_data_v11'; // Bump version to reset data with new dates

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
      amount: 200000,
      isRecurring: true,
      periodStart: '2024-12',
      payDay: 25
    },
    {
      id: 'cf-2',
      name: '法人税中間納付',
      category: CashFlowCategory.Tax,
      amount: 1500000,
      isRecurring: false,
      paymentDate: '2025-05-31',
    },
    {
      id: 'cf-3',
      name: '公庫返済',
      category: CashFlowCategory.LoanRepayment,
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
  }
};

const seedEmployees: Employee[] = [
  { 
    id: '1', 
    name: '林', 
    contractType: ContractType.FullTime, 
    defaultMonthlyCost: 600000, 
    defaultMonthlyHours: 160,
    monthlyData: {} 
  },
  { 
    id: '2', 
    name: 'アンドリューズ', 
    contractType: ContractType.Contractor, 
    defaultMonthlyCost: 400000, 
    defaultMonthlyHours: 120,
    monthlyData: {} 
  },
];

// Helper to determine current fiscal term based on today (Nov Year End)
const getInitialTerm = () => {
  const today = new Date();
  // Term ends in Nov. 
  // If Month is 0-10 (Jan-Nov), term is Year.
  // If Month is 11 (Dec), term is Year + 1.
  return today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
};

const currentYear = getInitialTerm();

const seedProjects: Project[] = [
  {
    id: '101',
    clientName: 'サンプル株式会社',
    projectName: 'DX推進基盤開発 + 保守',
    projectType: ProjectType.Dev,
    status: ProjectStatus.Ordered,
    
    // Configured for exactly 6 months (Jan 1 - Jun 30) to ensure exact cost calculation (1.8M)
    useFlow: true,
    flowAmount: 6000000,
    flowStartDate: `${currentYear}-01-01`,
    flowEndDate: `${currentYear}-06-30`,
    revenueMethod: RevenueRecognitionMethod.Milestone, // Explicitly set to Billing Basis (着手・完了基準)
    
    useStock: true,
    stockAmount: 50000,
    stockStartDate: `${currentYear}-07-01`, // Starts month after flow ends

    projectTasks: [
      { id: 't1', name: '要件定義' },
      { id: 't2', name: '設計・開発' },
      { id: 't3', name: 'テスト・納品' }
    ],

    billingConfig: {
      flowSplit: true,
      flowStartRatio: 50,
      flowStartDelay: 1, // Next Month Payment
      flowStartPayDay: 99,
      flowEndDelay: 1, // Next Month Payment
      flowEndPayDay: 99,
      stockDelay: 1,
      stockPayDay: 99
    },
    
    assignments: [{ employeeId: '1', utilizationRate: 50 }],
  },
];

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [currentTerm, setCurrentTerm] = useState<number>(getInitialTerm()); 
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setEmployees(parsed.employees || []);
      setProjects(parsed.projects || []);
      setWorkLogs(parsed.workLogs || []);
      setSettings({ ...defaultSettings, ...(parsed.settings || {}) });
      // Use saved term if exists, otherwise recalculate based on today
      if (parsed.currentTerm) setCurrentTerm(parsed.currentTerm);
      else setCurrentTerm(getInitialTerm());
    } else {
      setEmployees(seedEmployees);
      setProjects(seedProjects);
      setCurrentTerm(getInitialTerm());
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      const dataToSave = { employees, projects, workLogs, settings, currentTerm };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }
  }, [employees, projects, workLogs, settings, currentTerm, isLoaded]);

  const addEmployee = (emp: Omit<Employee, 'id'>) => {
    setEmployees([...employees, { ...emp, id: generateId() }]);
  };

  const updateEmployee = (emp: Employee) => {
    setEmployees(employees.map(e => e.id === emp.id ? emp : e));
  };

  const deleteEmployee = (id: string) => {
    setEmployees(employees.filter(e => e.id !== id));
    setProjects(projects.map(p => ({
      ...p,
      assignments: p.assignments.filter(a => a.employeeId !== id)
    })));
  };

  const addProject = (proj: Omit<Project, 'id'>) => {
    setProjects([...projects, { ...proj, id: generateId() }]);
  };

  const updateProject = (proj: Project) => {
    setProjects(projects.map(p => p.id === proj.id ? proj : p));
  };

  const deleteProject = (id: string) => {
    setProjects(projects.filter(p => p.id !== id));
  };

  const updateWorkLog = (log: WorkLog) => {
    const existingIndex = workLogs.findIndex(l => 
      l.projectId === log.projectId && 
      l.taskId === log.taskId && // Check task ID as well
      l.employeeId === log.employeeId && 
      l.weekStartDate === log.weekStartDate
    );

    if (existingIndex >= 0) {
      const newLogs = [...workLogs];
      newLogs[existingIndex] = { ...newLogs[existingIndex], actualHours: log.actualHours };
      setWorkLogs(newLogs);
    } else {
      setWorkLogs([...workLogs, { ...log, id: generateId() }]);
    }
  };

  const updateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  return (
    <AppContext.Provider value={{
      employees,
      projects,
      workLogs,
      settings,
      currentTerm,
      setCurrentTerm,
      addEmployee,
      updateEmployee,
      deleteEmployee,
      addProject,
      updateProject,
      deleteProject,
      updateWorkLog,
      updateSettings
    }}>
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
