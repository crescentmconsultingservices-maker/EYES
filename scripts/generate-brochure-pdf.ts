import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

async function generatePDF() {
  // A4 Landscape: Width = 841.89, Height = 595.28
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    layout: 'landscape',
    bufferPages: true
  });

  const outputDir = path.resolve('Brochure');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'The_EYES_Digital_Brochure.pdf');
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // Fonts
  const FONT_BODY = 'Helvetica';
  const FONT_BOLD = 'Helvetica-Bold';
  const FONT_ITALIC = 'Helvetica-Oblique';

  // Palette
  const COLOR_PRIMARY = '#1E1B4B'; // Indigo Navy
  const COLOR_SECONDARY = '#D4AF37'; // Gold
  const COLOR_DARK = '#0F172A'; // Slate Dark
  const COLOR_BODY = '#334155'; // Charcoal Body Text
  const COLOR_LIGHT_BG = '#F8FAFC'; // Soft gray-blue card
  const COLOR_BORDER = '#E2E8F0';
  const COLOR_MUTED_TEXT = '#64748B'; // Muted Slate

  const W = doc.page.width;
  const H = doc.page.height;
  const contentWidth = W - 80;

  // Helper: Page frames
  const applyPageDecoration = (isCover = false) => {
    doc.rect(15, 15, W - 30, H - 30)
       .lineWidth(1)
       .strokeColor(isCover ? COLOR_SECONDARY : COLOR_BORDER)
       .stroke();
  };

  // Helper: Slide Header
  const drawSlideHeader = (title: string, category: string) => {
    const grad = doc.linearGradient(20, 20, W - 20, 52);
    grad.stop(0, '#0F172A').stop(1, '#1E1B4B');
    
    doc.roundedRect(20, 20, W - 40, 32, 4).fill(grad);
    doc.rect(20, 50, W - 40, 2).fill(COLOR_SECONDARY);

    doc.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(11).text(title, 35, 31);
    
    const catUpper = category.toUpperCase();
    doc.fillColor(COLOR_SECONDARY).font(FONT_BOLD).fontSize(7.5).text(
      catUpper, 
      W - 45 - doc.widthOfString(catUpper), 
      33
    );
    doc.y = 65;
  };

  // Helper: Draw Card
  const drawCard = (x: number, y: number, w: number, h: number, title: string) => {
    doc.roundedRect(x, y, w, h, 6).fill(COLOR_LIGHT_BG);
    doc.roundedRect(x, y, w, h, 6).lineWidth(0.8).strokeColor(COLOR_BORDER).stroke();
    doc.rect(x, y, 4, h).fill(COLOR_SECONDARY);
    
    doc.fillColor(COLOR_PRIMARY).font(FONT_BOLD).fontSize(10.5).text(title, x + 16, y + 14);
    
    return {
      contentX: x + 16,
      contentY: y + 32,
      contentWidth: w - 32
    };
  };

  // -------------------------------------------------------------
  // SLIDE 1: COVER PAGE
  // -------------------------------------------------------------
  applyPageDecoration(true);

  // Gradient Cover Background
  const coverGrad = doc.linearGradient(20, 20, W - 20, H - 20);
  coverGrad.stop(0, '#0B0F19').stop(0.5, '#111827').stop(1, '#1E1B4B');
  doc.rect(20, 20, W - 40, H - 40).fill(coverGrad);

  // Gold Corners
  const offset = 35;
  doc.moveTo(offset, offset).lineTo(offset + 30, offset).lineWidth(1).strokeColor(COLOR_SECONDARY).stroke();
  doc.moveTo(offset, offset).lineTo(offset, offset + 30).stroke();
  doc.moveTo(W - offset, offset).lineTo(W - offset - 30, offset).stroke();
  doc.moveTo(W - offset, offset).lineTo(W - offset, offset + 30).stroke();
  doc.moveTo(offset, H - offset).lineTo(offset + 30, H - offset).stroke();
  doc.moveTo(offset, H - offset).lineTo(offset, H - offset - 30).stroke();
  doc.moveTo(W - offset, H - offset).lineTo(W - offset - 30, H - offset).stroke();
  doc.moveTo(W - offset, H - offset).lineTo(W - offset, H - offset - 30).stroke();

  // Centered Logo
  const logoPath = path.resolve('Brochure/crescent_moon_logo.png');
  const logoW = 280;
  const logoH = 80;
  const logoX = (W - logoW) / 2;
  const logoY = 70;

  if (fs.existsSync(logoPath)) {
    doc.roundedRect(logoX, logoY, logoW, logoH, 4).fill('#FFFFFF');
    doc.roundedRect(logoX, logoY, logoW, logoH, 4).lineWidth(1.5).strokeColor(COLOR_SECONDARY).stroke();
    doc.image(logoPath, logoX + 5, logoY + 5, { width: logoW - 10 });
  }

  // Cover Titles
  doc.y = 210;
  doc.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(34).text('THE EYES', { align: 'center' });
  doc.fillColor(COLOR_SECONDARY).font(FONT_BOLD).fontSize(14).text('Everything You Ever Said', { align: 'center', paragraphGap: 6 });
  doc.fillColor('#94A3B8').font(FONT_ITALIC).fontSize(11).text('The Neural Memory OS & Digital Auditing Hub', { align: 'center', paragraphGap: 24 });

  doc.moveTo((W - 200)/2, doc.y).lineTo((W + 200)/2, doc.y).lineWidth(1.5).strokeColor(COLOR_SECONDARY).stroke();
  doc.y += 24;

  // Metadata Card
  const metaW = 480;
  const metaH = 110;
  const metaX = (W - metaW) / 2;
  const metaY = doc.y;

  doc.roundedRect(metaX, metaY, metaW, metaH, 6).fill('#1E293B');
  doc.roundedRect(metaX, metaY, metaW, metaH, 6).lineWidth(0.8).strokeColor('#475569').stroke();

  let coverMetaY = metaY + 16;
  const renderMeta = (lbl: string, val: string) => {
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(COLOR_SECONDARY).text(lbl, metaX + 24, coverMetaY);
    doc.font(FONT_BODY).fontSize(9.5).fillColor('#F8FAFC').text(val, metaX + 170, coverMetaY);
    coverMetaY += 22;
  };

  renderMeta('DOCUMENT TYPE', 'Client Briefing & Product Portfolio');
  renderMeta('LIVE SANDBOX', 'https://eyes-app-sigma.vercel.app/');
  renderMeta('SECURITY STANDARD', 'PII Shielding & GDPR Purge Enabled');
  renderMeta('PUBLISHED BY', 'Crescent Moon Consulting Services');

  // -------------------------------------------------------------
  // SLIDE 2: HOW THE EYES WORKS
  // -------------------------------------------------------------
  doc.addPage();
  applyPageDecoration();
  drawSlideHeader('How The EYES Works', '01. Simply Connected');

  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(10).text(
    'The EYES safely unifies and indexes your digital footprints so you can search your past instantly.',
    40, 75, { width: contentWidth }
  );

  // 3-step pipeline flow representation
  const colW = 236;
  const colH = 320;
  const colGap = 26;

  // Step 1 Card
  const step1 = drawCard(40, 105, colW, colH, '1. One-Click Connection');
  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(8.5).text(
    'Securely connect your daily work and communication tools in seconds:\n\n' +
    '• Supported Applications:\n' +
    '  Works with Gmail, Slack, GitHub, Notion, Discord, and Dropbox.\n\n' +
    '• Password-Free Access:\n' +
    '  Links accounts using safe, industry-standard authentication.\n\n' +
    '• Automatic Updates:\n' +
    '  Syncs new files, tasks, and conversations automatically in the background.',
    step1.contentX, step1.contentY, { width: step1.contentWidth, lineGap: 3.5 }
  );

  // Step 2 Card
  const step2 = drawCard(40 + colW + colGap, 105, colW, colH, '2. Privacy Shielding');
  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(8.5).text(
    'Automatically protects your personal data and screens out sensitive records:\n\n' +
    '• Exclude Private Accounts:\n' +
    '  Block personal email domains, specific keywords, or chat channels.\n\n' +
    '• Automatic Scrubbing:\n' +
    '  Masks credit card numbers, passwords, and IDs before indexing.\n\n' +
    '• Clean Timelines:\n' +
    '  Organizes communication events into a unified, private history log.',
    step2.contentX, step2.contentY, { width: step2.contentWidth, lineGap: 3.5 }
  );

  // Step 3 Card
  const step3 = drawCard(40 + (colW * 2) + (colGap * 2), 105, colW, colH, '3. Smart Search & Ask');
  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(8.5).text(
    'Ask questions naturally and get answers backed by clickable proof:\n\n' +
    '• Natural Questions:\n' +
    '  Search past chats and files using simple queries like "What did I promise to send Sai?".\n\n' +
    '• Direct Source Links:\n' +
    '  Every answer is backed by a direct link to the original email or message.\n\n' +
    '• Reliable Facts:\n' +
    '  The AI only responds using your verified history, eliminating made-up answers.',
    step3.contentX, step3.contentY, { width: step3.contentWidth, lineGap: 3.5 }
  );

  // -------------------------------------------------------------
  // SLIDE 3: CONVERSATIONS WITH YOUR PAST
  // -------------------------------------------------------------
  doc.addPage();
  applyPageDecoration();
  drawSlideHeader('Conversations With Your Past', '02. Smart Search');

  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(10).text(
    'Search your digital history using plain, conversational English and receive answers backed by direct links.',
    40, 75, { width: contentWidth }
  );

  const splitW = 368;
  const splitH = 340;
  const splitGap = 25;

  // Left card
  const scl = drawCard(40, 100, splitW, splitH, 'Find What You Mean, Not Just What You Type');
  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(9).text(
    'The system searches concepts and contexts, not just exact strings:\n\n' +
    '• Smart Conceptual Search:\n' +
    '  If you search for "website feedback", it will find chats discussing "page fixes" or "design revisions".\n\n' +
    '• Exact Detail Matching:\n' +
    '  Prioritizes exact terms when looking for specific dates, names, file types, or transaction IDs.\n\n' +
    '• Fast Results:\n' +
    '  Delivers highly accurate, relevant answers from all connected apps in seconds.',
    scl.contentX, scl.contentY, { width: scl.contentWidth, lineGap: 4 }
  );

  // Right card
  const scr = drawCard(40 + splitW + splitGap, 100, splitW, splitH, 'Answers You Can Verify and Trust');
  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(9).text(
    'Avoids the typical mistakes and "made-up" answers common in general AI tools:\n\n' +
    '• Verifiable Proof:\n' +
    '  Every single answer includes a direct, clickable link pointing back to the original Slack chat, email, or Notion doc.\n\n' +
    '• Factual Boundaries:\n' +
    '  The AI is locked to only answer using verified documents. If it doesn\'t know, it tells you honestly.\n\n' +
    '• Context-Aware:\n' +
    '  Remembers your active projects to tailor answers to your current work.',
    scr.contentX, scr.contentY, { width: scr.contentWidth, lineGap: 4 }
  );

  // -------------------------------------------------------------
  // SLIDE 4: TRACK COMMITMENTS & PROMISES
  // -------------------------------------------------------------
  doc.addPage();
  applyPageDecoration();
  drawSlideHeader('Track Commitments & Promises', '03. Reliability Ledger');

  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(10).text(
    'Keep tabs on tasks, deadlines, and verbal agreements made across different channels.',
    40, 75, { width: contentWidth }
  );

  // Left card
  const audL = drawCard(40, 100, splitW, splitH, 'Automatic Promise Ledger');
  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(9).text(
    'Tracks agreements automatically from everyday chats and emails:\n\n' +
    '• Auto-Logs Deliverables:\n' +
    '  Detects whenever you or a contact promises a deliverable or schedules a deadline.\n\n' +
    '• Categorizes Obligations:\n' +
    '  Organizes items as active commitments, delayed tasks, or items that were explicitly cancelled.\n\n' +
    '• Follow-Through Index:\n' +
    '  Displays a visual dashboard showing your personal follow-through rates over time.',
    audL.contentX, audL.contentY, { width: audL.contentWidth, lineGap: 4 }
  );

  // Right card
  const audR = drawCard(40 + splitW + splitGap, 100, splitW, splitH, 'Calendar Verification');
  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(9).text(
    'Validates commitments against your calendar automatically:\n\n' +
    '• Calendar Cross-Check:\n' +
    '  Automatically scans Google Calendar entries around task due dates.\n\n' +
    '• Automatic Status Checks:\n' +
    '  Marks commitments as completed if a corresponding calendar entry is found, or flags them as pending.\n\n' +
    '• Next-Step Action Prompts:\n' +
    '  Recommends quick follow-up draft messages for overdue promises.',
    audR.contentX, audR.contentY, { width: audR.contentWidth, lineGap: 4 }
  );

  // -------------------------------------------------------------
  // SLIDE 5: LIVE INTERFACE MOCKUP
  // -------------------------------------------------------------
  doc.addPage();
  applyPageDecoration();
  drawSlideHeader('Live Application Interface', '04. User Workspace');

  // Left explanation card
  const expW = 280;
  const expH = 430;
  const expCard = drawCard(40, 75, expW, expH, 'The EYES Workspace UI');
  
  doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(8.5).text(
    'The platform offers a clean, visual interface to search histories and view logs:\n\n' +
    '• Central Search Console:\n' +
    '  Use natural language prompts to search memory indices at the bottom of the screen.\n\n' +
    '• Navigation Menu:\n' +
    '  Access Connectors, Source Feeds, Chronological Timelines, and Audits.\n\n' +
    '• Ingestion Progress:\n' +
    '  Displays active connector health and indexing status.\n\n' +
    '• Chat History:\n' +
    '  View and review past search queries.',
    expCard.contentX, expCard.contentY, { width: expCard.contentWidth, lineGap: 3.5 }
  );

  // Right browser mockup
  const screenshotP = path.resolve('Brochure/product_screenshot.png');
  if (fs.existsSync(screenshotP)) {
    const mockX = 350;
    const mockY = 75;
    const imgW = 450;
    const imgH = 253;
    const barH = 20;
    const mockH = imgH + barH;

    // Browser Outer Box
    doc.roundedRect(mockX, mockY, imgW, mockH, 6).fill('#0F172A');
    doc.roundedRect(mockX, mockY, imgW, mockH, 6).lineWidth(1).strokeColor('#334155').stroke();

    // Browser Top Bar
    doc.rect(mockX, mockY, imgW, barH).fill('#1E293B');
    
    // Control Dots
    const dotY = mockY + 10;
    doc.circle(mockX + 15, dotY, 3.5).fill('#EF4444');
    doc.circle(mockX + 27, dotY, 3.5).fill('#F59E0B');
    doc.circle(mockX + 39, dotY, 3.5).fill('#10B981');

    // URL bar
    const urlX = mockX + 60;
    const urlW = imgW - 120;
    doc.roundedRect(urlX, mockY + 4, urlW, 12, 3).fill('#0F172A');
    doc.fillColor('#64748B').font(FONT_BODY).fontSize(6.5).text('eyes-app-sigma.vercel.app', urlX + 10, mockY + 7);

    // Viewport image
    doc.image(screenshotP, mockX, mockY + barH, { width: imgW, height: imgH });

    // Caption
    doc.fillColor(COLOR_MUTED_TEXT).font(FONT_ITALIC).fontSize(8.5).text(
      'Figure 1: The EYES workspace, highlighting the natural language search console and quick connectors panel.',
      mockX, mockY + mockH + 12, { align: 'center', width: imgW }
    );
  }

  // -------------------------------------------------------------
  // SLIDE 6: DATA TRUST & PRIVACY
  // -------------------------------------------------------------
  doc.addPage();
  applyPageDecoration();
  drawSlideHeader('Data Trust & Privacy Policies', '05. Security & Onboarding');

  // Left Column: Privacy
  const pX = 40;
  doc.fillColor(COLOR_PRIMARY).font(FONT_BOLD).fontSize(12).text('Privacy First: Your Data, Your Control', pX, 75);

  let pY = 98;
  const features = [
    { title: '1-Click Data Self-Destruct', desc: 'Permanently delete your profile and erase all indexed memories, linked app credentials, and history logs from our servers. This is completely non-reversible.' },
    { title: 'Automatic Information Scrubbing', desc: 'Automatically hides sensitive details (like credit card numbers, bank records, and personal passwords) before processing any text.' },
    { title: 'Zero Data Training Guarantees', desc: 'Your work data is processed using private enterprise connections and is never stored, reviewed, or used to train public AI models.' }
  ];

  features.forEach((item) => {
    doc.circle(pX + 4, pY + 5, 2.5).fill(COLOR_SECONDARY);
    doc.fillColor(COLOR_PRIMARY).font(FONT_BOLD).fontSize(9.5).text(item.title, pX + 14, pY);
    doc.fillColor(COLOR_BODY).font(FONT_BODY).fontSize(8.5).text(item.desc, pX + 14, pY + 12, { width: 350, lineGap: 2.5 });
    pY += 56;
  });

  // Right Column: CTA card
  const ctaX = 430;
  const ctaW = 370;
  const ctaH = 260;

  const ctaGrad = doc.linearGradient(ctaX, 75, ctaX + ctaW, 75 + ctaH);
  ctaGrad.stop(0, '#1E293B').stop(1, '#0F172A');
  
  doc.roundedRect(ctaX, 75, ctaW, ctaH, 6).fill(ctaGrad);
  doc.roundedRect(ctaX, 75, ctaW, ctaH, 6).lineWidth(1.2).strokeColor(COLOR_SECONDARY).stroke();

  doc.fillColor(COLOR_SECONDARY).font(FONT_BOLD).fontSize(12).text('Get Started with The EYES', ctaX + 16, 91);
  
  doc.fillColor('#F8FAFC').font(FONT_BODY).fontSize(8.5).text(
    'Crescent Moon Consulting Services provides custom deployment pipelines and dedicated support packages for teams integrating The EYES:\n\n' +
    '• Start Searching Today:\n' +
    '  Access the live sandbox and link your accounts instantly:\n' +
    '  https://eyes-app-sigma.vercel.app/\n\n' +
    '• Contact and Support Channels:\n' +
    '  - General Support Desk: info@the-eyes.com\n' +
    '  - Client Success Team: accounts@crescent-moon-services.com\n' +
    '  - Custom integrations support is available upon request.',
    ctaX + 16, 115, { width: ctaW - 32, lineGap: 4.5 }
  );

  // Link button stroke
  doc.roundedRect(ctaX + 14, 160, 240, 16, 2).lineWidth(0.8).strokeColor(COLOR_SECONDARY).stroke();

  // -------------------------------------------------------------
  // HEADER & FOOTER RUNNING PROCESSOR
  // -------------------------------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    applyPageDecoration(i === 0);

    if (i > 0) {
      // Header Text
      doc.fillColor(COLOR_BORDER)
         .font(FONT_BODY)
         .fontSize(7.5)
         .text('THE EYES · CUSTOMER PRODUCT DOSSIER', 40, 10);

      doc.moveTo(40, 18).lineTo(W - 40, 18).lineWidth(0.5).strokeColor(COLOR_BORDER).stroke();

      // Footer line & text
      doc.moveTo(40, H - 18).lineTo(W - 40, H - 18).lineWidth(0.5).strokeColor(COLOR_BORDER).stroke();

      doc.fillColor(COLOR_BORDER)
         .font(FONT_BODY)
         .fontSize(7.5)
         .text('CONFIDENTIAL · FOR CLIENT REVIEW ONLY', 40, H - 14);

      doc.text(`Slide ${i + 1} of ${range.count}`, W - 90, H - 14, { align: 'right', width: 50 });
    }
  }

  doc.end();

  return new Promise<void>((resolve, reject) => {
    stream.on('finish', () => {
      console.log(`Fresh Digital Brochure generated successfully at: ${outputPath}`);
      resolve();
    });
    stream.on('error', (err) => {
      reject(err);
    });
  });
}

generatePDF().catch(console.error);
