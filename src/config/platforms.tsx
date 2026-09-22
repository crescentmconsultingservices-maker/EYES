import { 
  GitHubIconOfficial, 
  GmailIconOfficial, 
  CalendarIconOfficial, 
  NotionIconOfficial, 
  SlackIconOfficial, 
  DiscordIconOfficial,
  AsanaIconOfficial,
  LinearIconOfficial,
  ClickUpIconOfficial,
  NetlifyIconOfficial,
  SentryIconOfficial,
  CursorIconOfficial,
  LinkedInIconOfficial,
  GoogleDocsIcon,
  GoogleSheetsIcon,
  GoogleSlidesIcon,
  GoogleMeetIcon,
  GoogleChatIcon,
  GoogleMapsIcon,
  YouTubeIconOfficial,
  MetaIconOfficial,
  WhatsAppIconOfficial,
  InstagramIconOfficial,
  XIconOfficial
} from '../components/common/icons/PlatformIcons';

export const ALL_POSSIBLE_PLATFORMS = [
  // ─── Productivity ─────────────────────────────────────────────────────────
  { id: 'gmail',           name: 'Gmail',           icon: <GmailIconOfficial />,    category: 'Productivity', description: 'Index your entire email history and communications.',       color: '#ea4335' },
  { id: 'google-calendar', name: 'Google Calendar', icon: <CalendarIconOfficial />, category: 'Productivity', description: 'Track your meetings, events, and time allocation.',          color: '#4285f4' },
  { id: 'notion',          name: 'Notion',          icon: <NotionIconOfficial />,   category: 'Productivity', description: 'Search through your pages, databases, and workspace.',       color: 'var(--text-primary)' },
  { id: 'slack',           name: 'Slack',           icon: <SlackIconOfficial />,    category: 'Productivity', description: 'Index channel messages and direct communications.',          color: '#e01e5a' },
  { id: 'asana',           name: 'Asana',           icon: <AsanaIconOfficial />,    category: 'Productivity', description: 'Track project tasks, goals, and team progress.',             color: '#F95D5C', comingSoon: true },
  { id: 'linear',          name: 'Linear',          icon: <LinearIconOfficial />,   category: 'Productivity', description: 'Sync engineering tickets, cycles, and roadmaps.',           color: '#5E6AD2' },
  { id: 'clickup',         name: 'ClickUp',         icon: <ClickUpIconOfficial />,  category: 'Productivity', description: 'Connect your all-in-one productivity workspace.',            color: '#7B68EE', comingSoon: true },
  { id: 'google-docs',     name: 'Google Docs',     icon: <GoogleDocsIcon />,       category: 'Productivity', description: 'Read documents, generate reports, and meeting notes.',       color: '#4285F4', comingSoon: true },
  { id: 'google-sheets',   name: 'Google Sheets',   icon: <GoogleSheetsIcon />,     category: 'Productivity', description: 'Sync personal data, habits, expenses, and analytics.',       color: '#0F9D58', comingSoon: true },
  { id: 'google-slides',   name: 'Google Slides',   icon: <GoogleSlidesIcon />,     category: 'Productivity', description: 'Index presentation generation and AI-created reports.',      color: '#F4B400', comingSoon: true },
  { id: 'google-meet',     name: 'Google Meet',     icon: <GoogleMeetIcon />,       category: 'Productivity', description: 'Sync meeting data and AI-generated meeting summaries.',      color: '#00832d', comingSoon: true },
  { id: 'google-chat',     name: 'Google Chat',     icon: <GoogleChatIcon />,       category: 'Productivity', description: 'Index team communication and perform message analysis.',     color: '#00ac47', comingSoon: true },

  // ─── Development ──────────────────────────────────────────────────────────
  { id: 'github',          name: 'GitHub',          icon: <GitHubIconOfficial />,   category: 'Development',  description: 'Sync repositories, pull requests, and code history.',       color: 'var(--text-primary)' },
  { id: 'gitlab',          name: 'GitLab',          icon: <GitHubIconOfficial />,   category: 'Development',  description: 'Sync repositories, merge requests, and CI/CD pipelines.',     color: '#fc6d26', comingSoon: true },
  { id: 'netlify',         name: 'Netlify',         icon: <NetlifyIconOfficial />,  category: 'Development',  description: 'Monitor site deployments and build history.',               color: '#05BDBA', comingSoon: true },
  { id: 'sentry',          name: 'Sentry',          icon: <SentryIconOfficial />,   category: 'Development',  description: 'Monitor error logs and application health.',                color: '#362D59', comingSoon: true },
  { id: 'cursor',          name: 'Cursor',          icon: <CursorIconOfficial />,   category: 'Development',  description: 'Sync your AI-assisted code evolution history.',            color: 'var(--text-primary)', comingSoon: true },

  // ─── Social ───────────────────────────────────────────────────────────────
  { id: 'facebook',        name: 'Facebook (Meta)', icon: <MetaIconOfficial />,     category: 'Social',       description: 'Official Meta integration. Sync Facebook Page DMs and posts.', color: '#0081FB' },
  { id: 'discord',         name: 'Discord',         icon: <DiscordIconOfficial />,  category: 'Social',       description: 'Connect servers and private messaging history.',            color: '#5865f2' },
  { id: 'twitter',         name: 'Twitter (X)',     icon: <XIconOfficial />,        category: 'Social',       description: 'Sync your tweets, mentions, and social footprint.',         color: 'var(--text-primary)' },
  { id: 'linkedin',        name: 'LinkedIn',        icon: <LinkedInIconOfficial />, category: 'Social',       description: 'Index professional networking and careers communications.', color: '#0077b5', comingSoon: true },
  { id: 'google-maps',     name: 'Google Maps',     icon: <GoogleMapsIcon />,       category: 'Social',       description: 'Save travel memories, places, and location insights.',       color: '#4285F4', comingSoon: true },

  // ─── Creative ─────────────────────────────────────────────────────────────
  { id: 'youtube',         name: 'YouTube',         icon: <YouTubeIconOfficial />,  category: 'Creative',     description: 'Index saved videos, watch history, and learning.',           color: '#FF0000', comingSoon: true },
];
