import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Base atomic pulsing skeleton element
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return (
    <div
      style={style}
      aria-hidden="true"
      className={`animate-pulse bg-slate-200/80 rounded-lg ${className}`}
    />
  );
};

/**
 * Metric / KPI Cards Skeleton (for Dashboard & overview stats)
 */
export const KpiGridSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/90 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-28 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-xl" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-7 w-32 rounded-lg" />
            <Skeleton className="h-3.5 w-20 rounded-md" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <Skeleton className="h-3 w-16 rounded-md" />
            <Skeleton className="h-3 w-12 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Table Skeleton (for ClaimHistory, Dashboard claims table, Users table, Audit log)
 */
interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  colWidths?: string[];
  showCheckbox?: boolean;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  cols = 7,
  colWidths,
  showCheckbox = false,
}) => {
  return (
    <div className="w-full overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50/80 border-b border-slate-200">
            {showCheckbox && (
              <th className="py-3 px-3 w-10 text-center">
                <Skeleton className="w-4 h-4 mx-auto rounded" />
              </th>
            )}
            {Array.from({ length: cols }).map((_, cIdx) => (
              <th key={cIdx} className="py-3.5 px-4">
                <Skeleton
                  className={`h-3.5 rounded-md ${
                    colWidths && colWidths[cIdx] ? colWidths[cIdx] : 'w-20'
                  }`}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: rows }).map((_, rIdx) => (
            <tr key={rIdx} className="hover:bg-slate-50/40">
              {showCheckbox && (
                <td className="py-3.5 px-3 text-center">
                  <Skeleton className="w-4 h-4 mx-auto rounded" />
                </td>
              )}
              {Array.from({ length: cols }).map((_, cIdx) => (
                <td key={cIdx} className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    {cIdx === 0 && (
                      <Skeleton className="w-6 h-6 rounded-lg shrink-0" />
                    )}
                    <Skeleton
                      className={`h-3.5 rounded-md ${
                        colWidths && colWidths[cIdx]
                          ? colWidths[cIdx]
                          : cIdx % 2 === 0
                          ? 'w-24'
                          : 'w-16'
                      }`}
                    />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Mobile Cards Skeleton (for Mobile Claim History, Mobile Users, Mobile Branches)
 */
export const MobileCardListSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl p-4 bg-white border border-slate-200/90 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="w-8 h-8 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-24 rounded-md" />
                <Skeleton className="h-2.5 w-16 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <Skeleton className="h-3 w-28 rounded-md" />
            <Skeleton className="h-4 w-16 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Card Grid Skeleton (for Employees, Roles, Branches grid)
 */
export const CardGridSkeleton: React.FC<{
  count?: number;
  columns?: string;
}> = ({ count = 6, columns = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' }) => {
  return (
    <div className={`grid ${columns} gap-4`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/90 space-y-4"
        >
          <div className="flex items-start gap-3">
            <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32 rounded-md" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-16 rounded-md" />
                <Skeleton className="h-3 w-12 rounded-md" />
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <Skeleton className="h-3 w-full rounded-md" />
            <Skeleton className="h-3 w-3/4 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <Skeleton className="h-4 w-20 rounded-md" />
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-7 w-7 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Calendar Grid Skeleton (for CalendarManager monthly schedule)
 */
export const CalendarGridSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {/* Calendar Header Controls Skeleton */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <Skeleton className="h-5 w-48 rounded-lg" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-16 rounded-xl" />
          <Skeleton className="h-8 w-24 rounded-xl" />
        </div>
      </div>

      {/* Weekday Row */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {Array.from({ length: 7 }).map((_, idx) => (
          <Skeleton key={idx} className="h-7 rounded-xl" />
        ))}
      </div>

      {/* 35 Calendar Day Cells */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {Array.from({ length: 35 }).map((_, idx) => (
          <div
            key={idx}
            className="min-h-[75px] sm:min-h-[105px] p-2 rounded-xl border border-slate-200/80 bg-white flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-5 rounded-md" />
              {idx % 5 === 0 && <Skeleton className="h-2 w-2 rounded-full" />}
            </div>
            {idx % 4 === 0 ? (
              <Skeleton className="h-5 w-full rounded-md mt-2" />
            ) : (
              <div className="h-4" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
