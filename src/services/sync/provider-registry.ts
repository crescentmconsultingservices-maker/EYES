import { type SyncActor } from '@/utils/sync/actor';

export interface SyncResult {
  status: number;
  data?: any;
  error?: string;
  detail?: string;
}

export interface SyncProvider {
  executeSync(actor: SyncActor, mode: string): Promise<SyncResult>;
}

import { executeGithubSync } from './github-service';
import { executeGmailSync } from './gmail-service';
import { executeGoogleCalendarSync } from './google-calendar-service';
import { executeNotionSync } from './notion-service';
import { executeRedditSync } from './reddit-service';
import { executeSlackSync } from './slack-service';
import { executeDiscordSync } from './discord-service';

export const syncProviders: Record<string, SyncProvider> = {
  'github': { executeSync: executeGithubSync },
  'gmail': { executeSync: executeGmailSync },
  'google_calendar': { executeSync: executeGoogleCalendarSync },
  'notion': { executeSync: executeNotionSync },
  'reddit': { executeSync: executeRedditSync },
  'slack': { executeSync: executeSlackSync },
  'discord': { executeSync: executeDiscordSync },
};
