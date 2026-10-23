const express = require("express");
require("dotenv").config();
const path = require("path");
const session = require("express-session");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3000;

const db = new Database(path.join(__dirname, "crm.db"));

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'New',
    notes TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Please log in first." });
}

// Check whether the current user is logged in
app.get("/api/auth/check", (req, res) => {
  res.json({ authenticated: Boolean(req.session.isAdmin) });
});

// Admin login
app.post("/api/auth/login", (req, res, next) => {
  const { username, password } = req.body || {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username !== ADMIN_USERNAME ||
    password !== ADMIN_PASSWORD
  ) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }

  req.session.regenerate(error => {
    if (error) return next(error);

    req.session.isAdmin = true;
    res.json({ message: "Login successful." });
  });
});

// Admin logout
app.post("/api/auth/logout", (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out successfully." });
  });
});

// All lead operations require login
app.use("/api/leads", requireLogin);

// Get leads
app.get("/api/leads", (req, res) => {
  try {
    res.json(db.prepare("SELECT * FROM leads ORDER BY id DESC").all());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not fetch leads." });
  }
});

// Add a lead
app.post("/api/leads", (req, res) => {
  try {
    const { name, email, source } = req.body || {};

    if (
      typeof name !== "string" || !name.trim() ||
      typeof email !== "string" || !email.trim() ||
      typeof source !== "string" || !source.trim()
    ) {
      return res.status(400).json({
        error: "Name, email, and source are required."
      });
    }

    if (name.length > 100 || email.length > 254 || source.length > 100) {
      return res.status(400).json({ error: "One or more fields are too long." });
    }

    const result = db.prepare(`
      INSERT INTO leads (name, email, source)
      VALUES (?, ?, ?)
    `).run(name.trim(), email.trim(), source.trim());

    res.status(201).json(
      db.prepare("SELECT * FROM leads WHERE id = ?").get(result.lastInsertRowid)
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not add lead." });
  }
});

// Update status and/or notes
app.patch("/api/leads/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(id);

    if (!Number.isInteger(id) || id <= 0 || !lead) {
      return res.status(404).json({ error: "Lead not found." });
    }

    const { status, notes } = req.body || {};
    const allowedStatuses = ["New", "Contacted", "Converted"];

    if (status !== undefined && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid lead status." });
    }

    if (notes !== undefined &&
        (typeof notes !== "string" || notes.length > 1000)) {
      return res.status(400).json({ error: "Notes must be text up to 1000 characters." });
    }

    db.prepare(`
      UPDATE leads SET status = ?, notes = ? WHERE id = ?
    `).run(status ?? lead.status, notes ?? lead.notes, id);

    res.json(db.prepare("SELECT * FROM leads WHERE id = ?").get(id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not update lead." });
  }
});

// Delete a lead
app.delete("/api/leads/:id", (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid lead ID." });
    }

    const result = db.prepare("DELETE FROM leads WHERE id = ?").run(id);

    if (!result.changes) {
      return res.status(404).json({ error: "Lead not found." });
    }

    res.json({ message: "Lead deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not delete lead." });
  }
});

app.listen(PORT, () => {
  console.log(`Mini CRM running at http://localhost:${PORT}`);
});