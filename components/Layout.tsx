
import React from 'react';
import { useData } from '../context/AppContext';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  TrendingUp, 
  DollarSign, 
  LogOut,
  Menu,
  Calendar
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, onLogout }) => {
  const { currentTerm, setCurrentTerm } = useData();

  const navItems = [
    { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
    { id: 'resource', label: '予実管理 (Resource)', icon: Calendar },
    { id: 'analytics', label: '収益分析', icon: TrendingUp },
    { id: 'projects', label: '案件マスタ', icon: Briefcase },
    { id: 'employees', label: '従業員マスタ', icon: Users },
    { id: 'cf', label: 'キャッシュフロー', icon: DollarSign },
  ];

  // Dynamic Term Options: Ensure currentTerm is included, and show a reasonable range (e.g. -2 to +2 years)
  // Base range around 2025 as the anchor, but expand if currentTerm is outside
  const baseYear = 2025;
  const minYear = Math.min(baseYear, currentTerm - 1);
  const maxYear = Math.max(baseYear + 3, currentTerm + 1);
  const termOptions = [];
  for (let y = minYear; y <= maxYear; y++) {
    termOptions.push(y);
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col">
        <div className="p-6 border-b border-slate-700 flex flex-col items-center justify-center">
          {/* Updated Sidebar Logo */}
          <h1 className="text-4xl font-serif font-bold tracking-tighter text-white" style={{ fontFamily: '"Times New Roman", Times, serif' }}>I&C</h1>
          <p className="text-xs text-slate-400 mt-2">Management System</p>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center px-6 py-3 text-sm font-medium transition-colors duration-150 ${
                activeTab === item.id 
                  ? 'bg-blue-600 text-white border-r-4 border-blue-300' 
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700">
          <button 
            onClick={onLogout}
            className="flex items-center text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5 mr-2" />
            ログアウト
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full bg-slate-900 text-white z-50 p-4 flex justify-between items-center">
         <span className="font-serif font-bold text-xl" style={{ fontFamily: '"Times New Roman", Times, serif' }}>I&C</span>
         <Menu className="w-6 h-6" />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-50 flex flex-col h-screen">
        {/* Header with Term Selector */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center shadow-sm">
           <h2 className="text-2xl font-bold text-gray-800">
             {navItems.find(i => i.id === activeTab)?.label}
           </h2>
           <div className="flex items-center space-x-4">
             <label className="text-sm text-gray-600 font-medium">対象決算期:</label>
             <select 
               className="border border-gray-300 rounded px-3 py-1 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
               value={currentTerm}
               onChange={(e) => setCurrentTerm(Number(e.target.value))}
             >
               {termOptions.map(year => (
                 <option key={year} value={year}>
                   {year}年11月期 {year === 2025 ? '(創業期)' : ''}
                 </option>
               ))}
             </select>
           </div>
        </header>

        <div className="p-8 overflow-auto flex-1">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
