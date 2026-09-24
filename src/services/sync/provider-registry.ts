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
import { executeMetaSync } from './meta-service';
import { executeTwitterSync } from './twitter-service';
import { executeAsanaSync } from './asana-service';
import { executeClickUpSync } from './clickup-service';
import { executeGoogleChatSync } from './google-chat-service';
import { executeGitlabSync } from './gitlab-service';
import { executeNetlifySync } from './netlify-service';
import { executeSentrySync } from './sentry-service';
import { executeGoogleDocsSync } from './google-docs-service';
import { executeGoogleSheetsSync } from './google-sheets-service';
import { executeGoogleSlidesSync } from './google-slides-service';
import { executeGoogleMeetSync } from './google-meet-service';
import { executeCursorSync } from './cursor-service';
import { executeLinkedInSync } from './linkedin-service';
import { executeGoogleMapsSync } from './google-maps-service';
import { executeYouTubeSync } from './youtube-service';
import { executeZoomSync } from './zoom-service';
import { executeFigmaSync } from './figma-service';
import { executeDropboxSync } from './dropbox-service';

export const syncProviders: Record<string, SyncProvider> = {
  'github': { executeSync: executeGithubSync },
  'gmail': { executeSync: executeGmailSync },
  'google_calendar': { executeSync: executeGoogleCalendarSync },
  'notion': { executeSync: executeNotionSync },
  'reddit': { executeSync: executeRedditSync },
  'slack': { executeSync: executeSlackSync },
  'discord': { executeSync: executeDiscordSync },
  'meta': { executeSync: executeMetaSync },
  'facebook': { executeSync: executeMetaSync },
  'twitter': { executeSync: executeTwitterSync },
  'asana': { executeSync: executeAsanaSync },
  'clickup': { executeSync: executeClickUpSync },
  'google-chat': { executeSync: executeGoogleChatSync },
  'gitlab': { executeSync: executeGitlabSync },
  'netlify': { executeSync: executeNetlifySync },
  'sentry': { executeSync: executeSentrySync },
  'google-docs': { executeSync: executeGoogleDocsSync },
  'google-sheets': { executeSync: executeGoogleSheetsSync },
  'google-slides': { executeSync: executeGoogleSlidesSync },
  'google-meet': { executeSync: executeGoogleMeetSync },
  'cursor': { executeSync: executeCursorSync },
  'linkedin': { executeSync: executeLinkedInSync },
  'google-maps': { executeSync: executeGoogleMapsSync },
  'youtube': { executeSync: executeYouTubeSync },
  'zoom': { executeSync: executeZoomSync },
  'figma': { executeSync: executeFigmaSync },
  'dropbox': { executeSync: executeDropboxSync },
};
