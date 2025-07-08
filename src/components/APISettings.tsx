import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Settings } from 'lucide-react';

export const APISettings = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');

  useEffect(() => {
    if (isOpen) {
      const savedS2 = localStorage.getItem('espn_s2') || '';
      const savedSwid = localStorage.getItem('swid') || '';
      setEspnS2(savedS2);
      setSwid(savedSwid);
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem('espn_s2', espnS2);
    localStorage.setItem('swid', swid);
    setIsOpen(false);
    // Force a reload to apply the new credentials
    window.location.reload();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>API Settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="espn_s2" className="text-right">
              ESPN_S2
            </Label>
            <Input
              id="espn_s2"
              value={espnS2}
              onChange={(e) => setEspnS2(e.target.value)}
              className="col-span-3"
              placeholder="Your espn_s2 cookie"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="swid" className="text-right">
              SWID
            </Label>
            <Input
              id="swid"
              value={swid}
              onChange={(e) => setSwid(e.target.value)}
              className="col-span-3"
              placeholder="Your SWID cookie"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Save & Reload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};