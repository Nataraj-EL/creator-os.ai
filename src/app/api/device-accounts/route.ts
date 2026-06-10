import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function GET() {
  try {
    const homeDir = os.homedir();
    const chromeDir = path.join(homeDir, '.config', 'google-chrome');
    const chromiumDir = path.join(homeDir, '.config', 'chromium');
    const emails = new Set<string>();

    const checkPreferences = (dir: string) => {
      if (fs.existsSync(dir)) {
        try {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const prefPath = path.join(dir, item, 'Preferences');
            if (fs.existsSync(prefPath)) {
              try {
                const content = fs.readFileSync(prefPath, 'utf8');
                const matches = content.matchAll(/"email":"([^"]+)"/g);
                for (const m of matches) {
                  const email = m[1];
                  if (email && email.includes('@') && !email.includes('google.com') && !email.includes('example.com')) {
                    emails.add(email.trim());
                  }
                }
              } catch (e) {
                // Ignore parse/read errors of individual profile preferences
              }
            }
          }
        } catch (e) {
          // Ignore read errors of Chrome directories
        }
      }
    };

    checkPreferences(chromeDir);
    checkPreferences(chromiumDir);

    const accountsList = Array.from(emails).map(email => {
      const parts = email.split('@');
      const namePart = parts[0];
      const name = namePart
        .split(/[._+-]/)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
      return {
        name,
        email,
        avatar: name.charAt(0) || 'U'
      };
    });

    // Provide default fallbacks if no accounts found
    if (accountsList.length === 0) {
      accountsList.push(
        { name: 'Nataraj EL', email: 'natarajel.dev@gmail.com', avatar: 'N' },
        { name: 'Nataraj Bio', email: 'natarajbio004@gmail.com', avatar: 'N' }
      );
    }

    return NextResponse.json({ success: true, accounts: accountsList });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      accounts: [
        { name: 'Nataraj EL', email: 'natarajel.dev@gmail.com', avatar: 'N' },
        { name: 'Nataraj Bio', email: 'natarajbio004@gmail.com', avatar: 'N' }
      ]
    });
  }
}
