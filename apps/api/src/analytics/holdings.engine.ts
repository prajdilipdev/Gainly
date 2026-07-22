import { Exchange, TransactionType } from '@prisma/client';

export interface EngineTransaction {
  type: TransactionType;
  symbol: string;
  exchange: Exchange;
  companyName: string | null;
  quantity: number;
  price: number;
  fees: number;
  currency: string;
  executedAt: Date;
}

export interface Lot {
  quantity: number;
  costPerShare: number;
  acquiredAt: Date;
}

export interface Holding {
  symbol: string;
  exchange: Exchange;
  companyName: string | null;
  currency: string;
  quantity: number;
  avgCost: number;
  costBasis: number;
  realizedPnl: number;
  dividends: number;
  totalFees: number;
  firstBuyDate: Date | null;
  lots: Lot[];
}

/**
 * Replays a transaction ledger into current holdings using FIFO lot
 * accounting. Handles splits (adjusts every open lot) and accumulates
 * realized P&L and dividends per symbol.
 */
const SAME_DAY_TYPE_ORDER: Record<TransactionType, number> = {
  BUY: 0,
  SPLIT: 1,
  DIVIDEND: 2,
  SELL: 3,
};

export function computeHoldings(transactions: EngineTransaction[]): Holding[] {
  // Same-timestamp ties (common with date-only imports) resolve BUY before
  // SELL so a same-day round trip never hits the oversell branch.
  const sorted = [...transactions].sort(
    (a, b) =>
      a.executedAt.getTime() - b.executedAt.getTime() ||
      SAME_DAY_TYPE_ORDER[a.type] - SAME_DAY_TYPE_ORDER[b.type],
  );
  const bySymbol = new Map<string, Holding>();

  const getHolding = (tx: EngineTransaction): Holding => {
    const key = `${tx.symbol}:${tx.exchange}`;
    let h = bySymbol.get(key);
    if (!h) {
      h = {
        symbol: tx.symbol,
        exchange: tx.exchange,
        companyName: tx.companyName,
        currency: tx.currency,
        quantity: 0,
        avgCost: 0,
        costBasis: 0,
        realizedPnl: 0,
        dividends: 0,
        totalFees: 0,
        firstBuyDate: null,
        lots: [],
      };
      bySymbol.set(key, h);
    }
    if (tx.companyName && !h.companyName) h.companyName = tx.companyName;
    return h;
  };

  for (const tx of sorted) {
    const h = getHolding(tx);
    h.totalFees += tx.fees;

    switch (tx.type) {
      case 'BUY': {
        const costPerShare =
          tx.quantity > 0 ? tx.price + tx.fees / tx.quantity : tx.price;
        h.lots.push({
          quantity: tx.quantity,
          costPerShare,
          acquiredAt: tx.executedAt,
        });
        if (!h.firstBuyDate) h.firstBuyDate = tx.executedAt;
        break;
      }
      case 'SELL': {
        let remaining = tx.quantity;
        const netPerShare =
          tx.quantity > 0 ? tx.price - tx.fees / tx.quantity : tx.price;
        while (remaining > 1e-9 && h.lots.length > 0) {
          const lot = h.lots[0];
          const take = Math.min(lot.quantity, remaining);
          h.realizedPnl += take * (netPerShare - lot.costPerShare);
          lot.quantity -= take;
          remaining -= take;
          if (lot.quantity <= 1e-9) h.lots.shift();
        }
        // Oversell (shouldn't happen — service validates) counts full proceeds
        if (remaining > 1e-9) {
          h.realizedPnl += remaining * netPerShare;
        }
        break;
      }
      case 'DIVIDEND': {
        // price = total dividend cash received
        h.dividends += tx.price - tx.fees;
        break;
      }
      case 'SPLIT': {
        const ratio = tx.price;
        if (ratio > 0) {
          for (const lot of h.lots) {
            lot.quantity *= ratio;
            lot.costPerShare /= ratio;
          }
        }
        break;
      }
    }
  }

  const holdings: Holding[] = [];
  for (const h of bySymbol.values()) {
    h.quantity = h.lots.reduce((s, l) => s + l.quantity, 0);
    h.costBasis = h.lots.reduce((s, l) => s + l.quantity * l.costPerShare, 0);
    h.avgCost = h.quantity > 1e-9 ? h.costBasis / h.quantity : 0;
    // Round away floating noise
    h.quantity = Math.round(h.quantity * 1e6) / 1e6;
    holdings.push(h);
  }
  return holdings.sort((a, b) => a.symbol.localeCompare(b.symbol));
}
