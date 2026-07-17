import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Load Environment Variables
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN; // Set this in Meta App settings
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// System Prompt for the AI Agent
const SYSTEM_PROMPT = `
You are the lead manager for Casser Photography Production House. 
You are reaching out to a new lead who just submitted their contact information via a Facebook/Google Ad.
Your goal is to warmly introduce yourself, ask them about their photography needs (wedding, maternity, event, etc.), and gently push for booking a phone call.
Keep your message professional, warm, concise, and cinematic in tone. 
DO NOT mention that you are an AI. 
`;

// ==========================================
// 1. WhatsApp Message Sending Function
// ==========================================
async function sendWhatsAppMessage(to, message) {
  try {
    const url = `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`;
    
    // Note: To start a conversation outside the 24-hour window, you must send an approved WhatsApp Template message first.
    // Assuming this lead just opted in, you might need a template, or if they message you first, free-form text is fine.
    // For this automation, we will send a standard text message (if allowed) or you must configure a template.
    const payload = {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: message }
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    console.log("WhatsApp message sent successfully:", response.data);
  } catch (error) {
    console.error("Error sending WhatsApp message:", error.response?.data || error.message);
  }
}

// ==========================================
// 2. OpenAI Lead Processing Function
// ==========================================
async function generateAIResponseForLead(leadData) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `New Lead Information:\nName: ${leadData.name}\nPhone: ${leadData.phone}\nInterested in: ${leadData.interest || 'Unknown'}` }
      ],
      temperature: 0.7,
      max_tokens: 150,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error generating AI response:", error);
    return "Hi there! We received your inquiry at Casser Photography. We would love to capture your special moments. Let us know when is a good time to call!";
  }
}

// ==========================================
// 3. Webhook Endpoints
// ==========================================

// Meta Webhook Verification (Required when setting up Webhook in Meta Developer Dashboard)
app.get('/webhook/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.status(400).send("Missing parameters");
  }
});

// Receive Lead Data from Facebook Ads
app.post('/webhook/facebook', async (req, res) => {
  const body = req.body;

  // Immediately respond 200 OK so Facebook knows we received it
  res.status(200).send('EVENT_RECEIVED');

  if (body.object === 'page') {
    for (const entry of body.entry) {
      // Handle Leadgen event
      if (entry.changes && entry.changes[0].field === 'leadgen') {
        const leadInfo = entry.changes[0].value;
        console.log('New Lead Received from Facebook:', leadInfo);

        // In a real scenario, you would fetch the lead details using the lead_id via Graph API
        // For demonstration, we assume we extracted the name and phone number
        const leadData = {
          name: "Valued Client", // Mock extracted name
          phone: "1234567890",   // Mock extracted phone number (ensure country code is attached)
          interest: "Photography Services"
        };

        console.log(`Processing lead for ${leadData.name}...`);
        
        // 1. Generate AI Response
        const customMessage = await generateAIResponseForLead(leadData);
        
        // 2. Send via WhatsApp
        // Note: Phone number must include country code without '+' (e.g., 919876543210 for India)
        await sendWhatsAppMessage(leadData.phone, customMessage);
      }
    }
  }
});

// A simple health check route
app.get('/', (req, res) => res.send('Casser Photography Lead Automation Server is running.'));

// Start Server
app.listen(PORT, () => {
  console.log(`Lead automation server is running on port ${PORT}`);
});
