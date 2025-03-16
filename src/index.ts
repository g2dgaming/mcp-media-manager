#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';

interface Config {
  radarr: {
    url: string;
    apiKey: string;
  };
  sonarr: {
    url: string;
    apiKey: string;
  };
}

// This would typically be loaded from a config file
const config: Config = {
  radarr: {
    url: process.env.RADARR_URL || 'http://localhost:7878',
    apiKey: process.env.RADARR_API_KEY || '',
  },
  sonarr: {
    url: process.env.SONARR_URL || 'http://localhost:8989',
    apiKey: process.env.SONARR_API_KEY || '',
  },
};

const server = new Server(
  {
    name: "Media Server MCP",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// Helper functions for API calls
async function getRadarrMovies(filters?: { year?: number; genre?: string }) {
  try {
    const response = await axios.get(`${config.radarr.url}/api/v3/movie`, {
      headers: { 'X-Api-Key': config.radarr.apiKey },
    });
    let movies = response.data;

    if (filters) {
      if (filters.year) {
        movies = movies.filter((m: any) => m.year === filters.year);
      }
      if (filters.genre) {
        movies = movies.filter((m: any) => 
          m.genres.some((g: string) => g.toLowerCase() === filters.genre?.toLowerCase())
        );
      }
    }

    return movies;
  } catch (error) {
    console.error('Error fetching Radarr movies:', error);
    throw error;
  }
}

async function getSonarrSeries(filters?: { year?: number; genre?: string }) {
  try {
    const response = await axios.get(`${config.sonarr.url}/api/v3/series`, {
      headers: { 'X-Api-Key': config.sonarr.apiKey },
    });
    let series = response.data;

    if (filters) {
      if (filters.year) {
        series = series.filter((s: any) => s.year === filters.year);
      }
      if (filters.genre) {
        series = series.filter((s: any) => 
          s.genres.some((g: string) => g.toLowerCase() === filters.genre?.toLowerCase())
        );
      }
    }

    return series;
  } catch (error) {
    console.error('Error fetching Sonarr series:', error);
    throw error;
  }
}

// New helper functions for system management
async function getRadarrSystemStatus() {
  try {
    const [system, diskSpace, health] = await Promise.all([
      axios.get(`${config.radarr.url}/api/v3/system/status`, {
        headers: { 'X-Api-Key': config.radarr.apiKey },
      }),
      axios.get(`${config.radarr.url}/api/v3/diskspace`, {
        headers: { 'X-Api-Key': config.radarr.apiKey },
      }),
      axios.get(`${config.radarr.url}/api/v3/health`, {
        headers: { 'X-Api-Key': config.radarr.apiKey },
      })
    ]);

    return {
      system: system.data,
      diskSpace: diskSpace.data,
      health: health.data
    };
  } catch (error) {
    console.error('Error fetching Radarr system status:', error);
    throw error;
  }
}

async function getSonarrSystemStatus() {
  try {
    const [system, diskSpace, health] = await Promise.all([
      axios.get(`${config.sonarr.url}/api/v3/system/status`, {
        headers: { 'X-Api-Key': config.sonarr.apiKey },
      }),
      axios.get(`${config.sonarr.url}/api/v3/diskspace`, {
        headers: { 'X-Api-Key': config.sonarr.apiKey },
      }),
      axios.get(`${config.sonarr.url}/api/v3/health`, {
        headers: { 'X-Api-Key': config.sonarr.apiKey },
      })
    ]);

    return {
      system: system.data,
      diskSpace: diskSpace.data,
      health: health.data
    };
  } catch (error) {
    console.error('Error fetching Sonarr system status:', error);
    throw error;
  }
}

// List available resources (movies and TV shows)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const [movies, series] = await Promise.all([
    getRadarrMovies(),
    getSonarrSeries(),
  ]);

  const resources = [
    ...movies.map((movie: any) => ({
      uri: `radarr://movie/${movie.id}`,
      mimeType: "application/json",
      name: movie.title,
      description: `${movie.year} - ${movie.status}`,
    })),
    ...series.map((show: any) => ({
      uri: `sonarr://series/${show.id}`,
      mimeType: "application/json",
      name: show.title,
      description: `${show.year} - ${show.status}`,
    })),
  ];

  return { resources };
});

// Read specific resource details
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const [type, mediaType, id] = url.pathname.split('/').filter(Boolean);
  
  let content;
  if (type === 'radarr' && mediaType === 'movie') {
    const response = await axios.get(`${config.radarr.url}/api/v3/movie/${id}`, {
      headers: { 'X-Api-Key': config.radarr.apiKey },
    });
    content = response.data;
  } else if (type === 'sonarr' && mediaType === 'series') {
    const response = await axios.get(`${config.sonarr.url}/api/v3/series/${id}`, {
      headers: { 'X-Api-Key': config.sonarr.apiKey },
    });
    content = response.data;
  } else {
    throw new Error(`Invalid resource type: ${type}`);
  }

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "application/json",
      text: JSON.stringify(content, null, 2)
    }]
  };
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_media",
        description: "Search for movies or TV shows with filters",
        inputSchema: {
          type: "object",
          properties: {
            mediaType: {
              type: "string",
              enum: ["movie", "series"],
              description: "Type of media to search for"
            },
            year: {
              type: "number",
              description: "Filter by year"
            },
            genre: {
              type: "string",
              description: "Filter by genre"
            }
          },
          required: ["mediaType"]
        }
      },
      {
        name: "request_download",
        description: "Request a download for a movie or TV show",
        inputSchema: {
          type: "object",
          properties: {
            mediaType: {
              type: "string",
              enum: ["movie", "series"],
              description: "Type of media to download"
            },
            id: {
              type: "number",
              description: "ID of the media to download"
            }
          },
          required: ["mediaType", "id"]
        }
      },
      {
        name: "check_status",
        description: "Check the status of a movie or TV show",
        inputSchema: {
          type: "object",
          properties: {
            mediaType: {
              type: "string",
              enum: ["movie", "series"],
              description: "Type of media to check"
            },
            id: {
              type: "number",
              description: "ID of the media to check"
            }
          },
          required: ["mediaType", "id"]
        }
      },
      {
        name: "get_system_status",
        description: "Get system health and storage information",
        inputSchema: {
          type: "object",
          properties: {
            system: {
              type: "string",
              enum: ["radarr", "sonarr", "both"],
              description: "Which system to check"
            }
          },
          required: ["system"]
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "search_media": {
      const { mediaType, year, genre } = request.params.arguments as any;
      const filters = { year, genre };
      
      const results = mediaType === "movie" 
        ? await getRadarrMovies(filters)
        : await getSonarrSeries(filters);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(results, null, 2)
        }]
      };
    }

    case "request_download": {
      const { mediaType, id } = request.params.arguments as any;
      
      if (mediaType === "movie") {
        await axios.post(
          `${config.radarr.url}/api/v3/command/MoviesSearch`,
          { movieIds: [id] },
          { headers: { 'X-Api-Key': config.radarr.apiKey } }
        );
      } else {
        await axios.post(
          `${config.sonarr.url}/api/v3/command/SeriesSearch`,
          { seriesId: id },
          { headers: { 'X-Api-Key': config.sonarr.apiKey } }
        );
      }

      return {
        content: [{
          type: "text",
          text: `Download requested for ${mediaType} with ID ${id}`
        }]
      };
    }

    case "check_status": {
      const { mediaType, id } = request.params.arguments as any;
      
      let status;
      if (mediaType === "movie") {
        const response = await axios.get(
          `${config.radarr.url}/api/v3/movie/${id}`,
          { headers: { 'X-Api-Key': config.radarr.apiKey } }
        );
        status = {
          monitored: response.data.monitored,
          status: response.data.status,
          downloaded: response.data.downloaded,
          hasFile: response.data.hasFile,
        };
      } else {
        const response = await axios.get(
          `${config.sonarr.url}/api/v3/series/${id}`,
          { headers: { 'X-Api-Key': config.sonarr.apiKey } }
        );
        status = {
          monitored: response.data.monitored,
          status: response.data.status,
          percentOfEpisodes: response.data.statistics.percentOfEpisodes,
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(status, null, 2)
        }]
      };
    }

    case "get_system_status": {
      const { system } = request.params.arguments as any;
      let status: any = {};

      if (system === "radarr" || system === "both") {
        status.radarr = await getRadarrSystemStatus();
      }
      
      if (system === "sonarr" || system === "both") {
        status.sonarr = await getSonarrSystemStatus();
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(status, null, 2)
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
