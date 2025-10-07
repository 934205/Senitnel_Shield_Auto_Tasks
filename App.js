// worker.js
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");
require("dotenv").config();

// ✅ Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role key for background tasks
const supabase = createClient(supabaseUrl, supabaseKey);

// ⚙️ Operation when a student's end time arrives
async function handleEndOperation(student) {
  // Add your end-time handling logic here
  console.log(`✅ Handling end operation for ${student.name} (${student.reg_no})`);
}

async function checkHostelBoys() {
  const today = new Date().toLocaleString("en-US", { weekday: "long" }).toLowerCase();
  const endTimeColumn = `${today}_end_time`; // Example: "monday_end_time"
  const currentDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  try {
    // Step 1: Fetch all male hosteller students
    const { data: students, error: studentError } = await supabase
      .from("student")
      .select("*")
      .eq("gender", "male")
      .eq("hosteller", true);

    if (studentError) throw studentError;

    // Step 2: Get location_logs for today where inside = true
    const { data: logs, error: logError } = await supabase
      .from("location_logs")
      .select("reg_no")
      .eq("date", currentDate)
      .eq("inside", true);

    if (logError) throw logError;

    const insideRegNos = logs.map((log) => log.reg_no);

    // Step 3: Filter students who are inside
    const insideStudents = students.filter((s) => insideRegNos.includes(s.reg_no));

    if (insideStudents.length === 0) {
      console.log("✅ No male hosteller students currently inside.");
      return;
    }

    // Step 4: For each student, get their dept_year_id timing
    for (const student of insideStudents) {
      const { data: timing, error: timingError } = await supabase
        .from("timing")
        .select(endTimeColumn)
        .eq("dept_year_id", student.dept_year_id)
        .single();

      if (timingError) {
        console.error(`❌ Error fetching timing for ${student.reg_no}:`, timingError);
        continue;
      }

      console.log(`🎓 ${student.name} (${student.reg_no}) - End time today: ${timing[endTimeColumn]}`);

      const now = new Date();
      const endTime = timing[endTimeColumn];
      if (endTime && now.toTimeString().slice(0, 5) >= endTime.slice(0, 5)) {
        await handleEndOperation(student);
      }
    }
  } catch (err) {
    console.error("❌ Error in checkHostelBoys:", err);
  }
}

// ⏰ Run immediately at startup
checkHostelBoys();

// 🔁 Schedule with node-cron: every 30 minutes between 8 AM and 6 PM
cron.schedule("0,30 8-18 * * *", async () => {
  console.log("⏰ Cron triggered at", new Date().toLocaleString());
  await checkHostelBoys();
});

console.log("✅ Supabase worker running, scheduled every 30 minutes from 8 AM to 6 PM.");
