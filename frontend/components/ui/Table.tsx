'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────
export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'لا توجد بيانات',
  emptyIcon,
  sortKey,
  sortDir,
  onSort,
  onRowClick,
  className,
}: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto rounded-xl', className)}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={cn(
                  col.sortable && 'cursor-pointer select-none hover:text-text-muted transition-colors',
                  col.className
                )}
                onClick={() => col.sortable && onSort?.(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    <span className="flex flex-col">
                      <ChevronUp
                        size={10}
                        className={cn(
                          sortKey === col.key && sortDir === 'asc'
                            ? 'text-accent'
                            : 'text-text-subtle/40'
                        )}
                      />
                      <ChevronDown
                        size={10}
                        className={cn(
                          '-mt-1',
                          sortKey === col.key && sortDir === 'desc'
                            ? 'text-accent'
                            : 'text-text-subtle/40'
                        )}
                      />
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key}>
                    <div className="skeleton h-4 rounded w-full max-w-[120px]" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-subtle">
                  {emptyIcon && <div className="text-4xl opacity-50">{emptyIcon}</div>}
                  <p className="text-sm">{emptyMessage}</p>
                </div>
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────
interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-text-subtle">
        عرض{' '}
        <span className="text-text">
          {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)}
        </span>{' '}
        من <span className="text-text">{total}</span> نتيجة
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 text-sm rounded-lg text-text-muted hover:bg-white/5 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          السابق
        </button>
        {start > 1 && (
          <>
            <button
              onClick={() => onChange(1)}
              className="w-8 h-8 rounded-lg text-sm text-text-muted hover:bg-white/5"
            >
              1
            </button>
            {start > 2 && <span className="text-text-subtle px-1">...</span>}
          </>
        )}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn(
              'w-8 h-8 rounded-lg text-sm transition-colors',
              p === page
                ? 'bg-accent text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]'
                : 'text-text-muted hover:bg-white/5 hover:text-text'
            )}
          >
            {p}
          </button>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="text-text-subtle px-1">...</span>}
            <button
              onClick={() => onChange(totalPages)}
              className="w-8 h-8 rounded-lg text-sm text-text-muted hover:bg-white/5"
            >
              {totalPages}
            </button>
          </>
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-sm rounded-lg text-text-muted hover:bg-white/5 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          التالي
        </button>
      </div>
    </div>
  );
}

export default Table;
