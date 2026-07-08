import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  segmentCount?: number;
}

const getSegmentColor = (segmentPercent: number, totalPercent: number) => {
  if (totalPercent >= 70) {
    if (segmentPercent < 40) return "bg-violet-500";
    if (segmentPercent < 62) return "bg-fuchsia-500";
    return "bg-red-500";
  }

  if (totalPercent >= 45) {
    if (segmentPercent < 35) return "bg-blue-500";
    if (segmentPercent < 60) return "bg-violet-500";
    return "bg-fuchsia-500";
  }

  if (totalPercent >= 25) {
    if (segmentPercent < 45) return "bg-emerald-500";
    if (segmentPercent < 70) return "bg-cyan-500";
    return "bg-blue-500";
  }

  return "bg-zinc-500";
};

const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value = 0, segmentCount = 44, ...props }, ref) => {
  const targetValue = Math.max(0, Math.min(100, value ?? 0));
  const [visibleSegments, setVisibleSegments] = React.useState(0);

  const targetSegments = Math.round((targetValue / 100) * segmentCount);

  React.useEffect(() => {
    setVisibleSegments(0);

    const interval = window.setInterval(() => {

      setVisibleSegments((current) => {
        if (current >= targetSegments) {
          window.clearInterval(interval);
          return current;
        }

        return current + 1;
      });
    }, 15);

    return () => window.clearInterval(interval);
  }, [targetSegments]);

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={targetValue}
      className={cn("w-full", className)}
      {...props}
    >
      <div className="grid w-full grid-flow-col gap-1">
        {Array.from({ length: segmentCount }).map((_, index) => {
          const isActive = index < visibleSegments;
          const segmentPercent = ((index + 1) / segmentCount) * 100;

          return (
            <span
              key={index}
              className={cn(
                "h-5 rounded-full transition-colors duration-150",
                isActive
                  ? getSegmentColor(segmentPercent, targetValue)
                  : "bg-zinc-800/70",
              )}
            />
          );
        })}
      </div>
    </ProgressPrimitive.Root>
  );
});

Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };