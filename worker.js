const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// ✅ Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handleEndOperation(student) {
  console.log(`✅ Handling end operation for ${student.name} (${student.reg_no})`);
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

// ✅ Run once when GitHub Action triggers
checkHostelBoys();
