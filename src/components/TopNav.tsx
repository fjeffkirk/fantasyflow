import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Settings, RefreshCcw } from 'lucide-react';
import { useDataContext } from '../context/DataContext';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onOpenChange }) => {
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [leagueId, setLeagueId] = useState('');
  const [validity, setValidity] = useState({ s2: false, swid: false, leagueId: false });

  useEffect(() => {
    if (open) {
      const savedS2 = localStorage.getItem('espn_s2') || '';
      const savedSwid = localStorage.getItem('swid') || '';
      const savedLeagueId = localStorage.getItem('leagueId') || '';
      setEspnS2(savedS2);
      setSwid(savedSwid);
      setLeagueId(savedLeagueId);
    }
  }, [open]);

  useEffect(() => {
    setValidity({
      s2: espnS2.length >= 50,
      swid: swid.length >= 30,
      leagueId: /^\d+$/.test(leagueId),
    });
  }, [espnS2, swid, leagueId]);

  const isFormValid = validity.s2 && validity.swid && validity.leagueId;

  const handleSave = () => {
    if (!isFormValid) return;
    
    let finalSwid = swid;
    if (finalSwid.startsWith('{') && finalSwid.endsWith('}')) {
      finalSwid = finalSwid.slice(1, -1);
    }
    localStorage.setItem('espn_s2', espnS2);
    localStorage.setItem('swid', finalSwid);
    localStorage.setItem('leagueId', leagueId);
    onOpenChange(false);
    window.location.reload();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg bg-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">API Settings</DialogTitle>
          <p className="text-gray-600">Update your ESPN credentials and League ID.</p>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <Label htmlFor="espn_s2_settings" className="font-medium">ESPN_S2</Label>
              {espnS2.length > 0 && <div className={`w-2.5 h-2.5 rounded-full ${validity.s2 ? 'bg-green-500' : 'bg-red-500'}`} />}
            </div>
            <Input
              id="espn_s2_settings"
              value={espnS2}
              onChange={(e) => setEspnS2(e.target.value)}
              className="bg-gray-50 placeholder:text-gray-400/50"
              placeholder="AEBfg... (example)"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <Label htmlFor="swid_settings" className="font-medium">SWID</Label>
              {swid.length > 0 && <div className={`w-2.5 h-2.5 rounded-full ${validity.swid ? 'bg-green-500' : 'bg-red-500'}`} />}
            </div>
            <Input
              id="swid_settings"
              value={swid}
              onChange={(e) => setSwid(e.target.value)}
              className="bg-gray-50 placeholder:text-gray-400/50"
              placeholder="{1234ABCD-5678-...} (example)"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <Label htmlFor="leagueId_settings" className="font-medium">League ID</Label>
              {leagueId.length > 0 && <div className={`w-2.5 h-2.5 rounded-full ${validity.leagueId ? 'bg-green-500' : 'bg-red-500'}`} />}
            </div>
            <Input
              id="leagueId_settings"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              className="bg-gray-50 placeholder:text-gray-400/50"
              placeholder="123456 (example)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button 
            onClick={handleSave} 
            disabled={!isFormValid}
            className="w-full bg-[#576AA7] text-white hover:bg-[#4f5d9a] disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed disabled:border-gray-200"
          >
            Save & Reload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const TopNav = () => {
  const { leagueInfo, isLoading, error } = useDataContext();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleRefresh = () => {
    import('../services/dataService').then(m => {
      m.dataService.clearCache();
      window.location.reload();
    });
  };

  return (
    <nav className="bg-white/80 backdrop-blur-sm shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <img src="/fantasy-flow-logo.png" alt="Fantasy Flow Logo" className="h-10" />
          </div>
          <div className="flex items-center gap-2">
            {leagueInfo && <div className="w-3 h-3 bg-green-500 rounded-full" title="API Credentials OK"></div>}
            {error && <div className="w-3 h-3 bg-red-500 rounded-full" title="API Credentials Invalid or Missing"></div>}
            {isLoading && <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" title="Loading..."></div>}

            <Button variant="outline" size="icon" className="hover:bg-gray-100" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="hover:bg-gray-100" onClick={handleRefresh}>
              <RefreshCcw className="h-4 w-4" />
            </Button>

            <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
          </div>
        </div>
      </div>
    </nav>
  );
}; 