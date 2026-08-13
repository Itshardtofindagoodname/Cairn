"use client";

import { Loader2 } from "lucide-react";

/** Consistent spin loader used for every loading state. */
export function Spinner({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <Loader2
      className={`animate-spin ${className}`}
      aria-hidden
    />
  );
}
