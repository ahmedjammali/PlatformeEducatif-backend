// controllers/chatController.js - Optimized Version
const Chat = require('../models/Chat');
const User = require('../models/User');
require('dotenv').config();
const removeMarkdown = (text) => {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links but keep text
    .replace(/[*_~`>#-]+/g, '') // Remove markdown characters
    .replace(/^\s*\n/gm, '') // Remove empty lines
    .replace(/^\s{0,3}[-*+] /gm, '') // Remove list bullets
    .replace(/^\s{0,3}\d+\. /gm, '') // Remove numbered list bullets
    .replace(/\n{2,}/g, '\n') // Collapse multiple newlines
    .trim();
};


// Send message to AI and get response
const sendMessage = async (req, res) => {
  const startTime = Date.now();

  try {
    const { chatId } = req.params;
    const { message } = req.body;
    const studentId = req.userId;

    // Validate input quickly
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const student = req.user;


    // Find chat with minimal fields first
    const chatStartTime = Date.now();
    let chat = await Chat.findOne({
      _id: chatId,
      student: studentId,
      isActive: true
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }


    // Add user message
    const userMessage = {
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    chat.messages.push(userMessage);

    // Prepare AI context
    const contextStartTime = Date.now();
    const systemPrompt = createSystemPrompt(student);
    const messages = prepareMessagesForAI(chat.messages, systemPrompt);


    // Get AI response with timeout
    const aiStartTime = Date.now();
    console.log('🌐 Making AI API call...');
    
    const aiResponse = await getAIResponseWithTimeout(messages, 30000); // 30 second timeout
    console.log(`⏱️  AI API call took: ${Date.now() - aiStartTime}ms`);

    // Add AI response and save
    const saveStartTime = Date.now();
    const assistantMessage = {
    role: 'assistant',
        content: removeMarkdown(aiResponse),
        timestamp: new Date()
      };


    chat.messages.push(assistantMessage);
    await chat.save();
    console.log(`⏱️  Database save took: ${Date.now() - saveStartTime}ms`);

    console.log(`⏱️  Total request time: ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      userMessage,
      assistantMessage,
      chat: {
        id: chat._id,
        title: chat.title,
        messageCount: chat.messages.length
      },
      timing: {
        total: Date.now() - startTime,
        aiCall: Date.now() - aiStartTime
      }
    });

  } catch (error) {
    console.error('❌ Error in sendMessage:', error);
    console.log(`⏱️  Error occurred after: ${Date.now() - startTime}ms`);
    
    if (error.name === 'TimeoutError') {
      return res.status(408).json({ 
        error: 'AI service is taking too long to respond. Please try again.',
        timeout: true 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to send message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create system prompt with student context (simplified)
const createSystemPrompt = (student) => {
  const schoolName = student.school?.name || 'your school';
  const className = student.studentClass?.name || 'your class';
  const grade = student.studentClass?.grade || student.studentClass?.level || 'your grade';

  // Shorter, more focused prompt to reduce token usage
  return `You are an AI tutor helping ${student.name}, a student in ${className} at ${schoolName}.

Key guidelines:
- Give clear, concise educational answers
- Use age-appropriate language for grade ${grade}
- Be encouraging and supportive
- Keep responses focused and helpful

Student: ${student.name} | Class: ${className} | Grade: ${grade}`;
};

// Prepare messages for AI API (optimized)
const prepareMessagesForAI = (chatMessages, systemPrompt) => {
  const messages = [
    {
      role: 'system',
      content: systemPrompt
    }
  ];

  // Only include last 6 messages to reduce token usage and improve speed
  const recentMessages = chatMessages.slice(-6);
  
  recentMessages.forEach(msg => {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
  });

  return messages;
};

// AI response with timeout and retry logic
const getAIResponseWithTimeout = async (messages, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log('📤 Sending request to AI API...');
    
    // Check environment variables
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OpenRouter API key not configured');
    }

    const requestBody = {
      model: "anthropic/claude-sonnet-4", // Free model might be slower
      messages: messages,
      max_tokens: 500, // Reduced from 1000 for faster response
      temperature: 0.7,
      stream: false // Ensure we're not using streaming
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
        "X-Title": process.env.SITE_NAME || "Educational Platform",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log('📥 AI API responded with status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ AI API error:', errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      if (response.status === 402) {
        throw new Error('API credits exhausted. Please check your OpenRouter account.');
      }
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid AI API response format');
    }

    return data.choices[0].message.content;

  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    
    console.error('❌ AI API Error:', error.message);
    
    // Return a fallback response instead of failing completely
    return `I'm having trouble connecting to my AI service right now. This might be due to high demand. Please try asking your question again in a moment, or rephrase it more simply.`;
  }
};

// Alternative: Try a different, faster AI model
const getAIResponseFast = async (messages) => {
  try {
    const requestBody = {
      model: "openai/gpt-3.5-turbo", // Usually faster than deepseek
      // model: "anthropic/claude-3-haiku", // Another fast option
      // model: "meta-llama/llama-2-7b-chat", // Another option
      messages: messages,
      max_tokens: 300,
      temperature: 0.5
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
        "X-Title": process.env.SITE_NAME || "Educational Platform",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;

  } catch (error) {
    console.error('❌ Fast AI API Error:', error);
    return "I'm having trouble processing your request quickly. Please try again.";
  }
};

// Test API connectivity
const testAPIConnection = async () => {
  try {
    const testMessages = [
      { role: 'user', content: 'Hi' }
    ];
    
    const startTime = Date.now();
    const response = await getAIResponseWithTimeout(testMessages, 10000);
    const duration = Date.now() - startTime;
    
    console.log(`✅ API test successful in ${duration}ms`);
    return { success: true, duration, response };
  } catch (error) {
    console.log(`❌ API test failed:`, error.message);
    return { success: false, error: error.message };
  }
};

// Other controller functions remain the same...
const createChat = async (req, res) => {
  try {
    const { title } = req.body;
    const studentId = req.userId;

    const chat = new Chat({
      student: studentId,
      title: title || 'New Chat',
      messages: []
    });

    await chat.save();
    res.status(201).json(chat);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
};

const getStudentChats = async (req, res) => {
  try {
    const studentId = req.userId;
    
    const chats = await Chat.find({ 
      student: studentId, 
      isActive: true 
    })
    .sort({ lastMessageAt: -1 })
    .select('title lastMessageAt createdAt messages')
    .limit(50);

    res.json(chats);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
};

const getChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const studentId = req.userId;

    const chat = await Chat.findOne({
      _id: chatId,
      student: studentId,
      isActive: true
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json(chat);
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
};

const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const studentId = req.userId;

    const chat = await Chat.findOneAndUpdate(
      { _id: chatId, student: studentId },
      { isActive: false },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({ success: true, message: 'Chat deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
};

const updateChatTitle = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { title } = req.body;
    const studentId = req.userId;

    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }

    const chat = await Chat.findOneAndUpdate(
      { _id: chatId, student: studentId, isActive: true },
      { title: title.trim() },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({ success: true, chat });
  } catch (error) {
    console.error('Error updating chat title:', error);
    res.status(500).json({ error: 'Failed to update chat title' });
  }
};

module.exports = {
  createChat,
  getStudentChats,
  getChat,
  sendMessage,
  deleteChat,
  updateChatTitle,
  testAPIConnection // Export for testing
};