/*
  neatMon Secure Data API Test Client
  -----------------------------------
  Requests historical device data using HMAC authentication
*/

const http = require("http");
const crypto = require("crypto");

// ===== CONFIG =====
const HOST = "localhost";
const PORT = 1330;
const SECRET_KEY = "PUT_YOUR_ORGANIZATION_32_CHARACTER_LENGTH_KEY_HER";  // <-- Put real org.secretKey here
const GUID = "PUT-YOUR-GUID-HERE";

// Put EPOCH Start and End
const START = 1771112341; // Saturday, February 14, 2026 11:39:01 PM
const END   = 1771544341; // Thursday, February 19, 2026 11:39:01 PM

// ===== BUILD REQUEST PATH =====
const path = `/api/device/data/${GUID}?end=${END}&start=${START}`;

// ===== CREATE SIGNATURE =====
const timestamp = Math.floor(Date.now() / 1000).toString();
const method = "GET";

const payload = `${timestamp}${method}${path}`;

const signature = crypto
  .createHmac("sha256", SECRET_KEY)
  .update(payload)
  .digest("hex");

// ===== HTTP REQUEST OPTIONS =====
const options = {
  hostname: HOST,
  port: PORT,
  path: path,
  method: method,
  headers: {
    "x-nm-timestamp": timestamp,
    "x-nm-signature": signature,
    "Content-Type": "application/json"
  }
};

console.log("=== REQUEST DEBUG ===");
console.log("GUID:", GUID);
console.log("Secret:", SECRET_KEY);
console.log("Timestamp:", timestamp);
console.log("Payload:", payload);
console.log("Signature:", signature);
console.log("Path:", path);
console.log("=====================\n");

// ===== SEND REQUEST =====
const req = http.request(options, (res) => {
  let data = "";

  console.log("Status Code:", res.statusCode);

  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    try {
      const parsed = JSON.parse(data);
      console.log("Response JSON:");
      console.dir(parsed, { depth: null });
    } catch (err) {
      console.log("Raw Response:");
      console.log(data);
    }
  });
});

req.on("error", (error) => {
  console.error("Request error:", error);
});

req.end();