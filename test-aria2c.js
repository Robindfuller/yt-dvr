const axios = require('axios');

console.log('Testing aria2c connection...\n');

// Default settings for testing
const testSettings = {
  aria2c_ip: 'localhost',
  aria2c_port: '6800',
  download_folder: '/Users/robinfuller/Downloads',
  username: '',
  password: ''
};

async function testAria2cConnection() {
  try {
    const rpcUrl = `http://${testSettings.aria2c_ip}:${testSettings.aria2c_port}/jsonrpc`;
    
    // Test with aria2.getVersion method
    const rpcRequest = {
      jsonrpc: '2.0',
      method: 'aria2.getVersion',
      params: [],
      id: 'test'
    };
    
    console.log(`Connecting to: ${rpcUrl}`);
    
    const response = await axios.post(rpcUrl, rpcRequest, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });
    
    if (response.data.result) {
      console.log('✅ aria2c connection successful!');
      console.log(`Version: ${response.data.result.version}`);
      console.log(`Enabled features: ${response.data.result.enabledFeatures.join(', ')}`);
      console.log('\nYour Youtube Channel DVR app is ready to send downloads to aria2c!');
    } else {
      console.log('❌ aria2c responded but with no version info');
    }
    
  } catch (error) {
    console.log('❌ aria2c connection failed:');
    
    if (error.code === 'ECONNREFUSED') {
      console.log('Connection refused. Make sure aria2c is running with RPC enabled.');
      console.log('\nTo start aria2c with RPC:');
      console.log('aria2c --enable-rpc --rpc-listen-all --rpc-allow-origin-all');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('Connection timed out. Check your settings.');
    } else {
      console.log(error.message);
    }
    
    console.log('\nTroubleshooting:');
    console.log('1. Make sure aria2c is installed and running');
    console.log('2. Check if aria2c RPC is enabled on the correct port');
    console.log('3. Verify the IP and port in your settings');
    console.log('4. Check firewall settings if using remote aria2c');
  }
}

testAria2cConnection();

