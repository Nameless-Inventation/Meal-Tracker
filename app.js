// ==========================================
// CONFIGURATION - SUPABASE
// ==========================================
// Replace these with your actual Supabase Project URL and Anon Key
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Architecture for future billing
const PRICING = { breakfast: 50, lunch: 50, dinner: 50 };

// ==========================================
// STATE MANAGEMENT
// ==========================================
const state = {
  user: null,
  currentDate: new Date(), // Determines the month being viewed
  selectedDate: null,      // The specific day opened in the modal
  records: {}              // Cache of current month's records: {'YYYY-MM-DD': {breakfast: true, ...}}
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
const toDateString = (date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return (new Date(date.getTime() - offset)).toISOString().split('T')[0];
};
const getMonthBounds = (date) => {
  const y = date.getFullYear(), m = date.getMonth();
  return { start: toDateString(new Date(y, m, 1)), end: toDateString(new Date(y, m + 1, 0)) };
};
const showToast = (message) => {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
};

// ==========================================
// AUTHENTICATION
// ==========================================
async function checkUser() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  state.user = session?.user || null;
  toggleViews();
  if (state.user) loadMonthData();
}

async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');
  errorEl.textContent = 'Authenticating...';

  // Try signing in
  let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  
  if (error && error.message.includes('Invalid login credentials')) {
    // If not found, try signing up (simplified magic flow for demo)
    const signUpRes = await supabaseClient.auth.signUp({ email, password });
    if (signUpRes.error) {
      errorEl.textContent = signUpRes.error.message;
      return;
    }
    errorEl.textContent = 'Check your email to confirm signup, or if auto-confirm is on, you are logged in.';
    data = signUpRes.data;
  } else if (error) {
    errorEl.textContent = error.message;
    return;
  }

  if (data.user) {
    state.user = data.user;
    errorEl.textContent = '';
    toggleViews();
    loadMonthData();
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  state.user = null;
  toggleViews();
}

function toggleViews() {
  const authSection = document.getElementById('auth-section');
  const appSection = document.getElementById('app-section');
  if (state.user) {
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
  } else {
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
  }
}

// ==========================================
// DATABASE OPERATIONS
// ==========================================
async function loadMonthData() {
  const { start, end } = getMonthBounds(state.currentDate);
  const { data, error } = await supabaseClient
    .from('meal_records')
    .select('*')
    .gte('date', start)
    .lte('date', end);

  if (error) {
    showToast('Failed to load data. Retrying...');
    return;
  }

  state.records = {};
  data.forEach(record => {
    state.records[record.date] = {
      breakfast: record.breakfast,
      lunch: record.lunch,
      dinner: record.dinner
    };
  });
  
  renderUI();
}

async function saveMealToggle(dateStr, mealType, isSelected) {
  showToast('Saving...');
  
  // Optimistic UI update
  if (!state.records[dateStr]) state.records[dateStr] = { breakfast: false, lunch: false, dinner: false };
  state.records[dateStr][mealType] = isSelected;
  
  const rec = state.records[dateStr];
  const isEmpty = !rec.breakfast && !rec.lunch && !rec.dinner;

  renderUI(); // Render immediately

  if (isEmpty) {
    // Optional: Delete empty record
    const { error } = await supabaseClient.from('meal_records').delete().eq('date', dateStr).eq('user_id', state.user.id);
    if (error) handleErrorAndRevert(dateStr, mealType, !isSelected, 'Delete failed.');
    else showToast('Saved');
  } else {
    // Upsert
    const payload = { 
      date: dateStr, 
      user_id: state.user.id, 
      breakfast: rec.breakfast, 
      lunch: rec.lunch, 
      dinner: rec.dinner,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabaseClient.from('meal_records').upsert(payload, { onConflict: 'user_id, date' });
    if (error) handleErrorAndRevert(dateStr, mealType, !isSelected, 'Save failed.');
    else showToast('Saved');
  }
}

function handleErrorAndRevert(dateStr, mealType, revertedState, msg) {
  showToast(msg + ' Reverting.');
  state.records[dateStr][mealType] = revertedState;
  renderUI();
  updateModalUI();
}

// ==========================================
// UI RENDERING
// ==========================================
function renderUI() {
  renderCalendar();
  renderSummaryAndBreakdown();
}

function renderCalendar() {
  const y = state.currentDate.getFullYear();
  const m = state.currentDate.getMonth();
  
  document.getElementById('calendar-title').textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(state.currentDate);
  
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';
  
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayStr = toDateString(new Date());

  // Filler days
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  // Actual days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateString(new Date(y, m, d));
    const rec = state.records[dateStr] || { breakfast: false, lunch: false, dinner: false };
    
    const el = document.createElement('div');
    el.className = `cal-day ${dateStr === todayStr ? 'today' : ''}`;
    el.onclick = () => openDateDetails(dateStr);
    
    let dotsHTML = '';
    if (rec.breakfast) dotsHTML += '<div class="dot b"></div>';
    if (rec.lunch) dotsHTML += '<div class="dot l"></div>';
    if (rec.dinner) dotsHTML += '<div class="dot d"></div>';

    el.innerHTML = `
      <span class="date-num">${d}</span>
      <div class="meal-dots">${dotsHTML}</div>
    `;
    grid.appendChild(el);
  }
}

function renderSummaryAndBreakdown() {
  let b = 0, l = 0, d = 0, days = 0;
  const breakdownList = document.getElementById('breakdown-list');
  breakdownList.innerHTML = '';

  const sortedDates = Object.keys(state.records).sort();

  sortedDates.forEach(dateStr => {
    const rec = state.records[dateStr];
    let dailyMeals = [];
    if (rec.breakfast) { b++; dailyMeals.push('Breakfast'); }
    if (rec.lunch) { l++; dailyMeals.push('Lunch'); }
    if (rec.dinner) { d++; dailyMeals.push('Dinner'); }
    
    if (dailyMeals.length > 0) {
      days++;
      const li = document.createElement('li');
      // Just extract day number for display
      const dayNum = parseInt(dateStr.split('-')[2], 10);
      li.innerHTML = `<strong>${dayNum}</strong> <span>${dailyMeals.join(', ')}</span>`;
      breakdownList.appendChild(li);
    }
  });

  document.getElementById('stat-b').textContent = b;
  document.getElementById('stat-l').textContent = l;
  document.getElementById('stat-d').textContent = d;
  document.getElementById('stat-total').textContent = b + l + d;
  document.getElementById('stat-days').textContent = days;
}

// ==========================================
// MODAL & INTERACTIONS
// ==========================================
function openDateDetails(dateStr) {
  state.selectedDate = dateStr;
  
  // Format title like "September 19, 2026"
  const dObj = new Date(dateStr + "T00:00:00"); // Avoid timezone shift
  document.getElementById('modal-date-title').textContent = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(dObj);
  
  updateModalUI();
  document.getElementById('date-modal').classList.remove('hidden');
}

function updateModalUI() {
  const rec = state.records[state.selectedDate] || { breakfast: false, lunch: false, dinner: false };
  document.querySelectorAll('.meal-btn').forEach(btn => {
    const meal = btn.dataset.meal;
    if (rec[meal]) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function closeDateDetails() {
  document.getElementById('date-modal').classList.add('hidden');
  state.selectedDate = null;
}

// ==========================================
// EXPORT & IMPORT
// ==========================================
async function exportData() {
  showToast('Fetching all records for export...');
  const { data, error } = await supabaseClient.from('meal_records').select('*').eq('user_id', state.user.id);
  
  if (error) {
    showToast('Export failed.');
    return;
  }

  const exportObj = {
    version: 1,
    exportedAt: new Date().toISOString(),
    dailyMeals: data.map(d => ({ date: d.date, breakfast: d.breakfast, lunch: d.lunch, dinner: d.dinner }))
  };

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `maid-meals-export-${toDateString(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const json = JSON.parse(event.target.result);
      if (!json.dailyMeals || !Array.isArray(json.dailyMeals)) throw new Error("Invalid format");
      
      if (!confirm(`Import ${json.dailyMeals.length} records? This will merge with existing data.`)) return;
      
      showToast('Importing...');
      const payload = json.dailyMeals.map(d => ({
        user_id: state.user.id,
        date: d.date,
        breakfast: !!d.breakfast,
        lunch: !!d.lunch,
        dinner: !!d.dinner,
        updated_at: new Date().toISOString()
      }));

      // Supabase upsert supports arrays for bulk operations
      const { error } = await supabaseClient.from('meal_records').upsert(payload, { onConflict: 'user_id, date' });
      if (error) throw error;

      showToast('Import successful!');
      loadMonthData(); // reload
    } catch (err) {
      showToast('Import failed. Invalid file or network error.');
      console.error(err);
    }
    e.target.value = ''; // reset
  };
  reader.readAsText(file);
}


// ==========================================
// EVENT LISTENERS
// ==========================================
document.getElementById('auth-form').addEventListener('submit', handleAuth);
document.getElementById('btn-logout').addEventListener('click', handleLogout);

document.getElementById('btn-prev-month').addEventListener('click', () => {
  state.currentDate.setMonth(state.currentDate.getMonth() - 1);
  loadMonthData();
});
document.getElementById('btn-next-month').addEventListener('click', () => {
  state.currentDate.setMonth(state.currentDate.getMonth() + 1);
  loadMonthData();
});
document.getElementById('btn-today').addEventListener('click', () => {
  state.currentDate = new Date();
  loadMonthData();
});

document.getElementById('btn-close-modal').addEventListener('click', closeDateDetails);
document.getElementById('date-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('date-modal')) closeDateDetails();
});

document.querySelectorAll('.meal-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!state.selectedDate) return;
    const meal = btn.dataset.meal;
    const isActive = btn.classList.contains('active');
    saveMealToggle(state.selectedDate, meal, !isActive);
  });
});

document.getElementById('btn-export').addEventListener('click', exportData);
document.getElementById('import-file').addEventListener('change', importData);

// Auth state listener (handles tab synchronization)
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    state.user = null;
    toggleViews();
  }
});

// Init
checkUser();
