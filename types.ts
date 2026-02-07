
export enum ContractType {
  FullTime = '正社員',
  Contractor = '業務委託',
}

export enum ProjectType {
  Dev = '受託開発',
  Consulting = 'コンサルティング',
  Seminar = '講習会',
  BPO = 'BPO',
}

// Deprecated in favor of boolean flags in Project, but kept for compatibility if needed
export enum RevenueModel {
  Flow = '固定報酬 (フロー)',
  Stock = 'サブスクリプション (ストック)',
}

export enum ProjectStatus {
  PreOrder = '受注前',
  Ordered = 'デリバリー中', // Renamed from 受注済
  Delivered = 'デリバリー完了',
  Lost = '失注',
}

// New: Revenue Recognition Logic
export enum RevenueRecognitionMethod {
  Duration = '期間按分 (月次平準化)',
  Milestone = '請求基準 (着手・完了時)',
}

export enum CashFlowCategory {
  OperatingExpense = '販管費 (家賃・システム利用料等)',
  Tax = '法人税・消費税等',
  LoanRepayment = '借入金返済 (元本)',
  LoanIn = '借入・資金調達',
  Investment = '設備投資',
  Other = 'その他',
}

export interface CashFlowItem {
  id: string;
  name: string;
  category: CashFlowCategory;
  amount: number;
  isRecurring: boolean;
  
  // Recurring Settings
  periodStart?: string; // YYYY-MM (Start Month)
  periodEnd?: string;   // YYYY-MM (End Month, optional)
  payDay?: number;      // 1-31, 99=End of Month
  
  // One-time Settings
  paymentDate?: string; // YYYY-MM-DD (Specific Date)
  
  // Legacy support (to be migrated/ignored if paymentDate exists)
  targetMonth?: string; 
}

export interface MonthlyEmployeeData {
  cost: number;
  monthlyHours: number;
}

export interface Employee {
  id: string;
  name: string;
  contractType: ContractType;
  defaultMonthlyCost: number; 
  defaultMonthlyHours: number; 
  monthlyData: Record<string, MonthlyEmployeeData>;
}

export interface Assignment {
  employeeId: string;
  utilizationRate: number; // Percentage (0-100)
}

export interface ProjectTask {
  id: string;
  name: string;
}

export interface WorkLog {
  id: string;
  projectId: string;
  taskId?: string; // New: optional task linkage
  employeeId: string;
  weekStartDate: string;
  actualHours: number;
}

// Detailed Billing Config
export interface BillingConfig {
  // Flow (Fixed Reward) Logic
  flowSplit: boolean; // True = Split Payment (Start/End)
  flowStartRatio?: number; // %
  flowStartDelay?: number; // 0=Current, 1=Next, 2=NextNext
  flowStartPayDay?: number; // 0 or 99 = End of Month, 1-31 = Specific Day
  
  flowEndDelay?: number;   // 0=Current, 1=Next, 2=NextNext (Used for Lump sum too)
  flowEndPayDay?: number;
  
  // Stock (Subscription) Logic
  stockDelay?: number; // 0=Current, 1=Next, 2=NextNext
  stockPayDay?: number;
}

export interface Project {
  id: string;
  clientName: string;
  projectName: string;
  projectType: ProjectType;
  status: ProjectStatus;
  
  // Lead Source Information
  leadSourceCategory?: string;
  leadSourceDetail?: string;
  
  // Hybrid Model Configuration
  useFlow: boolean;
  useStock: boolean;
  useTimeCharge?: boolean; // New: Time Charge Support

  // Revenue Recognition (New)
  revenueMethod?: RevenueRecognitionMethod;

  // Flow Parameters (e.g. Development)
  flowAmount: number;
  flowStartDate: string; // ISO Date
  flowEndDate: string;   // ISO Date (Replaces duration)

  // Stock Parameters (e.g. Maintenance)
  stockAmount: number; // Monthly
  stockStartDate: string; // ISO Date

  // Time Charge Parameters (Monthly Manual Input)
  // Key: "YYYY-MM", Value: Amount
  timeChargePrices?: Record<string, number>;

  // Tasks Definition
  projectTasks: ProjectTask[];

  // Billing & Cashflow
  billingConfig: BillingConfig;

  assignments: Assignment[];
  isArchived?: boolean;
}

export interface SalesTarget {
  termYear: number;
  period: 'q1' | 'q2' | 'q3' | 'q4';
  amount: number;
}

export interface AppSettings {
  targetLaborShareMin: number;
  targetLaborShareMax: number;
  salesTargets: Record<string, number>;
  monthlySalesTarget?: number;
  initialCashBalance: number;
  cashFlowItems: CashFlowItem[];
  leadSourceOptions?: Record<string, string[]>; // Dynamic lead sources
}

export interface FiscalTerm {
  year: number;
  label: string;
  startMonth: string;
  endMonth: string;
}

export interface DataContextType {
  employees: Employee[];
  projects: Project[];
  workLogs: WorkLog[];
  settings: AppSettings;
  currentTerm: number;
  setCurrentTerm: (year: number) => void;
  addEmployee: (emp: Omit<Employee, 'id'>) => void;
  updateEmployee: (emp: Employee) => void;
  deleteEmployee: (id: string) => void;
  addProject: (proj: Omit<Project, 'id'>) => void;
  updateProject: (proj: Project) => void;
  deleteProject: (id: string) => void;
  updateWorkLog: (log: WorkLog) => void;
  updateSettings: (settings: AppSettings) => void;
}
