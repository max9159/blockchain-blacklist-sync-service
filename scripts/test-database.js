import database from '../src/database.js';

console.log('🔍 Testing Database Contents...\n');

async function testDatabase() {
  try {
    await database.init('./data/blacklist.db');
    
    console.log('📊 Database Statistics:');
    const stats = await database.getStats();
    console.log('Stats:', JSON.stringify(stats, null, 2));
    
    console.log('\n📋 Sync Status:');
    const syncStatus = await database.getSyncStatus();
    console.log('Sync Status:', JSON.stringify(syncStatus, null, 2));
    
    console.log('\n🔍 Sample Blacklist Entries:');
    const sampleEntries = await database.getAllBlacklistEntries(10);
    console.log(`Found ${sampleEntries.length} entries:`);
    sampleEntries.forEach((entry, i) => {
      console.log(`${i + 1}. ${entry.address} (${entry.token}/${entry.network}) - Blacklisted: ${entry.is_blacklisted}`);
      console.log(`   Block: ${entry.block_number}, TX: ${entry.transaction_hash}`);
    });
    
    console.log('\n✅ Database test completed successfully!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
  }
}

testDatabase(); 