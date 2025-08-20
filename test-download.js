const { spawn } = require('child_process');

console.log('Testing yt-dlp download functionality...\n');

// Test with a simple YouTube video
const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll for testing

function testDownload(url) {
  return new Promise((resolve, reject) => {
    console.log(`Testing download URL generation for: ${url}`);
    
    const ytdlp = spawn('yt-dlp', [
      '--get-url',
      '--format', 'bv*[height>=1080][ext=mp4]+ba[ext=m4a]/bv*[height>=720][ext=mp4]+ba[ext=m4a]/bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '30',
      '--extractor-args', 'youtube:player_client=android',
      url
    ]);
    
    let stdout = '';
    let stderr = '';
    
    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ytdlp.on('close', (code) => {
      if (code === 0) {
        const url = stdout.trim();
        if (url) {
          console.log('✅ Success! Download URL generated:');
          console.log(url.substring(0, 100) + '...');
          resolve(url);
        } else {
          console.log('❌ No download URL found');
          reject(new Error('No download URL found'));
        }
      } else {
        console.log('❌ yt-dlp failed:');
        console.log(stderr);
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
      }
    });
    
    ytdlp.on('error', (error) => {
      console.log('❌ Failed to execute yt-dlp:', error.message);
      reject(error);
    });
  });
}

testDownload(testUrl)
  .then(() => {
    console.log('\n✅ Download functionality test passed!');
    console.log('Your Youtube Channel DVR app should now work correctly.');
  })
  .catch((error) => {
    console.log('\n❌ Download functionality test failed:');
    console.log(error.message);
    console.log('\nThis might be due to:');
    console.log('- Network connectivity issues');
    console.log('- YouTube restrictions');
    console.log('- yt-dlp version compatibility');
  });
