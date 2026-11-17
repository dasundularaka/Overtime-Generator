import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TrendingUp, Calendar, Banknote, Clock, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { MONTH_NAMES } from '../utils/timeCalculations';

export interface MonthlyProgressDatum {
  monthIndex: number; // 0..11
  monthName: string;
  shortLabel: string;
  amount: number;
  minutes: number;
  claimsCount: number;
  isLastMonth?: boolean;
}

interface MonthlyProgressChartProps {
  data: MonthlyProgressDatum[];
  selectedYear: number;
  availableYears: number[];
  onYearChange: (year: number) => void;
  title: string;
  subtitle: string;
  loading?: boolean;
  onCreateClaim?: () => void;
}

function getNiceScaleMax(maxVal: number): number {
  if (!Number.isFinite(maxVal) || maxVal <= 0) return 10000;
  const roughStep = maxVal / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const fraction = roughStep / magnitude;
  let niceFraction = 1;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * magnitude * 4;
}

function formatAxisRupees(val: number): string {
  if (val <= 0) return 'Rs. 0';
  if (val >= 1_000_000) {
    const m = val / 1_000_000;
    return `Rs. ${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (val >= 1_000) {
    const k = val / 1_000;
    return `Rs. ${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `Rs. ${Math.round(val)}`;
}

function formatHours(minutes: number): string {
  if (!minutes || minutes <= 0) return '00:00';
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const MonthlyProgressChart: React.FC<MonthlyProgressChartProps> = ({
  data,
  selectedYear,
  availableYears,
  onYearChange,
  title,
  subtitle,
  loading = false,
  onCreateClaim,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 720, height: 280 });

  // Measure actual rendered container width & height responsively without distorting SVG typography
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setSize({
          width: Math.round(rect.width),
          height: Math.max(210, Math.min(340, Math.round(rect.height || 270))),
        });
      }
    };

    updateSize();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateSize);
      ro.observe(el);
    }
    window.addEventListener('resize', updateSize);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Default inspected month: latest month with data, or last calendar month, or most recent month
  const defaultActiveIdx = useMemo(() => {
    const lastMarked = data.find(d => d.isLastMonth && d.amount > 0);
    if (lastMarked) return lastMarked.monthIndex;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].amount > 0 || data[i].claimsCount > 0) return data[i].monthIndex;
    }
    const lastCal = data.find(d => d.isLastMonth);
    return lastCal ? lastCal.monthIndex : 0;
  }, [data]);

  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);
  const activeMonthIdx = hoveredMonthIdx !== null ? hoveredMonthIdx : defaultActiveIdx;
  const activeDatum = data.find(d => d.monthIndex === activeMonthIdx) || data[0];

  const yearTotals = useMemo(() => {
    let totalAmount = 0;
    let totalMinutes = 0;
    let totalClaims = 0;
    let peakMonth: MonthlyProgressDatum | null = null;

    for (const d of data) {
      totalAmount += d.amount;
      totalMinutes += d.minutes;
      totalClaims += d.claimsCount;
      if (!peakMonth || d.amount > peakMonth.amount) {
        peakMonth = d;
      }
    }
    return { totalAmount, totalMinutes, totalClaims, peakMonth };
  }, [data]);

  // Month-over-month delta for active inspected month
  const momChange = useMemo(() => {
    if (!activeDatum || activeDatum.monthIndex === 0) return null;
    const prev = data[activeDatum.monthIndex - 1];
    if (!prev || prev.amount <= 0) return null;
    const pct = ((activeDatum.amount - prev.amount) / prev.amount) * 100;
    return {
      pct: Math.round(pct * 10) / 10,
      prevShort: prev.shortLabel,
    };
  }, [activeDatum, data]);

  // SVG Layout Geometry
  const isCompactWidth = size.width < 480;
  const padLeft = isCompactWidth ? 52 : 66;
  const padRight = isCompactWidth ? 10 : 18;
  const padTop = 18;
  const padBottom = isCompactWidth ? 32 : 36;
  const svgW = Math.max(280, size.width);
  const svgH = Math.max(210, size.height);
  const plotW = Math.max(120, svgW - padLeft - padRight);
  const plotH = Math.max(100, svgH - padTop - padBottom);

  const rawMaxAmount = useMemo(() => {
    return data.reduce((max, d) => (d.amount > max ? d.amount : max), 0);
  }, [data]);

  const scaleMax = useMemo(() => getNiceScaleMax(rawMaxAmount), [rawMaxAmount]);

  const yTicks = useMemo(() => {
    const steps = 4;
    const arr = [];
    for (let i = 0; i <= steps; i++) {
      const val = (scaleMax / steps) * i;
      const y = padTop + plotH - (val / scaleMax) * plotH;
      arr.push({ value: val, label: formatAxisRupees(val), y });
    }
    return arr;
  }, [scaleMax, padTop, plotH]);

  const slotW = plotW / 12;
  const barW = Math.max(8, Math.min(34, slotW * 0.52));

  const points = useMemo(() => {
    return data.map((d, i) => {
      const cx = padLeft + slotW * i + slotW / 2;
      const ratio = scaleMax > 0 ? Math.min(1, Math.max(0, d.amount / scaleMax)) : 0;
      const barH = d.amount > 0 ? Math.max(3, ratio * plotH) : 0;
      const cy = padTop + plotH - barH;
      return {
        ...d,
        cx,
        cy,
        barX: cx - barW / 2,
        barY: cy,
        barH,
      };
    });
  }, [data, padLeft, padTop, plotH, slotW, barW, scaleMax]);

  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`)
      .join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const baseY = (padTop + plotH).toFixed(1);
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePath} L ${last.cx.toFixed(1)} ${baseY} L ${first.cx.toFixed(1)} ${baseY} Z`;
  }, [points, linePath, padTop, plotH]);

  const hasAnyYearData = yearTotals.totalClaims > 0 || yearTotals.totalAmount > 0;

  return (
    <div className="rounded-2xl bg-white shadow-xs border border-slate-200 overflow-hidden">
      {/* Header Strip */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              {title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
          {/* Annual Total Pill */}
          <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center gap-2">
            <span className="text-slate-500 font-medium">{selectedYear} Total:</span>
            <span className="font-bold text-slate-900 tabular-nums">
              Rs. {yearTotals.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Year Switcher */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <label htmlFor="progress-chart-year" className="sr-only">
              Select chart year
            </label>
            <select
              id="progress-chart-year"
              value={selectedYear}
              onChange={(e) => {
                setHoveredMonthIdx(null);
                onYearChange(Number(e.target.value));
              }}
              className="bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden cursor-pointer tabular-nums"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Selected / Hovered Month Live Breakdown Bar */}
      <div className="px-4 sm:px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-bold text-slate-900 text-xs sm:text-sm">
            {activeDatum ? `${activeDatum.monthName} ${selectedYear}` : `${MONTH_NAMES[0]} ${selectedYear}`}
          </span>
          {activeDatum?.isLastMonth && (
            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
              Last Month
            </span>
          )}
          {momChange && activeDatum && activeDatum.amount > 0 && (
            <span
              className={`inline-flex items-center gap-0.5 font-semibold text-[11px] tabular-nums ${
                momChange.pct >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {momChange.pct >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" />
              )}
              <span>
                {momChange.pct >= 0 ? '+' : ''}
                {momChange.pct}% vs {momChange.prevShort}
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 sm:gap-5 flex-wrap tabular-nums">
          <div className="flex items-center gap-1.5">
            <Banknote className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-slate-500">Amount:</span>
            <span className="font-bold text-emerald-700">
              Rs. {(activeDatum?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="text-slate-500">OT Hours:</span>
            <span className="font-bold text-slate-800">
              {formatHours(activeDatum?.minutes || 0)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="text-slate-500">Claims:</span>
            <span className="font-bold text-slate-800">
              {activeDatum?.claimsCount || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Responsive Chart Area */}
      <div className="p-3 sm:p-5">
        {loading ? (
          <div className="h-[clamp(220px,34dvh,320px)] w-full flex flex-col justify-end gap-3 animate-pulse px-2">
            <div className="flex items-end justify-between gap-2 sm:gap-4 h-4/5">
              {[
                'h-2/6',
                'h-3/6',
                'h-2/5',
                'h-4/6',
                'h-3/5',
                'h-5/6',
                'h-3/6',
                'h-4/6',
                'h-3/4',
                'h-5/6',
                'h-2/5',
                'h-1/4',
              ].map((hClass, i) => (
                <div key={i} className={`flex-1 rounded-t-lg bg-slate-200/80 ${hClass}`} />
              ))}
            </div>
            <div className="h-3 w-full rounded bg-slate-100" />
          </div>
        ) : (
          <div className="relative w-full">
            <div
              ref={containerRef}
              className="w-full h-[clamp(220px,34dvh,320px)] select-none"
            >
              <svg
                width={svgW}
                height={svgH}
                viewBox={`0 0 ${svgW} ${svgH}`}
                role="img"
                aria-label={`Monthly Overtime Amount Progress Chart for ${selectedYear}`}
                className="w-full h-full overflow-visible"
              >
                <defs>
                  <linearGradient id="otChartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Gridlines & Amount Labels */}
                {yTicks.map((tick, idx) => (
                  <g key={`y-${idx}`}>
                    <line
                      x1={padLeft}
                      y1={tick.y}
                      x2={padLeft + plotW}
                      y2={tick.y}
                      stroke={idx === 0 ? '#cbd5e1' : '#e2e8f0'}
                      strokeWidth={1}
                      strokeDasharray={idx === 0 ? undefined : '4 4'}
                    />
                    <text
                      x={padLeft - 8}
                      y={tick.y + 4}
                      textAnchor="end"
                      fill="#64748b"
                      fontSize={isCompactWidth ? 10 : 11}
                      fontWeight={600}
                      className="tabular-nums"
                    >
                      {tick.label}
                    </text>
                  </g>
                ))}

                {/* Axis Titles */}
                <text
                  x={padLeft}
                  y={10}
                  fill="#94a3b8"
                  fontSize={10}
                  fontWeight={700}
                >
                  Amount (Rs.)
                </text>

                {/* Subtle Area Under Progress Trend */}
                {hasAnyYearData && <path d={areaPath} fill="url(#otChartAreaGrad)" />}

                {/* Month Columns, Trend Line & Interactive Hit Targets */}
                {points.map((p) => {
                  const isActive = p.monthIndex === activeMonthIdx;
                  const barFill = isActive
                    ? '#4338ca'
                    : p.isLastMonth
                    ? '#059669'
                    : p.amount > 0
                    ? '#6366f1'
                    : '#e2e8f0';

                  return (
                    <g
                      key={p.monthIndex}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredMonthIdx(p.monthIndex)}
                      onClick={() => setHoveredMonthIdx(p.monthIndex)}
                    >
                      {/* Invisible generous touch/hover hit strip */}
                      <rect
                        x={padLeft + slotW * p.monthIndex}
                        y={padTop}
                        width={slotW}
                        height={plotH + padBottom}
                        fill="transparent"
                      />

                      {/* Active vertical focus backdrop */}
                      {isActive && (
                        <rect
                          x={padLeft + slotW * p.monthIndex + 2}
                          y={padTop}
                          width={Math.max(4, slotW - 4)}
                          height={plotH}
                          rx={6}
                          fill="#eef2ff"
                          opacity={0.7}
                        />
                      )}

                      {/* Monthly Amount Column Bar */}
                      {p.barH > 0 ? (
                        <rect
                          x={p.barX}
                          y={p.barY}
                          width={barW}
                          height={p.barH}
                          rx={4}
                          fill={barFill}
                          opacity={isActive ? 1 : 0.85}
                        />
                      ) : (
                        <rect
                          x={p.barX}
                          y={padTop + plotH - 2}
                          width={barW}
                          height={2}
                          rx={1}
                          fill="#e2e8f0"
                        />
                      )}

                      {/* X-Axis Month Label */}
                      <text
                        x={p.cx}
                        y={padTop + plotH + (isCompactWidth ? 18 : 20)}
                        textAnchor="middle"
                        fill={isActive ? '#312e81' : p.isLastMonth ? '#047857' : '#64748b'}
                        fontSize={isCompactWidth ? 10 : 11}
                        fontWeight={isActive || p.isLastMonth ? 700 : 500}
                      >
                        {p.shortLabel}
                      </text>
                    </g>
                  );
                })}

                {/* Progress Trend Line */}
                {hasAnyYearData && (
                  <path
                    d={linePath}
                    fill="none"
                    stroke="#312e81"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none"
                  />
                )}

                {/* Trend Data Dots */}
                {hasAnyYearData &&
                  points.map((p) => {
                    const isActive = p.monthIndex === activeMonthIdx;
                    if (p.amount <= 0 && !isActive) return null;
                    return (
                      <circle
                        key={`dot-${p.monthIndex}`}
                        cx={p.cx}
                        cy={p.cy}
                        r={isActive ? 5 : 3.5}
                        fill={p.isLastMonth ? '#10b981' : '#ffffff'}
                        stroke={p.isLastMonth ? '#065f46' : '#312e81'}
                        strokeWidth={2}
                        className="pointer-events-none"
                      />
                    );
                  })}
              </svg>
            </div>

            {/* Footer Legend + Empty Notice */}
            <div className="mt-2 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500 inline-block" />
                  <span>Monthly Claimed Amount</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
                  <span>Last Month</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-indigo-950 inline-block" />
                  <span>Progress Trend</span>
                </span>
              </div>

              {!hasAnyYearData ? (
                <div className="flex items-center gap-2">
                  <span>No submitted claims recorded for {selectedYear} in this scope.</span>
                  {onCreateClaim && (
                    <button
                      type="button"
                      onClick={onCreateClaim}
                      className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                    >
                      New Claim
                    </button>
                  )}
                </div>
              ) : (
                yearTotals.peakMonth &&
                yearTotals.peakMonth.amount > 0 && (
                  <span className="tabular-nums">
                    Peak Month: <strong className="text-slate-800">{yearTotals.peakMonth.monthName}</strong>{' '}
                    (Rs. {yearTotals.peakMonth.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </span>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
