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
          db.run(`INSERT INTO settings (aria2c_ip, aria2c_port, download_folder, username, password, metube_url) 
                  VALUES ('localhost', '6800', '/downloads', '', '', 'http://localhost:8081')`);
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
    FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE
  )`, (err) => {
    if (err) {
      console.error('Error creating videos table:', err.message);
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
  const { aria2c_ip, aria2c_port, download_folder, username, password, metube_url } = req.body;
  
  // Use default values for backward compatibility
  const aria2c_ip_val = aria2c_ip || 'localhost';
  const aria2c_port_val = aria2c_port || '6800';
  const download_folder_val = download_folder || './downloads';
  const username_val = username || '';
  const password_val = password || '';
  const metube_url_val = metube_url || 'http://localhost:8081';
  
  db.run(`UPDATE settings SET 
          aria2c_ip = ?, 
          aria2c_port = ?, 
          download_folder = ?, 
          username = ?, 
          password = ?,
          metube_url = ?,
          updated_at = CURRENT_TIMESTAMP
          WHERE id = (SELECT id FROM settings ORDER BY id DESC LIMIT 1)`,
    [aria2c_ip_val, aria2c_port_val, download_folder_val, username_val, password_val, metube_url_val],
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

function parseRSSFeed(xmlData) {
  return new Promise((resolve, reject) => {
    const parser = new xml2js.Parser();
    
    parser.parseString(xmlData, (err, result) => {
      if (err) {
        reject(err);
      } else {
        try {
          const videos = [];
          const entries = result.feed.entry || [];
          
          entries.forEach(entry => {
            const videoId = entry['yt:videoId'] ? entry['yt:videoId'][0] : null;
            const title = entry.title ? entry.title[0] : '';
            const description = entry.media && entry.media.group && entry.media.group[0].description ? 
                               entry.media.group[0].description[0] : '';
            const publishedAt = entry.published ? entry.published[0] : '';
            const thumbnailUrl = entry.media && entry.media.group && entry.media.group[0]['media:thumbnail'] ? 
                                entry.media.group[0]['media:thumbnail'][0].$.url : '';
            const videoUrl = entry.link ? entry.link[0].$.href : '';
            
            if (videoId) {
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
    
    videos.forEach((video, index) => {
      db.run(`INSERT OR IGNORE INTO videos (video_id, channel_id, title, description, published_at, thumbnail_url, video_url) 
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [video.video_id, channelId, video.title, video.description, video.published_at, video.thumbnail_url, video.video_url],
        function(err) {
          if (err) {
            console.error('Error saving video:', err);
          } else if (this.changes > 0) {
            savedCount++;
          } else {
            skippedCount++;
          }
          
          if (index === videos.length - 1) {
            resolve({ saved: savedCount, skipped: skippedCount });
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
  
  // Get channel info
  db.get("SELECT channel_id, name FROM channels WHERE id = ?", [id], (err, channel) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // Fetch and parse RSS feed
    fetchYouTubeRSS(channel.channel_id)
      .then(xmlData => parseRSSFeed(xmlData))
      .then(videos => saveVideosToDatabase(videos, id))
      .then(result => {
        res.json({
          success: true,
          message: `Found ${result.saved + result.skipped} videos. ${result.saved} new videos added, ${result.skipped} already existed.`,
          result: result
        });
      })
      .catch(error => {
        console.error('Error checking videos:', error);
        res.status(500).json({ error: 'Failed to check for new videos: ' + error.message });
      });
  });
});



// Add video download to MeTube
app.post('/api/videos/:id/download', (req, res) => {
  const { id } = req.params;
  
  // Get video info
  db.get("SELECT video_id, video_url, title FROM videos WHERE id = ?", [id], (err, video) => {
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
      
      // Send download request to MeTube
      addToMeTube(video.video_url, video.title, settings)
        .then(metubeResponse => {
          res.json({
            success: true,
            message: `Added to MeTube: ${video.title}`,
            title: video.title
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





function addToMeTube(videoUrl, title, settings) {
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
        auto_start: true
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
          title: title
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

app.listen(PORT, () => {
  console.log(`Youtube Channel DVR server running on http://localhost:${PORT}`);
});
