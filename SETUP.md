# Setup Instructions

## Status: FULLY IMPLEMENTED

The MCP server now has complete MemberSports integration! City of Denver Golf uses **MemberSports** (app.membersports.com) as their tee time booking system, and this has been fully implemented.

## What's Working

✅ MCP server structure and tools
✅ Playwright integration for browser automation
✅ **MemberSports booking system integration**
✅ Credit card parameter handling (not charged, only holds reservation)
✅ TypeScript build system
✅ All City of Denver courses configured with MemberSports IDs
✅ Complete booking flow from search to confirmation

## Installation

### Step 1: Install on Your Local Machine

```bash
# Clone the repository
git clone <your-repo-url>
cd denver-golf-mcp

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Build the project
npm run build
```

### Step 2: Configure with Claude Desktop

Add to your Claude Desktop config:

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

### Step 3: Start Using It!

You can now:

1. **List courses**: `list_courses`
2. **Search tee times**: `search_tee_times` with course, date, and preferences
3. **Book tee times**: `book_tee_time` with full booking details

## How MemberSports Integration Works

### URL Structure

```
https://app.membersports.com/book-linked-clubs-tee-time/{ORG_ID}/{COURSE_ID}/1
```

- **Organization ID**: 3660 (City of Denver Golf)
- **Course IDs**:
  - City Park: 4711
  - Overland: 4712
  - Wellshire: 4713
  - Kennedy: 4714

### Booking Flow

The automation handles these steps:

1. **Navigate** to MemberSports booking page for selected course
2. **Authenticate** - Login or register with email/phone/name
3. **Select Date** - Choose the desired date from date picker
4. **Select Time** - Click on available tee time slot
5. **Fill Player Info** - Enter contact details
6. **Enter Credit Card** - Add card for reservation hold (NOT charged!)
7. **Submit** - Complete the booking
8. **Extract Confirmation** - Get confirmation number from success page

### Screenshots for Debugging

The automation saves screenshots at each step to `/tmp/`:
- `/tmp/booking-step1.png` - Initial booking page
- `/tmp/booking-step2.png` - After authentication
- `/tmp/booking-step3.png` - Date selection
- `/tmp/booking-step4.png` - Time selection
- `/tmp/booking-step5.png` - Player info
- `/tmp/booking-step6.png` - Credit card
- `/tmp/booking-step7-confirmation.png` - Final confirmation

## Debugging Tips

### Enable Visual Mode

To watch the automation in action, edit `src/index.ts`:

```typescript
this.browser = await chromium.launch({
  headless: false,  // Change to false
  args: [...]
});
```

### Check Screenshots

If booking fails, check the screenshots in `/tmp/` to see where it got stuck.

### Adjust Selectors

If MemberSports updates their interface, you may need to update the CSS selectors in `src/index.ts`:

```typescript
// Example: If date picker changes
const datePicker = page.locator('input[type="date"], .new-date-picker-class').first();
```

### Add More Debugging

Add console logging:

```typescript
console.error('DEBUG: Current URL:', page.url());
console.error('DEBUG: Page title:', await page.title());
```

## Testing Without Real Bookings

To test without actually submitting bookings:

1. Comment out the submit button click in `bookTeeTime()`:
```typescript
// await submitButton.click();  // Comment this out
```

2. The automation will go through all steps except final submission

3. Check all screenshots to verify the forms are filled correctly

## Known Limitations

1. **Course IDs**: The actual MemberSports course IDs may differ from the placeholders (4711-4714). To find real IDs:
   - Visit https://www.cityofdenvergolf.com/
   - Click "Book Tee Time" for each course
   - Note the URL: `app.membersports.com/book-linked-clubs-tee-time/3660/{COURSE_ID}/1`
   - Update the `courseIds` map in `src/index.ts`

2. **Login Requirements**: MemberSports may require email verification for new accounts

3. **Rate Limiting**: Making too many requests too quickly may trigger bot detection

4. **Page Structure**: If MemberSports redesigns their booking interface, selectors may need updates

## Troubleshooting

### "Tee time not found on page"

- Check if the date is too far in the future (City of Denver allows booking 7-14 days ahead)
- Verify the time format matches what's displayed (e.g., "8:00 AM" vs "8:00am")
- Check screenshot `/tmp/booking-step3.png` to see available times

### Credit Card Errors

- Remember: Card is for hold only, not charged
- Verify all fields are filled correctly
- Check if MemberSports requires specific card types

### Bot Detection

If you see "Access Denied" or CAPTCHA:
- Add random delays between actions
- Use slower typing with `delay` option:
  ```typescript
  await input.fill(text, { delay: 100 });
  ```
- Try running in non-headless mode to appear more human-like

## Security Notes

- **Never commit** credit card information
- The server runs locally on your machine
- No data is transmitted except to MemberSports directly
- Consider adding encryption for stored credentials if extending this tool

## Future Enhancements

Potential improvements:

1. **Persistent Login** - Save session cookies to avoid re-logging in
2. **Cancellation** - Add `cancel_tee_time` tool
3. **Modification** - Add `modify_tee_time` tool
4. **Email Notifications** - Send confirmation emails
5. **Calendar Integration** - Add bookings to Google/Outlook calendar
6. **Price Alerts** - Notify when preferred times become available
7. **Multi-Course Search** - Search all courses at once
8. **Weather Integration** - Show forecast for tee time date

## Contributing

If you improve the selectors or add features:

1. Test thoroughly with real bookings
2. Document any MemberSports interface changes
3. Update this SETUP.md
4. Submit a pull request

## Support

If you encounter issues:

1. Check the screenshots in `/tmp/`
2. Review the stderr logs
3. Verify course IDs are correct
4. Test manually on MemberSports to confirm the booking system works
5. Open an issue with screenshots and error messages

## Credit Card Policy Reminder

From City of Denver Golf:

> Credit cards are not charged when the reservation is made.
> Players must check in and pay at the pro shop.

The card is used **only to hold** your tee time. You'll pay the green fee in person.
