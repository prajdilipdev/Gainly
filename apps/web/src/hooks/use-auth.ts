'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, setAccessToken, getAccessToken } from '@/lib/api';
import type { User, Currency } from '@/lib/types';

interface AuthResponse {
  user: User;
  accessToken: string;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<User & { createdAt: string }>('/users/me'),
    enabled: typeof window !== 'undefined' && !!getAccessToken(),
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<AuthResponse>('/auth/login', input),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(['me'], data.user);
      router.replace('/dashboard');
    },
  });
}

export function useRegister() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      email: string;
      password: string;
      baseCurrency: Currency;
    }) => api.post<AuthResponse>('/auth/register', input),
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(['me'], data.user);
      router.replace('/dashboard');
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSettled: () => {
      setAccessToken(null);
      queryClient.clear();
      router.replace('/login');
    },
  });
}
