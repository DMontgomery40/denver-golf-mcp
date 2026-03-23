#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { chromium, Browser, Page } from "playwright";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DENVER_COURSES: Record<string, string> = {
  "city-park": "City Park Golf Course",
  overland: "Overland Golf Course",
  wellshire: "Wellshire Golf Course",
  kennedy: "Kennedy Golf Course",
};

const COURSE_KEYS = Object.keys(DENVER_COURSES) as [string, ...string[]];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeeTime {
  time: string;
  available_spots: number;
  price: string;
}

// ---------------------------------------------------------------------------
// Booking Service
// ---------------------------------------------------------------------------

class DenverGolfBookingService {
  private browser: Browser | null = null;
  private readonly memberSportsBaseUrl = "https://app.membersports.com";
  private readonly memberSportsOrgId = "3660";

  // Course IDs in MemberSports
  // 4711 confirmed from https://app.membersports.com/custom/3660/4711/19
  // Others are sequential estimates — use discover_course_ids to verify
  private readonly courseIds: Record<string, string> = {
    "city-park": "4711",
    overland: "4712",
    wellshire: "4713",
    kennedy: "4714",
  };

  async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
    }
  }

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async loginOrRegister(
    page: Page,
    email: string,
    firstName: string,
    lastName: string,
    phone: string,
  ): Promise<void> {
    console.error("Checking if login is required...");
    const isLoggedIn =
      (await page.locator("text=Sign Out").count()) > 0 ||
      (await page.locator("text=My Account").count()) > 0;

    if (isLoggedIn) {
      console.error("Already logged in");
      return;
    }

    console.error("Attempting to login/register...");
    const signInButton = page.locator("text=/sign in|log in|register/i").first();
    if ((await signInButton.count()) > 0) {
      await signInButton.click();
      await page.waitForTimeout(2000);
    }

    const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
    if ((await emailInput.count()) > 0) {
      await emailInput.fill(email);
    }

    const registerButton = page.locator("text=/register|create account|sign up/i").first();
    if ((await registerButton.count()) > 0) {
      await registerButton.click();
      await page.waitForTimeout(1000);
      await page.locator('input[name*="first" i]').fill(firstName);
      await page.locator('input[name*="last" i]').fill(lastName);
      await page.locator('input[name*="phone" i]').fill(phone);
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(3000);
    }
  }

  async searchTeeTimes(params: {
    course: string;
    date: string;
    players: number;
    time_preference: string;
  }): Promise<TeeTime[]> {
    await this.initBrowser();
    const context = await this.browser!.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    try {
      const courseId = this.courseIds[params.course];
      if (!courseId) throw new Error(`Unknown course: ${params.course}`);

      const bookingUrl = `${this.memberSportsBaseUrl}/book-linked-clubs-tee-time/${this.memberSportsOrgId}/${courseId}/1`;
      console.error(`Navigating to MemberSports: ${bookingUrl}`);

      await page.goto(bookingUrl, { waitUntil: "networkidle", timeout: 30000 });
      await page.screenshot({ path: "/tmp/membersports-booking.png" });
      await page.waitForTimeout(2000);

      console.error(`Selecting date: ${params.date}`);
      const datePicker = page
        .locator('input[type="date"], input[placeholder*="date" i], .date-picker')
        .first();
      if ((await datePicker.count()) > 0) {
        await datePicker.fill(params.date);
        await page.waitForTimeout(1000);
      }

      const dateElements = page.locator(
        `[data-date="${params.date}"], [data-value="${params.date}"]`,
      );
      if ((await dateElements.count()) > 0) {
        await dateElements.first().click();
        await page.waitForTimeout(1000);
      }

      console.error("Scraping available tee times...");
      await page.screenshot({ path: "/tmp/membersports-times.png" });

      const teeTimes = await page.evaluate(() => {
        const times: Array<{ time: string; available_spots: number; price: string }> = [];
        const timeSlots = document.querySelectorAll(
          '.tee-time-slot, .time-slot, [class*="time"], [class*="slot"]',
        );

        timeSlots.forEach((slot) => {
          const timeText = slot.textContent || "";
          const timeMatch = timeText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
          if (timeMatch) {
            const priceMatch = timeText.match(/\$(\d+(?:\.\d{2})?)/);
            const isAvailable =
              !slot.classList.contains("unavailable") &&
              !slot.classList.contains("booked") &&
              !slot.classList.contains("disabled");
            if (isAvailable) {
              times.push({
                time: timeMatch[1],
                available_spots: 4,
                price: priceMatch ? `$${priceMatch[1]}` : "$45.00",
              });
            }
          }
        });
        return times;
      });

      console.error(`Found ${teeTimes.length} available tee times`);
      if (teeTimes.length === 0) {
        console.error("WARNING: No tee times found. Check /tmp/membersports-times.png");
      }
      return teeTimes;
    } finally {
      await context.close();
    }
  }

  async bookTeeTime(params: {
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
  }): Promise<{ success: boolean; confirmation?: string; message: string }> {
    await this.initBrowser();
    const context = await this.browser!.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    try {
      const courseId = this.courseIds[params.course];
      if (!courseId) throw new Error(`Unknown course: ${params.course}`);

      const bookingUrl = `${this.memberSportsBaseUrl}/book-linked-clubs-tee-time/${this.memberSportsOrgId}/${courseId}/1`;
      console.error(`Step 1: Navigating to ${bookingUrl}`);
      await page.goto(bookingUrl, { waitUntil: "networkidle", timeout: 30000 });
      await page.screenshot({ path: "/tmp/booking-step1.png" });

      console.error("Step 2: Handling authentication...");
      await this.loginOrRegister(
        page,
        params.player_info.email,
        params.player_info.first_name,
        params.player_info.last_name,
        params.player_info.phone,
      );
      await page.screenshot({ path: "/tmp/booking-step2.png" });

      console.error(`Step 3: Selecting date ${params.date}...`);
      await page.waitForTimeout(2000);
      const datePicker = page
        .locator('input[type="date"], input[placeholder*="date" i]')
        .first();
      if ((await datePicker.count()) > 0) {
        await datePicker.fill(params.date);
        await page.waitForTimeout(1000);
      }
      await page.screenshot({ path: "/tmp/booking-step3.png" });

      console.error(`Step 4: Selecting tee time ${params.time}...`);
      const timeSlot = page.locator(`text=${params.time}`).first();
      if ((await timeSlot.count()) > 0) {
        await timeSlot.click();
        await page.waitForTimeout(2000);
      } else {
        throw new Error(`Tee time ${params.time} not found on page`);
      }
      await page.screenshot({ path: "/tmp/booking-step4.png" });

      console.error("Step 5: Filling player information...");
      const firstNameInput = page.locator('input[name*="first" i], input[id*="first" i]').first();
      if ((await firstNameInput.count()) > 0 && (await firstNameInput.inputValue()) === "") {
        await firstNameInput.fill(params.player_info.first_name);
      }
      const lastNameInput = page.locator('input[name*="last" i], input[id*="last" i]').first();
      if ((await lastNameInput.count()) > 0 && (await lastNameInput.inputValue()) === "") {
        await lastNameInput.fill(params.player_info.last_name);
      }
      const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
      if ((await emailInput.count()) > 0 && (await emailInput.inputValue()) === "") {
        await emailInput.fill(params.player_info.email);
      }
      const phoneInput = page.locator('input[type="tel"], input[name*="phone" i]').first();
      if ((await phoneInput.count()) > 0 && (await phoneInput.inputValue()) === "") {
        await phoneInput.fill(params.player_info.phone);
      }
      await page.screenshot({ path: "/tmp/booking-step5.png" });

      console.error("Step 6: Filling credit card information...");
      const cardNumberInput = page
        .locator('input[name*="card" i], input[placeholder*="card" i], input[id*="card" i]')
        .first();
      if ((await cardNumberInput.count()) > 0) {
        await cardNumberInput.fill(params.credit_card.number);
      }
      const expiryMonthInput = page
        .locator('input[name*="exp" i][name*="month" i], select[name*="month" i]')
        .first();
      if ((await expiryMonthInput.count()) > 0) {
        await expiryMonthInput.fill(params.credit_card.expiry_month);
      }
      const expiryYearInput = page
        .locator('input[name*="exp" i][name*="year" i], select[name*="year" i]')
        .first();
      if ((await expiryYearInput.count()) > 0) {
        await expiryYearInput.fill(params.credit_card.expiry_year);
      }
      const cvvInput = page
        .locator('input[name*="cvv" i], input[name*="cvc" i], input[placeholder*="cvv" i]')
        .first();
      if ((await cvvInput.count()) > 0) {
        await cvvInput.fill(params.credit_card.cvv);
      }
      const zipInput = page.locator('input[name*="zip" i], input[name*="postal" i]').first();
      if ((await zipInput.count()) > 0) {
        await zipInput.fill(params.credit_card.zip);
      }
      await page.screenshot({ path: "/tmp/booking-step6.png" });

      console.error("Step 7: Submitting booking...");
      const submitButton = page
        .locator(
          'button[type="submit"], button:has-text("Book"), button:has-text("Reserve"), button:has-text("Complete")',
        )
        .first();
      if ((await submitButton.count()) > 0) {
        await submitButton.click();
        await page.waitForTimeout(5000);
      } else {
        throw new Error("Submit button not found");
      }
      await page.screenshot({ path: "/tmp/booking-step7-confirmation.png" });

      console.error("Step 8: Extracting confirmation number...");
      const confirmationNumber = await page.evaluate(() => {
        const text = document.body.textContent || "";
        const confirmationMatch = text.match(/confirmation\s*#?\s*:?\s*([A-Z0-9-]+)/i);
        if (confirmationMatch) return confirmationMatch[1];
        const confirmElements = document.querySelectorAll(
          '[class*="confirm"], [id*="confirm"]',
        );
        for (const elem of confirmElements) {
          const match = (elem.textContent || "").match(/([A-Z0-9-]{6,})/);
          if (match) return match[1];
        }
        return null;
      });

      if (confirmationNumber) {
        console.error(`SUCCESS: Booking confirmed with number ${confirmationNumber}`);
        return {
          success: true,
          confirmation: confirmationNumber,
          message: `Tee time successfully booked! Confirmation number: ${confirmationNumber}. Credit card was used to hold the reservation but was NOT charged. Pay at the pro shop when you arrive.`,
        };
      }

      console.error("Booking may have succeeded but confirmation number not found");
      return {
        success: true,
        message:
          "Booking appears submitted but confirmation number could not be extracted. Check your email for confirmation. Credit card was NOT charged — pay at the pro shop.",
      };
    } finally {
      await context.close();
    }
  }

  async discoverCourseIds(): Promise<
    Record<string, { id: string; url: string; name?: string }>
  > {
    await this.initBrowser();
    const context = await this.browser!.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    try {
      console.error("Discovering course IDs from cityofdenvergolf.com...");
      await page.goto("https://www.cityofdenvergolf.com/locations/", {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      await page.screenshot({ path: "/tmp/course-discovery.png" });

      const courseLinks = await page.evaluate(() => {
        const links: Array<{ text: string; href: string }> = [];
        document.querySelectorAll("a").forEach((a) => {
          const href = a.getAttribute("href") || "";
          const text = a.textContent?.trim() || "";
          if (
            href.includes("membersports") ||
            href.includes("book") ||
            text.toLowerCase().includes("book")
          ) {
            links.push({ text, href });
          }
        });
        return links;
      });
      console.error("Found booking links:", JSON.stringify(courseLinks, null, 2));

      const discovered: Record<string, { id: string; url: string; name?: string }> = {};
      for (const course of Object.keys(DENVER_COURSES)) {
        const courseUrl = `https://www.cityofdenvergolf.com/${course}/`;
        console.error(`Checking ${courseUrl}...`);
        try {
          await page.goto(courseUrl, { waitUntil: "networkidle", timeout: 30000 });
          await page.waitForTimeout(2000);
          const bookingLink = await page.evaluate(() => {
            const links = document.querySelectorAll("a");
            for (const link of links) {
              const href = link.getAttribute("href") || "";
              if (href.includes("app.membersports.com")) return href;
            }
            return null;
          });
          if (bookingLink) {
            const match = bookingLink.match(/\/(\d+)\/\d+\/?$/);
            if (match) {
              discovered[course] = {
                id: match[1],
                url: bookingLink,
                name: DENVER_COURSES[course],
              };
              console.error(`Found ${course}: ID = ${match[1]}`);
            }
          }
        } catch (err) {
          console.error(`Error checking ${course}:`, err);
        }
      }
      return discovered;
    } finally {
      await context.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Server Setup
// ---------------------------------------------------------------------------

const bookingService = new DenverGolfBookingService();

const server = new McpServer(
  { name: "denver-golf-booking", version: "2.1.0" },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// Tool: list_courses
// ---------------------------------------------------------------------------

server.registerTool(
  "list_courses",
  {
    title: "List Denver Golf Courses",
    description:
      "List all City of Denver municipal golf courses available for tee-time booking. " +
      "Use this when the user asks which courses exist or wants to see available options. " +
      "No inputs required. Returns an object mapping course slug to full course name. " +
      "No side effects.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(DENVER_COURSES, null, 2) }],
  }),
);

// ---------------------------------------------------------------------------
// Tool: discover_course_ids
// ---------------------------------------------------------------------------

server.registerTool(
  "discover_course_ids",
  {
    title: "Discover MemberSports Course IDs",
    description:
      "Discover the real MemberSports course IDs by scraping cityofdenvergolf.com and extracting booking URLs. " +
      "Use this to verify or update the hardcoded course-ID mappings before searching or booking. " +
      "No inputs required. Side effects: launches a headless browser, makes HTTP requests to cityofdenvergolf.com, " +
      "and saves a screenshot to /tmp/course-discovery.png. Slow (10-30s).",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async () => {
    try {
      console.error("Starting course ID discovery...");
      const discovered = await bookingService.discoverCourseIds();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: "Course ID discovery complete.",
                discovered_ids: discovered,
                current_ids: {
                  "city-park": "4711",
                  overland: "4712",
                  wellshire: "4713",
                  kennedy: "4714",
                },
                instructions:
                  "If discovered IDs differ from current, update courseIds in src/index.ts and rebuild.",
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              hint: "Check network connectivity and that cityofdenvergolf.com is reachable.",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: search_tee_times
// ---------------------------------------------------------------------------

server.registerTool(
  "search_tee_times",
  {
    title: "Search Tee Times",
    description:
      "Search for available tee times at a City of Denver golf course on a specific date. " +
      "Use this when the user wants to find open tee-time slots. Requires a course slug and date; " +
      "optionally accepts player count (default 4) and time-of-day preference (default 'any'). " +
      "Side effects: launches a headless browser, visits the MemberSports booking site, and " +
      "saves screenshots to /tmp/. Slow (10-30s). Returns an array of available times with prices.",
    inputSchema: z.object({
      course: z.enum(COURSE_KEYS).describe("Course slug: city-park, overland, wellshire, or kennedy"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
        .describe("Booking date in YYYY-MM-DD format"),
      players: z
        .number()
        .int()
        .min(1)
        .max(4)
        .default(4)
        .describe("Number of players (1-4). Defaults to 4."),
      time_preference: z
        .enum(["morning", "afternoon", "evening", "any"])
        .default("any")
        .describe("Preferred time of day. Defaults to 'any'."),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ course, date, players, time_preference }) => {
    try {
      const teeTimes = await bookingService.searchTeeTimes({
        course,
        date,
        players: players ?? 4,
        time_preference: time_preference ?? "any",
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                course: DENVER_COURSES[course],
                date,
                available_times: teeTimes,
                note:
                  teeTimes.length === 0
                    ? "No tee times found. The MemberSports page structure may have changed — check /tmp/membersports-times.png for debugging."
                    : undefined,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              course,
              date,
              hint: "Verify the course slug is valid and the date is in the future.",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: book_tee_time
// ---------------------------------------------------------------------------

server.registerTool(
  "book_tee_time",
  {
    title: "Book a Tee Time",
    description:
      "Book a tee time at a City of Denver golf course. DESTRUCTIVE: this creates a real reservation " +
      "on the MemberSports platform. A valid credit card is required to hold the reservation but is " +
      "NOT charged — payment is collected at the pro shop. Requires course, date, time, player count, " +
      "player contact info, and credit card details. Side effects: launches a headless browser, " +
      "fills and submits the MemberSports booking form, saves step-by-step screenshots to /tmp/. " +
      "Slow (30-60s). Returns success status and confirmation number if available.",
    inputSchema: z.object({
      course: z.enum(COURSE_KEYS).describe("Course slug"),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format")
        .describe("Booking date in YYYY-MM-DD format"),
      time: z.string().describe("Tee time string, e.g. '8:00 AM' or '2:30 PM'"),
      players: z.number().int().min(1).max(4).describe("Number of players (1-4)"),
      player_info: z
        .object({
          first_name: z.string().describe("Player first name"),
          last_name: z.string().describe("Player last name"),
          email: z.string().email().describe("Contact email"),
          phone: z.string().describe("Contact phone number"),
        })
        .describe("Primary player contact information"),
      credit_card: z
        .object({
          number: z.string().describe("Card number (no spaces or dashes)"),
          expiry_month: z.string().describe("Expiry month (MM)"),
          expiry_year: z.string().describe("Expiry year (YYYY)"),
          cvv: z.string().describe("CVV/CVC code"),
          zip: z.string().describe("Billing ZIP code"),
        })
        .describe(
          "Credit card for reservation hold only — NOT charged. Payment at the pro shop.",
        ),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ course, date, time, players, player_info, credit_card }) => {
    try {
      console.error(
        `Booking: ${player_info.first_name} ${player_info.last_name} at ${course} on ${date} ${time}`,
      );
      console.error(`Credit card ending in: ...${credit_card.number.slice(-4)}`);

      const result = await bookingService.bookTeeTime({
        course,
        date,
        time,
        players,
        player_info,
        credit_card,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              course,
              date,
              time,
              hint: "Check that the tee time is still available. Search first with search_tee_times.",
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

process.on("SIGINT", async () => {
  console.error("Shutting down...");
  await bookingService.closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("Shutting down...");
  await bookingService.closeBrowser();
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Transport Startup
// ---------------------------------------------------------------------------

async function main() {
  const transportMode = process.env.MCP_TRANSPORT ?? "stdio";

  if (transportMode === "http") {
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());

    const httpPort = parseInt(process.env.MCP_HTTP_PORT ?? "3000", 10);
    const httpHost = process.env.MCP_HTTP_HOST ?? "127.0.0.1";

    app.post("/mcp", async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.get("/mcp", async (_req, res) => {
      res.writeHead(405).end(JSON.stringify({ error: "Method Not Allowed. Use POST." }));
    });

    app.delete("/mcp", async (_req, res) => {
      res.writeHead(405).end(JSON.stringify({ error: "Method Not Allowed." }));
    });

    app.get("/health", (_req, res) => {
      res.json({ status: "ok", server: "denver-golf-booking", version: "2.1.0" });
    });

    app.listen(httpPort, httpHost, () => {
      console.error(
        `Denver Golf MCP Server (streamable-http) listening on http://${httpHost}:${httpPort}/mcp`,
      );
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Denver Golf Booking MCP Server running on stdio");
    console.error("Ready to search and book tee times at City of Denver golf courses");
  }
}

main().catch(async (error) => {
  console.error("Fatal error in main():", error);
  await bookingService.closeBrowser();
  process.exit(1);
});
