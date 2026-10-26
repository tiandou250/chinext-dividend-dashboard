import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Info, MoveHorizontal, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import MainChart, { type VisibleWindow } from '@/charts/MainChart';
import ErrorPanel from '@/components/ErrorPanel';
import ExtremeMarkers from '@/components/ExtremeMarkers';
import Header from '@/components/Header';
import GuideGate from '@/components/GuideGate';
import InfoDialog from '@/components/InfoDialog';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import MetricCards from '@/components/MetricCards';
import RangeSummary from '@/components/RangeSummary';
import type { StatusTone } from '@/components/StatusIndicator';
import TimeRangeSelector from '@/components/TimeRangeSelector';
import ZoneGuide from '@/components/ZoneGuide';
import { useMarketData } from '@/hooks/useMarketData';
import { useMediaQuery, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { shortSourceName } from '@/services/marketData';
import type { Granularity, HistoricalRecord, RangeKey } from '@/types/market';
import {
  changeRate,
  extremesWithin,
  HIGH_LINE,
  LOW_LINE,
  latestPair,
  resolveZone,
  sliceByRange,
} from '@/utils/calculations';
import { formatDateSlash, formatDateLong, formatRatio } from '@/utils/formatting';

/** 首次进入是否展示使用说明（读完记到本地，次次不再打扰） */
const GUIDE_KEY = 'chinext-dividend-guide-read-v1';

const RANGE_LABEL: Record<RangeKey, string> = {
  '1y': '近 1 年',
  '3y': '近 3 年',
  '5y': '近 5 年',
  all: '全部历史',
};

export default function App() {
  const { status, dataset, error, refreshing, refresh, lastRefreshFoundNewVersion } = useMarketData();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const reducedMotion = usePrefersReducedMotion();

  const [range, setRange] = useState<RangeKey>('5y');
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [visible, setVisible] = useState({ chinext: true, ratio: true });
  const [resetToken, setResetToken] = useState(0);
  const [selectedExtreme, setSelectedExtreme] = useState<'min' | 'max' | null>(null);
  const [chartWindow, setChartWindow] = useState<VisibleWindow | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(() => {
    try {
      return window.localStorage.getItem(GUIDE_KEY) !== '1';
    } catch {
      // 隐私模式禁用 localStorage 时，宁可不展示也不要报错
      return false;
    }
  });

  const metadata = dataset?.metadata ?? null;
  const records = useMemo<HistoricalRecord[]>(() => dataset?.records ?? [], [dataset]);
  const hasData = records.length > 0;

  const sliced = useMemo(() => sliceByRange(records, range), [records, range]);

  // 切换时间范围后，图表会重置到完整区间，本地窗口记录同步清空
  useEffect(() => {
    setChartWindow(null);
  }, [range]);

  const { latest, previous } = useMemo(() => latestPair(records), [records]);
  const zone = useMemo(() => resolveZone(latest?.ratio ?? Number.NaN), [latest]);

  const chinextChange = changeRate(latest?.chinextClose, previous?.chinextClose);
  const dividendChange = changeRate(latest?.dividendClose, previous?.dividendClose);

  /** 图表标记按「当前时间范围」计算，不随缩放变化，避免缩放时反复重设图表 */
  const rangeExtremes = useMemo(() => {
    if (sliced.length === 0) return { min: null, max: null };
    const first = sliced[0]!;
    const last = sliced[sliced.length - 1]!;
    return extremesWithin(sliced, first.date, last.date);
  }, [sliced]);

  /** 极值信息卡展示的是「当前缩放窗口」，与图表标记分开 */
  const windowExtremes = useMemo(() => {
    if (sliced.length === 0) return { min: null, max: null };
    if (!chartWindow) return rangeExtremes;
    return extremesWithin(sliced, chartWindow.from, chartWindow.to);
  }, [sliced, chartWindow, rangeExtremes]);

  const allTimeExtremes = useMemo(() => {
    if (records.length === 0) return { min: null, max: null };
    let minRec = records[0]!;
    let maxRec = records[0]!;
    for (const row of records) {
      if (row.ratio < minRec.ratio) minRec = row;
      if (row.ratio > maxRec.ratio) maxRec = row;
    }
    return { min: minRec, max: maxRec };
  }, [records]);

  const distribution = useMemo(() => {
    let low = 0;
    let mid = 0;
    let high = 0;
    for (const row of records) {
      if (row.ratio <= LOW_LINE) low += 1;
      else if (row.ratio >= HIGH_LINE) high += 1;
      else mid += 1;
    }
    return { low, mid, high, total: records.length };
  }, [records]);

  const windowRecords = useMemo(() => {
    if (!chartWindow) return sliced;
    return sliced.filter((row) => row.date >= chartWindow.from && row.date <= chartWindow.to);
  }, [sliced, chartWindow]);

  const handleGuideRead = useCallback(() => {
    try {
      window.localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      // 存不进去就算了，本次会话内不再弹出
    }
    setGuideOpen(false);
  }, []);

  const handleWindowChange = useCallback((next: VisibleWindow | null) => {
    setChartWindow((prev) => {
      if (prev === null && next === null) return prev;
      if (prev && next && prev.from === next.from && prev.to === next.to && prev.count === next.count) {
        return prev;
      }
      return next;
    });
  }, []);

  const handleToggleSeries = useCallback((key: 'chinext' | 'ratio') => {
    setVisible((prev) => {
      // 至少保留一条曲线，否则图表只剩参考线，容易被误读为"数据缺失"
      if (prev[key] && !prev[key === 'ratio' ? 'chinext' : 'ratio']) return prev;
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  const handleReset = useCallback(() => {
    setResetToken((token) => token + 1);
    setChartWindow(null);
  }, []);

  const shiftRange = useCallback((next: RangeKey) => {
    setRange(next);
    setSelectedExtreme(null);
  }, []);

  const statusTone: StatusTone =
    status === 'loading'
      ? 'loading'
      : error
        ? 'danger'
        : refreshing
          ? 'loading'
          : dataset?.warning
            ? 'warning'
            : 'calm';

  const statusLabel =
    status === 'loading'
      ? '正在读取数据'
      : error
        ? hasData
          ? '刷新失败，展示已缓存版本'
          : '数据读取失败'
        : refreshing
          ? '正在检查数据版本'
          : dataset?.warning
            ? '数据校验提示'
            : lastRefreshFoundNewVersion === null
              ? '静态快照已就绪'
              : lastRefreshFoundNewVersion
                ? '已同步新版本'
                : '已是最新版本';

  const statusDetail = error?.message ?? dataset?.warning ?? metadata?.coverageNote ?? null;
  const sourceName = shortSourceName(metadata);

  const visibleSpan =
    windowRecords.length > 0
      ? `${formatDateSlash(windowRecords[0]!.date)} → ${formatDateSlash(
          windowRecords[windowRecords.length - 1]!.date,
        )}`
      : '—';

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <Header
        latestTradingDate={metadata?.latestTradingDate ?? null}
        sourceName={sourceName}
        tone={statusTone}
        statusLabel={statusLabel}
        statusDetail={statusDetail}
        updatedAt={metadata?.lastUpdate?.runAt ?? metadata?.generatedAt ?? null}
        refreshing={refreshing}
        onRefresh={refresh}
      />

      <main
        className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-4 sm:px-6 sm:pt-5"
        style={{ paddingBottom: 'calc(2rem + var(--safe-bottom))' }}
      >
        {status === 'loading' && !hasData ? <LoadingSkeleton /> : null}

        {status === 'error' && !hasData ? (
          <ErrorPanel
            message={error?.message ?? '未能读取行情数据'}
            hint={error?.hint ?? '请检查数据文件是否已生成。'}
            code={error?.code ?? 'UNKNOWN'}
            refreshing={refreshing}
            onRetry={refresh}
          />
        ) : null}

        {hasData && latest ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.28 }}
            className="flex flex-col gap-4 sm:gap-5"
          >
            <AnimatePresence initial={false}>
              {error ? (
                <motion.div
                  key="refresh-error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/35 bg-gold/[0.08] px-3 py-2.5">
                    <TriangleAlert size={14} className="shrink-0 text-gold" aria-hidden />
                    <p className="text-[12px] leading-snug text-ink/80">
                      重新读取失败：{error.message}
                      <span className="ml-1 text-muted">
                        （页面仍展示上次成功读取的版本，数据截至 {metadata?.latestTradingDate ?? '—'}）
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={refresh}
                      className="surface-chip ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-gold transition-colors hover:text-gold/80"
                    >
                      重试
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <MetricCards
              latest={latest}
              previous={previous}
              zone={zone}
              chinextChange={chinextChange}
              dividendChange={dividendChange}
            />

            {/* ── 主图 ── */}
            <section className="card-surface p-3.5 sm:p-5" aria-labelledby="main-chart-title">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 id="main-chart-title" className="text-[14px] font-semibold text-ink sm:text-[15px]">
                    相对强弱走势
                  </h2>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                    左轴：创业板指数收盘点位 · 右轴：相对比值（创业板 ÷ 中证红利）· 虚线为
                    <span className="text-zone-low"> {LOW_LINE.toFixed(3)} </span>/
                    <span className="text-zone-high"> {HIGH_LINE.toFixed(3)} </span>
                    参考线
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInfoOpen(true)}
                  className="surface-chip trace-line inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink transition-colors hover:text-gold sm:min-h-[34px]"
                >
                  <Info size={13} aria-hidden />
                  说明
                </button>
              </div>

              <div className="mt-3">
                <TimeRangeSelector
                  range={range}
                  granularity={granularity}
                  visible={visible}
                  visibleSpan={visibleSpan}
                  onRangeChange={shiftRange}
                  onGranularityChange={setGranularity}
                  onToggleSeries={handleToggleSeries}
                  onReset={handleReset}
                />
              </div>

              <div className="surface-inset-sm mt-3 rounded-xl2 bg-well/50 p-2">
                <MainChart
                  records={sliced}
                  granularity={granularity}
                  visible={visible}
                  extremes={rangeExtremes}
                  isMobile={isMobile}
                  reducedMotion={reducedMotion}
                  resetToken={resetToken}
                  onSelectExtreme={setSelectedExtreme}
                  onWindowChange={handleWindowChange}
                />
              </div>

              <div className="mt-3">
                <RangeSummary records={windowRecords} />
              </div>

              <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
                <MoveHorizontal size={13} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  {isMobile
                    ? '双指缩放图表、拖动下方滑块调整区间；点击曲线上的极值标记查看当日明细。'
                    : '滚轮缩放、按住图表拖动可平移区间，也可拖动底部滑块；点击极值标记查看当日明细。'}
                  取值范围仅改变"看哪一段"，不改变数据本身。
                </span>
              </p>
            </section>

            {/* ── 极值 ── */}
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[13px] font-semibold text-ink">比值极值</h2>
                <span className="text-[11px] text-muted tnum">
                  {RANGE_LABEL[range]}区间内已标出 · 全历史极值见下方卡片
                </span>
              </div>
              <ExtremeMarkers
                allTime={allTimeExtremes}
                inView={windowExtremes}
                selected={selectedExtreme}
                onSelect={setSelectedExtreme}
              />
            </div>

            <ZoneGuide ratio={latest.ratio} zone={zone} distribution={distribution} />

            {/* ── 口径摘要 ── */}
            <section className="card-surface p-4 sm:p-5" aria-labelledby="method-title">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 id="method-title" className="text-[13px] font-semibold text-ink">
                  数据与口径
                </h2>
                <button
                  type="button"
                  onClick={() => setInfoOpen(true)}
                  className="text-[11px] font-medium text-gold hover:underline"
                >
                  查看完整说明
                </button>
              </div>
              <dl className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex items-baseline justify-between gap-3 border-b border-hairline/70 pb-1.5">
                  <dt className="text-[11.5px] text-muted">数据来源</dt>
                  <dd className="text-[12px] font-medium text-ink">{sourceName}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-hairline/70 pb-1.5">
                  <dt className="text-[11.5px] text-muted">数据截至</dt>
                  <dd className="text-[12px] font-medium text-ink tnum">
                    {metadata?.latestTradingDate ?? '—'} 收盘
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-hairline/70 pb-1.5">
                  <dt className="text-[11.5px] text-muted">记录条数</dt>
                  <dd className="text-[12px] font-medium text-ink tnum">
                    {records.length.toLocaleString('zh-CN')} 个交易日
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-hairline/70 pb-1.5">
                  <dt className="text-[11.5px] text-muted">时间轴起点</dt>
                  <dd className="text-[12px] font-medium text-ink tnum">
                    {metadata?.timelineStart ?? '—'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-hairline/70 pb-1.5">
                  <dt className="text-[11.5px] text-muted">首个可用交易日</dt>
                  <dd className="text-[12px] font-medium text-ink tnum">{metadata?.startDate ?? '—'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-hairline/70 pb-1.5">
                  <dt className="text-[11.5px] text-muted">数据版本</dt>
                  <dd className="truncate font-mono text-[11.5px] text-ink">
                    {metadata?.dataVersion ?? '—'}
                  </dd>
                </div>
              </dl>

              <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
                比值 = 创业板指数收盘点位 ÷ 中证红利指数收盘点位，取同一交易日收盘值，计算用未舍入原始点位。
                页面读取的是收盘后生成的静态快照，非盘中实时行情。
                {metadata?.coverageNote ? ` ${metadata.coverageNote}` : ''}
              </p>
            </section>
          </motion.div>
        ) : null}
      </main>

      <footer
        className="border-t border-hairline/70 bg-card/50"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[11px] leading-relaxed text-muted">
            个人研究工具 · 数据来自公开接口的历史收盘点位 · 历史表现不代表未来收益 · 不构成投资建议
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] text-muted tnum">
              {metadata?.latestTradingDate ? `数据截至 ${formatDateLong(metadata.latestTradingDate)}` : '—'}
              {latest ? ` · 当前比值 ${formatRatio(latest.ratio)}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-ink/70 transition-colors hover:text-gold"
            >
              <BookOpen size={11} aria-hidden />
              使用指南
            </button>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-ink/70 transition-colors hover:text-gold"
            >
              <Info size={11} aria-hidden />
              数据说明
            </button>
          </div>
        </div>
      </footer>

      <GuideGate open={guideOpen} onRead={handleGuideRead} />

      <InfoDialog
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        metadata={metadata}
        recordCount={records.length}
      />

      {/* 手机端状态条在滚动时始终可达，避免顶部信息被长页面带走 */}
      <div className="sr-only" aria-live="polite">
        {statusLabel}
      </div>
    </div>
  );
}
