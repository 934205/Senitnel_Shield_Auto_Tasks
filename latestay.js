const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();
const admin = require("firebase-admin");

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


async function sendAlert(reg_no) {
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

        const info = "You are staying inside campus after regular time? please reply here why are you stay inside campus?"
        const sent_at = Date.now();

        // 1️⃣ Insert alert into DB
        const { error } = await supabase
            .from("alerts")
            .insert([{ reg_no, sent_at, info, status: "pending" }]);
        if (error) throw error;

        // 2️⃣ Send FCM notification
        const message = {
            token: fcm_token,
            data: {
                type: "input_alert",
                sentAt: sent_at.toString(),
                info,
            },
            android: { priority: "high", ttl: 0, },
        };
        await admin.messaging().send(message);

        // 3️⃣ Schedule server-side check for 2 min timeout
        setTimeout(async () => {
            const { data } = await supabase
                .from("alerts")
                .select("*")
                .eq("reg_no", reg_no)
                .eq("sent_at", sent_at)
                .single();

            if (data && data.status === "pending") {
                // user did NOT reply within 1min 
                console.log("❌ User did NOT reply within 1min ");

                const { data: student, error: studentError } = await supabase
                    .from("student")
                    .select("mobile_number, name, dept_year_id")
                    .eq("reg_no", reg_no)
                    .single();

                if (studentError || !student) {
                    return res.status(404).json({ error: "Student not found" });
                }

                // Execute function B
                await client.messages.create({
                    body: `⚠️ ALERT: ${student.name} (${reg_no}) inside campus after regular end time  (mobile number = ${student.mobile_number}) 
                    and they didn't sent any reply`,
                    from: twilioPhone,
                    to: adminPhone,
                });
                console.log("🚨 Student reply sent to Admin sent");

                // Update status to timeout
                await supabase
                    .from("alerts")
                    .update({ status: "timeout" })
                    .eq("id", data.id);
            }
        }, 60 * 2000);

        console.log(JSON.stringify({ type: 'alert_sent', reg_no, sent_at }));
    } catch (err) {
        console.error("Error sending alert:", err);
    }
}

async function handleAlertOperation(student, currentDate) {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const exitTime = now.toTimeString().split(' ')[0]; // "HH:MM:SS"

    console.log(`✅ Handling Alert operation for ${student.name} (${student.reg_no}) at ${exitTime}`);

    try {

        await sendAlert(student.reg_no);

    } catch (err) {
        console.error(`❌ Error updating exit_time for ${student.reg_no}:`, err);
    }
}




// GitHub Action triggered script
async function alertLateStayStudents() {
    const today = new Date().toLocaleString("en-US", { weekday: "long" }).toLowerCase();
    const endTimeColumn = `${today}_end_time`;
    const currentDate = new Date().toISOString().split("T")[0];

    try {
        const { data: students } = await supabase
            .from("student")
            .select("*")
            .eq("hosteller", false);

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
                const currentDate = new Date().toISOString().split("T")[0];

                if (now >= endTime.getTime() + 30 * 60 * 1000) {
                    await handleAlertOperation(student, currentDate); // ensure FCM is sent
                }

            })
        );
    } catch (err) {
        console.error(err);
    }
}


// ✅ Run once when GitHub Action triggers
alertLateStayStudents();


