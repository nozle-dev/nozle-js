import { createTransactionId } from "./identifiers";

export class EventsNamespace {
  createTransactionId(): string {
    return createTransactionId();
  }
}
