// scripts/server.js
// Run: node scripts/server.js
// Requires: Node 18+
// Loads env from .env at project root

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { EmailClient } from '@azure/communication-email';
import { CommunicationServiceManagementClient } from '@azure/arm-communication';
import { AzureCliCredential, DefaultAzureCredential } from '@azure/identity';

// --------- CONFIG ----------
const {
  PORT = 3000,
  COMMUNICATION_SERVICES_CONNECTION_STRING: CONN,
  AZ_SUBSCRIPTION_ID: SUB,
  AZ_RESOURCE_GROUP: RG,
  AZ_EMAIL_SERVICE_NAME: SVC,
  AZ_EMAIL_DOMAIN: DOMAIN,
  RATE_PER_MINUTE = '20',     // avg emails/min (backend controls timing)
  JITTER_PCT = '50',          // ±% randomization around the gap
  MAX_RETRIES = '3',
  USE_DEFAULT_CREDENTIAL = '0' // set to 1 in Azure with Managed Identity
} = process.env;

if (!CONN) throw new Error('COMMUNICATION_SERVICES_CONNECTION_STRING is required');
['AZ_SUBSCRIPTION_ID','AZ_RESOURCE_GROUP','AZ_EMAIL_SERVICE_NAME','AZ_EMAIL_DOMAIN'].forEach(k=>{
  if (!process.env[k]) throw new Error(`${k} is required`);
});

const RATE_PER_MIN = Number(RATE_PER_MINUTE);
const JITTER = Number(JITTER_PCT);
const RETRIES = Number(MAX_RETRIES);

// Email deliverability settings
const DELIVERY_SETTINGS = {
  maxEmailsPerHour: 50,        // Limit emails per hour
  delayBetweenEmails: 2000,    // 2 seconds between emails
  maxRetries: 3,               // Max retry attempts
  retryDelay: 5000,            // 5 seconds between retries
  useWarmup: true,             // Gradually increase sending rate
  includeUnsubscribe: true,    // Include unsubscribe headers
  useProperHeaders: true       // Use proper email headers
};

// --------- CLIENTS ----------
const emailClient = new EmailClient(CONN);

const mgmtCredential = USE_DEFAULT_CREDENTIAL === '1'
  ? new DefaultAzureCredential()
  : new AzureCliCredential();       // dev: use `az login`
const mgmt = new CommunicationServiceManagementClient(mgmtCredential, SUB);

// --------- UTILS ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isRetryable = (err) => {
  const code = err?.statusCode || err?.code;
  return [429, 500, 502, 503, 504, 'TooManyRequests', 'ServiceUnavailable'].includes(code);
};

// Variable substitution for personalization and spintax expansion
function personalizeContent(content, recipient, recipientIndex = 0, senderEmail = '') {
  if (!content || !recipient) return content;
  
  // Create a highly unique seed for maximum variation
  // Combine email, index, content length, and domain for uniqueness
  const emailDomain = recipient.email.split('@')[1] || '';
  const contentHash = simpleHash(content.substring(0, 100)); // Hash part of content
  const uniqueString = `${recipient.email}_${recipientIndex}_${emailDomain}_${contentHash}`;
  const seed = simpleHash(uniqueString);
  
  let personalized = expandSpintax(content, seed);
  
  // Map sender emails to names for signature matching
  const senderNames = {
    'sales': 'John from Sales',
    'support': 'Sarah from Support', 
    'marketing': 'Mike from Marketing',
    'info': 'The Team',
    'hello': 'Customer Success',
    'contact': 'Business Development'
  };
  
  // Extract sender name from email (e.g., sales@domain.com -> sales)
  const senderUsername = senderEmail.split('@')[0] || '';
  const senderName = senderNames[senderUsername] || 'The Team';
  
  // Replace variables
  personalized = personalized
    .replace(/\{\{name\}\}/g, recipient.name || recipient.email.split('@')[0])
    .replace(/\{\{email\}\}/g, recipient.email)
    .replace(/\{\{firstName\}\}/g, (recipient.name || recipient.email.split('@')[0]).split(' ')[0])
    .replace(/\{\{lastName\}\}/g, (recipient.name || recipient.email.split('@')[0]).split(' ').slice(1).join(' ') || '')
    .replace(/\{\{senderName\}\}/g, senderName);
  
  return personalized;
}
const dedupe = (arr) => {
  const seen = new Set(); const out = [];
  for (const r of arr) {
    const key = String(r.email || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(r);
  }
  return out;
};
function sanitizeRecipients(input) {
  const list = Array.isArray(input) ? input : [];
  const mapped = list.map(r => ({
    email: String(r?.email || '').trim(),
    name: (String(r?.name || '').trim()) || String(r?.email || '').split('@')[0]
  })).filter(r => r.email);
  return dedupe(mapped);
}
function computeGapMs(ratePerMinute, jitterPct) {
  const base = 60_000 / Math.max(1, ratePerMinute);
  const j = Math.max(0, jitterPct) / 100;
  return { min: base * (1 - j), max: base * (1 + j) };
}
const randBetween = (min, max) => Math.floor(min + Math.random() * (max - min));

// Cache senders for 10 minutes
let cachedSenders = null, cachedAt = 0;
async function getApprovedSenders() {
  const now = Date.now();
  if (cachedSenders && now - cachedAt < 10 * 60_000) return cachedSenders;

  const senders = [];
  for await (const s of mgmt.senderUsernames.listByDomains(RG, SVC, DOMAIN)) {
    if (s?.name) senders.push(`${s.name}@${DOMAIN}`); // s.name == local-part
  }
  if (!senders.length) throw new Error('No approved sender usernames found in ACS domain');
  cachedSenders = senders; cachedAt = now;
  return senders;
}

async function sendOne({ from, to, subject, html, text, replyTo, recipientName }) {
  // Use the already processed HTML and text (no double processing)
  const payload = {
    senderAddress: from,
    content: { 
      subject, 
      html: html, 
      plainText: text || undefined 
    },
    recipients: { to: [{ address: to }] }
  };
  
  // Add inbox-friendly headers
  payload.headers = {
    'X-Priority': '3',
    'X-MSMail-Priority': 'Normal',
    'Importance': 'Normal',
    'Message-ID': `<${Date.now()}.${Math.random().toString(36)}@${DOMAIN}>`,
    'List-Unsubscribe': `<mailto:unsubscribe@${DOMAIN}?subject=Unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'Precedence': 'bulk'
  };
  
  if (Array.isArray(replyTo) && replyTo.length) {
    payload.replyTo = replyTo.map(a => ({ address: a }));
  }
  
  const poller = await emailClient.beginSend(payload, { pollIntervalInMs: 2000 });
  return await poller.pollUntilDone();
}

// Advanced spintax expansion with support for complex nested structures
function expandSpintax(text, seed = null) {
  if (!text) return text;
  
  // Create a proper seeded random number generator
  class SeededRandom {
    constructor(seed) {
      this.seed = seed % 2147483647;
      if (this.seed <= 0) this.seed += 2147483646;
    }
    
    next() {
      this.seed = (this.seed * 16807) % 2147483647;
      return (this.seed - 1) / 2147483646;
    }
  }
  
  const rng = seed !== null ? new SeededRandom(seed) : { next: Math.random };
  
  // Simplified and more reliable spintax parser
  function parseSpintax(input) {
    let result = input;
    let maxIterations = 50; // Increased iterations
    let iteration = 0;
    
    while (iteration < maxIterations) {
      let hasChanges = false;
      
      // Use a more reliable regex approach for simple patterns first
      result = result.replace(/\{([^{}]*\|[^{}]*)\}/g, (match, options) => {
        hasChanges = true;
        const choices = options.split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);
        if (choices.length === 0) return match;
        
        const randomIndex = Math.floor(rng.next() * choices.length);
        return choices[randomIndex];
      });
      
      if (!hasChanges) break;
      iteration++;
    }
    
    return result;
  }
  
  // Handle advanced spintax features
  let result = parseSpintax(text);
  
  // Handle weighted spintax: {option1*3|option2*1|option3*2}
  result = result.replace(/\{([^{}]*\*[0-9]+[^{}]*)\}/g, (match, content) => {
    const weightedOptions = [];
    const parts = content.split('|');
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('*')) {
        const [option, weightStr] = trimmed.split('*');
        const weight = parseInt(weightStr) || 1;
        for (let i = 0; i < weight; i++) {
          weightedOptions.push(option.trim());
        }
      } else {
        weightedOptions.push(trimmed);
      }
    }
    
    if (weightedOptions.length > 0) {
      const randomIndex = Math.floor(rng.next() * weightedOptions.length);
      return weightedOptions[randomIndex];
    }
    return match;
  });
  
  // Handle conditional spintax: {?condition:option1|option2}
  result = result.replace(/\{\?([^:{}]+):([^{}]+)\}/g, (match, condition, options) => {
    // Simple condition evaluation (can be extended)
    const shouldShow = Math.random() > 0.5; // 50% chance for demo
    if (shouldShow && options.includes('|')) {
      const choices = options.split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);
      const randomIndex = Math.floor(rng.next() * choices.length);
      return choices[randomIndex];
    }
    return '';
  });
  
  // Handle range spintax: {#1-5} for numbers
  result = result.replace(/\{#(\d+)-(\d+)\}/g, (match, min, max) => {
    const minNum = parseInt(min);
    const maxNum = parseInt(max);
    const randomNum = Math.floor(rng.next() * (maxNum - minNum + 1)) + minNum;
    return randomNum.toString();
  });
  
  // Handle capitalization modifiers: {^option1|option2} for first letter caps
  result = result.replace(/\{\^([^{}]+)\}/g, (match, content) => {
    if (content.includes('|')) {
      const options = content.split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);
      const randomIndex = Math.floor(rng.next() * options.length);
      const selected = options[randomIndex];
      return selected.charAt(0).toUpperCase() + selected.slice(1).toLowerCase();
    }
    return content.charAt(0).toUpperCase() + content.slice(1).toLowerCase();
  });
  
  // Handle all caps modifier: {!option1|option2}
  result = result.replace(/\{!([^{}]+)\}/g, (match, content) => {
    if (content.includes('|')) {
      const options = content.split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);
      const randomIndex = Math.floor(rng.next() * options.length);
      return options[randomIndex].toUpperCase();
    }
    return content.toUpperCase();
  });
  
  return result;
}

// Function to create a better hash for seeding
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  // Ensure we get a positive number - remove time-based variation
  return Math.abs(hash);
}

// Removed duplicate textToHtml function - using improveEmailContent instead

// Function to improve email content for better deliverability
function improveEmailContent(content, recipientName) {
  if (!content) return content;
  
  // Clean and normalize the content
  let improved = content
    .trim()                                    // Remove leading/trailing whitespace
    .replace(/\r\n/g, '\n')                   // Normalize line endings
    .replace(/\n{3,}/g, '\n\n')               // Replace 3+ newlines with just 2
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold text
    .replace(/\*(.*?)\*/g, '<em>$1</em>');    // Italic text
  
  // Split into paragraphs and clean them up
  const paragraphs = improved
    .split('\n\n')                            // Split on double newlines
    .map(p => p.trim())                       // Trim each paragraph
    .filter(p => p.length > 0)                // Remove empty paragraphs
    .map(p => p.replace(/\n/g, ' '))          // Replace single newlines with spaces
    .map(p => `<p style="margin: 0 0 16px 0;">${p}</p>`); // Wrap in paragraph tags
  
  // Join paragraphs
  const htmlContent = paragraphs.join('');
  
  // Wrap in clean, minimal HTML (single unsubscribe link)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    ${htmlContent}
    <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #888; text-align: center;">
      <p style="margin: 0;">If you no longer wish to receive emails, <a href="mailto:unsubscribe@${DOMAIN}?subject=Unsubscribe" style="color: #888;">unsubscribe here</a>.</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendWithRetry(args) {
  let attempt = 0;
  while (true) {
    try { return await sendOne(args); }
    catch (err) {
      attempt++;
      if (attempt > RETRIES || !isRetryable(err)) throw err;
      const backoff = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s...
      console.warn(`Retry ${attempt} for ${args.to} after ${backoff}ms: ${err?.message || err}`);
      await sleep(backoff);
    }
  }
}

// --------- APP ----------
const app = express();
app.use(cors()); // simple: allow all origins (tighten later if needed)
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Test endpoint for debugging
app.get('/test', (_req, res) => res.json({ message: 'Server is running', timestamp: new Date().toISOString() }));

// Get all approved senders
app.get('/senders', async (_req, res) => {
  try {
    const senders = await getApprovedSenders();
    res.json({ domain: DOMAIN, count: senders.length, senders });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Add new sender address
app.post('/senders', async (req, res) => {
  try {
    const { username, displayName } = req.body;
    
    if (!username || !displayName) {
      return res.status(400).json({ error: 'Username and displayName are required' });
    }
    
    // Validate username format (alphanumeric and hyphens only)
    if (!/^[a-zA-Z0-9-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and hyphens' });
    }
    
    // Create the sender in Azure
    await mgmt.senderUsernames.createOrUpdate(
      RG,
      SVC,
      DOMAIN,
      username,
      { username, displayName }
    );
    
    // Clear cache to force refresh
    cachedSenders = null;
    cachedAt = 0;
    
    res.json({ 
      success: true, 
      domain: DOMAIN,
      sender: `${username}@${DOMAIN}`,
      message: `Sender ${username}@${DOMAIN} created successfully`
    });
    
  } catch (e) {
    console.error('Error creating sender:', e);
    res.status(400).json({ error: e.message || 'Failed to create sender' });
  }
});

// Delete sender address
app.delete('/senders', async (req, res) => {
  try {
    console.log('Delete request received:', req.body);
    
    const { username } = req.body;
    
    if (!username) {
      console.log('No username provided');
      return res.status(400).json({ error: 'Username is required' });
    }
    
    // Validate username format
    if (!/^[a-zA-Z0-9-]+$/.test(username)) {
      console.log('Invalid username format:', username);
      return res.status(400).json({ error: 'Invalid username format' });
    }
    
    console.log(`Attempting to delete sender: ${username}@${DOMAIN}`);
    
    // Delete the sender from Azure
    await mgmt.senderUsernames.delete(
      RG,
      SVC,
      DOMAIN,
      username
    );
    
    // Clear cache to force refresh
    cachedSenders = null;
    cachedAt = 0;
    
    console.log(`✅ Deleted sender: ${username}@${DOMAIN}`);
    
    res.json({ 
      success: true, 
      domain: DOMAIN,
      sender: `${username}@${DOMAIN}`,
      message: `Sender ${username}@${DOMAIN} deleted successfully`
    });
    
  } catch (e) {
    console.error('Error deleting sender:', e);
    res.status(400).json({ 
      error: e.message || 'Failed to delete sender',
      details: e.toString()
    });
  }
});

// Campaign status tracking
let currentCampaignStatus = {
  isRunning: false,
  campaignName: '',
  sent: 0,
  successful: 0,
  failed: 0,
  total: 0,
  completed: false,
  startTime: null
};

// Real-time email details tracking
let emailDetails = [];
const MAX_EMAIL_DETAILS = 200;

// Get campaign status endpoint
app.get('/campaign-status', (req, res) => {
  res.json(currentCampaignStatus);
});

// Get email details endpoint
app.get('/email-details', (req, res) => {
  res.json({ 
    details: emailDetails.slice(-50), // Return last 50 email details
    campaignName: currentCampaignStatus.campaignName 
  });
});

// Main endpoint your simple frontend calls
// Body: { subject, text, recipients:[{email,name}] }
app.post('/bulk-send', async (req, res) => {
  try {
    const campaignName = String(req.body?.campaignName || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const text = String(req.body?.text || '').trim();
    const recipients = sanitizeRecipients(req.body?.recipients);

    if (!campaignName) throw new Error('campaign name is required');
    if (!subject) throw new Error('subject is required');
    if (!text) throw new Error('text is required');
    if (!recipients.length) throw new Error('no valid recipients provided');

    const senders = await getApprovedSenders();
    const { min, max } = computeGapMs(RATE_PER_MIN, JITTER);

    // Immediate ACK so the browser doesn’t wait for the whole batch
    // Initialize campaign status tracking
    currentCampaignStatus = {
      isRunning: true,
      campaignName: campaignName,
      sent: 0,
      successful: 0,
      failed: 0,
      total: recipients.length,
      completed: false,
      startTime: Date.now()
    };

    // Clear previous email details
    emailDetails = [];

    res.status(202).json({
      accepted: true,
      recipients: recipients.length,
      senders: senders.length,
      ratePerMinute: RATE_PER_MIN,
      jitterPct: JITTER
    });

    // Drip loop runs in-process with improved deliverability
    (async () => {
      let emailCount = 0;
      const startTime = Date.now();
      
      for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        const from = senders[Math.floor(Math.random() * senders.length)];
        try {
          // Personalize content for each recipient with unique index
          const personalizedSubject = personalizeContent(subject, r, i, from);
          const personalizedText = personalizeContent(text, r, i, from);
          
          // Debug: Log the personalized content to verify spintax is working
          console.log(`📧 ${i + 1}/${recipients.length} - ${r.email}: "${personalizedText.substring(0, 100)}..."`);
          
          // Convert text to HTML for better deliverability
          const personalizedHtml = improveEmailContent(personalizedText, r.name);
          
          // Check hourly rate limit
          const elapsedHours = (Date.now() - startTime) / (1000 * 60 * 60);
          if (emailCount > 0 && emailCount / elapsedHours > DELIVERY_SETTINGS.maxEmailsPerHour) {
            console.log(`Rate limit reached. Waiting before sending more emails...`);
            await sleep(60000); // Wait 1 minute
          }
          
          const out = await sendWithRetry({
            from,
            to: r.email,
            subject: personalizedSubject,
            html: personalizedHtml,
            text: personalizedText,
            replyTo: [], // set if you want a Reply-To
            recipientName: r.name
          });
          
          emailCount++;
          currentCampaignStatus.sent = emailCount;
          currentCampaignStatus.successful++;
          
          // Add to email details tracking
          emailDetails.push({
            timestamp: Date.now(),
            campaignName: campaignName,
            recipientEmail: r.email,
            senderEmail: from,
            status: 'success'
          });
          
          // Keep only last MAX_EMAIL_DETAILS entries
          if (emailDetails.length > MAX_EMAIL_DETAILS) {
            emailDetails.shift();
          }
          
          console.log(`OK ${r.email} via ${from} — status: ${out?.status ?? 'unknown'} (${emailCount}/${recipients.length})`);
        } catch (err) {
          emailCount++;
          currentCampaignStatus.sent = emailCount;
          currentCampaignStatus.failed++;
          
          // Add to email details tracking
          emailDetails.push({
            timestamp: Date.now(),
            campaignName: campaignName,
            recipientEmail: r.email,
            senderEmail: from,
            status: 'error',
            error: err?.message || 'Unknown error'
          });
          
          // Keep only last MAX_EMAIL_DETAILS entries
          if (emailDetails.length > MAX_EMAIL_DETAILS) {
            emailDetails.shift();
          }
          
          console.error(`FAIL ${r.email} via ${from} — ${err?.message || err}`);
        }
        
        // Use improved delay settings
        const delay = DELIVERY_SETTINGS.delayBetweenEmails + randBetween(0, 1000); // Add some randomness
        await sleep(delay);
      }
      
      // Mark campaign as completed
      currentCampaignStatus.completed = true;
      currentCampaignStatus.isRunning = false;
      console.log(`Campaign "${campaignName}" finished`);
      console.log(`Campaign "${campaignName}" completed: ${currentCampaignStatus.successful}/${currentCampaignStatus.total} successful, ${currentCampaignStatus.failed} failed`);
    })().catch(e => {
      console.error('Bulk loop error:', e);
      currentCampaignStatus.completed = true;
      currentCampaignStatus.isRunning = false;
    });

  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.listen(Number(PORT), () => {
  console.log(`Bulk sender listening on http://localhost:${PORT}`);
});
