/**
 * Журнал аномалий (античит): append-only NDJSON в `data/anomalies.ndjson`.
 *
 * Тот же приём, что у телеметрии: без БД, но при смене бэкенда достаточно
 * заменить этот файл. Пишутся только срабатывания (редкие), падение записи
 * не должно ронять игровой запрос.
 */
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

export interface AnomalyRecord {
  t: number;
  uid: string;
  code: string;
  detail: string;
}

export function logAnomaly(userId: string, records: Array<{ code: string; detail: string }>): void {
  if (records.length === 0) return;
  try {
    mkdirSync(config.dataDir, { recursive: true });
    const file = join(config.dataDir, 'anomalies.ndjson');
    const lines = records
      .map((r) =>
        JSON.stringify({ t: Date.now(), uid: userId, code: r.code, detail: r.detail } satisfies AnomalyRecord)
      )
      .join('\n');
    appendFileSync(file, `${lines}\n`, 'utf-8');
  } catch (err) {
    console.error('anomaly log failed:', err);
  }
}
