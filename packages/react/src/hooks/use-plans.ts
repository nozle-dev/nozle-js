import { useEffect, useState } from "react";
import { useBillingContext } from "../provider";

export interface Plan {
  code: string;
  name: string;
  amount_cents: number;
  amount_currency: string;
  interval: string;
}

export function usePlans() {
  const { store } = useBillingContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    store
      .fetchPlans()
      .then(setPlans)
      .finally(() => setIsLoading(false));
  }, [store]);

  return { plans, isLoading };
}
