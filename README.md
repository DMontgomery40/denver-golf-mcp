# Denver Golf MCP Server

A Model Context Protocol (MCP) server that provides comprehensive information about golf courses in the Denver metropolitan area.

## Features

- Search golf courses by location, type, and rating
- Get detailed information about specific courses
- Compare multiple courses
- Access course data including yardage, par, slope rating, and amenities

## Installation

```bash
npm install
npm run build
```

## Usage

### With Claude Desktop

Add this to your Claude Desktop configuration file:

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

### Standalone

```bash
node build/index.js
```

## Available Tools

### 1. search_golf_courses

Search for golf courses by various criteria:

```typescript
{
  city?: string;          // Filter by city (e.g., "Denver", "Aurora")
  type?: "public" | "private" | "semi-private";
  min_rating?: number;    // Minimum course rating
  max_rating?: number;    // Maximum course rating
}
```

### 2. get_course_details

Get detailed information about a specific golf course:

```typescript
{
  course_id: string;  // Required: Course ID
}
```

### 3. compare_courses

Compare multiple golf courses:

```typescript
{
  course_ids: string[];  // Array of course IDs to compare
}
```

### 4. list_all_courses

List all available golf courses in the Denver area.

## Available Golf Courses

The server includes information about the following courses:

- **Arrowhead Golf Club** (Littleton) - Public, 18 holes
- **Fossil Trace Golf Club** (Golden) - Public, 18 holes
- **City Park Golf Course** (Denver) - Public, 18 holes
- **Kennedy Golf Course** (Aurora) - Public, 27 holes
- **Highlands Ranch Golf Club** (Highlands Ranch) - Semi-Private, 18 holes
- **Bear Creek Golf Club** (Morrison) - Public, 18 holes

## Resources

Each golf course is available as a resource with the URI pattern:

```
golf://denver/{course_id}
```

For example:
- `golf://denver/arrowhead`
- `golf://denver/fossil-trace`
- `golf://denver/city-park`

## Course Information

Each course includes:

- Name and location
- Contact information
- Course specifications (holes, par, yardage)
- Ratings (course rating and slope)
- Type (public, private, semi-private)
- Description
- Available amenities
- Website (when available)

## Development

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run watch
```

## License

MIT

## Contributing

Feel free to submit issues or pull requests to add more Denver area golf courses or improve functionality.
