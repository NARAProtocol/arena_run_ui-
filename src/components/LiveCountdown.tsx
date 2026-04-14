import { useEffect, useState } from "react";
import { formatCountdown } from "../shared/arena";

export function LiveCountdown({ value }: { value: bigint | undefined }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="countdown-live">{formatCountdown(value)}</span>;
}
