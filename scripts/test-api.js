import database from '../src/database.js';
import { startServer } from '../src/api/server.js';
import logger from '../src/logger.js';

console.log('🔍 Testing API Server...\n');

async function testAPI() {
  try {
    // Initialize database
    console.log('📁 Initializing database...');
    await database.init('./data/blacklist.db');
    console.log('✅ Database initialized successfully');
    
    // Start server
    console.log('🚀 Starting API server...');
    const server = startServer();
    console.log('✅ API server started successfully');
    
    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test health endpoint
    console.log('🔍 Testing health endpoint...');
    try {
      const response = await fetch('http://localhost:3000/health');
      const data = await response.json();
      console.log('✅ Health check passed:', data);
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    }
    
    // Test stats endpoint
    console.log('🔍 Testing stats endpoint...');
    try {
      const response = await fetch('http://localhost:3000/stats');
      const data = await response.json();
      console.log('✅ Stats endpoint working:', data);
    } catch (error) {
      console.error('❌ Stats endpoint failed:', error.message);
    }
    
    // Close server
    console.log('🛑 Stopping server...');
    server.close();
    console.log('✅ Server stopped');
    
  } catch (error) {
    console.error('❌ API test failed:', error);
  }
}

testAPI(); 