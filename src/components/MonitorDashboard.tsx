import { useState, useEffect, useCallback, useRef } from 'react';

interface SmokeResult {
  status: number;
  ok: boolean;
  latency_ms: number;
  error?: string;
}

interface LambdaMetrics {
  invocations: number[];
  errors: number[];
  avg_duration: number[];
  period_seconds: number;
  total_invocations: number;
  total_errors: number;
  error_rate: number;
}

interface MonitorData {
  errors: Record<string, { message: string; timestamp: number }[]>;
  smoke: Record<string, SmokeResult>;
  metrics: Record<string, LambdaMetrics>;
  healthy: boolean;
}

const LAMBDA_DISPLAY: Record<string, { label: string; color: string }> = {
  'pow-predictor-nve-proxy': { label: 'NVE Proxy', color: '#3b82f6' },
  'pow-predictor-conditions-summary': { label: 'Conditions', color: '#8b5cf6' },
  'pow-predictor-frontend-errors': { label: 'Frontend Errors', color: '#f59e0b' },
  'pow-predictor-feedback': { label: 'Feedback', color: '#06b6d4' },
};

let sparklineCounter = 0;

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const idRef = useRef(`g-${++sparklineCounter}`);
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const h = 32, w = 120;
  const points = data.map((v, i) =>
    `${(i / Math.max(data.length - 1, 1)) * w},${h - (v / max) * (h - 4)}`
  ).join(' ');
  const fillPoints = `${points} ${w},${h} 0,${h}`;
  const gradId = idRef.current;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline points={fillPoints} fill={`url(#${gradId})`} stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function LambdaCard({ name, metrics }: { name: string; metrics: LambdaMetrics }) {
  const display = LAMBDA_DISPLAY[name] || { label: name, color: '#64748b' };
  const avgDuration = metrics.avg_duration.length > 0
    ? Math.round(metrics.avg_duration.reduce((a, b) => a + b, 0) / metrics.avg_duration.length)
    : 0;
  return (
    <div className="bg-[#1a2332] border border-[#1e293b] rounded-xl p-5">
      <div className="text-[#64748b] text-[11px] uppercase tracking-wider mb-1">{display.label}</div>
      <div className="text-3xl font-bold text-white mb-0.5">{metrics.total_invocations}</div>
      <div className="text-[#64748b] text-xs mb-3">invocations</div>
      <Sparkline data={metrics.invocations} color={display.color} />
      <div className="flex justify-between mt-2 text-xs">
        <span className={metrics.error_rate > 0 ? 'text-red-400' : 'text-green-400'}>
          {metrics.error_rate}% errors
        </span>
        <span className="text-[#64748b]">~{avgDuration}ms avg</span>
      </div>
    </div>
  );
}

function SmokeCard({ label, result }: { label: string; result: SmokeResult }) {
  return (
    <div className="bg-[#1a2332] border border-[#1e293b] rounded-xl p-5">
      <div className="text-[#64748b] text-[11px] uppercase tracking-wider mb-2">{label}</div>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${result.ok ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-2xl font-bold text-white">{result.ok ? 'UP' : 'DOWN'}</span>
        <span className="text-[#64748b] text-sm ml-2">{result.status} · {result.latency_ms}ms</span>
      </div>
    </div>
  );
}

function ErrorList({ errors }: { errors: MonitorData['errors'] }) {
  const allErrors = Object.entries(errors).flatMap(([name, errs]) =>
    errs.map(e => ({ name: name.replace('pow-predictor-', ''), ...e }))
  ).sort((a, b) => b.timestamp - a.timestamp);

  const totalCount = allErrors.length;

  function timeAgo(ts: number) {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.round(mins / 60)}h ago`;
  }

  return (
    <div className="bg-[#1a2332] border border-[#1e293b] rounded-xl p-5">
      <div className="flex justify-between items-center mb-3">
        <div className="text-[#64748b] text-[11px] uppercase tracking-wider">Recent Errors</div>
        {totalCount > 0 ? (
          <span className="text-red-400 text-xs bg-red-400/10 px-2 py-0.5 rounded">
            {totalCount} error{totalCount !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-green-400 text-xs">None</span>
        )}
      </div>
      {allErrors.length > 0 && (
        <div className="border-t border-[#1e293b] pt-3 space-y-2">
          {allErrors.map((err, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="text-red-400 text-[11px] font-mono whitespace-nowrap min-w-[90px]">{err.name}</span>
              <span className="text-[#94a3b8] text-sm font-mono truncate">{err.message}</span>
              <span className="text-[#475569] text-[11px] ml-auto whitespace-nowrap">{timeAgo(err.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MonitorDashboard() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch('/api/monitor');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const respJson = await resp.json();
      // API Gateway proxy integration returns the Lambda body already parsed,
      // but handle both wrapped and unwrapped responses defensively
      const body = typeof respJson.body === 'string' ? JSON.parse(respJson.body) : respJson;
      setData(body);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { document.title = 'Pow Predictor Monitor'; fetchData(); }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchData, 60000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchData]);

  function timeAgoShort(date: Date) {
    const secs = Math.round((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    return `${Math.round(secs / 60)}m ago`;
  }

  if (!data && loading) {
    return (
      <div className="min-h-screen bg-[#0f1729] flex items-center justify-center">
        <div className="text-[#64748b] text-lg">Loading...</div>
      </div>
    );
  }

  if (!data && error) {
    return (
      <div className="min-h-screen bg-[#0f1729] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-2">Failed to load monitoring data</div>
          <div className="text-[#64748b] text-sm mb-4">{error}</div>
          <button onClick={fetchData} className="text-blue-400 hover:text-blue-300 text-sm">Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const lambdaNames = Object.keys(LAMBDA_DISPLAY);

  return (
    <div className="min-h-screen bg-[#0f1729] p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#1e293b]">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${data.healthy ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'}`} />
            <span className="font-semibold text-white">Production</span>
            <span className="text-[#64748b]">·</span>
            <span className="text-[#94a3b8] text-sm">Pow Predictor</span>
          </div>
          <div className="flex items-center gap-3 text-[#64748b] text-sm">
            {lastUpdated && <span>Updated {timeAgoShort(lastUpdated)}</span>}
            {loading && <span className="text-blue-400 animate-spin">↻</span>}
            <span className="text-[#475569]">·</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? 'text-blue-400' : 'text-[#475569]'}
            >
              Auto-refresh {autoRefresh ? 'on' : 'off'}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && data && (
          <div className="bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2 mb-4 flex justify-between items-center">
            <span className="text-red-400 text-sm">Refresh failed: {error}</span>
            <button onClick={fetchData} className="text-red-400 hover:text-red-300 text-sm">Retry</button>
          </div>
        )}

        {/* Smoke Tests */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {data.smoke.site && <SmokeCard label="Site" result={data.smoke.site} />}
          {data.smoke.api && <SmokeCard label="API Gateway" result={data.smoke.api} />}
        </div>

        {/* Lambda Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {lambdaNames.map(name =>
            data.metrics[name] && <LambdaCard key={name} name={name} metrics={data.metrics[name]} />
          )}
        </div>

        {/* Recent Errors */}
        <ErrorList errors={data.errors} />
      </div>
    </div>
  );
}
