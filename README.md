# Denver Golf MCP Server - Tee Time Booking

An MCP (Model Context Protocol) server that automates booking tee times at City of Denver golf courses through https://www.cityofdenvergolf.com/

## Features

- **Search Available Tee Times** - Find open slots by course, date, and time preference
- **Book Tee Times** - Automatically reserve tee times with player and payment information
- **Credit Card Handling** - Securely processes card info for reservation (NOT charged - payment at pro shop)
- **Multiple Courses** - Supports all City of Denver municipal courses

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

### Standalone Usage

```bash
node build/index.js
```

## Available Tools

### 1. list_courses

Lists all City of Denver golf courses available for booking.

```typescript
// No parameters required
```

### 2. search_tee_times

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

### 3. book_tee_time

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

This MCP server uses Playwright to automate the booking process:

1. **Navigation** - Opens the City of Denver Golf booking website
2. **Search** - Finds the booking interface (likely ChronoGolf, ForeTees, or similar widget)
3. **Selection** - Chooses your desired course, date, and tee time
4. **Form Filling** - Enters player information and credit card details
5. **Confirmation** - Completes the reservation and returns confirmation number

## Development

### Watch Mode

```bash
npm run watch
```

### Debug Mode

The server logs detailed information to stderr including:
- Page navigation steps
- Booking system detection
- Form interaction details
- Screenshots saved to `/tmp/` for debugging

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
- Requires internet connection to access booking system
- Subject to City of Denver Golf booking policies and availability
- The booking system may change, requiring updates to automation logic

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
