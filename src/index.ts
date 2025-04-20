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

type FilterOptions = {
  year?: number;
  genre?: string;
  title?: string;
  limit?: number;
};

// 🔧 Reusable filter logic
function applyFilters<T extends { year?: number; genres?: string[] }>(
  items: T[],
  filters?: FilterOptions
): T[] {
  if (!filters) return items;

  let result = [...items];

  if (filters.year) {
    result = result.filter(item => item.year === filters.year);
  }

  if (filters.genre) {
    result = result.filter(item =>
      item.genres?.some(g => g.toLowerCase() === filters.genre?.toLowerCase())
    );
  }

  if (filters.limit && result.length > filters.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

// 🎯 Reduce Radarr movie fields for AI consumption
function reduceMovieData(movie: any) {
  return {
    id:movie.id,
    title: movie.title,
    originalTitle: movie.originalTitle,
    year: movie.year,
    runtime: movie.runtime,
    status: movie.status,
    monitored: movie.monitored,
    isAvailable: movie.isAvailable,
    genres: movie.genres,
    studio: movie.studio,
    overview: movie.overview,
    certification: movie.certification,
    releaseDate: movie.releaseDate,
    tmdbId: movie.tmdbId,
    popularity: movie.popularity,
  };
}

// 📺 Reduce Sonarr series fields for AI consumption
function reduceSeriesData(series: any) {
  return {
    title: series.title,
    id:series.id,
    originalTitle: series.originalTitle,
    year: series.year,
    runtime: series.runtime,
    status: series.status,
    monitored: series.monitored,
    isAvailable: series.isAvailable,
    genres: series.genres,
    studio: series.studio,
    overview: series.overview,
    certification: series.certification,
    releaseDate: series.firstAired,
    tvdbId: series.tvdbId,
    popularity: series.popularity,
  };
}

// 🎬 Get movies from Radarr
export async function getRadarrMovies(filters?: FilterOptions) {
  try {
    const endpoint = filters?.title ? '/api/v3/movie/lookup' : '/api/v3/movie';
    const response = await axios.get(`${config.radarr.url}${endpoint}`, {
      headers: { 'X-Api-Key': config.radarr.apiKey },
      params: filters?.title ? { term: filters.title } : undefined,
    });

    return applyFilters(response.data, filters).map(reduceMovieData);
  } catch (error) {
    console.error('Error fetching Radarr movies:', error);
    throw error;
  }
}

// 📺 Get series from Sonarr
export async function getSonarrSeries(filters?: FilterOptions) {
  try {
    const endpoint = filters?.title ? '/api/v3/series/lookup' : '/api/v3/series';
    const response = await axios.get(`${config.sonarr.url}${endpoint}`, {
      headers: { 'X-Api-Key': config.sonarr.apiKey },
      params: filters?.title ? { term: filters.title } : undefined,
    });

    return applyFilters(response.data, filters).map(reduceSeriesData);
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
  const type = url.protocol.replace(':', '');
  const response = url.pathname.split('/').filter(Boolean);
  const id = url.pathname.split('/').filter(Boolean);
  const mediaType=url.hostname;
  let content;
  if (type == "radarr" && mediaType === 'movie') {
    const response = await axios.get(`${config.radarr.url}/api/v3/movie/${id}`, {
      headers: { 'X-Api-Key': config.radarr.apiKey },
    });
    content = response.data;
  } else if ( type == "sonarr" && mediaType === 'series') {
    const response = await axios.get(`${config.sonarr.url}/api/v3/series/${id}`, {
      headers: { 'X-Api-Key': config.sonarr.apiKey },
    });
    content = response.data;
  } else {
    throw new Error(`Invalid resource type ${type} mediaType :  ${mediaType} id ${id}`);
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
              description: "Type of media to search for: 'movie' or 'series'"
            },
            year: {
              type: "number",
              description: "Release year of the media. Helps narrow down the search."
            },
            genre: {
              type: "string",
              description: "Genre of the media (e.g., 'action', 'drama', 'comedy'). Helps filter results."
            },
            title: {
              type: "string",
              description: "Optional title or partial title to search for a specific media."
            },
            limit: {
              type: "number",
              description: "Maximum number of results to return."
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
              description: "Type of media to download('series','movie')",
            },
            tmdbId: {
              type: "number",
              description: "TMDB id of the movie/series to download"
            },
            tvdbId: {
              type: "number",
              description: "TVDB id of the movie/series to download"
            }
          },
          required: ["mediaType"]
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
      },
      {
        name: "get_activity",
        description: "Get the current download queue of Radarr or Sonarr, including ongoing downloads or pending activity.",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              enum: ["radarr", "sonarr"],
              description: "Which service to check activity 'radarr' for movies , 'sonarr' for series"
            }
          },
          required: ["service"]
        }
      },
      {
        name: "get_wanted",
        description: "List missing (wanted) movies or TV series",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              enum: ["radarr", "sonarr"],
              description: "Which system to get wanted media from"
            }
          },
          required: ["service"]
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "search_media": {
    const { mediaType, year, genre, title,limit } = request.params.arguments as any;
    const filters = { year, genre, title,limit };
    if(!filters.limit){
      filters.limit=10;
    }
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
    case "get_wanted":{
            const { service } = request.params.arguments as any;
            const endpoint = service === "radarr"
      ? `${config.radarr.url}/api/v3/wanted/missing`
      : `${config.sonarr.url}/api/v3/wanted/missing`;
    if(service != "radarr" && service != "sonarr")
    {
      throw new Error("Service can either be 'sonarr' or 'radarr'");
    }
    const apiKey = service === "radarr"
      ? config.radarr.apiKey
      : config.sonarr.apiKey;

    const response = await axios.get(endpoint, {
      headers: { 'X-Api-Key': apiKey }
    });

    const missingItems = response.data.records;

    if (missingItems.length === 0) {
      return {
        content: [{
          type: "text",
          text: `🎉 No wanted (missing) ${service === "radarr" ? "movies" : "episodes"}!`
        }]
      };
    }


    return {
      content: [{
        type: "text",
        text: `🧾 Wanted list from ${service}:\n`+ JSON.stringify(missingItems)
      }]
    };

    }
    case "request_download": {
      const { mediaType, tvdbId,tmdbId } = request.params.arguments as any;

      if (mediaType === "movie") {
        if(!tmdbId){
          throw new Error("tmdbId is required to download movie")
        }
        var response=await axios.post(
          `${config.radarr.url}/api/v3/movie`,
          {
            "tmdbId": tmdbId,
            "rootFolderPath": "/movies",
            "qualityProfileId": 4,
            "monitored": true,
            "addOptions": {
                "searchForMovie": true
            },
            "minimumAvailability": "released"
         },
          { headers: { 'X-Api-Key': config.radarr.apiKey } }
        );
      } else {
        if(!tvdbId){
          throw new Error("tvdbId is required to download series");
        }
        var response=await axios.post(
          `${config.sonarr.url}/api/v3/series`,
{
            "tvdbId": tvdbId,
            "rootFolderPath": "/tv",
            "qualityProfileId": 4,
            "monitored": true,
            "addOptions": {
                "searchForMovie": true
            },
            "minimumAvailability": "released"
         },
            { headers: { 'X-Api-Key': config.sonarr.apiKey } }
        );
      }

      return {
        content: [{
          type: "text",
          text: `Download requested for ${mediaType}.`
        }]
      };
    }

    case "get_activity": {
        const { service } = request.params.arguments as any;

          let queueResponse;

          if (service === "radarr") {
            queueResponse = await axios.get(
              `${config.radarr.url}/api/v3/queue`,
              {
                headers: { 'X-Api-Key': config.radarr.apiKey }
              }
            );
          } else if (service == "sonarr"){
            queueResponse = await axios.get(
              `${config.sonarr.url}/api/v3/queue`,
              {
                headers: { 'X-Api-Key': config.sonarr.apiKey }
              }
            );
          }
          else {
              throw new Error("Service can either be 'sonarr' or 'radarr'");
          }

          const queue = queueResponse.data.records;
          if (!Array.isArray(queue) || queue.length === 0) {
            return {
              content: [{
                type: "text",
                text: `No active downloads in ${service}.`
              }]
            };
          }

          const summary = queue.map(item => {
            const progress = item.size > 0
              ? `${((item.sizeleft / item.size) * 100).toFixed(1)}% remaining`
              : "Progress unknown";

            return {progress:progress,...item}
          });

          return {
            content: [{
              type: "text",
              text: `Current ${service} activity:\n` + JSON.stringify(summary)
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
