const axios = require('axios');

// Test MeTube integration
async function testMeTube() {
  const testUrl = 'https://youtu.be/dCPdkaVlcBo?si=csTO6auzZ4zbc-J9';
  const metubeUrl = 'http://localhost:8081/api/add';
  
  const testPayload = {
    url: testUrl,
    quality: "best",
    format: "any",
    playlist_strict_mode: false,
    auto_start: true
  };
  
  console.log('Testing MeTube integration...');
  console.log('MeTube URL:', metubeUrl);
  console.log('Test payload:', JSON.stringify(testPayload, null, 2));
  
  try {
    const response = await axios.post(metubeUrl, testPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ MeTube test successful!');
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
  } catch (error) {
    console.log('❌ MeTube test failed!');
    if (error.code === 'ECONNREFUSED') {
      console.log('Error: Connection refused. Make sure MeTube is running on http://localhost:8081');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('Error: Connection timed out. Check your MeTube URL.');
    } else if (error.response) {
      console.log('Error:', error.response.status, error.response.statusText);
      console.log('Response data:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
}

// Run the test
testMeTube();
