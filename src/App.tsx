import React from 'react';
import { FantasyDashboard } from './components/FantasyDashboard';
import { DataProvider } from './context/DataContext';
import { TopNav } from './components/TopNav';

function App() {
  return (
    <DataProvider>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-gray-50 to-blue-100">
        <TopNav />
        <FantasyDashboard />
      </div>
    </DataProvider>
  );
}

export default App;