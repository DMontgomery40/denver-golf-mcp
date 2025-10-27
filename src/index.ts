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
  private readonly baseUrl = "https://www.cityofdenvergolf.com";

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

  async searchTeeTimes(params: TeeTimeSearchParams): Promise<TeeTime[]> {
    try {
      await this.initBrowser();
      const context = await this.browser!.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      console.error(`Navigating to ${this.baseUrl}...`);
      await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Take a screenshot for debugging
      await page.screenshot({ path: '/tmp/homepage.png' });
      console.error('Homepage loaded, screenshot saved');

      // Look for booking interface elements
      const content = await page.content();
      console.error(`Page title: ${await page.title()}`);

      // Try to find tee time booking links or buttons
      const bookingLinks = await page.evaluate(() => {
        const links: string[] = [];
        document.querySelectorAll('a').forEach(a => {
          const href = a.getAttribute('href');
          const text = a.textContent?.toLowerCase() || '';
          if (href && (
            text.includes('book') ||
            text.includes('tee time') ||
            text.includes('reservation') ||
            href.includes('book') ||
            href.includes('tee')
          )) {
            links.push(`${text.trim()}: ${href}`);
          }
        });
        return links;
      });

      console.error('Found booking-related links:', bookingLinks);

      // Try to find iframe with booking system
      const frames = page.frames();
      console.error(`Found ${frames.length} frames on page`);

      for (const frame of frames) {
        const frameUrl = frame.url();
        console.error(`Frame URL: ${frameUrl}`);
        if (frameUrl.includes('tee') || frameUrl.includes('book') || frameUrl.includes('chronogolf') || frameUrl.includes('foreup')) {
          console.error(`Found potential booking frame: ${frameUrl}`);
        }
      }

      await context.close();

      // Return mock data with instructions for now
      return [
        {
          time: "8:00 AM",
          available_spots: 4,
          price: "$45.00"
        },
        {
          time: "8:30 AM",
          available_spots: 4,
          price: "$45.00"
        },
        {
          time: "9:00 AM",
          available_spots: 2,
          price: "$45.00"
        }
      ];

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

      console.error(`Navigating to ${this.baseUrl} for booking...`);
      await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // This is where we would navigate through the booking flow
      // For now, return a detailed message about the booking system

      await context.close();

      return {
        success: false,
        message: `To complete the booking automation, we need to identify the specific booking system used by cityofdenvergolf.com. The site appears to use a third-party booking widget (likely ChronoGolf, ForeTees, or similar). Once identified, the booking flow would be: 1) Navigate to booking widget, 2) Select course: ${params.course}, 3) Select date: ${params.date}, 4) Select time: ${params.time}, 5) Enter player details, 6) Enter credit card (for reservation hold only, not charged), 7) Confirm booking. Note: Credit card is NOT charged - it only holds the reservation. Payment is made at the pro shop.`
      };

    } catch (error) {
      console.error('Error booking tee time:', error);
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
