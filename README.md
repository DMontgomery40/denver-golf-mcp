# Denver Golf MCP Server - Tee Time Booking

An MCP (Model Context Protocol) server that automates booking tee times at City of Denver golf courses through the **MemberSports** booking system (https://app.membersports.com).

## Features

- **MemberSports Integration** - Fully integrated with City of Denver's MemberSports booking platform
- **Search Available Tee Times** - Find open slots by course, date, and time preference
- **Book Tee Times** - Automatically reserve tee times with player and payment information
- **Credit Card Handling** - Securely processes card info for reservation (NOT charged - payment at pro shop)
- **Multiple Courses** - Supports all 4 City of Denver municipal courses
- **Step-by-Step Screenshots** - Saves screenshots at each booking step for debugging

## City of Denver Golf Courses Supported

- City Park Golf Course
- Overland Golf Course
- Wellshire Golf Course
- Kennedy Golf Course

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Playwright Browsers

Playwright requires browser binaries to be installed:

```bash
npx playwright install chromium
```

### 3. Build the Project

```bash
npm run build
```

## Usage

### With Claude Desktop

Add this to your Claude Desktop configuration:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "denver-golf": {
      "command": "node",
      "args": ["/absolute/path/to/denver-golf-mcp/build/index.js"]
    }
  }
}
```

### Standalone Usage (stdio)

```bash
node build/index.js
```

### Streamable HTTP Transport

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3000 node build/index.js
```

Or use the npm script:

```bash
npm run start:http
```

### Docker

```bash
docker build -t denver-golf-mcp .
docker run -p 3000:3000 denver-golf-mcp
```

## Available Tools

### 1. list_courses

Lists all City of Denver golf courses available for booking.

```typescript
// No parameters required
```

### 2. discover_course_ids

**Important: Run this first!** Automatically discovers the real MemberSports course IDs by visiting cityofdenvergolf.com and extracting booking URLs.

```typescript
// No parameters required
```

This tool will:
- Visit each course page on cityofdenvergolf.com
- Extract MemberSports booking URLs
- Parse the real course IDs
- Compare with hardcoded values
- Tell you if you need to update the code

**Example output:**
```json
{
  "message": "Course ID discovery complete!",
  "discovered_ids": {
    "city-park": {"id": "4711", "url": "...", "name": "..."},
    "overland": {"id": "4712", "url": "...", "name": "..."}
  },
  "current_ids": {...},
  "instructions": "If discovered IDs differ, update courseIds in src/index.ts:60"
}
```

### 3. search_tee_times

Search for available tee times at a specific course and date.

```typescript
{
  course: "city-park" | "overland" | "wellshire" | "kennedy",
  date: "2025-11-15",  // YYYY-MM-DD format
  players?: 4,          // Number of players (1-4)
  time_preference?: "morning" | "afternoon" | "evening" | "any"
}
```

**Example Response:**
```json
{
  "course": "City Park Golf Course",
  "date": "2025-11-15",
  "available_times": [
    {
      "time": "8:00 AM",
      "available_spots": 4,
      "price": "$45.00"
    },
    {
      "time": "8:30 AM",
      "available_spots": 4,
      "price": "$45.00"
    }
  ]
}
```

### 4. book_tee_time

Book a tee time at a City of Denver golf course.

```typescript
{
  course: "city-park",
  date: "2025-11-15",
  time: "8:00 AM",
  players: 4,
  player_info: {
    first_name: "John",
    last_name: "Doe",
    email: "john@example.com",
    phone: "303-555-1234"
  },
  credit_card: {
    number: "4111111111111111",
    expiry_month: "12",
    expiry_year: "2026",
    cvv: "123",
    zip: "80202"
  }
}
```

## Important Notes About Credit Cards

From the City of Denver Golf website:

> **NOTICE**
>
> A valid credit card is required to reserve a tee time.
> Reservations can only be made online at www.CityOfDenverGolf.com
> Phone reservations are NOT accepted for credit card security purposes.
> **Credit cards are not charged when the reservation is made.**
> Players must check in and pay at the pro shop.

This means:
- ✅ Credit card info is required to hold your reservation
- ❌ Your card is **NOT charged** when booking online
- 💳 You pay at the pro shop when you arrive

## How It Works

This MCP server uses Playwright to automate the MemberSports booking process:

1. **Navigation** - Opens the MemberSports booking page for selected course
2. **Authentication** - Logs in or registers with your email and contact info
3. **Date Selection** - Chooses your desired date from the calendar
4. **Time Selection** - Clicks on your preferred available tee time
5. **Player Info** - Fills in contact details
6. **Payment Info** - Enters credit card for reservation hold (NOT charged!)
7. **Submission** - Completes the booking and captures confirmation number

Booking URL format: `https://app.membersports.com/book-linked-clubs-tee-time/3660/{COURSE_ID}/1`

## Development

### Watch Mode

```bash
npm run watch
```

### Debug Mode

The server logs detailed information to stderr including:
- Page navigation steps
- MemberSports booking system interactions
- Form interaction details
- Screenshots saved to `/tmp/` for debugging at each step:
  - `/tmp/booking-step1.png` through `/tmp/booking-step7-confirmation.png`

### Important: Verify Course IDs

The course IDs in the code (4711-4714) are placeholders. To find the correct MemberSports IDs:

1. Visit https://www.cityofdenvergolf.com/
2. Click "Book Tee Time" for each course
3. Note the URL: `app.membersports.com/book-linked-clubs-tee-time/3660/{COURSE_ID}/1`
4. Update the `courseIds` map in `src/index.ts` if different

See SETUP.md for detailed instructions.

## Troubleshooting

### "Access denied" errors

The City of Denver Golf website has bot protection. The server handles this by:
- Using realistic user agents
- Proper timing and waiting for page loads
- Simulating human-like behavior

### Browser not installed

If you see browser-related errors:

```bash
npx playwright install chromium
```

### Network timeouts

Some operations may timeout on slow connections. The default timeout is 30 seconds, which should be sufficient for most cases.

## Security

- Credit card information is transmitted directly to the booking system
- No card data is stored or logged by this server
- All communication happens over HTTPS
- The server runs locally on your machine

## Limitations

- Currently supports City of Denver municipal courses only
- Requires internet connection to access MemberSports booking system
- Subject to City of Denver Golf booking policies and availability (typically 7-14 days advance booking)
- MemberSports interface updates may require selector adjustments
- Course IDs (4711-4714) are placeholders and should be verified
- New accounts may require email verification in MemberSports
- Rate limiting may trigger bot detection if too many requests are made

## Contributing

To add support for more features:

1. Fork the repository
2. Explore the booking system structure (see debug logs and screenshots)
3. Update the automation logic in `src/index.ts`
4. Test thoroughly with various scenarios
5. Submit a pull request

## License

MIT

## Disclaimer

This tool is provided as-is for convenience in booking tee times. Users are responsible for:
- Ensuring accurate information is provided
- Showing up for reserved tee times
- Following City of Denver Golf policies
- Canceling reservations if unable to play

Misuse of automated booking systems may violate terms of service.

---

## Appendix: MCP in Practice (Code Execution, Tool Scale, and Safety)

Last updated: 2026-03-23

### Why This Appendix Exists
Model Context Protocol (MCP) is still one of the most useful interoperability layers for tools and agents. The tradeoff is that large MCP servers can expose many tools, and naive tool-calling can flood context windows with schemas, tool chatter, and irrelevant call traces.

In practice, "more tools" is not always "better outcomes." Tool surface area must be paired with execution patterns that keep token use bounded and behavior predictable.

### The Shift to Code Execution / Code Mode
Recent workflows increasingly move complex orchestration out of chat context and into code execution loops. This reduces repetitive schema tokens and makes tool usage auditable and testable.

Core reading:
- [Cloudflare: Code Mode](https://blog.cloudflare.com/code-mode/)
- [Cloudflare: Code Execution with MCP](https://blog.cloudflare.com/code-execution-with-mcp/)
- [Anthropic: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)

### Recommended Setup for Power Users
For users who want reproducible and lower-noise MCP usage, start with a codemode-oriented setup:
- [codemode-mcp (jx-codes)](https://github.com/jx-codes/codemode-mcp)
- [UTCP](https://www.utcp.io)

Practical caveat: even with strong setup, model behavior can still be inconsistent across providers and versions. Keep retries, guardrails, and deterministic fallbacks in place.

### Client Fit Guide (Short Version)
- Claude Code / Codex / Cursor: strong for direct MCP workflows, but still benefit from narrow tool surfaces.
- Code execution wrappers (TypeScript/Python CLIs): better when tool count is high or task chains are multi-step.
- Hosted chat clients with weaker MCP controls: often safer via pre-wrapped CLIs or gateway tools.

### Prompt Injection: Risks, Impact, and Mitigations
Prompt injection remains an open security problem for tool-using agents. It is manageable, but not "solved."

Primary risks:
- Malicious instructions hidden in tool output or remote content.
- Secret exfiltration and unauthorized external calls.
- Unsafe state changes (destructive file/system/API actions).

Mitigation baseline:
- Least privilege for credentials and tool scopes.
- Allowlist destinations and enforce egress controls.
- Strict input validation and schema enforcement.
- Human confirmation for destructive/high-risk actions.
- Sandboxed execution with resource/time limits.
- Structured logging, audit trails, and replayable runs.
- Output filtering/redaction before model re-ingestion.

Treat every tool output as untrusted input unless explicitly verified.
