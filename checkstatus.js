const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
const admin = require("firebase-admin");
const twilio = require("twilio");
// ✅ Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE;
const adminPhone = process.env.ADMIN_PHONE;

const client = twilio(accountSid, authToken);


const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});


// 🔹 1. Check inside students and send notification
async function checkStatus() {
  try {
    const today = new Date().toISOString().split("T")[0]; // e.g., "2025-10-21"
    const { data: insidestudents, error: studentsError } = await supabase
      .from("location_logs")
      .select("reg_no")
      .eq("inside", true)
      .eq("date",today)


    if (studentsError || !insidestudents || insidestudents.length === 0) {
      console.error("No inside students found");
      return;
    }

    for (const student of insidestudents) {
      await sendMessage(student.reg_no);
    }

  } catch (err) {
    console.error("❌ Error in exit-verification:", err.message);
  }
}

// 🔹 2. Send message and track response
async function sendMessage(reg_no) {
  try {
    // Get FCM token
    const { data: tokenData, error: tokenError } = await supabase
      .from("fcm_tokens")
      .select("fcm_token")
      .eq("reg_no", reg_no)
      .single();

    if (tokenError || !tokenData?.fcm_token) {
      console.warn(`⚠️ No FCM token for ${reg_no}`);
      return;
    }

    const fcm_token = tokenData.fcm_token;
    const info = "FCM notification to check status";
    const sent_at = Date.now();

    // Insert alert
    const { error: insertError } = await supabase
      .from("alerts")
      .insert([{ reg_no, sent_at, info, status: "pending" }]);
    if (insertError) throw insertError;

    // Send FCM
    const message = {
      token: fcm_token,
      data: { type: "reachability_ping", sentAt: sent_at.toString(), info },
      android: { priority: "high" },
    };

    await admin.messaging().send(message);
    console.log(`📨 FCM sent to ${reg_no}`);

    // Wait 2 minutes for response
    setTimeout(async () => {
      const { data } = await supabase
        .from("alerts")
        .select("*")
        .eq("reg_no", reg_no)
        .eq("sent_at", sent_at)
        .single();

      if (data && data.status === "pending") {
        console.log(`🚫 ${reg_no} device did not respond in time`);

        const { data: student } = await supabase
          .from("student")
          .select("name, mobile_number")
          .eq("reg_no", reg_no)
          .single();

        await client.messages.create({
          body: `⚠️ ALERT: ${student.name} (${reg_no}) device (${student.mobile_number}) did NOT respond.`,
          from: twilioPhone,
          to: adminPhone,
        });

        console.log("🚨 SMS sent to admin");

        await supabase
          .from("alerts")
          .update({ status: "timeout" })
          .eq("reg_no",reg_no)
          .eq("sent_at",sent_at);
      }
    }, 2 * 60 * 1000); // 2 minutes

    return {success : true}

  } catch (err) {
    console.error(`❌ Failed to send alert to ${reg_no}:`, err.message);
  }
}

checkStatus()