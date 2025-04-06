require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const port = 3001;
app.use(cors());
app.use(express.json());

console.log("OpenAI API key is:", process.env.OPENAI_API_KEY);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/api/message', async (req, res) => {
  console.log("💬 POST /api/message route hit");
  const { message } = req.body;
  console.log("Received message:", message);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a helpful, polite medical receptionist AI assistant for an Australian GP clinic.
You answer basic questions, take appointment requests, and relay messages.
Never give medical advice. Be warm, professional, and respectful.`
        },
        {
          role: 'user',
          content: message
        }
      ],
      functions: [
        {
          name: "parse_patient_message",
          description: "Extracts structured info from a patient's message",
          parameters: {
            type: "object",
            properties: {
              intent: {
                type: "string",
                enum: ["appointment_request", "faq", "message_for_doctor"],
                description: "Type of the inquiry"
              },
              name: {
                type: "string",
                description: "Full name of the patient"
              },
              phone: {
                type: "string",
                description: "Phone number of the patient"
              },
              doctor: {
                type: "string",
                description: "Doctor requested, if mentioned"
              },
              preferred_time: {
                type: "string",
                description: "Preferred time and day of appointment"
              },
              reason: {
                type: "string",
                description: "Reason for the appointment or message"
              }
            },
            required: ["intent", "name", "phone"]
          }
        }
      ],
      function_call: { name: "parse_patient_message" }
    });

    const functionArgs = JSON.parse(response.choices[0].message.function_call.arguments);
    console.log("Parsed response:", functionArgs);

    const logEntry = {
      timestamp: new Date().toISOString(),
      originalMessage: message,
      parsedData: functionArgs
    };

    console.log("📝 Attempting to save log...");

    fs.readFile('logs.json', 'utf8', (err, data) => {
      let logs = [];

      if (!err && data) {
        try {
          logs = JSON.parse(data);
        } catch (parseErr) {
          console.error("❌ Failed to parse logs.json:", parseErr);
        }
      }

      logs.push(logEntry);

      fs.writeFile('logs.json', JSON.stringify(logs, null, 2), (writeErr) => {
        if (writeErr) {
          console.error("❌ Error writing to logs.json:", writeErr);
          res.status(500).send("Failed to save log.");
        } else {
          console.log("✅ Log saved to logs.json");
          res.json({ data: functionArgs });
        }
      });
    });

  } catch (err) {
    console.error("GPT call failed:", JSON.stringify(err, null, 2));
    res.status(500).send("Error processing message.");
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/logs', (req, res) => {
  fs.readFile('logs.json', 'utf8', (err, data) => {
    if (err) {
      console.error("❌ Error reading logs.json:", err);
      return res.status(500).send("Error reading logs");
    }

    try {
      const logs = JSON.parse(data);
      res.json(logs);
    } catch (e) {
      console.error("❌ Error parsing logs.json:", e);
      res.status(500).send("Invalid JSON");
    }
  });
});

app.delete('/logs/:timestamp', (req, res) => {
  const targetTimestamp = req.params.timestamp;
  fs.readFile('logs.json', 'utf8', (err, data) => {
    if (err) {
      console.error("❌ Error reading logs.json:", err);
      return res.status(500).send("Failed to read logs");
    }

    let logs = JSON.parse(data);
    const newLogs = logs.filter(entry => entry.timestamp !== targetTimestamp);

    fs.writeFile('logs.json', JSON.stringify(newLogs, null, 2), writeErr => {
      if (writeErr) {
        console.error("❌ Error writing logs.json:", writeErr);
        return res.status(500).send("Failed to delete log");
      }
      console.log(`🗑️ Log deleted: ${targetTimestamp}`);
      res.sendStatus(200);
    });
  });
});

// 🧪 Test data generator
app.post('/generate-test-data', (req, res) => {
  const fakeNames = ['Sarah Lim', 'Mark Bailey', 'Jenna Moore', 'Luke Thompson', 'Amy Tan', 'James Walker'];
  const fakeDoctors = ['Dr. Nguyen', 'Dr. Patel', 'Dr. Singh', 'Dr. Wilson'];
  const fakeReasons = ['checkup', 'follow-up', 'referral', 'results discussion', 'vaccination'];
  const fakeTimes = ['Monday 9am', 'Tuesday 2pm', 'Wednesday 11am', 'Thursday 4pm', 'Friday 10am'];

  const newLogs = [];

  for (let i = 0; i < 10; i++) {
    const name = fakeNames[Math.floor(Math.random() * fakeNames.length)];
    const doctor = fakeDoctors[Math.floor(Math.random() * fakeDoctors.length)];
    const reason = fakeReasons[Math.floor(Math.random() * fakeReasons.length)];
    const preferred_time = fakeTimes[Math.floor(Math.random() * fakeTimes.length)];
    const phone = "04" + Math.floor(100000000 + Math.random() * 900000000).toString().slice(0, 8);

    newLogs.push({
      timestamp: new Date().toISOString(),
      originalMessage: `Hi, I’m ${name}. I’d like to see ${doctor} for ${reason} at ${preferred_time}.`,
      parsedData: {
        intent: 'appointment_request',
        name,
        phone,
        doctor,
        preferred_time,
        reason
      }
    });
  }

  fs.readFile('logs.json', 'utf8', (err, data) => {
    let logs = [];
    if (!err && data) {
      try {
        logs = JSON.parse(data);
      } catch (parseErr) {
        console.error("❌ Failed to parse logs:", parseErr);
      }
    }

    logs.push(...newLogs);

    fs.writeFile('logs.json', JSON.stringify(logs, null, 2), writeErr => {
      if (writeErr) {
        console.error("❌ Failed to write logs:", writeErr);
        return res.status(500).send("Write error");
      }

      console.log("✅ Test logs generated.");
      res.sendStatus(200);
    });
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
