# neatMon API SDK

This repository contains the SDK for a deployable API that receives, parses, and stores data from neatMon Automated Monitoring Nodes (AMNs). It enables seamless integration with databases and other applications for real-time monitoring, analytics, and automation.

---

## 📎 Helpful Links

- [neatMon Open Source API Documentation](https://neatmon-inc.github.io/neatmon.api/)
- [User Guides and Docs](https://info.neatmon.com/)
- For support, contact: info@neatmon.com

---

## 🎥 API Technical Overview (YouTube)

Watch a walkthrough of the deployment process and menu-driven setup of the AMNs:  
[https://www.youtube.com/watch?v=SwGXM8TaJbA&t=304s](https://www.youtube.com/watch?v=SwGXM8TaJbA&t=304s)

---

## 🚀 Getting Started

To begin, copy and configure the environment variables (see below). Then use the `make` command to launch the API. Once started, you can verify it’s running by visiting:

http://localhost/api/status

A working response should return:

"API Working Sat Feb 26 2022 08:16:20 GMT+0000 (Coordinated Universal Time)"

---

## 🛠️ Installation

The API is Docker-based and is designed for consistent deployment across environments. While it can also be run with `node index.js`, Docker is recommended to avoid version mismatches.

### System Requirements

- Preferred OS: Linux (others supported with adjustments)
- Required:
  - `make`
  - `docker`

---

## ⚙️ Environment Variable Setup

Copy the sample configuration:

cp config/.env_sample config/.env

Update the values in `.env` to match your deployment settings.

You’ll also need to configure MongoDB users in `database/init-mongo.js`.

---

## 🧱 Building the Complete App

The app includes:
- A Node.js API server
- A MongoDB database

Each service has its own Dockerfile. Docker Compose is used for orchestration.

### Run the App

From the root directory:

make         # or `make run`

### Stop the App

If running in an active terminal, press:

CTRL + C

To stop all running Docker containers (in any terminal):

docker stop $(docker ps -aq)

### Stop and Erase

To stop and remove all containers, volumes, and networks:

CTRL + C
make nuke

---

## 🧩 Building Only the Server

If not using Docker Compose, you can build and run the server manually:

### Build

cd server
make build

### Run

cd server
make up

---

## 🧪 Debugging GUID Requests

Two utility scripts are included for debugging production connections:

- `deploy_log_guid.sh`
- `deploy_check_guid.sh`

Before use, make them executable:

chmod +x deploy_*

These will output detailed logs for a given GUID.

---

## 🔄 Firmware Over-the-Air (FOTA) Updates

When first run, the API will create a directory at:

../apiFolder

This path holds firmware for AMNs. The location can be modified in `docker-compose.yml`.

See the documentation for further information on how to perform a FOTA/OTA for specific devices.

---

## 📈 Repository Stats (as of latest commit)

- **First Commit:** _2022-02-25_
- **Total Commits:** _258 (as of 2025-06-26)_

### 👨‍💻 Primary Languages
- **JavaScript:** 879 lines  
- **YAML:** 338 lines  
- **JSON:** 256 lines  
- **HTML:** 89 lines  
- **Shell:** 47 lines  
- **Dockerfile:** 9 lines  

---
