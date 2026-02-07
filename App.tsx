import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CashFlow from './components/CashFlow';
import Analytics from './components/Analytics';
import ProjectMaster from './components/ProjectMaster';
import EmployeeMaster from './components/EmployeeMaster';
import ResourcePlanning from './components/ResourcePlanning';
import { AppProvider } from './context/AppContext';

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    const auth = localStorage.getItem('irwin_auth');
    if (auth === 'true') setIsAuthenticated(true);
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
    localStorage.setItem('irwin_auth', 'true');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('irwin_auth');
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'cf': return <CashFlow />;
      case 'analytics': return <Analytics />;
      case 'projects': return <ProjectMaster />;
      case 'employees': return <EmployeeMaster />;
      case 'resource': return <ResourcePlanning />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout}>
      {renderContent()}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;
