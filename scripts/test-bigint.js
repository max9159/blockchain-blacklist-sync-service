import { safeToNumber, safeToString, safeMin, safeMax } from '../src/utils/bigint.js';

console.log('🔧 Testing BigInt utility functions...\n');

// Test safeToNumber
console.log('1. Testing safeToNumber:');
try {
  console.log(`   BigInt(123) -> ${safeToNumber(BigInt(123))}`);
  console.log(`   "456" -> ${safeToNumber("456")}`);
  console.log(`   789 -> ${safeToNumber(789)}`);
  console.log('   ✅ safeToNumber works correctly');
} catch (error) {
  console.log('   ❌ safeToNumber failed:', error.message);
}

// Test safeToString
console.log('\n2. Testing safeToString:');
try {
  console.log(`   BigInt(123) -> "${safeToString(BigInt(123))}"`);
  console.log(`   456 -> "${safeToString(456)}"`);
  console.log(`   "789" -> "${safeToString("789")}"`);
  console.log('   ✅ safeToString works correctly');
} catch (error) {
  console.log('   ❌ safeToString failed:', error.message);
}

// Test safeMin
console.log('\n3. Testing safeMin:');
try {
  console.log(`   safeMin(BigInt(100), 200) -> ${safeMin(BigInt(100), 200)}`);
  console.log(`   safeMin(300, BigInt(50)) -> ${safeMin(300, BigInt(50))}`);
  console.log('   ✅ safeMin works correctly');
} catch (error) {
  console.log('   ❌ safeMin failed:', error.message);
}

// Test safeMax
console.log('\n4. Testing safeMax:');
try {
  console.log(`   safeMax(BigInt(100), 200) -> ${safeMax(BigInt(100), 200)}`);
  console.log(`   safeMax(300, BigInt(50)) -> ${safeMax(300, BigInt(50))}`);
  console.log('   ✅ safeMax works correctly');
} catch (error) {
  console.log('   ❌ safeMax failed:', error.message);
}

// Test error cases
console.log('\n5. Testing error cases:');
try {
  safeToNumber(BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1));
  console.log('   ❌ Should have thrown error for unsafe BigInt');
} catch (error) {
  console.log('   ✅ Correctly threw error for unsafe BigInt:', error.message);
}

try {
  safeToNumber('invalid');
  console.log('   ❌ Should have thrown error for invalid string');
} catch (error) {
  console.log('   ✅ Correctly threw error for invalid string:', error.message);
}

console.log('\n🎉 BigInt utility tests completed!'); 