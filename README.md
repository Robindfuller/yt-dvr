# Youtube Channel DVR

A Node.js web application for managing YouTube channel downloads with MeTube integration.

## Features

- **Dashboard**: Overview page (placeholder for future features)
- **Channels**: Channel management (placeholder for future features)
- **Videos**: Video management (placeholder for future features)
- **Settings**: MeTube configuration with SQLite persistence
- **Mobile-first design**: Responsive layout that works on all devices
- **SQLite database**: Local data storage for settings

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Install and configure MeTube for video downloads:
   ```bash
   # Using Docker (recommended):
   docker run -d \
     --name metube \
     -p 8081:8081 \
     -v /path/to/downloads:/downloads \
     alexta69/metube
   
   # Or using Docker Compose:
   # Create docker-compose.yml with:
   # version: '3'
   # services:
   #   metube:
   #     image: alexta69/metube
   #     ports:
   #       - "8081:8081"
   #     volumes:
   #       - ./downloads:/downloads
   ```
4. Verify MeTube is running:
   ```bash
   node test-metube.js
   ```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Pages

### Dashboard (`/dashboard`)
- Main overview page
- Currently shows placeholder content

### Channels (`/channels`)
- Channel management interface
- Currently shows placeholder content

### Videos (`/videos`)
- Video management interface
- Lists all videos from subscribed channels
- Sorted by release date (newest first)
- Paginated display with thumbnails and metadata
- **Download functionality** using MeTube for best quality

### Settings (`/settings`)
- Configure MeTube connection settings:
  - **MeTube URL**: MeTube server URL (default: http://localhost:8081)
  - **Download Folder**: Path for downloads (default: ./downloads)

## Database

The application uses SQLite for data persistence:
- Database file: `youtube_dvr.db`
- Settings table stores MeTube configuration
- Data is automatically loaded and saved when editing settings

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite3
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Styling**: Mobile-first responsive design with CSS Grid/Flexbox

## Project Structure

```
youtube-channel-watcher/
├── server.js              # Express server and API routes
├── package.json           # Dependencies and scripts
├── youtube_dvr.db         # SQLite database (created automatically)
├── public/                # Static files
│   ├── index.html         # Redirect to dashboard
│   ├── dashboard.html     # Dashboard page
│   ├── channels.html      # Channels page
│   ├── videos.html        # Videos page
│   ├── settings.html      # Settings page with form
│   └── styles.css         # Mobile-first CSS styles
└── README.md              # This file
```

## API Endpoints

- `GET /api/settings` - Retrieve current settings
- `POST /api/settings` - Update settings
- `GET /api/channels` - Get paginated channels list
- `POST /api/channels` - Add new channel
- `DELETE /api/channels/:id` - Delete channel
- `POST /api/channels/:id/check-videos` - Check for new videos from RSS feed
- `GET /api/videos` - Get paginated videos list
- `POST /api/videos/:id/download` - Send download request to MeTube

## Future Enhancements

- YouTube API integration
- Channel subscription management
- Video download queue
- Download progress tracking
- Video metadata management
- Search and filtering capabilities

## License

MIT License
