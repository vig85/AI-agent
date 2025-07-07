const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Rate limiting setup
const rateLimit = require('express-rate-limit');

// Create a limiter: 100 requests per IP per day
const limiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 100, // limit each IP to 100 requests per day
  message: {
    error: 'Too many requests from this IP, please try again tomorrow.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all requests
app.use(limiter);

// Server timeout configuration
const serverTimeout = 30000; // 30 seconds

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  defaultHeaders: {
    'OpenAI-Beta': 'assistants=v2'
  }
});

const assistantId = 'asst_qHEsOVm5oP583nV47EP9fcMs';

// Check assistant on startup
async function checkAssistant() {
  try {
    const assistant = await openai.beta.assistants.retrieve(assistantId);
    console.log('✅ Assistant found:', assistant.name);
    return assistant;
  } catch (error) {
    console.error('❌ Error checking assistant:', error.message);
    throw error;
  }
}

checkAssistant();

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  let threadId;

  console.log('🟢 Received message:', message);

  try {
    // Create a new thread using direct API call
    console.log('📝 Creating thread...');
    const threadResponse = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    
    const thread = await threadResponse.json();
    console.log('🔍 Thread response:', JSON.stringify(thread, null, 2));
    
    threadId = thread.id;
    console.log('📍 threadId =', threadId);

    // Add user message to thread using direct API call
    console.log('📝 Adding message to thread...');
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        role: 'user',
        content: message
      })
    });
    
    const messageResult = await messageResponse.json();
    console.log('✅ Message added:', messageResult.id);

    // Start a run using direct API call
    console.log('🚀 Starting assistant run...');
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        assistant_id: assistantId
      })
    });
    
    const run = await runResponse.json();
    console.log('🏃 Started run with ID:', run.id);

    // Poll for run completion using direct API call
    let runStatus = run;
    let loopCount = 0;
    const MAX_RETRIES = 30;

    while (
      (runStatus.status === 'in_progress' || runStatus.status === 'queued') &&
      loopCount < MAX_RETRIES
    ) {
      loopCount++;
      console.log(`🔁 Loop ${loopCount}: Run status = ${runStatus.status}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${run.id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });
      
      runStatus = await statusResponse.json();
    }

    if (loopCount === MAX_RETRIES) {
      throw new Error('Assistant run timeout exceeded.');
    }

    if (runStatus.status === 'failed') {
      throw new Error(
        'Assistant run failed: ' + (runStatus.last_error?.message || 'Unknown error')
      );
    }

    // Get the final assistant message using direct API call
    console.log('📨 Fetching messages from thread...');
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    
    const messages = await messagesResponse.json();
    const assistantMessage = messages.data.find(m => m.role === 'assistant');
    const reply = assistantMessage?.content?.[0]?.text?.value || 'No reply from assistant.';

    console.log('💬 Assistant reply:', reply);

    res.json({
      reply,
      threadId,
    });

  } catch (error) {
    console.error('❌ Chat error:', error.message);
    console.error('🧵 threadId at error:', typeof threadId !== 'undefined' ? threadId : 'undefined');
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Set server timeout
server.timeout = serverTimeout;
console.log(`⏱️ Server timeout set to ${serverTimeout/1000} seconds`);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});