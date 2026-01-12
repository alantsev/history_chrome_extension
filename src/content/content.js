const EXCLUDED_PATTERNS = [
  // Local files
  /^file:\/\//,

  // Localhost / development
  /^https?:\/\/localhost/,
  /^https?:\/\/127\.0\.0\.1/,
  /^https?:\/\/0\.0\.0\.0/,
  /^https?:\/\/\[::1\]/,

  // Email services
  /^https?:\/\/mail\.google\.com/,
  /^https?:\/\/([^.]+\.)?gmail\.com/,
  /^https?:\/\/([^.]+\.)?protonmail\.com/,
  /^https?:\/\/([^.]+\.)?proton\.me\/mail/,
  /^https?:\/\/outlook\.live\.com/,
  /^https?:\/\/outlook\.office\.com/,
  /^https?:\/\/mail\.yahoo\.com/,
  /^https?:\/\/([^.]+\.)?fastmail\.com/,
  /^https?:\/\/([^.]+\.)?tutanota\.com/,
  /^https?:\/\/([^.]+\.)?zoho\.com\/mail/,

  // Cloud consoles
  /^https?:\/\/console\.aws\.amazon\.com/,
  /^https?:\/\/([^.]+\.)?console\.cloud\.google\.com/,
  /^https?:\/\/portal\.azure\.com/,
  /^https?:\/\/cloud\.digitalocean\.com/,
  /^https?:\/\/app\.netlify\.com/,
  /^https?:\/\/vercel\.com\/dashboard/,
  /^https?:\/\/dashboard\.heroku\.com/,

  // Banking / Financial (US)
  /^https?:\/\/([^.]+\.)?chase\.com/,
  /^https?:\/\/([^.]+\.)?bankofamerica\.com/,
  /^https?:\/\/([^.]+\.)?wellsfargo\.com/,
  /^https?:\/\/([^.]+\.)?citi\.com/,
  /^https?:\/\/([^.]+\.)?capitalone\.com/,
  /^https?:\/\/([^.]+\.)?usbank\.com/,
  /^https?:\/\/([^.]+\.)?pnc\.com/,
  /^https?:\/\/([^.]+\.)?schwab\.com/,
  /^https?:\/\/([^.]+\.)?fidelity\.com/,
  /^https?:\/\/([^.]+\.)?vanguard\.com/,
  /^https?:\/\/([^.]+\.)?paypal\.com/,
  /^https?:\/\/([^.]+\.)?venmo\.com/,

  // Banking / Financial (Australia)
  /^https?:\/\/([^.]+\.)?commbank\.com\.au/,
  /^https?:\/\/([^.]+\.)?westpac\.com\.au/,
  /^https?:\/\/([^.]+\.)?nab\.com\.au/,
  /^https?:\/\/([^.]+\.)?anz\.com\.au/,
  /^https?:\/\/([^.]+\.)?macquarie\.com\.au/,
  /^https?:\/\/([^.]+\.)?bendigo\.com\.au/,
  /^https?:\/\/([^.]+\.)?bankwest\.com\.au/,
  /^https?:\/\/([^.]+\.)?suncorp\.com\.au/,
  /^https?:\/\/([^.]+\.)?ing\.com\.au/,
  /^https?:\/\/([^.]+\.)?ubank\.com\.au/,
  /^https?:\/\/([^.]+\.)?up\.com\.au/,

  // Password managers
  /^https?:\/\/([^.]+\.)?1password\.com/,
  /^https?:\/\/([^.]+\.)?bitwarden\.com/,
  /^https?:\/\/([^.]+\.)?lastpass\.com/,
  /^https?:\/\/([^.]+\.)?dashlane\.com/,
  /^https?:\/\/([^.]+\.)?keepersecurity\.com/,

  // Healthcare
  /^https?:\/\/([^.]+\.)?mychart\.com/,
  /^https?:\/\/([^.]+\.)?patient\./,
  /^https?:\/\/([^.]+\.)?healthsafe-id\.com/,

  // Social media feeds
  /^https?:\/\/([^.]+\.)?twitter\.com/,
  /^https?:\/\/([^.]+\.)?x\.com/,
  /^https?:\/\/([^.]+\.)?facebook\.com/,
  /^https?:\/\/([^.]+\.)?instagram\.com/,
  /^https?:\/\/([^.]+\.)?tiktok\.com/,
  /^https?:\/\/([^.]+\.)?snapchat\.com/,
  /^https?:\/\/([^.]+\.)?linkedin\.com\/feed/,
  /^https?:\/\/([^.]+\.)?reddit\.com/,

  // Video streaming
  /^https?:\/\/([^.]+\.)?youtube\.com\/watch/,
  /^https?:\/\/([^.]+\.)?netflix\.com/,
  /^https?:\/\/([^.]+\.)?hulu\.com/,
  /^https?:\/\/([^.]+\.)?disneyplus\.com/,
  /^https?:\/\/([^.]+\.)?primevideo\.com/,
  /^https?:\/\/([^.]+\.)?hbomax\.com/,
  /^https?:\/\/([^.]+\.)?max\.com/,
  /^https?:\/\/([^.]+\.)?twitch\.tv/,

  // Search results
  /^https?:\/\/([^.]+\.)?google\.com\/search/,
  /^https?:\/\/([^.]+\.)?bing\.com\/search/,
  /^https?:\/\/([^.]+\.)?duckduckgo\.com\/\?q=/,
  /^https?:\/\/([^.]+\.)?yahoo\.com\/search/,
  /^https?:\/\/([^.]+\.)?baidu\.com\/s/,

  // Authentication / OAuth
  /^https?:\/\/accounts\.google\.com/,
  /^https?:\/\/login\.microsoftonline\.com/,
  /^https?:\/\/auth0\.com/,
  /^https?:\/\/([^.]+\.)?okta\.com/,
  /^https?:\/\/([^.]+\.)?auth\./,
  /^https?:\/\/([^.]+\.)?login\./,
  /^https?:\/\/([^.]+\.)?signin\./,
  /^https?:\/\/([^.]+\.)?sso\./,

  // Payment gateways
  /^https?:\/\/checkout\.stripe\.com/,
  /^https?:\/\/([^.]+\.)?braintreepayments\.com/,
  /^https?:\/\/([^.]+\.)?square\.com\/checkout/,

  // Browser internal pages
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^about:/,
  /^edge:\/\//,
  /^moz-extension:\/\//,
];

function shouldExcludeUrl(url) {
  return EXCLUDED_PATTERNS.some(pattern => pattern.test(url));
}

class ContentScript {
  constructor() {
    // Wait for DOM to be fully loaded before initializing
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  async init() {
    try {
      // Skip excluded URLs
      if (shouldExcludeUrl(window.location.href)) {
        return;
      }

      if (document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
      }

      const moduleURL = chrome.runtime.getURL('content/page_data_collector.js');
      const module = await import(moduleURL).catch(e => {
        console.error('Module import error:', e);
        throw e;
      });

      const pageData = await module.PageDataCollector.collect();
      await this.sendToBackground(pageData);
    } catch (error) {
      console.error('ContentScript init error:', error);
    }
  }

  async sendToBackground(pageData) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PAGE_VISITED',
        data: pageData
      });

      if (response.status === 'error') {
        console.error('Error saving page data:', response.error);
      }
    } catch (error) {
      console.error('Error communicating with background worker:', error);
    }
  }
}

// Initialize the content script
new ContentScript();

