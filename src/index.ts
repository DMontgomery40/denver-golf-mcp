#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium, Browser, Page } from "playwright";

// City of Denver Golf Courses
const DENVER_COURSES = {
  "city-park": "City Park Golf Course",
  "overland": "Overland Golf Course",
  "wellshire": "Wellshire Golf Course",
  "kennedy": "Kennedy Golf Course"
};

interface TeeTimeSearchParams {
  course: string;
  date: string; // YYYY-MM-DD format
  players?: number;
  time_preference?: "morning" | "afternoon" | "evening" | "any";
}

interface BookingParams {
  course: string;
  date: string;
  time: string;
  players: number;
  player_info: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  credit_card: {
    number: string;
    expiry_month: string;
    expiry_year: string;
    cvv: string;
    zip: string;
  };
}

interface TeeTime {
  time: string;
  available_spots: number;
  price: string;
}

class DenverGolfBookingService {
  private browser: Browser | null = null;
  private readonly memberSportsBaseUrl = "https://app.membersports.com";
  private readonly memberSportsOrgId = "3660"; // City of Denver Golf organization ID

  // Course IDs in MemberSports
  // Note: 4711 is confirmed from https://app.membersports.com/custom/3660/4711/19
  // Others (4712-4714) are sequential guesses - use discover_course_ids tool to verify
  private readonly courseIds: Record<string, string> = {
    "city-park": "4711",
    "overland": "4712",
    "wellshire": "4713",
    "kennedy": "4714"
  };

  async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
    }
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async loginOrRegister(page: Page, email: string, firstName: string, lastName: string, phone: string): Promise<void> {
    console.error('Checking if login is required...');

    // Check if already logged in
    const isLoggedIn = await page.locator('text=Sign Out').count() > 0 ||
                       await page.locator('text=My Account').count() > 0;

    if (isLoggedIn) {
      console.error('Already logged in');
      return;
    }

    console.error('Attempting to login/register...');

    // Try to find and click sign in/register button
    const signInButton = page.locator('text=/sign in|log in|register/i').first();
    if (await signInButton.count() > 0) {
      await signInButton.click();
      await page.waitForTimeout(2000);
    }

    // Fill in email
    const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(email);
    }

    // Check if this is a new user (registration) or existing user
    const registerButton = page.locator('text=/register|create account|sign up/i').first();
    if (await registerButton.count() > 0) {
      await registerButton.click();
      await page.waitForTimeout(1000);

      // Fill registration form
      await page.locator('input[name*="first" i]').fill(firstName);
      await page.locator('input[name*="last" i]').fill(lastName);
      await page.locator('input[name*="phone" i]').fill(phone);

      // Submit registration
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
    }
  }

  async searchTeeTimes(params: TeeTimeSearchParams): Promise<TeeTime[]> {
    try {
      await this.initBrowser();
      const context = await this.browser!.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      const courseId = this.courseIds[params.course];
      if (!courseId) {
        throw new Error(`Unknown course: ${params.course}`);
      }

      // Navigate to MemberSports booking page for specific course
      const bookingUrl = `${this.memberSportsBaseUrl}/book-linked-clubs-tee-time/${this.memberSportsOrgId}/${courseId}/1`;
      console.error(`Navigating to MemberSports: ${bookingUrl}`);

      await page.goto(bookingUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.screenshot({ path: '/tmp/membersports-booking.png' });
      console.error('MemberSports booking page loaded, screenshot saved');

      // Wait for the date picker or tee sheet to load
      await page.waitForTimeout(2000);

      // Try to select the date
      console.error(`Selecting date: ${params.date}`);

      // Look for date picker - MemberSports likely uses a calendar widget
      const datePicker = page.locator('input[type="date"], input[placeholder*="date" i], .date-picker').first();
      if (await datePicker.count() > 0) {
        await datePicker.fill(params.date);
        await page.waitForTimeout(1000);
      }

      // Alternative: Look for a calendar and click the specific date
      const dateElements = page.locator(`[data-date="${params.date}"], [data-value="${params.date}"]`);
      if (await dateElements.count() > 0) {
        await dateElements.first().click();
        await page.waitForTimeout(1000);
      }

      // Scrape available tee times from the page
      console.error('Scraping available tee times...');
      await page.screenshot({ path: '/tmp/membersports-times.png' });

      const teeTimes = await page.evaluate(() => {
        const times: Array<{time: string; available_spots: number; price: string}> = [];

        // Look for tee time slots - adjust selectors based on actual MemberSports DOM
        const timeSlots = document.querySelectorAll('.tee-time-slot, .time-slot, [class*="time"], [class*="slot"]');

        timeSlots.forEach(slot => {
          const timeText = slot.textContent || '';
          const timeMatch = timeText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);

          if (timeMatch) {
            const time = timeMatch[1];
            const priceMatch = timeText.match(/\$(\d+(?:\.\d{2})?)/);
            const price = priceMatch ? `$${priceMatch[1]}` : '$45.00';

            // Check if slot is available (not grayed out or marked unavailable)
            const isAvailable = !slot.classList.contains('unavailable') &&
                               !slot.classList.contains('booked') &&
                               !slot.classList.contains('disabled');

            if (isAvailable) {
              times.push({
                time: time,
                available_spots: 4, // Default to 4, adjust if we can parse this
                price: price
              });
            }
          }
        });

        return times;
      });

      await context.close();

      console.error(`Found ${teeTimes.length} available tee times`);

      if (teeTimes.length === 0) {
        // Return message if no times found
        console.error('WARNING: No tee times found. The page structure may have changed.');
        console.error('Check /tmp/membersports-times.png to see what the page looks like');
      }

      return teeTimes;

    } catch (error) {
      console.error('Error searching tee times:', error);
      throw error;
    }
  }

  async bookTeeTime(params: BookingParams): Promise<{ success: boolean; confirmation?: string; message: string }> {
    try {
      await this.initBrowser();
      const context = await this.browser!.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      const courseId = this.courseIds[params.course];
      if (!courseId) {
        throw new Error(`Unknown course: ${params.course}`);
      }

      // Step 1: Navigate to booking page
      const bookingUrl = `${this.memberSportsBaseUrl}/book-linked-clubs-tee-time/${this.memberSportsOrgId}/${courseId}/1`;
      console.error(`Step 1: Navigating to ${bookingUrl}`);
      await page.goto(bookingUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.screenshot({ path: '/tmp/booking-step1.png' });

      // Step 2: Login or register
      console.error('Step 2: Handling authentication...');
      await this.loginOrRegister(
        page,
        params.player_info.email,
        params.player_info.first_name,
        params.player_info.last_name,
        params.player_info.phone
      );
      await page.screenshot({ path: '/tmp/booking-step2.png' });

      // Step 3: Select date
      console.error(`Step 3: Selecting date ${params.date}...`);
      await page.waitForTimeout(2000);

      // Try multiple date selection methods
      const datePicker = page.locator('input[type="date"], input[placeholder*="date" i]').first();
      if (await datePicker.count() > 0) {
        await datePicker.fill(params.date);
        await page.waitForTimeout(1000);
      }

      await page.screenshot({ path: '/tmp/booking-step3.png' });

      // Step 4: Select tee time
      console.error(`Step 4: Selecting tee time ${params.time}...`);

      // Look for the specific time slot and click it
      const timeSlot = page.locator(`text=${params.time}`).first();
      if (await timeSlot.count() > 0) {
        await timeSlot.click();
        await page.waitForTimeout(2000);
      } else {
        throw new Error(`Tee time ${params.time} not found on page`);
      }

      await page.screenshot({ path: '/tmp/booking-step4.png' });

      // Step 5: Fill player information (if not already filled from login)
      console.error('Step 5: Filling player information...');

      // First name
      const firstNameInput = page.locator('input[name*="first" i], input[id*="first" i]').first();
      if (await firstNameInput.count() > 0 && await firstNameInput.inputValue() === '') {
        await firstNameInput.fill(params.player_info.first_name);
      }

      // Last name
      const lastNameInput = page.locator('input[name*="last" i], input[id*="last" i]').first();
      if (await lastNameInput.count() > 0 && await lastNameInput.inputValue() === '') {
        await lastNameInput.fill(params.player_info.last_name);
      }

      // Email
      const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
      if (await emailInput.count() > 0 && await emailInput.inputValue() === '') {
        await emailInput.fill(params.player_info.email);
      }

      // Phone
      const phoneInput = page.locator('input[type="tel"], input[name*="phone" i]').first();
      if (await phoneInput.count() > 0 && await phoneInput.inputValue() === '') {
        await phoneInput.fill(params.player_info.phone);
      }

      await page.screenshot({ path: '/tmp/booking-step5.png' });

      // Step 6: Fill credit card information
      console.error('Step 6: Filling credit card information (for hold only, not charged)...');

      // Card number
      const cardNumberInput = page.locator('input[name*="card" i], input[placeholder*="card" i], input[id*="card" i]').first();
      if (await cardNumberInput.count() > 0) {
        await cardNumberInput.fill(params.credit_card.number);
      }

      // Expiry month
      const expiryMonthInput = page.locator('input[name*="exp" i][name*="month" i], select[name*="month" i]').first();
      if (await expiryMonthInput.count() > 0) {
        await expiryMonthInput.fill(params.credit_card.expiry_month);
      }

      // Expiry year
      const expiryYearInput = page.locator('input[name*="exp" i][name*="year" i], select[name*="year" i]').first();
      if (await expiryYearInput.count() > 0) {
        await expiryYearInput.fill(params.credit_card.expiry_year);
      }

      // CVV
      const cvvInput = page.locator('input[name*="cvv" i], input[name*="cvc" i], input[placeholder*="cvv" i]').first();
      if (await cvvInput.count() > 0) {
        await cvvInput.fill(params.credit_card.cvv);
      }

      // ZIP code
      const zipInput = page.locator('input[name*="zip" i], input[name*="postal" i]').first();
      if (await zipInput.count() > 0) {
        await zipInput.fill(params.credit_card.zip);
      }

      await page.screenshot({ path: '/tmp/booking-step6.png' });

      // Step 7: Submit the booking
      console.error('Step 7: Submitting booking...');

      const submitButton = page.locator('button[type="submit"], button:has-text("Book"), button:has-text("Reserve"), button:has-text("Complete")').first();
      if (await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForTimeout(5000); // Wait for confirmation
      } else {
        throw new Error('Submit button not found');
      }

      await page.screenshot({ path: '/tmp/booking-step7-confirmation.png' });

      // Step 8: Extract confirmation number
      console.error('Step 8: Extracting confirmation number...');

      const confirmationNumber = await page.evaluate(() => {
        // Look for confirmation number in various formats
        const text = document.body.textContent || '';
        const confirmationMatch = text.match(/confirmation\s*#?\s*:?\s*([A-Z0-9-]+)/i);
        if (confirmationMatch) {
          return confirmationMatch[1];
        }

        // Look for specific confirmation elements
        const confirmElements = document.querySelectorAll('[class*="confirm"], [id*="confirm"]');
        for (const elem of confirmElements) {
          const elemText = elem.textContent || '';
          const match = elemText.match(/([A-Z0-9-]{6,})/);
          if (match) {
            return match[1];
          }
        }

        return null;
      });

      await context.close();

      if (confirmationNumber) {
        console.error(`SUCCESS: Booking confirmed with number ${confirmationNumber}`);
        return {
          success: true,
          confirmation: confirmationNumber,
          message: `Tee time successfully booked! Confirmation number: ${confirmationNumber}. Remember: Credit card was used to hold the reservation but was NOT charged. Pay at the pro shop when you arrive.`
        };
      } else {
        console.error('Booking may have succeeded but confirmation number not found');
        return {
          success: true,
          message: 'Booking appears to have been submitted successfully, but confirmation number could not be extracted. Check your email for confirmation. Remember: Credit card was NOT charged - pay at the pro shop.'
        };
      }

    } catch (error) {
      console.error('Error booking tee time:', error);
      throw error;
    }
  }

  async discoverCourseIds(): Promise<Record<string, {id: string; url: string; name?: string}>> {
    try {
      await this.initBrowser();
      const context = await this.browser!.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      console.error('Discovering course IDs from cityofdenvergolf.com...');
      await page.goto('https://www.cityofdenvergolf.com/locations/', { waitUntil: 'networkidle', timeout: 30000 });
      await page.screenshot({ path: '/tmp/course-discovery.png' });

      // Extract all booking links
      const courseLinks = await page.evaluate(() => {
        const links: Array<{text: string; href: string}> = [];
        document.querySelectorAll('a').forEach(a => {
          const href = a.getAttribute('href') || '';
          const text = a.textContent?.trim() || '';
          if (href.includes('membersports') || href.includes('book') || text.toLowerCase().includes('book')) {
            links.push({ text, href });
          }
        });
        return links;
      });

      console.error('Found booking links:', JSON.stringify(courseLinks, null, 2));

      // Try to visit each course page
      const discovered: Record<string, {id: string; url: string; name?: string}> = {};

      for (const course of Object.keys(DENVER_COURSES)) {
        const courseUrl = `https://www.cityofdenvergolf.com/${course}/`;
        console.error(`Checking ${courseUrl}...`);

        try {
          await page.goto(courseUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(2000);

          // Look for MemberSports booking link
          const bookingLink = await page.evaluate(() => {
            const links = document.querySelectorAll('a');
            for (const link of links) {
              const href = link.getAttribute('href') || '';
              if (href.includes('app.membersports.com')) {
                return href;
              }
            }
            return null;
          });

          if (bookingLink) {
            // Extract course ID from URL
            const match = bookingLink.match(/\/(\d+)\/\d+\/?$/);
            if (match) {
              discovered[course] = {
                id: match[1],
                url: bookingLink,
                name: DENVER_COURSES[course as keyof typeof DENVER_COURSES]
              };
              console.error(`Found ${course}: ID = ${match[1]}`);
            }
          }
        } catch (err) {
          console.error(`Error checking ${course}:`, err);
        }
      }

      await context.close();
      return discovered;

    } catch (error) {
      console.error('Error discovering course IDs:', error);
      throw error;
    }
  }

  async getCourseInfo(): Promise<typeof DENVER_COURSES> {
    return DENVER_COURSES;
  }
}

// Create server instance
const bookingService = new DenverGolfBookingService();
const server = new Server(
  {
    name: "denver-golf-booking",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_courses",
        description: "List all City of Denver golf courses available for booking",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "discover_course_ids",
        description: "Discover the real MemberSports course IDs by visiting cityofdenvergolf.com and extracting booking URLs. Use this to verify or update the course ID mappings.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "search_tee_times",
        description: "Search for available tee times at a City of Denver golf course",
        inputSchema: {
          type: "object",
          properties: {
            course: {
              type: "string",
              enum: Object.keys(DENVER_COURSES),
              description: "Golf course ID (city-park, overland, wellshire, or kennedy)"
            },
            date: {
              type: "string",
              description: "Date in YYYY-MM-DD format (e.g., 2025-11-15)",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$"
            },
            players: {
              type: "number",
              description: "Number of players (1-4)",
              minimum: 1,
              maximum: 4
            },
            time_preference: {
              type: "string",
              enum: ["morning", "afternoon", "evening", "any"],
              description: "Preferred time of day"
            }
          },
          required: ["course", "date"]
        }
      },
      {
        name: "book_tee_time",
        description: "Book a tee time at a City of Denver golf course. Note: Credit card is required but NOT charged - it only holds the reservation. Payment is made at the pro shop when you check in.",
        inputSchema: {
          type: "object",
          properties: {
            course: {
              type: "string",
              enum: Object.keys(DENVER_COURSES),
              description: "Golf course ID"
            },
            date: {
              type: "string",
              description: "Date in YYYY-MM-DD format",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$"
            },
            time: {
              type: "string",
              description: "Tee time (e.g., '8:00 AM', '2:30 PM')"
            },
            players: {
              type: "number",
              description: "Number of players",
              minimum: 1,
              maximum: 4
            },
            player_info: {
              type: "object",
              properties: {
                first_name: { type: "string" },
                last_name: { type: "string" },
                email: { type: "string", format: "email" },
                phone: { type: "string" }
              },
              required: ["first_name", "last_name", "email", "phone"]
            },
            credit_card: {
              type: "object",
              description: "Credit card info for reservation (NOT charged, only holds the tee time)",
              properties: {
                number: { type: "string", description: "Card number (no spaces or dashes)" },
                expiry_month: { type: "string", description: "Expiry month (MM)" },
                expiry_year: { type: "string", description: "Expiry year (YYYY)" },
                cvv: { type: "string", description: "CVV/CVC code" },
                zip: { type: "string", description: "Billing ZIP code" }
              },
              required: ["number", "expiry_month", "expiry_year", "cvv", "zip"]
            }
          },
          required: ["course", "date", "time", "players", "player_info", "credit_card"]
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_courses": {
        const courses = await bookingService.getCourseInfo();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(courses, null, 2)
            }
          ]
        };
      }

      case "discover_course_ids": {
        console.error('Starting course ID discovery...');
        const discovered = await bookingService.discoverCourseIds();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: "Course ID discovery complete! Update src/index.ts with these IDs if they differ from current values.",
                discovered_ids: discovered,
                current_ids: {
                  "city-park": "4711",
                  "overland": "4712",
                  "wellshire": "4713",
                  "kennedy": "4714"
                },
                instructions: "If discovered IDs differ, update the courseIds map in src/index.ts:60 and rebuild with 'npm run build'"
              }, null, 2)
            }
          ]
        };
      }

      case "search_tee_times": {
        const searchArgs = args as any;
        const params: TeeTimeSearchParams = {
          course: searchArgs?.course,
          date: searchArgs?.date,
          players: searchArgs?.players || 4,
          time_preference: searchArgs?.time_preference || "any"
        };

        console.error(`Searching tee times for ${params.course} on ${params.date}...`);
        const teeTimes = await bookingService.searchTeeTimes(params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                course: DENVER_COURSES[params.course as keyof typeof DENVER_COURSES],
                date: params.date,
                available_times: teeTimes,
                note: "This is currently showing example data. The booking system integration is being developed. Check the error logs for details about the booking system discovery process."
              }, null, 2)
            }
          ]
        };
      }

      case "book_tee_time": {
        const bookingArgs = args as any;
        const params: BookingParams = {
          course: bookingArgs?.course,
          date: bookingArgs?.date,
          time: bookingArgs?.time,
          players: bookingArgs?.players,
          player_info: bookingArgs?.player_info,
          credit_card: bookingArgs?.credit_card
        };

        console.error(`Booking tee time for ${params.player_info.first_name} ${params.player_info.last_name}...`);
        console.error(`Course: ${params.course}, Date: ${params.date}, Time: ${params.time}`);
        console.error(`Credit card ending in: ...${params.credit_card.number.slice(-4)}`);

        const result = await bookingService.bookTeeTime(params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down...');
  await bookingService.closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down...');
  await bookingService.closeBrowser();
  process.exit(0);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Denver Golf Booking MCP Server running on stdio");
  console.error("Ready to search and book tee times at City of Denver golf courses");
}

main().catch(async (error) => {
  console.error("Fatal error in main():", error);
  await bookingService.closeBrowser();
  process.exit(1);
});
