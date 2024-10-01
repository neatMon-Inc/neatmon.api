/*
    Description: API for neatMon
    License: MIT
    Author: neatMon, Inc.
    Date: 2022-02-25
*/

require('dotenv').config({}); // Get env variables
const Express = require("express");
const http = require('http');
const fileSystem = require('fs');
const path = require('path');
const FILE_DIRECTORY = "/usr/src/apiFiles/";
const BodyParser = require("body-parser");
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;
const bull = require('bull');
const crc32 = require('crc/crc32');
const rateLimit = require('express-rate-limit');
const queue = new bull('data-queue', 'redis://redis:6379')
const sanitize = require("sanitize-filename");

INSIDE_NEATMON = process.env.INSIDE_NEATMON
console.log(INSIDE_NEATMON)

console.log("Setting up app.  Getting environment variables...");
FROM_NEATMON_IO = process.env.FROM_NEATMON_IO
CONNECTION_URL = process.env.MONGO_URL;
const DATABASE_NAME = process.env.MONGO_DATABASE_NAME;
const DATABASE_COLLECTION = process.env.MONGO_DATABASE_COLLECTION_DATA;
const DATABASE_CONFIG = process.env.MONGO_DATABASE_COLLECTION_CONFIGURATION;
const MONGO_DATABASE_EDITOR_USER = process.env.MONGO_DATABASE_EDITOR_USER;
const MONGO_DATABASE_EDITOR_PASSWORD = process.env.MONGO_DATABASE_EDITOR_PASSWORD;

const downloadLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 1 hour
    max: 500, // max number of requests from device/ip
    message: 'Too many file download requests from this IP, please try again later'
});

/////////////////////////////////////////////////////////
/////   DATABASE CONNECTOR                          /////
/////////////////////////////////////////////////////////
const app = Express();
const server = http.createServer({}, app).listen(5000, async () => {
    console.log("Connection: ", CONNECTION_URL)
    try {
        MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true }, (error, client) => {
            if (error) {
                throw error;
            }
            database = client.db(DATABASE_NAME);
            console.log(DATABASE_COLLECTION)
            collection = database.collection(DATABASE_COLLECTION); // data storage
            unit_configuration = database.collection(DATABASE_CONFIG); // password storage
            console.log("Connected to `" + DATABASE_NAME + ":" + DATABASE_CONFIG + ", " + DATABASE_COLLECTION + "`!");
        });
    } catch (e) {
        console.error("Error connecting to Mongo client: ", e);
    }

});

// HTTP Socket Timeouts and KeepAlive for incoming HTTP requests
server.keepAliveTimeout = (60 * 1000) + 1000;
server.headersTimeout = (60 * 1000) + 2000;

app.use(BodyParser.text({ type: 'application/json' }))
app.use((req, res, next) => {
    if (req.body) {
        if (typeof req.body == 'string') {
            if (req.body.includes('"pn":"\\x')) {
                console.log('Warning: bad "pn" key detected from request body. These are currently causing issues, so removing key and value...')
                var startIndex = req.body.indexOf('"pn":"\\x')
                var endIndex = startIndex + 1
                var numQuotationMarks = 0;
                for (endIndex; endIndex < req.body.length; endIndex++) {
                    if (req.body.charAt(endIndex) === '"') {
                        numQuotationMarks++;
                    }
                    if (numQuotationMarks === 3) {
                        break;
                    }
                }
                for (endIndex; endIndex < req.body.length; endIndex++) {
                    if (req.body.charAt(endIndex) === ',') {
                        break;
                    }
                }
                const badString = req.body.substring(startIndex, endIndex)
                console.log('Removing the follow key/value pair from the request: `' + badString + '`')
                const newString = req.body.substring(0, startIndex) + req.body.substring(endIndex + 1, req.body.length)
                console.log('Successfully removed the "pn" key and value. Now processing request.')
                try {
                    req.body = JSON.parse(newString)
                }
                catch (e) {
                    let now = new Date(); // Get the date/time
                    let m_date = new Date(now.toISOString()); // Convert to ISO format
                    console.log("\ERROR with incoming request:\n\tDate:\t" + m_date + "\n\tFrom:\t" + req.ip + "\n\tGUID:\t" + req.params.p_guid + "\n\tID:\t" + req.body.id);
                    console.error(e);
                    return res.status(400).send({ err: 'Bad request/data' });
                }
            }
            else {
                try {
                    req.body = JSON.parse(req.body)
                }
                catch (e) {
                    let now = new Date(); // Get the date/time
                    let m_date = new Date(now.toISOString()); // Convert to ISO format
                    console.log("\ERROR with incoming request:\n\tDate:\t" + m_date + "\n\tFrom:\t" + req.ip + "\n\tGUID:\t" + req.params.p_guid + "\n\tID:\t" + req.body.id);
                    console.error(e);
                    console.log('Error occurred parsing JSON. Bad data was sent.');
                    return res.status(400).send({ err: 'Bad request/data' });
                }
            }
        }
    }
    next();
})

app.use((err, req, res, next) => {
    if (err) {
        let now = new Date(); // Get the date/time
        let m_date = new Date(now.toISOString()); // Convert to ISO format
        console.log("\ERROR with incoming request:\n\tDate:\t" + m_date + "\n\tFrom:\t" + req.ip + "\n\tGUID:\t" + req.params.p_guid + "\n\tID:\t" + req.body.id);
        console.error(err);
        console.log('Bad JSON was sent, sending error as a response.');
        return res.status(400).send({ err: 'Bad JSON' });
    } else {
        next()
    }
})

let database, collection;

//////////////////////////////////////////////////////////
//// FUNCTIONS                                      //////
//////////////////////////////////////////////////////////
async function checkPword(p_pword, p_guid) {
    const query = { GUID: p_guid };
    console.log("Checking for " + p_guid + ", " + p_pword);
    return new Promise(function () {
        setTimeout(function () {
            try {
                unit_configuration.findOne(query, (error, result) => {
                    console.log("Result: " + result);
                    if (error) {
                        return 0;
                    }
                    else if (!result) return 0;
                    else return 1;
                });
            } catch (error) {
                console.log("ERROR retrieving password");
                return 0;
            }
        }, 1000) // wait 1000mS for response..
    })
}

//////////////////////////////////////////////////////////
//// POST METHODS                                   //////
//////////////////////////////////////////////////////////
app.post("/api/device/:p_guid", downloadLimit, async (request, response) => {
    try {
        // If it is desired to maintain a separate record of when the data is received as opposed to 
        //   recorded then consider the code below for a starting point.  Add the m_date to the doc object
        //   too.
        let now = new Date(); // Get the date/time
        let m_date = new Date(now.toISOString()); // Convert to ISO format

        console.log("\nIncoming request:\n\tDate:\t" + m_date + "\n\tFrom:\t" + request.ip + "\n\tGUID:\t" + request.params.p_guid + "\n\tID:\t" + request.body.id);

        // Record the incoming request to the requests cache
        await database.collection('deviceApiRequestsCache').insertOne({
            route: 'v1',
            dateOfRequest: now,
            connectionIP: request.ip,
            guid: request.params.p_guid,
            postHeaders: request.headers,
            postBody: request.body,
        })

        if (!request.body?.id) return response.status(500).send("Bad unit/password"); // No ID included in post!

        // First check that the GUID is matching
        //   The incoming post can either be the full GUID string, or the shortened string
        //   To reduce payload size the GUID will be shortened to the last 5 digits in the body of the post

        let m_guid = request.body.id;

        if (request.body.id.length == 5) { // short string provided
            m_guid = request.body.id;
            cutString = request.params.p_guid.length - 5;
            if (m_guid != request.params.p_guid.substring(cutString)) return response.status(500).send("ShortID Bad unit/password");
        }
        else if (request.body.id.length > 5 && request.body.id == request.params.p_guid) m_guid = request.body.id; // Long string for GUID provided
        else return response.status(500).send("Bad unit/password"); // Catch all for bad guid or undefined guid in post

        // Parse headers for content and crc
        const length = request.get('Content-Length');
        let incomingCRC = request.get('CRC-32');

        console.log("Post/Body:")
        console.log("\tGUID:\t" + request.params.p_guid);
        console.log("\tHW:\t" + request.body.hw); // not included in every post
        console.log("\tFW:\t" + request.body.fw); // not included in every post
        console.log("\tPN:\t" + request.body.pn); // not included in every post
        console.log("Post/Length:\t" + length);
        console.log("Post/CRC-32:");
        if (!incomingCRC)
        { // Older firmware support without CRC checks
            console.log("WARNING: No CRC included in post, skipping CRC checks.  Recommend updating firmware, contact nM support.")
        }
        else
        {
            incomingCRC = incomingCRC.toLowerCase();
            console.log("\tProvided:\t" + incomingCRC);
            const calculatedIncomingCRC = crc32(JSON.stringify(request.body)).toString(16);
            console.log("\tCalculated:\t" + calculatedIncomingCRC);
            if (incomingCRC != calculatedIncomingCRC)
            {
                console.log("\tCRC-32:\tERR");
                return res.status(400).send({ err: 'CRC-32: ERR' });
            }
            else console.log("\tCRC-32:\tOK");
        }

        // If these are not included in the body, they will not be used in the db insert
        var m_hw_id = request.body.hw;
        var m_fw_id = request.body.fw;
        var m_pn_id = request.body.pn;

        const doc = {
            "guid": request.params.p_guid,
            "hw": m_hw_id,
            "fw": m_fw_id,
            "pn": m_pn_id,
            "d": m_date,
            "v": request.body.v,
            "body": request.body,
            "length": length,
            'now': now,
        }

        const deviceList = await database.collection('devices').find({ serial: doc.guid }).toArray()
        if (deviceList.length > 0) {
            const job = await queue.add(doc);
        } else {
            console.log(`Error:\n\tDevice with GUID ${doc.guid} does not exist, data will not be inserted`);
        }

        // Grab any controls that are available for device that have not been executed yet
        const controlList = await database.collection('controlQueue').find({ guid: doc.guid, executed: "" }).toArray();
        // Grab a command that needs to be executed on the device
        const cmd = await database.collection('commandQueue').findOne({ guid: doc.guid, executed: "" });

        console.log("Response:"); // Now we form the response, and if the device has any controls/command, they need to be sent to the device in the body
        if (controlList.length > 0 || cmd) {
            let finalCommand = {}
            if (controlList.length > 0) {
                finalCommand.control = [];
                controlList.forEach((ctrl) => {
                    finalCommand.control.id = ctrl._id.slice(-5);
                    finalCommand.control.push(ctrl.control);
                })
            }
            if (cmd) {
                finalCommand.id = cmd._id.slice(-5);
                if (cmd.command.fwu)
                    finalCommand.fwu = cmd.command.fwu;
                if (cmd.command.cfg)
                    finalCommand.cfg = cmd.command.cfg;
            }

            // construct the response
            const responseBody = JSON.stringify({ t: Math.floor(Date.now() / 1000), cmd: finalCommand });
            const responseBodyCrc = crc32(responseBody).toString(16);

            console.log("\tBody:\t" + responseBody);
            console.log("\tHeader/CRC-32:\t" + responseBodyCrc);

            // Header
            response.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Length': responseBody.length,
                'CRC-32': responseBodyCrc.toString(16),
            });

            // Body
            response.write(responseBody);
            response.end();
            // return response.send({ t: Math.floor(Date.now() / 1000), cmd: finalCommand });
        } else {
            const responseBody = JSON.stringify({ t: Math.floor(Date.now() / 1000) });
            const responseBodyCrc = crc32(responseBody).toString(16);

            console.log("\tBody: " + responseBody);
            console.log("\tHeader/CRC-32: " + responseBodyCrc);

            // Header
            response.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Length': responseBody.length,
                'CRC-32': responseBodyCrc.toString(16),
            });

            // Body
            response.write(responseBody);
            response.end();
        }
    }
    catch (e) {
        console.log('Exception occurred at some point during the request:');
        console.log(e);
        const responseBody = JSON.stringify({ t: Math.floor(Date.now() / 1000) });
        const responseBodyCrc = crc32(responseBody).toString(16);

        response.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Length': responseBody.length,
            'CRC-32': responseBodyCrc.toString(16),
        });

        return response.send({ t: Math.floor(Date.now() / 1000) });
    }
});

//////////////////////////////////////////////////////////
//// GET METHODS                                    //////
//////////////////////////////////////////////////////////

/*
** Get the status of the API, useful for uptime monitoring of the API by a third party
*/
app.get("/api/status", downloadLimit, async (request, response) => {
    response.send("API Working " + Date());
});

/*
** Get the current time in timestamp format
*/
app.get("/api/status/time", downloadLimit, async (request, response) => {
    let res = {
        "t": Date.now()
    }
    response.send(res);
});

/*
** Get the status of a GUID passed as parameter
** Returns all data for a given GUID starting with the latest
*/
app.get("/api/device/data/:m_guid", downloadLimit, async (request, response) => {
    const m_guid = request.params.m_guid;
    const start = request.query.start;
    const end = request.query.end;
    console.log("Incoming historical device data request\n\t/api/device/data/" + m_guid + "\n\tStart:\t" + start + "\n\tEnd:\t" + end);

    const startDate = start ? new Date(parseInt(start * 1000)).toISOString() : null;
    const endDate = end ? new Date(parseInt(end * 1000)).toISOString() : null;

    // {"metadata.guid" : "my-guid-here" , "timestamp" : {$gte : ISODate('2024-07-15T00:00:01.000')}}
    let query = { 'metadata.guid': m_guid };
    if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) {
            query.timestamp["$gte"] = new Date(startDate);
        }
        if (endDate) {
            query.timestamp["$lte"] = new Date(endDate);
        }
    }

    let sort = { 'timestamp': -1 };
    try {
        // console.dir(query); // See query sent by uncommenting this line, helpful for debugging
        await collection.find(query).sort(sort).toArray(function (error, result) {
            if (error) {
                return response.status(500).send("API Error:\n\tBad request");
            }
            console.log("Query result size: " + JSON.parse(JSON.stringify(result)).length);
            if (JSON.parse(JSON.stringify(result)).length > 1000) {
                return response.status(400).json({ "Error": "Query results exceed limits. Reduce requested range." });
            }
            response.send(result);
        });
    } catch (e) {
        console.error("Error:\tParsing incoming request failed\n", e);
        return response.status(500).send("API Error: Unable to find records in collection");
    }
});

/*
**  Get a file from the API server (for firmware updates)
**  NOTE: downLoad limit sets requests to no more than 100 in an hour!
*/
app.get("/files/:filename", downloadLimit, async (request, response) => {
    try {
        // Note: the file path below is internal to the docker container.  
        //  Unless changed, in your docker-compose the local filesystem 
        //  should direct to the folder ../apiFolder should contain the files for this route
        var requestPath = sanitize(request.params.filename); // Sanitize input
        var filePath = path.resolve(FILE_DIRECTORY, requestPath);    
        
        if (!filePath.startsWith(FILE_DIRECTORY)) {
            response.status(403).send('Forbidden');
            return;
        }

        let range = request.headers.range;
        console.log("Incoming request for file:\n\tPath:\t" + filePath  + "\n\tRange (bytes):\t" + range + "\n\tFrom:\t" + request.ip);

        if (!fileSystem.existsSync(filePath)) {
            response.status(404).send('ERR: File not found');
            return;
        }
        else if (!range) {
            response.status(400).send('ERR: Missing range');
            return;
        }

        var stat = fileSystem.statSync(filePath);
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        if (start < 0 || start >= stat.size) {
            // Check to determine if requested starting byte is greater than file size
            // https://www.rfc-editor.org/rfc/rfc7233#section-4.4
            console.log("\tWarning: Request outside start byte range of file..");
            return response.status(416).send("Bad request.  Start byte out of range!");
        }

        var end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        if (end >= stat.size) {
            console.log("\tWarning: Outside end range of filesize.  Adjusting response to available bytes and size.");
            end = stat.size - 1;
        }
        else if (end < 0)
        {
            console.log("\tWarning: Request outside end byte range of file..");
            return response.status(416).send("Bad request.  End byte is less than zero!");
        }

        const chunksize = (end - start) + 1;
        let contentRange = "bytes " + start + "-" + end + "/" + chunksize;
        const file = fileSystem.createReadStream(filePath, { start, end });
        let crcValue = "";

        file.on('data', function (chunk) {
            crcValue = crc32(chunk, crcValue);
        });

        file.on('end', function () {
            response.writeHead(206, {
                'Content-Type': 'application/octet-stream',
                'Content-Range': contentRange,
                'Content-Length': chunksize,
                'CRC-32': crcValue.toString(16),
            });

            let downloadedBytes = 0;
            fileStream2 = fileSystem.createReadStream(filePath, { start, end });

            fileStream2.on('data', function (chunk) {
                downloadedBytes += chunk.length;
                response.write(chunk);
            });

            fileStream2.on('end', function () {
                console.log('\tStatus: Send complete');
                response.end();
            });

            fileStream2.on('error', function (err) {
                console.log('\tError: Downloading file:', err);
                response.status(500).send('Error while downloading file');
            });
        });

        file.on('error', function (err) {
            console.log('\tError: Calculating CRC32:', err);
            response.status(500).send('Error while calculating CRC32');
        });
    }
    catch (e) {
        console.log(e);
        console.log('File: Bad request.');
        return response.status(400).send("Bad request.");
    }
})