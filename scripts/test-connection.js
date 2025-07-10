import Web3 from 'web3';
import TronWeb from 'tronweb';
import dotenv from 'dotenv';
import { safeToNumber } from '../src/utils/bigint.js';
import { CONTRACTS, EVENTS } from '../src/constants.js';

dotenv.config();

console.log('🔍 Testing Blockchain Connections...\n');

// Test Ethereum connection
async function testEthereum() {
  console.log('📡 Testing Ethereum connection...');
  
  try {
    const web3 = new Web3(process.env.ETHEREUM_RPC_URL);
    
    // Test basic connection
    const blockNumberBigInt = await web3.eth.getBlockNumber();
    const blockNumber = safeToNumber(blockNumberBigInt);
    console.log(`✅ Connected to Ethereum - Current block: ${blockNumber}`);
    
    // Test USDT contract
    console.log('\n📋 Testing USDT contract...');
    const usdtAddedLogs = await web3.eth.getPastLogs({
      fromBlock: Math.max(blockNumber - 100, 0),
      toBlock: blockNumber,
      address: CONTRACTS.ETHEREUM.USDT,
      topics: [EVENTS.ADDED_BLACKLIST]
    });
    const usdtRemovedLogs = await web3.eth.getPastLogs({
      fromBlock: Math.max(blockNumber - 100, 0),
      toBlock: blockNumber,
      address: CONTRACTS.ETHEREUM.USDT,
      topics: [EVENTS.REMOVED_BLACKLIST]
    });
    console.log(`✅ Found ${usdtAddedLogs.length + usdtRemovedLogs.length} USDT blacklist events in last 100 blocks`);
    
    // Test USDC contract
    console.log('\n📋 Testing USDC contract...');
    const usdcBlacklistedLogs = await web3.eth.getPastLogs({
      fromBlock: Math.max(blockNumber - 100, 0),
      toBlock: blockNumber,
      address: CONTRACTS.ETHEREUM.USDC,
      topics: [EVENTS.BLACKLISTED]
    });
    const usdcUnblacklistedLogs = await web3.eth.getPastLogs({
      fromBlock: Math.max(blockNumber - 100, 0),
      toBlock: blockNumber,
      address: CONTRACTS.ETHEREUM.USDC,
      topics: [EVENTS.UNBLACKLISTED]
    });
    console.log(`✅ Found ${usdcBlacklistedLogs.length + usdcUnblacklistedLogs.length} USDC blacklist events in last 100 blocks`);
    
    return true;
  } catch (error) {
    console.error('❌ Ethereum connection failed:', error.message);
    return false;
  }
}

// Test TRON connection
async function testTron() {
  console.log('\n📡 Testing TRON connection...');
  
  try {
    const tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
      headers: { 'TRON-PRO-API-KEY': process.env.TRON_GRID_API_KEY }
    });
    
    // Test basic connection
    const currentBlock = await tronWeb.trx.getCurrentBlock();
    const blockNumber = currentBlock.block_header.raw_data.number;
    console.log(`✅ Connected to TRON - Current block: ${blockNumber}`);
    
    // Test USDT contract events
    console.log('\n📋 Testing TRON USDT contract...');
    const currentTimestamp = currentBlock.block_header.raw_data.timestamp;
    const fromTimestamp = currentTimestamp - (60 * 60 * 1000); // 1 hour ago
    
    const url = `${tronWeb.fullNode.host}/v1/contracts/${CONTRACTS.TRON.USDT}/events`;
    const params = new URLSearchParams({
      event_name: 'AddedBlackList',
      min_block_timestamp: fromTimestamp,
      max_block_timestamp: currentTimestamp,
      limit: 10
    });
    
    const response = await fetch(`${url}?${params}`, {
      headers: {
        'TRON-PRO-API-KEY': process.env.TRON_GRID_API_KEY || ''
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Found ${data.data?.length || 0} TRON USDT blacklist events in last hour`);
    } else {
      console.log('⚠️  Could not fetch TRON events - API key might be required');
    }
    
    return true;
  } catch (error) {
    console.error('❌ TRON connection failed:', error.message);
    return false;
  }
}

// Test database
async function testDatabase() {
  console.log('\n📁 Testing Database...');
  
  try {
    const { default: database } = await import('../src/database.js');
    await database.init(process.env.DATABASE_PATH || './data/blacklist.db');
    
    const stats = await database.getStats();
    console.log('✅ Database initialized successfully');
    console.log('📊 Current stats:', JSON.stringify(stats, null, 2));
    
    await database.close();
    return true;
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  const results = {
    ethereum: await testEthereum(),
    tron: await testTron(),
    database: await testDatabase()
  };
  
  console.log('\n\n📊 Test Results Summary:');
  console.log('========================');
  console.log(`Ethereum: ${results.ethereum ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`TRON:     ${results.tron ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Database: ${results.database ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (Object.values(results).every(r => r)) {
    console.log('\n🎉 All tests passed! You can now run the harvester.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check your configuration.');
    process.exit(1);
  }
}

runTests().catch(console.error); 