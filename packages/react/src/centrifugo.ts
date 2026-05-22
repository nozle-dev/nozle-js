import { Centrifuge, type Subscription } from "centrifuge";
import type { BillingStore } from "./store";

export interface CentrifugoConnection {
  disconnect: () => void;
}

export function connectCentrifugo(
  store: BillingStore,
  customerId: string,
  wsUrl: string
): CentrifugoConnection {
  const centrifuge = new Centrifuge(wsUrl, {});

  const sub: Subscription = centrifuge.newSubscription(
    `customer:${customerId}`
  );

  sub.on("publication", (ctx) => {
    store.handleEvent(
      ctx.data as { type: string; [key: string]: unknown }
    );
  });

  sub.on("subscribed", () => {
    store.setConnectionState("connected");
  });

  centrifuge.on("connected", () => {
    store.setConnectionState("connected");
  });

  centrifuge.on("disconnected", () => {
    store.setConnectionState("disconnected");
  });

  sub.subscribe();
  centrifuge.connect();
  store.setConnectionState("connecting");

  return {
    disconnect: () => {
      sub.unsubscribe();
      centrifuge.disconnect();
    },
  };
}
