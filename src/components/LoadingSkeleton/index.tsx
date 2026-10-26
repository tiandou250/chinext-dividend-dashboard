const SHIMMER =
  'bg-[linear-gradient(90deg,#EDF1F7_0%,#F7F9FC_50%,#EDF1F7_100%)] bg-[length:400px_100%] animate-shimmer';

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-md ${SHIMMER} ${className}`} />;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <div className="card-surface p-4 sm:p-5">{children}</div>;
}

/**
 * 首屏骨架。
 * 结构与真实布局一致（4 张指标卡 + 图表卡 + 极值卡），避免数据到位时的跳动。
 */
export default function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在读取行情数据</span>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <CardShell key={index}>
            <div className="flex items-start justify-between gap-2">
              <Bar className="h-3 w-20" />
              <Bar className="h-5 w-14 rounded-full" />
            </div>
            <Bar className="mt-4 h-8 w-28" />
            <Bar className="mt-3 h-3 w-24" />
          </CardShell>
        ))}
      </div>

      <CardShell>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Bar className="h-4 w-32" />
            <Bar className="h-8 w-24 rounded-full" />
          </div>
          <div className="flex gap-2">
            <Bar className="h-9 w-56 rounded-full" />
            <Bar className="hidden h-9 w-40 rounded-full sm:block" />
          </div>
          <Bar className="h-[300px] w-full rounded-xl sm:h-[420px] lg:h-[560px]" />
        </div>
      </CardShell>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <CardShell key={index}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Bar className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <Bar className="h-3 w-24" />
                  <Bar className="h-3 w-16" />
                </div>
              </div>
              <Bar className="h-6 w-16" />
            </div>
          </CardShell>
        ))}
      </div>
    </div>
  );
}
