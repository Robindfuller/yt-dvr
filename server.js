const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const https = require('https');
const xml2js = require('xml2js');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./youtube_dvr.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

function initDatabase() {
  // Create settings table
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aria2c_ip TEXT DEFAULT 'localhost',
    aria2c_port TEXT DEFAULT '6800',
    download_folder TEXT DEFAULT '/downloads',
    username TEXT DEFAULT '',
    password TEXT DEFAULT '',
    metube_url TEXT DEFAULT 'http://localhost:8081',
    filter_shorts INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating settings table:', err.message);
    } else {
      // Insert default settings if table is empty
      db.get("SELECT COUNT(*) as count FROM settings", (err, row) => {
        if (err) {
          console.error('Error checking settings:', err.message);
        } else if (row.count === 0) {
          db.run(`INSERT INTO settings (aria2c_ip, aria2c_port, download_folder, username, password, metube_url, filter_shorts) 
                  VALUES ('localhost', '6800', '/downloads', '', '', 'http://localhost:8081', 1)`);
        }
      });
      
      // Add filter_shorts column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE settings ADD COLUMN filter_shorts INTEGER DEFAULT 1`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding filter_shorts column:', err.message);
        }
      });
    }
  });

  // Create channels table
  db.run(`CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating channels table:', err.message);
    }
  });

  // Create videos table
  db.run(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT UNIQUE NOT NULL,
    channel_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    published_at DATETIME NOT NULL,
    thumbnail_url TEXT,
    video_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    download_requested_at DATETIME,
    FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('Error creating videos table:', err.message);
    } else {
      // Add download_requested_at column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE videos ADD COLUMN download_requested_at DATETIME`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.error('Error adding download_requested_at column:', err.message);
        }
      });
    }
  });
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/channels', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'channels.html'));
});

app.get('/videos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'videos.html'));
});

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});



// API Routes
app.get('/api/settings', (req, res) => {
  db.get("SELECT * FROM settings ORDER BY id DESC LIMIT 1", (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(row || {});
    }
  });
});

app.post('/api/settings', (req, res) => {
  const { aria2c_ip, aria2c_port, download_folder, username, password, metube_url, filter_shorts } = req.body;
  
  // Use default values for backward compatibility
  const aria2c_ip_val = aria2c_ip || 'localhost';
  const aria2c_port_val = aria2c_port || '6800';
  const download_folder_val = download_folder || './downloads';
  const username_val = username || '';
  const password_val = password || '';
  const metube_url_val = metube_url || 'http://localhost:8081';
  const filter_shorts_val = filter_shorts ? 1 : 0;
  
  db.run(`UPDATE settings SET 
          aria2c_ip = ?, 
          aria2c_port = ?, 
          download_folder = ?, 
          username = ?, 
          password = ?,
          metube_url = ?,
          filter_shorts = ?,
          updated_at = CURRENT_TIMESTAMP
          WHERE id = (SELECT id FROM settings ORDER BY id DESC LIMIT 1)`,
    [aria2c_ip_val, aria2c_port_val, download_folder_val, username_val, password_val, metube_url_val, filter_shorts_val],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true, message: 'Settings updated successfully' });
      }
    }
  );
});

// Channel API Routes
app.post('/api/channels', (req, res) => {
  const { channel_id, name } = req.body;
  
  if (!channel_id || !name) {
    return res.status(400).json({ error: 'Channel ID and name are required' });
  }
  
  db.run(`INSERT INTO channels (channel_id, name) VALUES (?, ?)`,
    [channel_id, name],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          res.status(400).json({ error: 'Channel ID already exists' });
        } else {
          res.status(500).json({ error: err.message });
        }
      } else {
        res.json({ success: true, message: 'Channel added successfully', id: this.lastID });
      }
    }
  );
});

app.get('/api/channels', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  // Get total count
  db.get("SELECT COUNT(*) as total FROM channels", (err, countRow) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Get paginated channels
    db.all(`SELECT * FROM channels ORDER BY name ASC LIMIT ? OFFSET ?`,
      [limit, offset],
      (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          const total = countRow.total;
          const totalPages = Math.ceil(total / limit);
          
          res.json({
            channels: rows,
            pagination: {
              page,
              limit,
              total,
              totalPages,
              hasNext: page < totalPages,
              hasPrev: page > 1
            }
          });
        }
      }
    );
  });
});

app.delete('/api/channels/:id', (req, res) => {
  const { id } = req.params;
  
  db.run("DELETE FROM channels WHERE id = ?", [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Channel not found' });
    } else {
      res.json({ success: true, message: 'Channel deleted successfully' });
    }
  });
});

// Bulk import channels endpoint
app.post('/api/channels/bulk-import', (req, res) => {
  const { channels } = req.body;
  
  if (!channels || typeof channels !== 'string') {
    return res.status(400).json({ error: 'Channel data is required' });
  }
  
  // Parse the channel data
  const lines = channels.trim().split('\n');
  const channelData = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    const parts = trimmedLine.split(',');
    if (parts.length >= 3) {
      const channelId = parts[0].trim();
      const channelUrl = parts[1].trim();
      const channelName = parts[2].trim();
      
      // Validate channel ID format
      if (channelId.startsWith('UC') && channelId.length >= 24) {
        channelData.push({
          channel_id: channelId,
          name: channelName
        });
      }
    }
  }
  
  if (channelData.length === 0) {
    return res.status(400).json({ error: 'No valid channel data found' });
  }
  
  let addedCount = 0;
  let skippedCount = 0;
  let processedCount = 0;
  
  // Process each channel
  const processChannel = (index) => {
    if (index >= channelData.length) {
      // All channels processed
      res.json({
        success: true,
        message: `Bulk import completed`,
        added: addedCount,
        skipped: skippedCount,
        total: channelData.length
      });
      return;
    }
    
    const channel = channelData[index];
    
    db.run(`INSERT INTO channels (channel_id, name) VALUES (?, ?)`,
      [channel.channel_id, channel.name],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            skippedCount++;
          } else {
            console.error(`Error adding channel ${channel.channel_id}:`, err.message);
            skippedCount++;
          }
        } else {
          addedCount++;
        }
        
        // Process next channel
        processChannel(index + 1);
      }
    );
  };
  
  // Start processing
  processChannel(0);
});

// RSS and Video Functions
function fetchYouTubeRSS(channelId) {
  return new Promise((resolve, reject) => {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Function to detect if a video is a YouTube Short
function isYouTubeShorts(videoId, title, videoUrl) {
  // Check for common Shorts indicators
  const shortsIndicators = [
    // Title contains "shorts" or "#shorts"
    /#shorts\b/i,
    /\bshorts\b/i,
    // Video URL contains /shorts/
    /\/shorts\//i,
    // Some Shorts have specific title patterns
    /^shorts?:/i,
    /^#\d+$/i, // Just numbers with #
  ];
  
  // Check title for Shorts indicators
  if (title && shortsIndicators.some(pattern => pattern.test(title))) {
    return true;
  }
  
  // Check video URL for /shorts/ pattern
  if (videoUrl && videoUrl.includes('/shorts/')) {
    return true;
  }
  
  // Check for Shorts-specific video ID patterns (some Shorts have specific patterns)
  // This is less reliable but can catch some cases
  if (videoId && videoId.length === 11) {
    // Some Shorts have specific patterns in their IDs
    // This is a heuristic and may not catch all Shorts
    const shortsPatterns = [
      /^[A-Za-z0-9_-]{11}$/, // Standard video ID format
    ];
    
    // For now, we'll rely more on title and URL patterns
    // as video ID patterns for Shorts are not always reliable
  }
  
  return false;
}

function parseRSSFeed(xmlData, filterShorts = true) {
  return new Promise((resolve, reject) => {
    const parser = new xml2js.Parser();
    
    parser.parseString(xmlData, (err, result) => {
      if (err) {
        reject(err);
      } else {
        try {
          const videos = [];
          let shortsSkipped = 0;
          const entries = result.feed.entry || [];
          
          entries.forEach(entry => {
            const videoId = entry['yt:videoId'] ? entry['yt:videoId'][0] : null;
            const title = entry.title ? entry.title[0] : '';
            const description = entry.media && entry.media.group && entry.media.group[0].description ? 
                               entry.media.group[0].description[0] : '';
            const publishedAt = entry.published ? entry.published[0] : '';
            const videoUrl = entry.link ? entry.link[0].$.href : '';
            
            // Generate high-quality YouTube thumbnail URL
            const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
            
            if (videoId) {
              // Check if this is a Shorts video (only if filtering is enabled)
              if (filterShorts && isYouTubeShorts(videoId, title, videoUrl)) {
                console.log(`Skipping Shorts video: ${title} (${videoId})`);
                shortsSkipped++;
                return; // Skip this video
              }
              
              videos.push({
                video_id: videoId,
                title: title,
                description: description,
                published_at: publishedAt,
                thumbnail_url: thumbnailUrl,
                video_url: videoUrl
              });
            }
          });
          
          if (filterShorts && shortsSkipped > 0) {
            console.log(`Parsed ${videos.length} regular videos (${shortsSkipped} Shorts filtered out)`);
          } else {
            console.log(`Parsed ${videos.length} videos`);
          }
          resolve(videos);
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}

function saveVideosToDatabase(videos, channelId) {
  return new Promise((resolve, reject) => {
    let savedCount = 0;
    let skippedCount = 0;
    const newlyAddedVideos = [];
    
    videos.forEach((video, index) => {
      // Save ALL videos to database
      db.run(`INSERT OR IGNORE INTO videos (video_id, channel_id, title, description, published_at, thumbnail_url, video_url) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [video.video_id, channelId, video.title, video.description, video.published_at, video.thumbnail_url, video.video_url],
        function(err) {
          if (err) {
            console.error('Error saving video:', err);
          } else if (this.changes > 0) {
            savedCount++;
            // Add all newly saved videos to the auto-queue list
            newlyAddedVideos.push(video);
          } else {
            skippedCount++;
          }
          
          if (index === videos.length - 1) {
            resolve({ 
              saved: savedCount, 
              skipped: skippedCount, 
              newlyAddedVideos: newlyAddedVideos 
            });
          }
        }
      );
    });
  });
}

// Video API Routes
app.get('/api/videos', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  // Get total count
  db.get("SELECT COUNT(*) as total FROM videos", (err, countRow) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Get paginated videos with channel info
    db.all(`SELECT v.*, c.name as channel_name 
            FROM videos v 
            JOIN channels c ON v.channel_id = c.id 
            ORDER BY v.published_at DESC 
            LIMIT ? OFFSET ?`,
      [limit, offset],
      (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          const total = countRow.total;
          const totalPages = Math.ceil(total / limit);
          
          res.json({
            videos: rows,
            pagination: {
              page,
              limit,
              total,
              totalPages,
              hasNext: page < totalPages,
              hasPrev: page > 1
            }
          });
        }
      }
    );
  });
});

// Check for new videos endpoint
app.post('/api/channels/:id/check-videos', (req, res) => {
  const { id } = req.params;
  
  // Get channel info and settings
  db.get("SELECT channel_id, name FROM channels WHERE id = ?", [id], (err, channel) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // Get settings to check if Shorts filtering is enabled
    db.get("SELECT filter_shorts FROM settings ORDER BY id DESC LIMIT 1", (err, settings) => {
      if (err) {
        console.error('Error getting settings:', err.message);
        // Continue with default filtering enabled
      }
      
      const filterShorts = settings ? settings.filter_shorts !== 0 : true;
      
      // Fetch and parse RSS feed
      fetchYouTubeRSS(channel.channel_id)
        .then(xmlData => parseRSSFeed(xmlData, filterShorts))
        .then(videos => saveVideosToDatabase(videos, id))
        .then(result => {
          const filterMessage = filterShorts ? ' (Shorts filtered out)' : '';
          res.json({
            success: true,
            message: `Found ${result.saved + result.skipped} videos${filterMessage}. ${result.saved} new videos added, ${result.skipped} already existed.`,
            result: result
          });
        })
        .catch(error => {
          console.error('Error checking videos:', error);
          res.status(500).json({ error: 'Failed to check for new videos: ' + error.message });
        });
    });
  });
});



// Add video download to MeTube
app.post('/api/videos/:id/download', (req, res) => {
  const { id } = req.params;
  
  // Get video info with channel name and published date
  db.get(`SELECT v.video_id, v.video_url, v.title, v.published_at, c.name as channel_name 
          FROM videos v 
          JOIN channels c ON v.channel_id = c.id 
          WHERE v.id = ?`, [id], (err, video) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Get MeTube settings
    db.get("SELECT * FROM settings ORDER BY id DESC LIMIT 1", (err, settings) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to get settings: ' + err.message });
      }
      if (!settings) {
        return res.status(500).json({ error: 'No MeTube settings configured. Please configure in Settings first.' });
      }
      
      // Create filename prefix: {channel_name}_{YYYYMMDDHHmmss}
      const publishedDate = new Date(video.published_at);
      const dateTimeStr = publishedDate.getFullYear().toString() +
                         (publishedDate.getMonth() + 1).toString().padStart(2, '0') +
                         publishedDate.getDate().toString().padStart(2, '0') +
                         publishedDate.getHours().toString().padStart(2, '0') +
                         publishedDate.getMinutes().toString().padStart(2, '0') +
                         publishedDate.getSeconds().toString().padStart(2, '0');
      
      // Sanitize channel name for filename (remove special characters, replace spaces with underscores)
      const sanitizedChannelName = video.channel_name
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .trim();
      
      const filenamePrefix = `${sanitizedChannelName}_${dateTimeStr}`;
      
      // Send download request to MeTube
      addToMeTube(video.video_url, video.title, settings, filenamePrefix)
        .then(metubeResponse => {
          // Record the download request timestamp in the database
          db.run(`UPDATE videos SET download_requested_at = CURRENT_TIMESTAMP WHERE id = ?`, [id], (err) => {
            if (err) {
              console.error('Error recording download request timestamp:', err.message);
            }
            
            res.json({
              success: true,
              message: `Added to MeTube: ${video.title}`,
              title: video.title,
              filenamePrefix: filenamePrefix
            });
          });
        })
        .catch(error => {
          console.error('Error adding to MeTube:', error);
          
          // Provide more user-friendly error messages
          let errorMessage = 'Failed to add download to MeTube';
          if (error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Failed to connect to MeTube. Check your settings and ensure MeTube is running.';
          } else if (error.message.includes('ETIMEDOUT')) {
            errorMessage = 'MeTube connection timed out. Check your settings.';
          } else if (error.message.includes('not available')) {
            errorMessage = 'This video is not available for download (may be age-restricted or private)';
          }
          
          res.status(500).json({ error: errorMessage });
        });
    });
  });
});





function addToMeTube(videoUrl, title, settings, filenamePrefix) {
  return new Promise(async (resolve, reject) => {
    try {
      // Build MeTube API URL
      const metubeUrl = `${settings.metube_url}/add`;
      
      // Prepare MeTube request payload
      const metubeRequest = {
        url: videoUrl,
        quality: "best",
        format: "any",
        playlist_strict_mode: false,
        auto_start: true,
        custom_name_prefix: filenamePrefix
      };
      
      // Send request to MeTube
      const response = await axios.post(metubeUrl, metubeRequest, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 seconds timeout
      });
      
      if (response.status === 200) {
        resolve({
          success: true,
          title: title,
          filenamePrefix: filenamePrefix
        });
      } else {
        reject(new Error(`MeTube error: ${response.status} ${response.statusText}`));
      }
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        reject(new Error('MeTube connection refused. Make sure MeTube is running and accessible.'));
      } else if (error.code === 'ETIMEDOUT') {
        reject(new Error('MeTube connection timed out. Check your settings.'));
      } else if (error.response) {
        reject(new Error(`MeTube request failed: ${error.response.status} ${error.response.statusText}`));
      } else {
        reject(new Error(`MeTube request failed: ${error.message}`));
      }
    }
  });
}

// Auto-check for new videos endpoint
app.post('/api/auto-check', (req, res) => {
  console.log('🔄 Starting auto-check for new videos...');
  
  // Get all channels
  db.all("SELECT id, channel_id, name FROM channels", (err, channels) => {
    if (err) {
      console.error('Error fetching channels:', err.message);
      return res.status(500).json({ error: 'Failed to fetch channels: ' + err.message });
    }
    
    if (channels.length === 0) {
      return res.json({
        success: true,
        message: 'No channels found to check',
        results: {
          channelsChecked: 0,
          totalVideosFound: 0,
          newVideosAdded: 0,
          videosAddedToMeTube: 0,
          errors: []
        }
      });
    }
    
    let channelsChecked = 0;
    let totalVideosFound = 0;
    let newVideosAdded = 0;
    let videosAddedToMeTube = 0;
    let errors = [];
    
    // Process each channel
    const processChannel = (index) => {
      if (index >= channels.length) {
        // All channels processed
        console.log(`✅ Auto-check completed: ${channelsChecked} channels checked, ${newVideosAdded} new videos found, ${videosAddedToMeTube} added to MeTube`);
        res.json({
          success: true,
          message: `Auto-check completed`,
          results: {
            channelsChecked,
            totalVideosFound,
            newVideosAdded,
            videosAddedToMeTube,
            errors
          }
        });
        return;
      }
      
      const channel = channels[index];
      console.log(`📺 Checking channel: ${channel.name} (${channel.channel_id})`);
      
      // Get settings for Shorts filtering
      db.get("SELECT filter_shorts FROM settings ORDER BY id DESC LIMIT 1", (err, settings) => {
        const filterShorts = settings ? settings.filter_shorts !== 0 : true;
        
        // Fetch and parse RSS feed
        fetchYouTubeRSS(channel.channel_id)
          .then(xmlData => parseRSSFeed(xmlData, filterShorts))
          .then(videos => {
            totalVideosFound += videos.length;
            
            // Save videos to database and get new ones
            return saveVideosToDatabase(videos, channel.id);
          })
          .then(result => {
            newVideosAdded += result.saved;
            channelsChecked++;
            
            // If new videos were found, add them to MeTube
            if (result.saved > 0) {
              console.log(`🎥 Found ${result.saved} new videos for ${channel.name}, adding to MeTube...`);
              return addNewVideosToMeTube(channel.id, result.newlyAddedVideos);
            }
            return 0;
          })
          .then(metubeCount => {
            videosAddedToMeTube += metubeCount;
            // Add delay before processing next channel to avoid rate limiting
            setTimeout(() => {
              processChannel(index + 1);
            }, 2000); // 2 second delay between channels
          })
          .catch(error => {
            console.error(`❌ Error processing channel ${channel.name}:`, error.message);
            errors.push({
              channel: channel.name,
              error: error.message
            });
            channelsChecked++;
            // Add delay even on error before continuing with next channel
            setTimeout(() => {
              processChannel(index + 1);
            }, 2000); // 2 second delay between channels
          });
      });
    };
    
    // Start processing
    processChannel(0);
  });
});

// Function to add newly discovered videos to MeTube
function addNewVideosToMeTube(channelId, newlyAddedVideos) {
  return new Promise((resolve, reject) => {
    // Get MeTube settings
    db.get("SELECT * FROM settings ORDER BY id DESC LIMIT 1", (err, settings) => {
      if (err || !settings) {
        console.error('Failed to get MeTube settings');
        resolve(0);
        return;
      }
      
      if (!newlyAddedVideos || newlyAddedVideos.length === 0) {
        resolve(0);
        return;
      }
      
      // Get the newly added videos from this specific check
      const videoIds = newlyAddedVideos.map(video => video.video_id);
      const placeholders = videoIds.map(() => '?').join(',');
      
      db.all(`SELECT v.id, v.video_id, v.video_url, v.title, v.published_at, c.name as channel_name 
              FROM videos v 
              JOIN channels c ON v.channel_id = c.id 
              WHERE v.channel_id = ? AND v.video_id IN (${placeholders})
              ORDER BY v.published_at DESC`, [channelId, ...videoIds], (err, videos) => {
        if (err) {
          console.error('Error fetching newly added videos:', err.message);
          resolve(0);
          return;
        }
        
        let processedCount = 0;
        let successCount = 0;
        
        videos.forEach((video, index) => {
          // Create filename prefix
          const publishedDate = new Date(video.published_at);
          const dateTimeStr = publishedDate.getFullYear().toString() +
                             (publishedDate.getMonth() + 1).toString().padStart(2, '0') +
                             publishedDate.getDate().toString().padStart(2, '0') +
                             publishedDate.getHours().toString().padStart(2, '0') +
                             publishedDate.getMinutes().toString().padStart(2, '0') +
                             publishedDate.getSeconds().toString().padStart(2, '0');
          
          const sanitizedChannelName = video.channel_name
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .trim();
          
          const filenamePrefix = `${sanitizedChannelName}_${dateTimeStr}`;
          
          // Add to MeTube
          addToMeTube(video.video_url, video.title, settings, filenamePrefix)
            .then(() => {
              // Record download request timestamp
              db.run(`UPDATE videos SET download_requested_at = CURRENT_TIMESTAMP WHERE id = ?`, [video.id]);
              successCount++;
              console.log(`✅ Added to MeTube: ${video.title}`);
            })
            .catch(error => {
              console.error(`❌ Failed to add to MeTube: ${video.title} - ${error.message}`);
            })
            .finally(() => {
              processedCount++;
              if (processedCount === videos.length) {
                resolve(successCount);
              }
            });
        });
      });
    });
  });
}

// Auto-check scheduler
let autoCheckInterval = null;
let isAutoCheckRunning = false;

// Start auto-check scheduler
function startAutoCheckScheduler() {
  // Check every 30 minutes (1800000 ms)
  const checkInterval = 30 * 60 * 1000;
  
  console.log(`🕐 Auto-check scheduler started (checking every ${checkInterval / 60000} minutes)`);
  
  autoCheckInterval = setInterval(async () => {
    if (isAutoCheckRunning) {
      console.log('⏳ Auto-check already running, skipping...');
      return;
    }
    
    console.log('🔄 Scheduled auto-check starting...');
    await runScheduledAutoCheck();
  }, checkInterval);
  
  // Run initial check after 1 minute
  setTimeout(async () => {
    console.log('🔄 Running initial auto-check...');
    await runScheduledAutoCheck();
  }, 60000);
}

// Scheduled auto-check function
async function runScheduledAutoCheck() {
  if (isAutoCheckRunning) {
    return;
  }
  
  isAutoCheckRunning = true;
  
  try {
    // Get all channels
    const channels = await new Promise((resolve, reject) => {
      db.all("SELECT id, channel_id, name FROM channels", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (channels.length === 0) {
      console.log('ℹ️  No channels found for scheduled check');
      return;
    }
    
    console.log(`📺 Scheduled check: Found ${channels.length} channels`);
    
    let channelsChecked = 0;
    let totalVideosFound = 0;
    let newVideosAdded = 0;
    let videosAddedToMeTube = 0;
    let errors = [];
    
    // Get settings
    const settings = await new Promise((resolve, reject) => {
      db.get("SELECT filter_shorts FROM settings ORDER BY id DESC LIMIT 1", (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    const filterShorts = settings ? settings.filter_shorts !== 0 : true;
    
    // Process each channel with delay
    for (const channel of channels) {
      try {
        console.log(`📺 Scheduled check: ${channel.name}`);
        
        const xmlData = await fetchYouTubeRSS(channel.channel_id);
        const videos = await parseRSSFeed(xmlData, filterShorts);
        const result = await saveVideosToDatabase(videos, channel.id);
        
        totalVideosFound += videos.length;
        newVideosAdded += result.saved;
        channelsChecked++;
        
        if (result.saved > 0) {
          console.log(`  🎥 Found ${result.saved} new videos, adding to MeTube...`);
          const metubeCount = await addNewVideosToMeTube(channel.id, result.newlyAddedVideos);
          videosAddedToMeTube += metubeCount;
        }
        
        // Add delay between channels to avoid rate limiting
        if (channels.indexOf(channel) < channels.length - 1) {
          console.log(`  ⏳ Waiting 2 seconds before next channel...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`  ❌ Error processing ${channel.name}: ${error.message}`);
        errors.push({ channel: channel.name, error: error.message });
        channelsChecked++;
        
        // Add delay even on error before continuing
        if (channels.indexOf(channel) < channels.length - 1) {
          console.log(`  ⏳ Waiting 2 seconds before next channel...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    console.log(`📊 Scheduled check completed: ${channelsChecked} channels, ${newVideosAdded} new videos, ${videosAddedToMeTube} added to MeTube`);
    
    if (errors.length > 0) {
      console.log(`   Errors: ${errors.length}`);
    }
    
  } catch (error) {
    console.error('❌ Scheduled auto-check failed:', error.message);
  } finally {
    isAutoCheckRunning = false;
  }
}

// API endpoint to control auto-check scheduler
app.post('/api/auto-check/scheduler', (req, res) => {
  const { action } = req.body;
  
  if (action === 'start') {
    if (autoCheckInterval) {
      res.json({ success: true, message: 'Auto-check scheduler is already running' });
    } else {
      startAutoCheckScheduler();
      res.json({ success: true, message: 'Auto-check scheduler started' });
    }
  } else if (action === 'stop') {
    if (autoCheckInterval) {
      clearInterval(autoCheckInterval);
      autoCheckInterval = null;
      res.json({ success: true, message: 'Auto-check scheduler stopped' });
    } else {
      res.json({ success: true, message: 'Auto-check scheduler was not running' });
    }
  } else if (action === 'status') {
    res.json({
      success: true,
      running: autoCheckInterval !== null,
      isChecking: isAutoCheckRunning
    });
  } else {
    res.status(400).json({ error: 'Invalid action. Use "start", "stop", or "status"' });
  }
});

app.listen(PORT, () => {
  console.log(`Youtube Channel DVR server running on http://localhost:${PORT}`);
  
  // Start auto-check scheduler automatically
  startAutoCheckScheduler();
});
