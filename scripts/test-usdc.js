import Web3 from 'web3';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Testing USDC Contract Specifically...\n');

const web3 = new Web3(process.env.ETHEREUM_RPC_URL);
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19d4a2e9eb0cE3606eb48';

async function testUSDC() {
  try {
    console.log('📋 Testing USDC contract address:', USDC_ADDRESS);
    
    // Test 1: Get basic contract info
    const blockNumber = await web3.eth.getBlockNumber();
    console.log(`Current block: ${blockNumber}`);
    
    // Test 2: Get contract bytecode to verify it exists
    const code = await web3.eth.getCode(USDC_ADDRESS);
    console.log(`Contract exists: ${code !== '0x'}`);
    
    // Test 3: Try to get logs without any topics filter
    console.log('\n📋 Testing logs without topics filter...');
    const allLogs = await web3.eth.getPastLogs({
      fromBlock: Math.max(Number(blockNumber) - 10, 0),
      toBlock: Number(blockNumber),
      address: USDC_ADDRESS
    });
    console.log(`✅ Found ${allLogs.length} total logs from USDC contract in last 10 blocks`);
    
    // Test 4: Check the actual event signatures from real logs
    if (allLogs.length > 0) {
      console.log('\n📋 Sample logs from USDC contract:');
      allLogs.slice(0, 3).forEach((log, i) => {
        console.log(`Log ${i + 1}:`);
        console.log(`  Topics: ${log.topics}`);
        console.log(`  Data: ${log.data}`);
      });
    }
    
    // Test 5: Try with a longer block range
    console.log('\n📋 Testing with longer block range (last 100 blocks)...');
    const moreLogs = await web3.eth.getPastLogs({
      fromBlock: Math.max(Number(blockNumber) - 100, 0),
      toBlock: Number(blockNumber),
      address: USDC_ADDRESS
    });
    console.log(`✅ Found ${moreLogs.length} total logs from USDC contract in last 100 blocks`);
    
    // Test 6: Check specific known event signatures
    console.log('\n📋 Testing specific event signatures...');
    
    // Transfer event (should exist)
    const transferHash = web3.utils.keccak256('Transfer(address,address,uint256)');
    console.log(`Transfer event hash: ${transferHash}`);
    
    try {
      const transferLogs = await web3.eth.getPastLogs({
        fromBlock: Math.max(Number(blockNumber) - 50, 0),
        toBlock: Number(blockNumber),
        address: USDC_ADDRESS,
        topics: [transferHash]
      });
      console.log(`✅ Found ${transferLogs.length} Transfer events in last 50 blocks`);
    } catch (error) {
      console.error(`❌ Error testing Transfer events: ${error.message}`);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error testing USDC contract: ${error.message}`);
    return false;
  }
}

testUSDC().catch(console.error); 