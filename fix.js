const fs = require('fs');

const files = [
  'src/lib/cron/sync-escalation-handler.ts',
  'src/lib/cron/sync-persistence.ts',
  'src/lib/cron/sync-utils.ts',
  'src/services/audit/audit-db.ts',
  'src/services/audit/audit-prompts.ts',
  'src/app/settings/components/FeedbackTab.tsx',
  'src/app/settings/components/OrganizationTab.tsx',
  'src/app/settings/components/ThemeTab.tsx',
  'src/app/settings/components/TuningTab.tsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    // Replace \` with `
    content = content.replace(/\\`/g, '`');
    // Replace \$ with $
    content = content.replace(/\\\$/g, '$');
    fs.writeFileSync(f, content);
    console.log('Fixed', f);
  }
});
