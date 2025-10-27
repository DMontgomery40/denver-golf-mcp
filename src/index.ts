#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Golf course data for Denver area
interface GolfCourse {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  holes: number;
  par: number;
  yardage: number;
  type: "public" | "private" | "semi-private";
  rating: number;
  slope: number;
  description: string;
  amenities: string[];
  website?: string;
}

const golfCourses: GolfCourse[] = [
  {
    id: "arrowhead",
    name: "Arrowhead Golf Club",
    address: "10850 W Sundown Trail",
    city: "Littleton",
    phone: "(303) 973-9614",
    holes: 18,
    par: 72,
    yardage: 6682,
    type: "public",
    rating: 72.1,
    slope: 137,
    description: "Dramatic mountain course carved through red rock formations with stunning views of the Front Range.",
    amenities: ["Pro Shop", "Driving Range", "Restaurant", "Practice Green"],
    website: "https://www.arrowheadcolorado.com"
  },
  {
    id: "fossil-trace",
    name: "Fossil Trace Golf Club",
    address: "3050 Illinois St",
    city: "Golden",
    phone: "(303) 277-8750",
    holes: 18,
    par: 72,
    yardage: 6831,
    type: "public",
    rating: 72.6,
    slope: 136,
    description: "Award-winning course built in a former clay mine featuring unique geological features and fossil sites.",
    amenities: ["Pro Shop", "Driving Range", "Restaurant", "Practice Green", "Clubhouse"],
    website: "https://www.fossiltrace.com"
  },
  {
    id: "city-park",
    name: "City Park Golf Course",
    address: "2500 York St",
    city: "Denver",
    phone: "(720) 865-0790",
    holes: 18,
    par: 72,
    yardage: 6656,
    type: "public",
    rating: 71.3,
    slope: 125,
    description: "Denver's oldest municipal golf course with mature trees and challenging layout in the heart of the city.",
    amenities: ["Pro Shop", "Driving Range", "Snack Bar", "Practice Green"]
  },
  {
    id: "kennedy",
    name: "Kennedy Golf Course",
    address: "10500 E Hampden Ave",
    city: "Aurora",
    phone: "(303) 755-0105",
    holes: 27,
    par: 72,
    yardage: 7003,
    type: "public",
    rating: 73.4,
    slope: 132,
    description: "Championship 27-hole facility that has hosted numerous professional events.",
    amenities: ["Pro Shop", "Driving Range", "Restaurant", "Practice Green", "Banquet Facilities"]
  },
  {
    id: "highlands-ranch",
    name: "Highlands Ranch Golf Club",
    address: "9800 S Broadway",
    city: "Highlands Ranch",
    phone: "(303) 471-0965",
    holes: 18,
    par: 72,
    yardage: 6700,
    type: "semi-private",
    rating: 71.8,
    slope: 130,
    description: "Well-maintained course with rolling hills and scenic mountain views.",
    amenities: ["Pro Shop", "Driving Range", "Restaurant", "Practice Green", "Pool"]
  },
  {
    id: "bear-creek",
    name: "Bear Creek Golf Club",
    address: "19420 W Dartmouth Pl",
    city: "Morrison",
    phone: "(303) 697-5610",
    holes: 18,
    par: 72,
    yardage: 6817,
    type: "public",
    rating: 72.5,
    slope: 135,
    description: "Challenging mountain course with wildlife, elevation changes, and beautiful scenery.",
    amenities: ["Pro Shop", "Driving Range", "Restaurant", "Practice Green"]
  }
];

// Create server instance
const server = new Server(
  {
    name: "denver-golf-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available resources (golf courses)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: golfCourses.map(course => ({
      uri: `golf://denver/${course.id}`,
      mimeType: "application/json",
      name: course.name,
      description: `Information about ${course.name} in ${course.city}`
    }))
  };
});

// Read specific resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri.toString();
  const courseId = uri.replace("golf://denver/", "");

  const course = golfCourses.find(c => c.id === courseId);

  if (!course) {
    throw new Error(`Golf course not found: ${courseId}`);
  }

  return {
    contents: [
      {
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(course, null, 2)
      }
    ]
  };
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_golf_courses",
        description: "Search for golf courses in the Denver area by various criteria",
        inputSchema: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "Filter by city (e.g., Denver, Aurora, Littleton)"
            },
            type: {
              type: "string",
              enum: ["public", "private", "semi-private"],
              description: "Filter by course type"
            },
            min_rating: {
              type: "number",
              description: "Minimum course rating"
            },
            max_rating: {
              type: "number",
              description: "Maximum course rating"
            }
          }
        }
      },
      {
        name: "get_course_details",
        description: "Get detailed information about a specific golf course",
        inputSchema: {
          type: "object",
          properties: {
            course_id: {
              type: "string",
              description: "The ID of the golf course"
            }
          },
          required: ["course_id"]
        }
      },
      {
        name: "compare_courses",
        description: "Compare two or more golf courses",
        inputSchema: {
          type: "object",
          properties: {
            course_ids: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Array of course IDs to compare"
            }
          },
          required: ["course_ids"]
        }
      },
      {
        name: "list_all_courses",
        description: "List all available golf courses in the Denver area",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "search_golf_courses": {
      let results = [...golfCourses];
      const searchArgs = args as any;

      if (searchArgs?.city) {
        results = results.filter(c =>
          c.city.toLowerCase().includes((searchArgs.city as string).toLowerCase())
        );
      }

      if (searchArgs?.type) {
        results = results.filter(c => c.type === searchArgs.type);
      }

      if (searchArgs?.min_rating !== undefined) {
        results = results.filter(c => c.rating >= (searchArgs.min_rating as number));
      }

      if (searchArgs?.max_rating !== undefined) {
        results = results.filter(c => c.rating <= (searchArgs.max_rating as number));
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    }

    case "get_course_details": {
      const detailArgs = args as any;
      const course = golfCourses.find(c => c.id === detailArgs?.course_id);

      if (!course) {
        return {
          content: [
            {
              type: "text",
              text: `Course not found: ${detailArgs?.course_id}`
            }
          ],
          isError: true
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(course, null, 2)
          }
        ]
      };
    }

    case "compare_courses": {
      const compareArgs = args as any;
      const courses = golfCourses.filter(c =>
        (compareArgs?.course_ids as string[])?.includes(c.id)
      );

      if (courses.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No courses found with the provided IDs"
            }
          ],
          isError: true
        };
      }

      const comparison = {
        courses: courses.map(c => ({
          name: c.name,
          city: c.city,
          type: c.type,
          holes: c.holes,
          par: c.par,
          yardage: c.yardage,
          rating: c.rating,
          slope: c.slope
        }))
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(comparison, null, 2)
          }
        ]
      };
    }

    case "list_all_courses": {
      const courseList = golfCourses.map(c => ({
        id: c.id,
        name: c.name,
        city: c.city,
        type: c.type,
        holes: c.holes
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(courseList, null, 2)
          }
        ]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Denver Golf MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
