import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-md",
        className
      )}
    >
      <svg
        viewBox="0 0 120 120"
        className="h-3/5 w-3/5"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M71 32 A28 28 0 0 0 71 88"
          stroke="#fff"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <rect x="71" y="8" width="18" height="104" rx="9" fill="#fff" />
      </svg>
    </div>
  );
}