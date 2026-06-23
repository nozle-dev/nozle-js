import { useEffect, useState } from "react";
import { useBillingContext } from '../provider.js';

export interface Plan {
  code: string;
  name: string;
  amount_cents: number;
  amount_currency: string;
  interval: string;
}

export interface UsePlansResult {
  plans: Plan[];
  loading: boolean;
}

export function usePlans(): UsePlansResult {
  const { client } = useBillingContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlans() {
      if (!client) {
        setLoading(false);
        return;
      }

      try {
        const response = await client.fetch('/api/v1/plans');
        if (response.ok) {
          const data = await response.json();
          setPlans(data.plans || []);
        }
      } catch (error) {
        console.error('Failed to fetch plans:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchPlans();
  }, [client]);

  return { plans, loading };
}
