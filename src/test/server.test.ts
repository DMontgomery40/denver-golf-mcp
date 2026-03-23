import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// We re-create a minimal server with the same tool registrations but mock
// implementations so tests don't require Playwright or network access.

function createTestServer(): McpServer {
  const COURSE_KEYS = ["city-park", "overland", "wellshire", "kennedy"] as [
    string,
    ...string[],
  ];

  const DENVER_COURSES: Record<string, string> = {
    "city-park": "City Park Golf Course",
    overland: "Overland Golf Course",
    wellshire: "Wellshire Golf Course",
    kennedy: "Kennedy Golf Course",
  };

  const server = new McpServer(
    { name: "denver-golf-booking", version: "2.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "list_courses",
    {
      title: "List Denver Golf Courses",
      description: "List all City of Denver municipal golf courses.",
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

  server.registerTool(
    "discover_course_ids",
    {
      title: "Discover MemberSports Course IDs",
      description: "Discover real MemberSports course IDs. (Mock: returns hardcoded IDs.)",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message: "Course ID discovery complete.",
            discovered_ids: {
              "city-park": { id: "4711", url: "https://example.com", name: "City Park" },
            },
            current_ids: { "city-park": "4711" },
          }),
        },
      ],
    }),
  );

  server.registerTool(
    "search_tee_times",
    {
      title: "Search Tee Times",
      description: "Search for available tee times at a Denver golf course.",
      inputSchema: z.object({
        course: z.enum(COURSE_KEYS),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        players: z.number().int().min(1).max(4).default(4),
        time_preference: z
          .enum(["morning", "afternoon", "evening", "any"])
          .default("any"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ course, date }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            course: DENVER_COURSES[course],
            date,
            available_times: [
              { time: "8:00 AM", available_spots: 4, price: "$45.00" },
              { time: "9:30 AM", available_spots: 2, price: "$45.00" },
            ],
          }),
        },
      ],
    }),
  );

  server.registerTool(
    "book_tee_time",
    {
      title: "Book a Tee Time",
      description: "Book a tee time. (Mock: always returns success.)",
      inputSchema: z.object({
        course: z.enum(COURSE_KEYS),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string(),
        players: z.number().int().min(1).max(4),
        player_info: z.object({
          first_name: z.string(),
          last_name: z.string(),
          email: z.string().email(),
          phone: z.string(),
        }),
        credit_card: z.object({
          number: z.string(),
          expiry_month: z.string(),
          expiry_year: z.string(),
          cvv: z.string(),
          zip: z.string(),
        }),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            confirmation: "MOCK-12345",
            message: "Mock booking successful.",
          }),
        },
      ],
    }),
  );

  return server;
}

describe("denver-golf-mcp server", () => {
  let client: Client;
  let server: McpServer;

  before(async () => {
    server = createTestServer();
    client = new Client({ name: "test-client", version: "1.0.0" });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  after(async () => {
    await client.close();
    await server.close();
  });

  // ---- tools/list ----

  describe("tools/list", () => {
    it("returns all four tools", async () => {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        "book_tee_time",
        "discover_course_ids",
        "list_courses",
        "search_tee_times",
      ]);
    });

    it("each tool has a description and inputSchema", async () => {
      const result = await client.listTools();
      for (const tool of result.tools) {
        assert.ok(tool.description, `${tool.name} missing description`);
        assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`);
        assert.equal(tool.inputSchema.type, "object");
      }
    });

    it("tools have annotations", async () => {
      const result = await client.listTools();
      for (const tool of result.tools) {
        assert.ok(tool.annotations, `${tool.name} missing annotations`);
      }
    });

    it("book_tee_time is marked destructive", async () => {
      const result = await client.listTools();
      const bookTool = result.tools.find((t) => t.name === "book_tee_time");
      assert.ok(bookTool);
      assert.equal(bookTool.annotations?.destructiveHint, true);
      assert.equal(bookTool.annotations?.readOnlyHint, false);
    });

    it("list_courses is marked read-only", async () => {
      const result = await client.listTools();
      const listTool = result.tools.find((t) => t.name === "list_courses");
      assert.ok(listTool);
      assert.equal(listTool.annotations?.readOnlyHint, true);
      assert.equal(listTool.annotations?.destructiveHint, false);
    });
  });

  // ---- tools/call - success paths ----

  describe("tools/call - success paths", () => {
    it("list_courses returns all four courses", async () => {
      const result = await client.callTool({ name: "list_courses", arguments: {} });
      assert.ok(!result.isError);
      const content = result.content as Array<{ type: string; text: string }>;
      const courses = JSON.parse(content[0].text);
      assert.ok(courses["city-park"]);
      assert.ok(courses["overland"]);
      assert.ok(courses["wellshire"]);
      assert.ok(courses["kennedy"]);
    });

    it("discover_course_ids returns discovered IDs", async () => {
      const result = await client.callTool({
        name: "discover_course_ids",
        arguments: {},
      });
      assert.ok(!result.isError);
      const content = result.content as Array<{ type: string; text: string }>;
      const data = JSON.parse(content[0].text);
      assert.ok(data.discovered_ids);
      assert.ok(data.current_ids);
    });

    it("search_tee_times returns tee time array", async () => {
      const result = await client.callTool({
        name: "search_tee_times",
        arguments: { course: "city-park", date: "2026-04-15" },
      });
      assert.ok(!result.isError);
      const content = result.content as Array<{ type: string; text: string }>;
      const data = JSON.parse(content[0].text);
      assert.equal(data.course, "City Park Golf Course");
      assert.ok(Array.isArray(data.available_times));
      assert.ok(data.available_times.length > 0);
    });

    it("search_tee_times accepts optional parameters", async () => {
      const result = await client.callTool({
        name: "search_tee_times",
        arguments: {
          course: "overland",
          date: "2026-04-15",
          players: 2,
          time_preference: "morning",
        },
      });
      assert.ok(!result.isError);
    });

    it("book_tee_time returns confirmation", async () => {
      const result = await client.callTool({
        name: "book_tee_time",
        arguments: {
          course: "city-park",
          date: "2026-04-15",
          time: "8:00 AM",
          players: 4,
          player_info: {
            first_name: "Test",
            last_name: "User",
            email: "test@example.com",
            phone: "303-555-0000",
          },
          credit_card: {
            number: "4111111111111111",
            expiry_month: "12",
            expiry_year: "2027",
            cvv: "123",
            zip: "80202",
          },
        },
      });
      assert.ok(!result.isError);
      const content = result.content as Array<{ type: string; text: string }>;
      const data = JSON.parse(content[0].text);
      assert.equal(data.success, true);
      assert.ok(data.confirmation);
    });
  });

  // ---- tools/call - validation failures ----

  describe("tools/call - validation failures", () => {
    it("search_tee_times rejects invalid course", async () => {
      const result = await client.callTool({
        name: "search_tee_times",
        arguments: { course: "nonexistent", date: "2026-04-15" },
      });
      assert.ok(result.isError);
    });

    it("search_tee_times rejects malformed date", async () => {
      const result = await client.callTool({
        name: "search_tee_times",
        arguments: { course: "city-park", date: "not-a-date" },
      });
      assert.ok(result.isError);
    });

    it("search_tee_times rejects out-of-range players", async () => {
      const result = await client.callTool({
        name: "search_tee_times",
        arguments: { course: "city-park", date: "2026-04-15", players: 10 },
      });
      assert.ok(result.isError);
    });

    it("book_tee_time rejects missing required fields", async () => {
      const result = await client.callTool({
        name: "book_tee_time",
        arguments: { course: "city-park" },
      });
      assert.ok(result.isError);
    });

    it("book_tee_time rejects invalid email", async () => {
      const result = await client.callTool({
        name: "book_tee_time",
        arguments: {
          course: "city-park",
          date: "2026-04-15",
          time: "8:00 AM",
          players: 4,
          player_info: {
            first_name: "Test",
            last_name: "User",
            email: "not-an-email",
            phone: "303-555-0000",
          },
          credit_card: {
            number: "4111111111111111",
            expiry_month: "12",
            expiry_year: "2027",
            cvv: "123",
            zip: "80202",
          },
        },
      });
      assert.ok(result.isError);
    });

    it("unknown tool returns error", async () => {
      const result = await client.callTool({
        name: "nonexistent_tool",
        arguments: {},
      });
      assert.ok(result.isError);
    });
  });
});
