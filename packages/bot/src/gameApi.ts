import type { GameApi, PlayerSummary } from './commands.js';

/**
 * Client for the game server's service API (`/api/admin/*`).
 *
 * The bot has no access to the save files — everything it knows about a player
 * comes from here, authenticated with the shared `ADMIN_TOKEN`.
 */

export interface NudgeCandidate {
  userId: string;
  name: string;
  bankedDays: number;
  currentDay: number;
  grade: string;
}

export class GameApiClient implements GameApi {
  constructor(
    private readonly baseUrl: string,
    private readonly adminToken: string
  ) {}

  get available(): boolean {
    return Boolean(this.baseUrl && this.adminToken);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    if (!this.available) return null;
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'x-admin-token': this.adminToken,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        console.error(`[api] ${init.method ?? 'GET'} ${path} → ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      console.error(`[api] ${init.method ?? 'GET'} ${path} failed:`, (err as Error).message);
      return null;
    }
  }

  getSummary(userId: string): Promise<PlayerSummary | null> {
    return this.request<PlayerSummary>(`/api/admin/users/${encodeURIComponent(userId)}/summary`);
  }

  async deleteUser(userId: string): Promise<boolean> {
    const result = await this.request<{ ok: boolean; deleted: boolean }>(
      `/api/admin/users/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
    return Boolean(result?.deleted);
  }

  /** Claim the players who should be nudged (server marks them as notified). */
  async claimNudges(minBankedDays: number, limit = 100): Promise<NudgeCandidate[]> {
    const result = await this.request<{ nudges: NudgeCandidate[] }>('/api/admin/nudges', {
      method: 'POST',
      body: JSON.stringify({ minBankedDays, limit }),
    });
    return result?.nudges ?? [];
  }
}
