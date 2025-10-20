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


async function doLogout(reg_no) {
  try {
    // Get the user's FCM token from DB
    const { data: tokenData, error: tokenError } = await supabase
      .from("fcm_tokens")
      .select("fcm_token")
      .eq("reg_no", reg_no)
      .single(); // assume one token per user

    if (tokenError) {
      throw tokenError; // handle error
    }

    const fcm_token = tokenData?.fcm_token;
    if (!fcm_token) {
      throw new Error(`No FCM token found for reg_no: ${reg_no}`);
    }

    // 2️⃣ Send Firebase push notification
    const message = {
      token: fcm_token,

      data: {
        action: "logout",
        message: "You are being logged out remotely",
      },
      android: {
        priority: "high", // ensures delivery even if app is killed
      },
    };

    const response = await admin.messaging().send(message);

    console.log(`✅ Logout notification sent for ${reg_no}`, response);
  } catch (err) {
    console.error("❌ Error sending FCM logout:", err);

  }
}

async function handleEndOperation(student) {
  const currentTime = new Date().toISOString();
  console.log(`✅ Handling end operation for ${student.name} (${student.reg_no}) at ${currentTime}`);

  try {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const exitTime = now.toTimeString().split(' ')[0]; // "06:22:28"

    const { data, error } = await supabase
      .from("location_logs")
      .update({ exit_time: exitTime, inside: false })
      .eq("reg_no", student.reg_no)
      .eq("date", currentDate)
      .is("exit_time", null);

    if (error) console.error(`❌ Failed to update exit_time for ${student.reg_no}:`, error);
    else {
      console.log(`✅ exit_time updated for ${student.reg_no}`);
      await doLogout(student.reg_no)
    }
  } catch (err) {
    console.error(`❌ Error updating exit_time for ${student.reg_no}:`, err);
  }
}



// GitHub Action triggered script
async function checkHostelBoys() {
  const today = new Date().toLocaleString("en-US", { weekday: "long" }).toLowerCase();
  const endTimeColumn = `${today}_end_time`;
  const currentDate = new Date().toISOString().split("T")[0];

  try {
    const { data: students } = await supabase
      .from("student")
      .select("*")
      .eq("gender", "Male")
      .eq("hosteller", true);

    const { data: logs } = await supabase
      .from("location_logs")
      .select("reg_no")
      .eq("date", currentDate)
      .eq("inside", true);

    const insideRegNos = logs.map(l => l.reg_no);
    const insideStudents = students.filter(s => insideRegNos.includes(s.reg_no));

    await Promise.all(
      insideStudents.map(async (student) => {
        const { data: timing, error: timingError } = await supabase
          .from("timing")
          .select(endTimeColumn)
          .eq("dept_year_id", student.dept_year_id)
          .single();

        if (timingError || !timing?.[endTimeColumn]) {
          console.error(`Skipping ${student.reg_no}: No timing data`);
          return;
        }

        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const [h, m, s] = timing[endTimeColumn].split(':').map(Number);
        const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s || 0);

        if (now >= endTime) {
          await handleEndOperation(student); // ensure FCM is sent
        }
      })
    );



  } catch (err) {
    console.error(err);
  }
}


// ✅ Run once when GitHub Action triggers
checkHostelBoys();


