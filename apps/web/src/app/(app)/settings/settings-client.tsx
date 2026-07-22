'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Currency, User } from '@/lib/types';

export default function SettingsPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [notifStatus, setNotifStatus] = useState<string>('unknown');

  useEffect(() => {
    if (user) {
      setName(user.name);
      setCurrency(user.baseCurrency);
    }
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifStatus(Notification.permission);
    } else {
      setNotifStatus('unsupported');
    }
  }, []);

  const updateProfile = useMutation({
    mutationFn: (input: { name?: string; baseCurrency?: Currency }) =>
      api.patch<User>('/users/me', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], (old: User | undefined) =>
        old ? { ...old, ...data } : data,
      );
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Profile updated');
    },
    onError: (err) => toast.error(err.message),
  });

  const requestNotifications = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotifStatus(permission);
    if (permission === 'granted') {
      toast.success('Browser notifications enabled');
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and notification preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Signed in as {user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="set-name">Name</Label>
            <Input
              id="set-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Base currency</Label>
            <Select
              value={currency}
              onValueChange={(v: string) => setCurrency(v as Currency)}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
                <SelectItem value="INR">INR — Indian Rupee</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used as the default for new portfolios and dashboard aggregation.
            </p>
          </div>
          <Button
            onClick={() =>
              updateProfile.mutate({ name: name.trim(), baseCurrency: currency })
            }
            disabled={updateProfile.isPending || !name.trim()}
          >
            {updateProfile.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Browser notifications</CardTitle>
          <CardDescription>
            Receive native notifications when price alerts trigger, even when
            the tab is in the background.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Status:{' '}
            <span className="font-medium">
              {notifStatus === 'granted'
                ? 'Enabled'
                : notifStatus === 'denied'
                  ? 'Blocked (enable in browser site settings)'
                  : notifStatus === 'unsupported'
                    ? 'Not supported in this browser'
                    : 'Not enabled'}
            </span>
          </p>
          {notifStatus === 'default' && (
            <Button variant="outline" onClick={requestNotifications}>
              Enable notifications
            </Button>
          )}
          <Separator />
          <p className="text-xs text-muted-foreground">
            In-app notifications always appear in the bell menu regardless of
            this setting.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
