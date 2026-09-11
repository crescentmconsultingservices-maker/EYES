/**
 * setup-qstash-schedules.mjs
 *
 * Automatically provisions recurring background cron schedules in Upstash QStash.
 * Bypasses Vercel Hobby's 2-cron limit and provides automated execution,
 * retries, and monitoring directly via the Upstash console.
 *
 * Usage:
 *   node scripts/setup-qstash-schedules.mjs
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { Client } from '@upstash/qstash';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const token = process.env.QSTASH_TOKEN;
if (!token) {
  console.error('❌ Error: QSTASH_TOKEN not found in .env.local');
  process.exit(1);
}

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://eyes-app-sigma.vercel.app'
).replace(/\/$/, '');

const cronSecret = process.env.CRON_SECRET || '';

console.log('=== Upstash QStash Schedule Provisioner ===');
console.log(`Target Site: ${siteUrl}`);
console.log(`Has Cron Secret: ${Boolean(cronSecret)}\n`);

const client = new Client({ token });

const TARGET_SCHEDULES = [
  {
    name: 'Platform Sync Engine',
    path: '/api/cron/sync',
    cron: '*/30 * * * *', // Every 30 minutes
    description: 'Syncs Gmail, Slack, GitHub, and Meta connectors',
  },
  {
    name: 'Batch Vector Embeddings',
    path: '/api/cron/embeddings',
    cron: '*/5 * * * *', // Every 5 minutes
    description: 'Vectorizes un-embedded memories via AI Gateway',
  },
  {
    name: 'Chronic Knowledge Graph Maintenance',
    path: '/api/cron/chronic',
    cron: '0 2 * * *', // Daily at 2:00 AM
    description: 'Nightly deduplication and memory decay cycles',
  },
  {
    name: 'State Vectors Aggregation',
    path: '/api/cron/state-vectors',
    cron: '0 3 * * *', // Daily at 3:00 AM
    description: 'Aggregates cognitive state vectors per user',
  },
  {
    name: 'Cluster Users & Leiden Detection',
    path: '/api/cron/cluster-users',
    cron: '30 3 * * *', // Daily at 3:30 AM
    description: 'Clusters active graph edges into cognitive communities',
  },
  {
    name: 'Purge Expired Leak Scans',
    path: '/api/cron/purge-leak-scans',
    cron: '0 4 * * *', // Daily at 4:00 AM
    description: 'Cleans up expired ephemeral leak scans',
  },
];

async function main() {
  try {
    console.log('1. Querying existing QStash schedules...');
    const existing = await client.schedules.list();
    console.log(`Found ${existing.length} existing schedule(s) in QStash.\n`);

    for (const target of TARGET_SCHEDULES) {
      const destination = `${siteUrl}${target.path}`;

      // Check if already registered
      const match = existing.find((s) => s.destination === destination);

      if (match) {
        console.log(`Updating [${target.name}]...`);
        try {
          await client.schedules.delete(match.scheduleId);
        } catch (delErr) {
          console.warn(`Could not delete old schedule ${match.scheduleId}:`, delErr.message);
        }
      } else {
        console.log(`Creating [${target.name}]...`);
      }

      const created = await client.schedules.create({
        destination,
        cron: target.cron,
        headers: {
          'x-cron-secret': cronSecret,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ source: 'qstash-scheduler' }),
      });

      console.log(
        `  ✅ Registered: ${target.name}\n     Cron: "${target.cron}"\n     Endpoint: ${destination}\n     ScheduleId: ${created.scheduleId}\n`
      );
    }

    console.log('🎉 All 6 recurring schedules are now active and running in Upstash QStash!');
  } catch (err) {
    console.error('❌ Failed to provision QStash schedules:', err);
    process.exit(1);
  }
}

main();
