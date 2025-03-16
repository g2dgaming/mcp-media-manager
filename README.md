# MCParr Server

An MCP server that integrates with Radarr and Sonarr to manage your media library.

## Features

Current Features:
- Browse your movie and TV show library
- Search and filter media by year and genre
- Request downloads for movies and TV shows
- Check download and monitoring status
- System health monitoring and management
  - Disk space monitoring
  - System health checks
  - Status reporting

## Installation

### Local Installation

1. Install dependencies:
```bash
pnpm install
```

### Global Installation

To install MCParr Server globally on your system:

```bash
pnpm run install-global
```

This will make the `mcparr` command available globally in your terminal.

## Configuration

1. Set up environment variables:
```bash
export RADARR_URL=http://your-radarr-instance:7878
export RADARR_API_KEY=your-radarr-api-key
export SONARR_URL=http://your-sonarr-instance:8989
export SONARR_API_KEY=your-sonarr-api-key
```

Alternatively, you can create a `.env` file in your project directory with these variables.

## Usage

### Running Locally

Build and run the server:
```bash
pnpm run build
pnpm start
```

For development:
```bash
pnpm run dev
```

### Running Globally

If installed globally, simply run:
```bash
mcparr
```

## API Reference

### search_media
Search for movies or TV shows with filters:
```typescript
{
  mediaType: "movie" | "series",  // Required
  year?: number,                  // Optional
  genre?: string                  // Optional
}
```

### request_download
Request a download for specific media:
```typescript
{
  mediaType: "movie" | "series",  // Required
  id: number                      // Required
}
```

### check_status
Check the status of specific media:
```typescript
{
  mediaType: "movie" | "series",  // Required
  id: number                      // Required
}
```

### get_system_status
Get system health and storage information:
```typescript
{
  system: "radarr" | "sonarr" | "both"  // Required - Which system to check
}
```

Response includes:
- System status (version, uptime, etc.)
- Disk space information
- Health check results

## Resources

Media is exposed as resources with the following URI schemes:
- Movies: `radarr://movie/{id}`
- TV Shows: `sonarr://series/{id}`

Each resource includes:
- Title
- Year
- Current status
