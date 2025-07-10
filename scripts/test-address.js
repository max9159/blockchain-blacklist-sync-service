import Web3 from 'web3';
import dotenv from 'dotenv';

dotenv.config();

console.log('🔍 Testing Address Validation...\n');

const web3 = new Web3(process.env.ETHEREUM_RPC_URL);

// Test different addresses
const addresses = {
  'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  'USDC': '0xA0b86991c6218b36c1d19d4a2e9eb0cE3606eb48',
  'USDC_CHECKSUM': '0xA0b86991c6218b36c1d19d4a2e9eb0cE3606eB48',
  'USDC_LOWERCASE': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  'USDC_UPPERCASE': '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48'
};

console.log('📋 Testing address formats...\n');

for (const [name, address] of Object.entries(addresses)) {
  console.log(`${name}: ${address}`);
  
  try {
    // Test Web3 address validation
    const isValid = web3.utils.isAddress(address);
    console.log(`  Web3 isAddress: ${isValid}`);
    
    // Test checksum
    const checksum = web3.utils.toChecksumAddress(address);
    console.log(`  Checksum: ${checksum}`);
    
    // Test getting code
    const code = await web3.eth.getCode(address);
    console.log(`  Contract exists: ${code !== '0x'}`);
    
    // Test simple log query
    const blockNumber = await web3.eth.getBlockNumber();
    const logs = await web3.eth.getPastLogs({
      fromBlock: Math.max(Number(blockNumber) - 5, 0),
      toBlock: Number(blockNumber),
      address: address
    });
    console.log(`  ✅ Log query successful: ${logs.length} logs`);
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
  
  console.log('');
}

// Test the exact address that's causing issues
const problematicAddress = '0xA0b86991c6218b36c1d19d4a2e9eb0cE3606eb48';
console.log(`\n🔍 Detailed test of problematic address: ${problematicAddress}`);

try {
  // Check each character
  console.log(`Length: ${problematicAddress.length}`);
  console.log(`Starts with 0x: ${problematicAddress.startsWith('0x')}`);
  console.log(`Contains only hex: ${/^0x[0-9a-fA-F]+$/.test(problematicAddress)}`);
  
  // Try to normalize it
  const normalized = problematicAddress.toLowerCase();
  console.log(`Normalized: ${normalized}`);
  
  // Try Web3 utils
  console.log(`Web3 isAddress: ${web3.utils.isAddress(problematicAddress)}`);
  console.log(`Web3 toChecksumAddress: ${web3.utils.toChecksumAddress(problematicAddress)}`);
  
} catch (error) {
  console.error(`Error in detailed test: ${error.message}`);
} 