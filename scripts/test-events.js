import Web3 from 'web3';
import dotenv from 'dotenv';
import { CONTRACTS, EVENTS } from '../src/constants.js';

dotenv.config();

console.log('🔍 Testing Event Signatures...\n');

const web3 = new Web3(process.env.ETHEREUM_RPC_URL);

// Print event signatures
console.log('📋 Generated Event Signatures:');
console.log(`ADDED_BLACKLIST: ${EVENTS.ADDED_BLACKLIST}`);
console.log(`REMOVED_BLACKLIST: ${EVENTS.REMOVED_BLACKLIST}`);
console.log(`BLACKLISTED: ${EVENTS.BLACKLISTED}`);
console.log(`UNBLACKLISTED: ${EVENTS.UNBLACKLISTED}`);

// Test each event signature individually
async function testEventSignature(contractAddress, eventHash, eventName) {
  try {
    const blockNumber = await web3.eth.getBlockNumber();
    
    console.log(`\n📋 Testing ${eventName} on ${contractAddress}...`);
    
    const logs = await web3.eth.getPastLogs({
      fromBlock: Math.max(Number(blockNumber) - 1000, 0),
      toBlock: Number(blockNumber),
      address: contractAddress,
      topics: [eventHash]
    });
    
    console.log(`✅ Found ${logs.length} ${eventName} events in last 1000 blocks`);
    
    if (logs.length > 0) {
      console.log(`   Sample log:`, logs[0]);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error testing ${eventName}:`, error.message);
    return false;
  }
}

async function testAll() {
  console.log('\n🔍 Testing Individual Event Signatures...\n');
  
  // Test USDT events
  await testEventSignature(CONTRACTS.ETHEREUM.USDT, EVENTS.ADDED_BLACKLIST, 'USDT AddedBlackList');
  await testEventSignature(CONTRACTS.ETHEREUM.USDT, EVENTS.REMOVED_BLACKLIST, 'USDT RemovedBlackList');
  
  // Test USDC events
  await testEventSignature(CONTRACTS.ETHEREUM.USDC, EVENTS.BLACKLISTED, 'USDC Blacklisted');
  await testEventSignature(CONTRACTS.ETHEREUM.USDC, EVENTS.UNBLACKLISTED, 'USDC UnBlacklisted');
  
  console.log('\n🔍 Testing Alternative Event Signatures for USDC...\n');
  
  // Test alternative event signatures for USDC
  const alternativeBlacklisted = web3.utils.keccak256('Blacklisted(address)');
  const alternativeUnblacklisted = web3.utils.keccak256('UnBlacklisted(address)');
  
  console.log(`Alternative BLACKLISTED: ${alternativeBlacklisted}`);
  console.log(`Alternative UNBLACKLISTED: ${alternativeUnblacklisted}`);
  
  await testEventSignature(CONTRACTS.ETHEREUM.USDC, alternativeBlacklisted, 'USDC Blacklisted (alt)');
  await testEventSignature(CONTRACTS.ETHEREUM.USDC, alternativeUnblacklisted, 'USDC UnBlacklisted (alt)');
}

testAll().catch(console.error); 