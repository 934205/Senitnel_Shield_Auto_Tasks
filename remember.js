const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
const admin = require("firebase-admin");

// ✅ Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Endpoint to send to topic "all"
async function notifyAll() {
  const message = {
    notification: {
      title:"Remember Alert",
      body:"Please login to Sentinel Shield at 9'o clock",
    },
    topic: 'remember',
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Successfully sent:', response);
  } catch (error) {
    console.error('Error sending:', error);
  }
};

notifyAll()