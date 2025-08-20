const { spawn } = require('child_process');

console.log('Checking if yt-dlp is installed...\n');

const ytdlp = spawn('yt-dlp', ['--version']);

ytdlp.stdout.on('data', (data) => {
  console.log('✅ yt-dlp is installed!');
  console.log(`Version: ${data.toString().trim()}`);
  console.log('\nYour Youtube Channel DVR app is ready to download videos!');
});

ytdlp.stderr.on('data', (data) => {
  console.log('❌ yt-dlp is not installed or not found in PATH');
  console.log('\nTo install yt-dlp:');
  console.log('\nOn macOS (using Homebrew):');
  console.log('  brew install yt-dlp');
  console.log('\nOn Ubuntu/Debian:');
  console.log('  sudo apt update');
  console.log('  sudo apt install yt-dlp');
  console.log('\nOn Windows (using pip):');
  console.log('  pip install yt-dlp');
  console.log('\nOr download from: https://github.com/yt-dlp/yt-dlp');
  console.log('\nAfter installation, restart the app and try downloading videos again.');
});

ytdlp.on('close', (code) => {
  if (code !== 0) {
    console.log('\n❌ yt-dlp check failed with code:', code);
  }
});
