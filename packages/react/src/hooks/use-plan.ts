import { useState, useEffect } from "react";
import { useBillingContext } from '../provider.js';

export interface UsePlanResult {
  plan: {
    code: string;
    name: string;
  } | null;
  loading: boolean;
}

export function usePlan(): UsePlanResult {
  const { client } = useBillingContext();
  const [plan, setPlan] = useState<{ code: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock plan for demo - in production, fetch from API
    setPlan({ code: 'pro', name: 'Pro Plan' });
    setLoading(false);
  }, [client]);

  return { plan, loading };
}
