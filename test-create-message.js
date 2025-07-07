const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testMessageCreate() {
  try {
    console.log('🧪 Testing OpenAI SDK...');
    console.log('🔍 typeof openai.beta.threads.messages.create:', typeof openai.beta.threads.messages.create);
    console.dir(openai.beta.threads.messages.create, { depth: 1 });
    
    // Create a thread
    console.log('📝 Creating thread...');
    const thread = await openai.beta.threads.create();
    console.log('✅ Thread created:', thread.id);
    
    // Create a message
    console.log('📝 Creating message...');
    const message = await openai.beta.threads.messages.create({
      thread_id: thread.id,
      role: 'user',
      content: 'Hello, test message',
    });
    console.log('✅ Message created:', message.id);
    
    console.log('🎉 Test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Error stack:', error.stack);
  }
}

testMessageCreate(); 