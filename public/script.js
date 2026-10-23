const leadsTable = document.getElementById("leadsTable");
const leadDialog = document.getElementById("leadDialog");
const leadForm = document.getElementById("leadForm");
const formError = document.getElementById("formError");

const loginScreen = document.getElementById("loginScreen");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const appScreen = document.querySelector(".app");

let leads = [];

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}

// LOGIN CHECK
async function checkLogin() {
  try {
    const response = await fetch("/api/auth/check", {
      credentials: "same-origin"
    });

    const result = await response.json();

    loginScreen.style.display = result.authenticated ? "none" : "flex";
    appScreen.style.display = result.authenticated ? "" : "none";

    if (result.authenticated) {
      await loadLeads();
    } else {
      leads = [];
      updateStats();
    }
  } catch (error) {
    loginScreen.style.display = "flex";
    appScreen.style.display = "none";
    loginError.textContent = "Cannot connect to the server. Please restart it.";
  }
}

// ADMIN LOGIN
loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginError.textContent = "";

  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Logging in...";

  try {
    await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: document.getElementById("loginUsername").value.trim(),
        password: document.getElementById("loginPassword").value
      })
    });

    loginForm.reset();
    await checkLogin();
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Log In";
  }
});

// LOGOUT
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await apiRequest("/api/auth/logout", {
      method: "POST"
    });

    leads = [];
    updateStats();
    leadsTable.replaceChildren();
    await checkLogin();
  } catch (error) {
    alert(error.message);
  }
});

// DASHBOARD STATISTICS
function updateStats() {
  document.getElementById("totalLeads").textContent = leads.length;

  document.getElementById("newLeads").textContent =
    leads.filter(lead => lead.status === "New").length;

  document.getElementById("contactedLeads").textContent =
    leads.filter(lead => lead.status === "Contacted").length;

  document.getElementById("convertedLeads").textContent =
    leads.filter(lead => lead.status === "Converted").length;
}

function createCell() {
  return document.createElement("td");
}

// DISPLAY AND FILTER LEADS
function renderLeads() {
  const search = document.getElementById("searchInput")
    .value.trim().toLowerCase();

  const selectedStatus = document.getElementById("filterStatus").value;

  const filteredLeads = leads.filter(lead => {
    const matchesSearch =
      lead.name.toLowerCase().includes(search) ||
      lead.email.toLowerCase().includes(search);

    const matchesStatus =
      selectedStatus === "All" || lead.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  leadsTable.replaceChildren();

  if (filteredLeads.length === 0) {
    const row = document.createElement("tr");
    const cell = createCell();

    cell.colSpan = 5;
    cell.className = "empty";
    cell.textContent = leads.length
      ? "No leads match your search."
      : "No leads yet. Click Add New Lead to get started.";

    row.appendChild(cell);
    leadsTable.appendChild(row);
    return;
  }

  filteredLeads.forEach(lead => {
    const row = document.createElement("tr");

    // CLIENT NAME AND EMAIL
    const clientCell = createCell();
    clientCell.textContent = lead.name;

    const email = document.createElement("small");
    email.textContent = lead.email;
    clientCell.appendChild(email);

    // SOURCE
    const sourceCell = createCell();
    sourceCell.textContent = lead.source;

    // STATUS
    const statusCell = createCell();
    const statusSelect = document.createElement("select");
    statusSelect.className = `status ${lead.status}`;

    ["New", "Contacted", "Converted"].forEach(status => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      option.selected = lead.status === status;
      statusSelect.appendChild(option);
    });

    statusSelect.addEventListener("change", async () => {
      try {
        await apiRequest(`/api/leads/${lead.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: statusSelect.value })
        });

        await loadLeads();
      } catch (error) {
        alert(error.message);
        await loadLeads();
      }
    });

    statusCell.appendChild(statusSelect);

    // FOLLOW-UP NOTES
    const notesCell = createCell();
    const notesInput = document.createElement("input");

    notesInput.className = "notes-input";
    notesInput.value = lead.notes || "";
    notesInput.maxLength = 1000;
    notesInput.placeholder = "Add a note...";
    notesInput.setAttribute("aria-label", `Notes for ${lead.name}`);

    const saveNoteButton = document.createElement("button");
    saveNoteButton.className = "action-btn";
    saveNoteButton.textContent = "Save";

    saveNoteButton.addEventListener("click", async () => {
      try {
        await apiRequest(`/api/leads/${lead.id}`, {
          method: "PATCH",
          body: JSON.stringify({ notes: notesInput.value })
        });

        await loadLeads();
      } catch (error) {
        alert(error.message);
      }
    });

    notesCell.append(notesInput, saveNoteButton);

    // DELETE LEAD
    const actionsCell = createCell();
    const deleteButton = document.createElement("button");

    deleteButton.className = "action-btn delete";
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", async () => {
      if (!confirm(`Delete the lead "${lead.name}"?`)) return;

      try {
        await apiRequest(`/api/leads/${lead.id}`, {
          method: "DELETE"
        });

        await loadLeads();
      } catch (error) {
        alert(error.message);
      }
    });

    actionsCell.appendChild(deleteButton);

    row.append(
      clientCell,
      sourceCell,
      statusCell,
      notesCell,
      actionsCell
    );

    leadsTable.appendChild(row);
  });
}

// LOAD LEADS FROM THE DATABASE
async function loadLeads() {
  try {
    leads = await apiRequest("/api/leads");
    updateStats();
    renderLeads();
  } catch (error) {
    if (error.message === "Please log in first.") {
      await checkLogin();
      return;
    }

    leadsTable.replaceChildren();

    const row = document.createElement("tr");
    const cell = createCell();

    cell.colSpan = 5;
    cell.className = "empty";
    cell.textContent = "Could not load leads. Please check the server.";

    row.appendChild(cell);
    leadsTable.appendChild(row);

    console.error(error);
  }
}

// OPEN ADD-LEAD FORM
document.getElementById("addLeadBtn").addEventListener("click", () => {
  formError.textContent = "";
  leadForm.reset();
  leadDialog.showModal();
});

// CLOSE ADD-LEAD FORM
document.getElementById("closeDialog").addEventListener("click", () => {
  leadDialog.close();
});

leadDialog.addEventListener("click", event => {
  if (event.target === leadDialog) {
    leadDialog.close();
  }
});

// SAVE NEW LEAD
leadForm.addEventListener("submit", async event => {
  event.preventDefault();
  formError.textContent = "";

  const formData = new FormData(leadForm);

  const lead = {
    name: formData.get("name").trim(),
    email: formData.get("email").trim(),
    source: formData.get("source")
  };

  try {
    await apiRequest("/api/leads", {
      method: "POST",
      body: JSON.stringify(lead)
    });

    leadDialog.close();
    leadForm.reset();
    await loadLeads();
  } catch (error) {
    formError.textContent = error.message;
  }
});

// SEARCH AND FILTER
document.getElementById("searchInput")
  .addEventListener("input", renderLeads);

document.getElementById("filterStatus")
  .addEventListener("change", renderLeads);

// START THE APP
checkLogin();