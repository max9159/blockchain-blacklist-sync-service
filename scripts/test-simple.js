import Web3 from 'web3';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Simple Connection Test...\n');

async function testBasicConnection() {
  try {
    console.log('📡 Testing basic Ethereum connection...');
    
    const web3 = new Web3(process.env.ETHEREUM_RPC_URL);
    
    // Test basic connection
    const blockNumber = await web3.eth.getBlockNumber();
    console.log(`✅ Connected to Ethereum - Current block: ${blockNumber}`);
    
    // Test getting block details
    const block = await web3.eth.getBlock('latest');
    console.log(`✅ Latest block hash: ${block.hash}`);
    console.log(`✅ Block timestamp: ${block.timestamp}`);
    
    // Test a simple log query without topics
    console.log('\n📋 Testing simple log query...');
    const logs = await web3.eth.getPastLogs({
      fromBlock: Number(blockNumber) - 10,
      toBlock: Number(blockNumber),
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' // USDT contract
    });
    console.log(`✅ Found ${logs.length} logs from USDT contract in last 10 blocks`);
    
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    return false;
  }
}

// Run the test
testBasicConnection().then(success => {
  if (success) {
    console.log('\n🎉 Basic connection test passed!');
  } else {
    console.log('\n❌ Basic connection test failed!');
    process.exit(1);
  }
}); 