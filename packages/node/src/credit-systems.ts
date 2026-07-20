import type { CreditSystem } from "./types";

interface CoreCreditSystem {
  lago_id: string;
  code: string;
  name: string;
  description?: string | null;
  unit_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface CoreCreditSystemPage {
  credit_systems?: CoreCreditSystem[];
  meta?: { next_page?: number | null };
}

export class CreditSystemsNamespace {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeout: number,
  ) {}

  async list(): Promise<CreditSystem[]> {
    const systems: CreditSystem[] = [];
    let page = 1;

    while (page > 0) {
      const url = new URL(`${this.baseUrl}/api/v1/credit-systems`);
      url.searchParams.set("status", "active");
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", "100");

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!response.ok) {
        throw new Error(`creditSystems.list failed: ${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as CoreCreditSystemPage;
      systems.push(...(data.credit_systems ?? []).map(normalizeCreditSystem));
      page = data.meta?.next_page ?? 0;
    }

    return systems;
  }
}

function normalizeCreditSystem(system: CoreCreditSystem): CreditSystem {
  return {
    id: system.lago_id,
    code: system.code,
    name: system.name,
    description: system.description ?? null,
    unitName: system.unit_name,
    status: system.status,
    createdAt: system.created_at,
    updatedAt: system.updated_at,
  };
}
