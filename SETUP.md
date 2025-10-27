# Setup Instructions

## Current Status

The MCP server framework is complete and ready to use. However, to fully automate tee time booking, you'll need to complete the booking system integration on your local machine.

## What's Working

✅ MCP server structure and tools
✅ Playwright integration for browser automation
✅ Credit card parameter handling (not charged, only holds reservation)
✅ TypeScript build system
✅ All City of Denver courses configured

## What Needs Completion

The booking automation requires identifying and integrating with the specific booking widget used by cityofdenvergolf.com. Here's how to complete it:

### Step 1: Install on Your Local Machine

```bash
# Clone the repository
git clone <your-repo-url>
cd denver-golf-mcp

# Install dependencies
npm install

# Install Playwright browsers (this was blocked in the dev environment)
npx playwright install chromium

# Build the project
npm run build
```

### Step 2: Discover the Booking System

Run the server and use the `search_tee_times` tool. It will:
- Navigate to cityofdenvergolf.com
- Take screenshots (saved to /tmp/)
- Log all booking-related links and iframes
- Identify the booking widget provider

Check the stderr output for details like:
```
Found booking-related links: [...]
Found potential booking frame: https://...
```

### Step 3: Complete the Automation

Once you identify the booking system, update `src/index.ts`:

#### For ChronoGolf:

```typescript
// In searchTeeTimes method, after page.goto():
const bookingFrame = page.frame({ url: /chronogolf/ });
await bookingFrame.click('[data-course="city-park"]');
await bookingFrame.fill('[data-date]', params.date);
// ... continue with selectors
```

#### For ForeTees:

```typescript
// Similar approach with ForeTees-specific selectors
const bookingFrame = page.frame({ url: /foretees/ });
// ... ForeTees-specific navigation
```

#### For other systems:

Use Playwright's Inspector to identify selectors:

```bash
npx playwright inspector https://www.cityofdenvergolf.com/
```

### Step 4: Implement the Booking Flow

Update the `bookTeeTime` method in `src/index.ts`:

```typescript
async bookTeeTime(params: BookingParams) {
  await this.initBrowser();
  const context = await this.browser!.newContext({ ... });
  const page = await context.newPage();

  // Navigate to booking page
  await page.goto(this.baseUrl);

  // Find and interact with booking widget
  const bookingFrame = page.frame({ url: /booking-system/ });

  // 1. Select course
  await bookingFrame.click(`[data-course="${params.course}"]`);

  // 2. Select date
  await bookingFrame.fill('[data-date-picker]', params.date);

  // 3. Select time
  await bookingFrame.click(`[data-time="${params.time}"]`);

  // 4. Fill player info
  await bookingFrame.fill('[name="first_name"]', params.player_info.first_name);
  await bookingFrame.fill('[name="last_name"]', params.player_info.last_name);
  await bookingFrame.fill('[name="email"]', params.player_info.email);
  await bookingFrame.fill('[name="phone"]', params.player_info.phone);

  // 5. Fill credit card (for reservation hold)
  await bookingFrame.fill('[name="card_number"]', params.credit_card.number);
  await bookingFrame.fill('[name="exp_month"]', params.credit_card.expiry_month);
  await bookingFrame.fill('[name="exp_year"]', params.credit_card.expiry_year);
  await bookingFrame.fill('[name="cvv"]', params.credit_card.cvv);
  await bookingFrame.fill('[name="zip"]', params.credit_card.zip);

  // 6. Submit booking
  await bookingFrame.click('[type="submit"]');

  // 7. Wait for confirmation
  await page.waitForSelector('.confirmation-number');
  const confirmationNumber = await page.textContent('.confirmation-number');

  await context.close();

  return {
    success: true,
    confirmation: confirmationNumber,
    message: `Tee time booked successfully! Confirmation: ${confirmationNumber}`
  };
}
```

### Step 5: Test Thoroughly

Create a test script:

```bash
# test/manual-test.sh
echo "Testing search_tee_times..."
node build/index.js <<EOF
{
  "tool": "search_tee_times",
  "arguments": {
    "course": "city-park",
    "date": "2025-11-20",
    "players": 4
  }
}
EOF
```

### Step 6: Handle Edge Cases

Add error handling for:
- No available tee times
- Booking system timeouts
- Credit card validation errors
- Reservation conflicts

## Debugging Tips

1. **Enable non-headless mode** to watch the automation:
```typescript
this.browser = await chromium.launch({ headless: false });
```

2. **Slow down actions** for debugging:
```typescript
await bookingFrame.click(selector, { delay: 100 });
```

3. **Take screenshots** at each step:
```typescript
await page.screenshot({ path: `/tmp/step-${stepNumber}.png` });
```

4. **Use Playwright trace** for detailed debugging:
```typescript
await context.tracing.start({ screenshots: true, snapshots: true });
// ... your automation code
await context.tracing.stop({ path: 'trace.zip' });
```

Then view the trace:
```bash
npx playwright show-trace trace.zip
```

## Security Considerations

- Never log complete credit card numbers
- Use HTTPS for all connections
- Consider adding rate limiting to prevent abuse
- Add authentication if exposing as a service
- Respect the booking system's terms of service

## Next Steps After Implementation

1. Test with various courses and dates
2. Add retry logic for transient failures
3. Implement cancellation functionality
4. Add support for modifying existing reservations
5. Consider adding email notifications
6. Document the specific booking system integration

## Getting Help

If you encounter issues:

1. Check the screenshots in `/tmp/`
2. Review the stderr logs
3. Use Playwright Inspector to explore the page
4. Test the booking manually to understand the flow
5. Check for changes to the booking system

## Contributing Back

Once you've completed the integration:

1. Document the booking system details
2. Update this SETUP.md with your findings
3. Add tests for the booking flow
4. Submit a pull request with your implementation

Good luck! The hard part (MCP setup, tool definitions, browser automation framework) is done. You just need to connect the dots with the specific booking system.
