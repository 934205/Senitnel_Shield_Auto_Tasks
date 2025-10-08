const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// ✅ Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handleEndOperation(student) {
  const currentTime = new Date().toISOString();
  console.log(`✅ Handling end operation for ${student.name} (${student.reg_no}) at ${currentTime}`);

  try {
    const { data, error } = await supabase
      .from("location_logs")
      .update({ exit_time: currentTime, inside: false })
      .eq("reg_no", student.reg_no)
      .eq("date", new Date().toISOString().split("T")[0])
      .is("exit_time", null); // only update if not already updated

    if (error) console.error(`❌ Failed to update exit_time for ${student.reg_no}:`, error);
    else console.log(`✅ exit_time updated for ${student.reg_no}`);
  } catch (err) {
    console.error(`❌ Error updating exit_time for ${student.reg_no}:`, err);
  }
}



async function checkHostelBoys() {
  const today = new Date().toLocaleString("en-US", { weekday: "long" }).toLowerCase();
  const endTimeColumn = `${today}_end_time`;
  const currentDate = new Date().toISOString().split("T")[0];

  try {
    const { data: students, error: studentError } = await supabase
      .from("student")
      .select("*")
      .eq("gender", "Male")
      .eq("hosteller", true);

    if (studentError) throw studentError;

    const { data: logs, error: logError } = await supabase
      .from("location_logs")
      .select("reg_no")
      .eq("date", currentDate)
      .eq("inside", true);

    if (logError) throw logError;

    const insideRegNos = logs.map((log) => log.reg_no);
    const insideStudents = students.filter((s) => insideRegNos.includes(s.reg_no));

    if (insideStudents.length === 0) {
      console.log("✅ No male hosteller students currently inside.");
      return;
    }

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

      const now = new Date(); // current date & time
      const [hours, minutes, seconds] = timing[endTimeColumn].split(':').map(Number);

      // create a Date object for today at endTime
      const endTimeDate = new Date(now);
      endTimeDate.setHours(hours, minutes, seconds || 0, 0);

      if (now >= endTimeDate) {
        await handleEndOperation(student);
      }

    }
  } catch (err) {
    console.error("❌ Error in checkHostelBoys:", err);
  }
}

// ✅ Run once when GitHub Action triggers
checkHostelBoys();
