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
    status: movie.status,
    monitored: movie.monitored,
    isAvailable: movie.isAvailable,
    genres: movie.genres,
    studio: movie.studio,
    overview: movie.overview,
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
      headers: { 'X-Api-Key': config.radarr.apiKey } as any,
    });
    content = response.data;
  } else if ( type == "sonarr" && mediaType === 'series') {
    const response = await axios.get(`${config.sonarr.url}/api/v3/series/${id}`, {
      headers: { 'X-Api-Key': config.sonarr.apiKey } as any,
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
      "name": "check_status",
      "description": "Check the status of a movie or TV show. This function is intended to be used to retrieve the download or monitoring status of a specific media item from a media management system such as Radarr or Sonarr. IMPORTANT: This should only be called if the 'monitored' field for the media item is true, indicating that the user is actively tracking it. The function accepts multiple possible identifiers for flexibility—either the internal system ID (`id`), the TheMovieDB ID (`tmdbId`), or the TheTVDB ID (`tvdbId`). Only one of these identifiers needs to be provided. The media type must also be specified as either a movie or a series. This tool is useful for determining if a media item is downloaded, missing, queued, or has other relevant status updates in the media library.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "mediaType": {
            "type": "string",
            "enum": ["movie", "series"],
            "description": "Type of media to check, either 'movie' or 'series'."
          },
          "id": {
            "type": "number",
            "description": "Internal ID of the media as assigned by the media server (Radarr/Sonarr). Optional if 'tmdbId' or 'tvdbId' is provided."
          },
          "tmdbId": {
            "type": "number",
            "description": "TheMovieDB ID of the media. Optional if 'id' or 'tvdbId' is provided."
          },
          "tvdbId": {
            "type": "number",
            "description": "TheTVDB ID of the media. Optional if 'id' or 'tmdbId' is provided."
          }
        },
        "required": ["mediaType"],
        "oneOf": [
          { "required": ["id"] },
          { "required": ["tmdbId"] },
          { "required": ["tvdbId"] }
        ]
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
      headers: { 'X-Api-Key': apiKey } as any
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
      const args = request.params.arguments as any;
      try {
        if (args?.tmdbId) {
          // Check if movie already exists in library
          const existingMoviesRes = await axios.get(
            `${config.radarr.url}/api/v3/movie`,
            { headers: { 'X-Api-Key': config.radarr.apiKey } }
          );

          const existingMovie = existingMoviesRes.data.find((m: any) => m.tmdbId === args.tmdbId);

          if (existingMovie) {
            if (existingMovie.hasFile) {
              return {
                content: [{
                  type: "text",
                  text: `✅ Movie already exists in your library and is downloaded.`,
                }]
              };
            } else {
              return {
                content: [{
                  type: "text",
                  text: `⏳ Movie is already in the library and may be downloading.`,
                }]
              };
            }
          }

          // Proceed to add movie if not already there
          await axios.post(
            `${config.radarr.url}/api/v3/movie`,
            {
              tmdbId: args.tmdbId,
              rootFolderPath: "/movies",
              qualityProfileId: 4,
              monitored: true,
              addOptions: {
                searchForMovie: true
              },
              minimumAvailability: "released"
            },
            { headers: { 'X-Api-Key': config.radarr.apiKey } }
          );

          return {
            content: [{
              type: "text",
              text: `🎬 Download request for movie (TMDB ID: ${args.tmdbId}) sent successfully.`
            }]
          };

        } else if (args?.tvdbId) {
          // Check if series already exists in library
          const existingSeriesRes = await axios.get(
            `${config.sonarr.url}/api/v3/series`,
            { headers: { 'X-Api-Key': config.sonarr.apiKey } }
          );

          const existingSeries = existingSeriesRes.data.find((s: any) => s.tvdbId === args.tvdbId);

          if (existingSeries) {
            return {
              content: [{
                type: "text",
                text: `✅ Series already exists in your library.`,
              }]
            };
          }

          // Proceed to add series if not already there
          await axios.post(
            `${config.sonarr.url}/api/v3/series`,
            {
              tvdbId: args.tvdbId,
              rootFolderPath: "/tv",
              qualityProfileId: 4,
              monitored: true,
            },
            { headers: { 'X-Api-Key': config.sonarr.apiKey } }
          );

          return {
            content: [{
              type: "text",
              text: `📺 Download request for series (TVDB ID: ${args.tvdbId}) sent successfully.`
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: "❌ Please provide a valid 'tmdbId' for movie or 'tvdbId' for series."
            }]
          };
        }
      } catch (err: any) {
        return {
          content: [{
            type: "text",
            text: `❌ An error occurred while requesting download: ${err?.response?.data?.message || err.message}`,
          }]
        };
      }
    }


    case "get_activity": {
        const { service } = request.params.arguments as any;

          let queueResponse;

          if (service === "radarr") {
            queueResponse = await axios.get(
              `${config.radarr.url}/api/v3/queue`,
              {
                headers: { 'X-Api-Key': config.radarr.apiKey }
              } as any
            );
          } else if (service == "sonarr"){
            queueResponse = await axios.get(
              `${config.sonarr.url}/api/v3/queue`,
              {
                headers: { 'X-Api-Key': config.sonarr.apiKey }
              } as any
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
      const { mediaType, id, tmdbId, tvdbId } = request.params.arguments as any;
      let status;

      try {
        if (mediaType === "movie") {
          let movie;

          if (id) {
            const res = await axios.get(
              `${config.radarr.url}/api/v3/movie/${id}`,
              { headers: { 'X-Api-Key': config.radarr.apiKey } }
            );
            movie = res.data;
          } else if (tmdbId) {
            const res = await axios.get(
              `${config.radarr.url}/api/v3/movie`,
              { headers: { 'X-Api-Key': config.radarr.apiKey } }
            );
            movie = res.data.find((m: any) => m.tmdbId === tmdbId);

            if (!movie) {
              return {
                content: [{
                  type: "text",
                  text: `❌ No movie found in your library with TMDB ID ${tmdbId}.`,
                }]
              };
            }
          } else {
            return {
              content: [{
                type: "text",
                text: "❌ Please provide either 'id' or 'tmdbId' to check movie status.",
              }]
            };
          }

          status = {
            monitored: movie.monitored,
            status: movie.status,
            hasFile: movie.hasFile,
            in_queue: false,
            queue: {},
          };

          if (!movie.hasFile) {
            let page = 1;
            const pageSize = 100;
            let totalRecords = 0;
            let found = false;

            do {
              const queueRes = await axios.get(
                `${config.radarr.url}/api/v3/queue?page=${page}&pageSize=${pageSize}`,
                { headers: { 'X-Api-Key': config.radarr.apiKey } }
              );

              const { records, totalRecords: total } = queueRes.data;
              totalRecords = total;

              const match = records.find((item: any) => item?.movieId === movie.id);
              if (match) {
                found = true;
                status.in_queue = true;
                status.queue = {
                  timeLeft: match.timeleft,
                  size: match.size,
                  sizeLeft: match.sizeleft,
                  status: match.status,
                  title: match.title,
                  downloadProgress: match.size > 0
                    ? ((match.size - match.sizeleft) / match.size * 100).toFixed(2) + '%'
                    : '0%',
                };
                break;
              }

              page++;
            } while ((page - 1) * pageSize < totalRecords && !found);
          }
          else{
            //File exists
            status.size=movie.size;
            status.added=movie.added;
            status.ratings=movie.ratings;
          }

        } else if (mediaType === "series") {
          let series;

          if (id) {
            const res = await axios.get(
              `${config.sonarr.url}/api/v3/series/${id}`,
              { headers: { 'X-Api-Key': config.sonarr.apiKey } }
            );
            series = res.data;
          } else if (tvdbId) {
            const res = await axios.get(
              `${config.sonarr.url}/api/v3/series`,
              { headers: { 'X-Api-Key': config.sonarr.apiKey } }
            );
            series = res.data.find((s: any) => s.tvdbId === tvdbId);

            if (!series) {
              return {
                content: [{
                  type: "text",
                  text: `❌ No series found in your library with TVDB ID ${tvdbId}.`,
                }]
              };
            }
          } else {
            return {
              content: [{
                type: "text",
                text: "❌ Please provide either 'id' or 'tvdbId' to check series status.",
              }]
            };
          }

          status = {
            monitored: series.monitored,
            status: series.status,
            percentOfEpisodes: series.statistics?.percentOfEpisodes ?? null,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(status, null, 2),
          }]
        };

      } catch (err: any) {
        return {
          content: [{
            type: "text",
            text: `❌ An error occurred while checking status: ${err?.response?.data?.message || err.message}`,
          }]
        };
      }
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
