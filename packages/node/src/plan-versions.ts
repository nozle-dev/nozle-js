import { apiError } from "./errors";
import { request, type RequestPolicy } from "./http";

/**
 * One version of a plan code. A plan is version 1 until its pricing is changed while customers pay for it; that
 * change saves version 2, and so on. Subscriptions stay on their version until a version migration moves them.
 */
export interface PlanVersion {
  nozle_id: string;
  version: number;
  is_current: boolean;
  created_at: string;
  amount_cents: number;
  amount_currency: string;
  active_subscriptions_count: number;
}

/** The version whose subscriptions move, and the version they move to (the current version when omitted). */
export interface PlanVersionMigrationInput {
  fromVersion: number;
  toVersion?: number;
}

export type PlanVersionMigrationStatus = "running" | "succeeded" | "completed_with_errors" | "failed" | "canceled";

export type PlanVersionMigrationSkipReason =
  | "already_on_version"
  | "canceling"
  | "custom_pricing"
  | "different_billing"
  | "external_billing"
  | "in_trial"
  | "not_active"
  | "open_checkout"
  | "pending_plan_change";

/** What a migration did to one subscription. `move_status` says where a scheduled move stands. */
export interface PlanVersionMigrationItem {
  external_subscription_id: string;
  status: "succeeded" | "skipped" | "failed" | "canceled";
  skip_reason?: PlanVersionMigrationSkipReason | null;
  error?: string | null;
  effective_at?: string | null;
  move_status?: "pending" | "moved" | "canceled" | null;
}

export interface PlanVersionMigration {
  nozle_id: string;
  plan_code: string;
  from_version: number;
  to_version: number;
  status: PlanVersionMigrationStatus;
  matched_count: number;
  succeeded_count: number;
  skipped_count: number;
  failed_count: number;
  started_at?: string | null;
  finished_at?: string | null;
  canceled_at?: string | null;
  created_at: string;
  /** Only from `getMigration`. */
  items?: PlanVersionMigrationItem[];
}

export interface PlanVersionMigrationPreviewItem {
  external_subscription_id: string;
  external_customer_id?: string;
  outcome: "move" | "skip";
  skip_reason?: string | null;
  effective_on?: string | null;
  current_amount_cents?: number;
  new_amount_cents?: number;
}

export interface PlanVersionMigrationPreview {
  plan_code: string;
  from_version: number;
  to_version: number;
  items: PlanVersionMigrationPreviewItem[];
}

/** The versions of a plan code and the migrations that move subscribers between them. Secret keys only. */
export class PlanVersionsNamespace {
  constructor(
    private readonly coreUrl: string,
    private readonly apiKey: string,
    private readonly policy: RequestPolicy,
  ) {}

  /** Every version of the plan code, oldest first, with its price and active subscriptions. */
  async list(code: string): Promise<PlanVersion[]> {
    return (await this.call<{ versions: PlanVersion[] }>("planVersions.list", "GET", `${this.plan(code)}/versions`)).versions;
  }

  /** One version of the plan code, for example the older version a subscriber is billed on. */
  async get<T = Record<string, unknown>>(code: string, version: number): Promise<T> {
    positive(version, "version");
    return (await this.call<{ plan: T }>("planVersions.get", "GET", `${this.plan(code)}?version=${version}`)).plan;
  }

  /** What migrating `fromVersion`'s subscriptions would do to each of them. Nothing is written. */
  async previewMigration(code: string, input: PlanVersionMigrationInput): Promise<PlanVersionMigrationPreview> {
    const path = `${this.migrations(code)}/preview`;
    return (await this.call<{ plan_version_migration_preview: PlanVersionMigrationPreview }>("planVersions.previewMigration", "POST", path, body(input)))
      .plan_version_migration_preview;
  }

  /**
   * Starts moving `fromVersion`'s active subscriptions to `toVersion` (the current version by default). Each moves
   * at the end of its billing period; nothing is invoiced or refunded now. The migration runs in the background:
   * read it again with `getMigration`. Another migration of the code still running fails with a 409
   * `plan_version_migration_running`.
   */
  async createMigration(code: string, input: PlanVersionMigrationInput): Promise<PlanVersionMigration> {
    return this.migration("planVersions.createMigration", "POST", this.migrations(code), body(input));
  }

  /** The migrations of the plan code, newest first, without their items. */
  async listMigrations(code: string): Promise<PlanVersionMigration[]> {
    return (await this.call<{ plan_version_migrations: PlanVersionMigration[] }>("planVersions.listMigrations", "GET", this.migrations(code)))
      .plan_version_migrations;
  }

  /** A migration with what it did to each subscription. */
  async getMigration(code: string, id: string): Promise<PlanVersionMigration> {
    return this.migration("planVersions.getMigration", "GET", this.one(code, id));
  }

  /** Stops a migration and unschedules every move not started; those subscriptions stay on their version. */
  async cancelMigration(code: string, id: string): Promise<PlanVersionMigration> {
    return this.migration("planVersions.cancelMigration", "POST", `${this.one(code, id)}/cancel`);
  }

  private plan(code: string): string {
    if (!code?.trim()) throw new Error("plan versions require a plan code");
    return `/api/v1/plans/${encodeURIComponent(code)}`;
  }

  private migrations(code: string): string {
    return `${this.plan(code)}/version-migrations`;
  }

  private one(code: string, id: string): string {
    if (!id?.trim()) throw new Error("plan version migrations require a migration id");
    return `${this.migrations(code)}/${encodeURIComponent(id)}`;
  }

  private async migration(operation: string, method: string, path: string, payload?: unknown): Promise<PlanVersionMigration> {
    return (await this.call<{ plan_version_migration: PlanVersionMigration }>(operation, method, path, payload)).plan_version_migration;
  }

  private async call<T>(operation: string, method: string, path: string, payload?: unknown): Promise<T> {
    if (!this.apiKey.startsWith("sk_")) throw new Error("plan versions require a secret key");
    const response = await request(this.policy, `${this.coreUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}`, ...(payload !== undefined && { "Content-Type": "application/json" }) },
      ...(payload !== undefined && { body: JSON.stringify(payload) }),
    });
    if (!response.ok) throw await apiError(operation, response);
    return (await response.json()) as T;
  }
}

function positive(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be an integer of 1 or more`);
}

function body(input: PlanVersionMigrationInput): Record<string, number> {
  positive(input.fromVersion, "fromVersion");
  if (input.toVersion !== undefined) positive(input.toVersion, "toVersion");
  return { from_version: input.fromVersion, ...(input.toVersion !== undefined && { to_version: input.toVersion }) };
}
