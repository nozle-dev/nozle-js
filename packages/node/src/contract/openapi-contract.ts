/**
 * Compile-time contract between the SDK's hand-written types and the API schemas in
 * nozle-openapi.yaml (generated into ../generated/openapi.ts by `npm run generate:openapi`).
 * Each line states that what the API returns fits the type the SDK promises. `npm run typecheck`
 * fails when the SDK promises a field the API does not send or types it differently.
 * Nothing here is imported at runtime.
 */
import type { components } from "../generated/openapi";
import type {
  CanResult,
  CostEventAccepted,
  CreditBalance,
  CreditBalances,
  CreditOperationPage,
  CustomerEntity,
  CustomerEntityPage,
  EntityCreditBalance,
  EntityCreditBalances,
  PingResult,
  SubscriptionOptions,
  UsageCheckResult,
  UsageTrackResult,
} from "../types";

type Schemas = components["schemas"];
// The API value fits the SDK type, and the SDK type declares no key the API schema lacks.
type Fits<Api, Sdk> = [Api] extends [Sdk] ? ([Exclude<keyof Sdk, keyof Api>] extends [never] ? true : false) : false;
type Expect<T extends true> = T;

export type OpenApiContract = [
  Expect<Fits<Schemas["CreditsUsageTrackResponse"], UsageTrackResult>>,
  Expect<Fits<Schemas["CreditsUsageCheckResponse"], UsageCheckResult>>,
  Expect<Fits<Schemas["PlatformCanResponse"], CanResult>>,
  Expect<Fits<Schemas["PlatformPingResponse"], PingResult>>,
  Expect<Fits<Schemas["CostEventAccepted"], CostEventAccepted>>,
  Expect<Fits<Schemas["CreditsCustomerBalance"], CreditBalance>>,
  Expect<Fits<Schemas["CreditsCustomerBalanceList"], CreditBalances>>,
  Expect<Fits<Schemas["CreditsCustomerOperationPage"], CreditOperationPage>>,
  Expect<Fits<Schemas["CreditsEntity"], CustomerEntity>>,
  Expect<Fits<Schemas["CreditsEntityPage"], CustomerEntityPage>>,
  Expect<Fits<Schemas["CreditsEntityBalance"], EntityCreditBalance>>,
  Expect<Fits<Schemas["CreditsEntityBalanceList"], EntityCreditBalances>>,
  Expect<Fits<Schemas["BillingSubscriptionOptionsResponse"], SubscriptionOptions>>,
];
