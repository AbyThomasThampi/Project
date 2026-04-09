-- Database schema

CREATE DATABASE IF NOT EXISTS queuesmart;
USE queusmart;

-- ── Users ───────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    password VARCHAR(128) NOT NULL,
    role ENUM('user','admin') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Services ────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL,
    expectedDuration INT NOT NULL,
    priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Queue ───────────────────────────────────
CREATE TABLE IF NOT EXISTS queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    serviceId INT NOT NULL,
    status ENUM('open','closed') DEFAULT 'open',
    joinedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    email VARCHAR(254),
    priority ENUM('low','medium','high'),
    FOREIGN KEY (serviceId) REFERENCES services(id) ON DELETE CASCADE
);

-- ── Notifications ───────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userEmail VARCHAR(254) NOT NULL,
    type ENUM('info','success','warning','alert') DEFAULT 'info',
    title VARCHAR(200) NOT NULL,
    message VARCHAR(500) NOT NULL,
    service_id INT,
    isRead TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
);

-- ── History ─────────────────────────────────
CREATE TABLE IF NOT EXISTS history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    serviceId INT NOT NULL,
    serviceName VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    joinedAt DATETIME NOT NULL,
    completedAt TIMESTAMP NULL,
    status ENUM('served','left') NOT NULL,
    waitTimeMinutes INT NOT NULL DEFAULT 0,
    FOREIGN KEY (serviceId) REFERENCES services(id) ON DELETE CASCADE
);