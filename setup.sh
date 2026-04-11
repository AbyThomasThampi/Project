#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# QueueSmart — One-shot VM Setup Script
# Tested on Ubuntu 22.04 / 24.04 with MySQL 8.x
# ════════════════════════════════════════════════════════════════════
set -e

# ── Config ─────────────────────────────────────────────────────────
DB_NAME="queuesmart"
DB_USER="queue_admin"
DB_PASS="password"
APP_PORT=3000

echo "========================================"
echo "  QueueSmart Server Setup"
echo "========================================"

# ── 1. System packages ────────────────────────────────────────────
echo ""
echo "[1/8] Updating package lists..."
sudo apt update -y

# ── 2. Node.js 20 LTS ────────────────────────────────────────────
echo ""
echo "[2/8] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "  → Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "  → Already installed: $(node -v)"
fi
echo "  → Updating npm..."
sudo npm install -g npm@latest

# ── 3. MySQL ──────────────────────────────────────────────────────
echo ""
echo "[3/8] Checking MySQL..."
if ! command -v mysql &> /dev/null; then
    echo "  → Installing MySQL Server..."
    sudo apt install -y mysql-server
    sudo systemctl enable --now mysql
else
    echo "  → Already installed: $(mysql -V)"
fi

# Make sure MySQL is running
if ! systemctl is-active --quiet mysql; then
    echo "  → Starting MySQL service..."
    sudo systemctl start mysql
fi

# ── 4. Database & user ────────────────────────────────────────────
echo ""
echo "[4/8] Configuring MySQL database and user..."
sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME};
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "  → Database '${DB_NAME}' and user '${DB_USER}' ready."

# ── 5. Import schema ─────────────────────────────────────────────
echo ""
echo "[5/8] Importing schema..."
if [ -f "store/schema.sql" ]; then
    # schema.sql already has CREATE DATABASE IF NOT EXISTS + USE queuesmart
    sudo mysql < store/schema.sql
    echo "  → Schema imported."
else
    echo "  ⚠  store/schema.sql not found — skipping."
fi

# ── 6. .env file ─────────────────────────────────────────────────
echo ""
echo "[6/8] Generating .env file..."
cat > .env <<EOF
DB_HOST=127.0.0.1
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_NAME=${DB_NAME}
DB_PORT=3306
PORT=${APP_PORT}
EOF
echo "  → .env created."

# ── 7. NPM dependencies ──────────────────────────────────────────
echo ""
echo "[7/8] Installing Node.js dependencies..."
npm install express cors bcryptjs dotenv mysql2
npm install
echo "  → Dependencies installed."

# ── 8. Seed demo accounts ────────────────────────────────────────
echo ""
echo "[8/8] Seeding demo accounts..."

# Use a small inline Node script so passwords get bcrypt-hashed
# just like the /register endpoint does it
node -e "
const bcrypt = require('bcryptjs');
const mysql  = require('mysql2/promise');

(async () => {
  const pool = await mysql.createPool({
    host: '127.0.0.1',
    user: '${DB_USER}',
    password: '${DB_PASS}',
    database: '${DB_NAME}',
    port: 3306
  });

  const accounts = [
    { email: 'student@tutor.com', password: 'student123', role: 'user'  },
    { email: 'admin@tutor.com',   password: 'admin123',   role: 'admin' }
  ];

  for (const acct of accounts) {
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?', [acct.email]
    );
    if (existing.length > 0) {
      console.log('  → ' + acct.email + ' already exists, skipping.');
      continue;
    }
    const hash = await bcrypt.hash(acct.password, 10);
    await pool.execute(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      [acct.email, hash, acct.role]
    );
    console.log('  → Created ' + acct.role + ': ' + acct.email);
  }

  // Seed default services if table is empty
  const [svcRows] = await pool.execute('SELECT COUNT(*) as cnt FROM services');
  if (svcRows[0].cnt === 0) {
    const services = [
      ['Algebra Tutoring', 'One-on-one help with algebra',  45, 'medium'],
      ['Essay Review',     'Detailed feedback on essays',   30, 'low'],
      ['Calculus Help',    'Calculus 1 & 2 support',        60, 'high']
    ];
    for (const [name, desc, dur, pri] of services) {
      await pool.execute(
        'INSERT INTO services (name, description, expectedDuration, priority) VALUES (?, ?, ?, ?)',
        [name, desc, dur, pri]
      );
      console.log('  → Created service: ' + name);
    }
  } else {
    console.log('  → Services already seeded, skipping.');
  }

  await pool.end();
  console.log('  → Seeding complete.');
})();
"

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "  Start the server:"
echo "    node server.js"
echo ""
echo "  Then open:"
echo "    http://localhost:${APP_PORT}"
echo ""
echo "  Demo accounts:"
echo "    Student: student@tutor.com / student123"
echo "    Admin:   admin@tutor.com   / admin123"
echo ""
echo "  To access from host machine, use your VM's IP:"
echo "    http://<VM_IP>:${APP_PORT}"
echo "========================================"
