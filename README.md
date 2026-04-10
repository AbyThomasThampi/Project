# QueueSmart – Backend (Assignment 4)

## Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Testing:** Jest + Supertest
- **Database:** MySQL (persistent storage via mysql2)

---

## Project Structure

```
queuesmart-backend/
├── server.js                  ← Express entry point
├── package.json
├── routes/
│   ├── auth.js                ← POST /api/auth/login|register
│   ├── services.js            ← CRUD  /api/services
│   ├── queue.js               ← Queue management + wait-time logic
│   ├── notifications.js       ← Notification triggers & retrieval
│   └── history.js             ← Queue participation history
├── middleware/
│   └── validate.js            ← Field validation helpers
├── store/
│   ├── dataStore.js           ← MySQL data access layer(users, queue, services, notifications, history)
│   ├── db.js                  ← MySQL connection pool
│   └── schema.sql             ← MySQL database schema (tables + setup) 
├── tests/
│   └── queuesmart.test.js     ← Jest unit tests (70–80% coverage target)
└── public/
    ├── api.js                 ← Frontend API client (replaces script.js)
    └── [copy A2 HTML/CSS here]
```

---

## Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Setup MySQL database
# - Install MySQL locally if not already installed
# - Run the schema file:
mysql -u root -p < store/schema.sql

# 3. Start the server (port 3000)
npm start

# 4. Open the frontend
#    Copy all A2 HTML/CSS files into the public/ folder, then visit:
#    http://localhost:3000

# 5. Run tests
npm test
```

---

## API Endpoints

### Authentication
| Method | Endpoint              | Body                              | Description          |
|--------|-----------------------|-----------------------------------|----------------------|
| POST   | /api/auth/register    | email, password, role?            | Register new user    |
| POST   | /api/auth/login       | email, password                   | Login                |
| GET    | /api/auth/users       | —                                 | List all users       |

### Services
| Method | Endpoint              | Body / Params                     | Description          |
|--------|-----------------------|-----------------------------------|----------------------|
| GET    | /api/services         | —                                 | List all services    |
| GET    | /api/services/:id     | —                                 | Get one service      |
| POST   | /api/services         | name, description, expectedDuration, priority? | Create service |
| PUT    | /api/services/:id     | Any service field(s)              | Update service       |
| DELETE | /api/services/:id     | —                                 | Delete service       |

### Queue
| Method | Endpoint                       | Body / Params                 | Description            |
|--------|--------------------------------|-------------------------------|------------------------|
| GET    | /api/queue/:serviceId          | —                             | View queue             |
| POST   | /api/queue/:serviceId/join     | email                         | Join queue             |
| DELETE | /api/queue/:serviceId/leave    | email                         | Leave queue            |
| POST   | /api/queue/:serviceId/serve    | —                             | Serve next user        |
| PATCH  | /api/queue/:serviceId/priority | email, priority               | Change user priority   |
| PATCH  | /api/queue/:serviceId/reorder  | fromIndex, toIndex            | Reorder queue          |
| GET    | /api/queue/:serviceId/wait     | —                             | Wait-time estimate     |

### Notifications
| Method | Endpoint                        | Body / Params                            | Description          |
|--------|---------------------------------|------------------------------------------|----------------------|
| POST   | /api/notifications              | userEmail, type, title, message          | Create notification  |
| GET    | /api/notifications/:email       | ?limit=N                                 | Get unread notifs    |
| PATCH  | /api/notifications/:id/read     | —                                        | Mark read            |
| DELETE | /api/notifications/:email       | —                                        | Clear all for user   |

### History
| Method | Endpoint                         | Params                                        | Description        |
|--------|----------------------------------|-----------------------------------------------|--------------------|
| GET    | /api/history/:email              | ?status=&serviceId=&startDate=&endDate=       | Get user history   |
| GET    | /api/history/:email/stats        | —                                             | Aggregate stats    |
| DELETE | /api/history/:email              | —                                             | Clear user history |

---

## Frontend Integration

Replace `<script src="script.js"></script>` with `<script src="api.js"></script>` in every HTML page.

`api.js` is a drop-in replacement:
- All function signatures are identical to `script.js`
- All localStorage calls are replaced with `fetch()` calls to the Express backend
- `loadData()` and `refreshAllQueues()` are called automatically on page load

---

## Demo Accounts (seeded)
| Role    | Email               | Password    |
|---------|---------------------|-------------|
| Student | student@tutor.com   | student123  |
| Admin   | admin@tutor.com     | admin123    |
