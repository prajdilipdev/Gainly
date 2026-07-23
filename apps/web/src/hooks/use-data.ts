'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Alert,
  AlertCondition,
  AlertStatus,
  Currency,
  DashboardEntry,
  Exchange,
  HistoricalBar,
  Notification,
  Portfolio,
  PortfolioSummary,
  Quote,
  SearchResult,
  Transaction,
  TransactionType,
  Watchlist,
} from '@/lib/types';

const PRICE_REFRESH_MS = 30_000;

// ---------- Portfolios ----------

export function usePortfolios() {
  return useQuery({
    queryKey: ['portfolios'],
    queryFn: () => api.get<Portfolio[]>('/portfolios'),
  });
}

/**
 * Resolves a portfolio by its URL segment (readable slug or UUID) to the full
 * record, so the detail page can use the real id for its other API calls.
 */
export function usePortfolio(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: ['portfolio', idOrSlug],
    queryFn: () => api.get<Portfolio>(`/portfolios/${idOrSlug}`),
    enabled: !!idOrSlug,
  });
}

export function usePortfolioSummary(portfolioId: string | undefined) {
  return useQuery({
    queryKey: ['portfolio-summary', portfolioId],
    queryFn: () =>
      api.get<PortfolioSummary>(`/analytics/portfolios/${portfolioId}/summary`),
    enabled: !!portfolioId,
    refetchInterval: PRICE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardEntry[]>('/analytics/dashboard'),
    refetchInterval: PRICE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

export function useCreatePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      baseCurrency: Currency;
    }) => api.post<Portfolio>('/portfolios', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portfolios'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeletePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/portfolios/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['portfolios'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ---------- Transactions ----------

export interface TransactionFilters {
  symbol?: string;
  type?: TransactionType;
  exchange?: Exchange;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function useTransactions(
  portfolioId: string | undefined,
  filters: TransactionFilters = {},
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return useQuery({
    queryKey: ['transactions', portfolioId, filters],
    queryFn: () =>
      api.get<{ items: Transaction[]; total: number }>(
        `/portfolios/${portfolioId}/transactions${qs ? `?${qs}` : ''}`,
      ),
    enabled: !!portfolioId,
    placeholderData: keepPreviousData,
  });
}

export interface TransactionInput {
  type: TransactionType;
  symbol: string;
  exchange: Exchange;
  companyName?: string;
  quantity: number;
  price: number;
  fees?: number;
  currency?: Currency;
  notes?: string;
  executedAt: string;
}

export function useCreateTransaction(portfolioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TransactionInput) =>
      api.post<Transaction>(`/portfolios/${portfolioId}/transactions`, input),
    onSuccess: () => invalidatePortfolioData(qc, portfolioId),
  });
}

export function useUpdateTransaction(portfolioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<TransactionInput> & { id: string }) =>
      api.patch<Transaction>(
        `/portfolios/${portfolioId}/transactions/${id}`,
        input,
      ),
    onSuccess: () => invalidatePortfolioData(qc, portfolioId),
  });
}

export function useDeleteTransaction(portfolioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/portfolios/${portfolioId}/transactions/${id}`),
    onSuccess: () => invalidatePortfolioData(qc, portfolioId),
  });
}

function invalidatePortfolioData(
  qc: ReturnType<typeof useQueryClient>,
  portfolioId: string,
) {
  void qc.invalidateQueries({ queryKey: ['transactions', portfolioId] });
  void qc.invalidateQueries({ queryKey: ['portfolio-summary', portfolioId] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
  void qc.invalidateQueries({ queryKey: ['portfolios'] });
}

// ---------- Market data ----------

export function useSymbolSearch(query: string) {
  return useQuery({
    queryKey: ['symbol-search', query],
    queryFn: () =>
      api.get<SearchResult[]>(`/market/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 2,
    staleTime: 60 * 60_000,
  });
}

export function useQuote(symbol: string | undefined, exchange: Exchange | undefined) {
  return useQuery({
    queryKey: ['quote', exchange, symbol],
    queryFn: () => api.get<Quote>(`/market/quote/${exchange}/${symbol}`),
    enabled: !!symbol && !!exchange,
    refetchInterval: PRICE_REFRESH_MS,
  });
}

export function useHistory(
  symbol: string | undefined,
  exchange: Exchange | undefined,
  range: string,
) {
  return useQuery({
    queryKey: ['history', exchange, symbol, range],
    queryFn: () =>
      api.get<HistoricalBar[]>(
        `/market/history/${exchange}/${symbol}?range=${range}`,
      ),
    enabled: !!symbol && !!exchange,
    staleTime: 10 * 60_000,
  });
}

// ---------- Watchlists ----------

export function useWatchlists() {
  return useQuery({
    queryKey: ['watchlists'],
    queryFn: () => api.get<Watchlist[]>('/watchlists'),
  });
}

export function useWatchlist(id: string | undefined) {
  return useQuery({
    queryKey: ['watchlist', id],
    queryFn: () => api.get<Watchlist>(`/watchlists/${id}`),
    enabled: !!id,
    refetchInterval: PRICE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
}

export function useCreateWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Watchlist>('/watchlists', { name }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['watchlists'] }),
  });
}

export function useDeleteWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/watchlists/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['watchlists'] }),
  });
}

export function useAddWatchlistItem(watchlistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      symbol: string;
      exchange: Exchange;
      companyName?: string;
    }) => api.post(`/watchlists/${watchlistId}/items`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['watchlist', watchlistId] });
      void qc.invalidateQueries({ queryKey: ['watchlists'] });
    },
  });
}

export function useRemoveWatchlistItem(watchlistId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      api.delete(`/watchlists/${watchlistId}/items/${itemId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['watchlist', watchlistId] });
      void qc.invalidateQueries({ queryKey: ['watchlists'] });
    },
  });
}

// ---------- Alerts ----------

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get<Alert[]>('/alerts'),
    refetchInterval: 60_000,
  });
}

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      symbol: string;
      exchange: Exchange;
      condition: AlertCondition;
      threshold: number;
      note?: string;
    }) => api.post<Alert>('/alerts', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useSetAlertStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AlertStatus }) =>
      api.patch<Alert>(`/alerts/${id}/status`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/alerts/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

// ---------- Notifications ----------

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications'),
    refetchInterval: 30_000,
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
