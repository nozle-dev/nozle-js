import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { BillingStore } from "./store";
import { connectCentrifugo, type CentrifugoConnection } from "./centrifugo";

interface BillingContextValue {
  store: BillingStore;
  stripePromise: Promise<Stripe | null> | null;
}

const BillingContext = createContext<BillingContextValue | null>(null);

interface BillingProviderProps {
  apiKey: string;
  customerId: string;
  baseUrl?: string;
  wsUrl?: string;
  stripeKey?: string;
  features?: string[];
  children: ReactNode;
}

export function BillingProvider({
  apiKey,
  customerId,
  baseUrl = "http://localhost:8080",
  wsUrl = "ws://localhost:8001/connection/websocket",
  stripeKey,
  features = [],
  children,
}: BillingProviderProps) {
  const storeRef = useRef<BillingStore>(null!);

  if (!storeRef.current) {
    storeRef.current = new BillingStore(baseUrl, apiKey, customerId);
  }

  const stripePromise = useMemo(
    () => (stripeKey ? loadStripe(stripeKey) : null),
    [stripeKey]
  );

  useEffect(() => {
    const store = storeRef.current!;

    for (const feature of features) {
      store.fetchUsage(feature);
    }

    const connection: CentrifugoConnection = connectCentrifugo(
      store,
      customerId,
      wsUrl
    );

    return () => {
      connection.disconnect();
    };
  }, [apiKey, customerId, baseUrl, wsUrl, features]);

  return (
    <BillingContext.Provider value={{ store: storeRef.current, stripePromise }}>
      {children}
    </BillingContext.Provider>
  );
}

export function useBillingContext(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) {
    throw new Error("useBillingContext must be used within a BillingProvider");
  }
  return ctx;
}
