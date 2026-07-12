import { useEffect, useState } from "react";
import { useBillingContext } from '../provider.js';

export interface Plan {
  code: string;
  name: string;
  amount_cents: number;
  amount_currency: string;
  interval: string;
}

export function usePlans() {
  const { client } = useBillingContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!client) {
      setIsLoading(false);
      return;
    }

    void client
      .fetch("/api/v1/plans")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { plans?: Plan[] };
        if (!cancelled) setPlans(data.plans ?? []);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  return { plans, isLoading };
}
