/*
    Description: API for neatMon
    License: MIT
    Author: neatMon, Inc.
    Date: 2022-02-25
*/

require('dotenv').config({}); // Get env variables
// const axios = require("axios"); // HTTP Client
const Express = require("express");
var http = require('http'),
    fileSystem = require('fs'),
    path = require('path');
const FILE_DIRECTORY = "/usr/src/apiFiles/";
const BodyParser = require("body-parser");
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;
const bull = require('bull');
const crc32 = require('crc/crc32');
const queue = new bull('data-queue', 'redis://redis:6379')
// const fetch = require('isomorphic-fetch')

INSIDE_NEATMON = process.env.INSIDE_NEATMON
console.log(INSIDE_NEATMON)

console.log("Setting up app.  Getting environment variables");
FROM_NEATMON_IO = process.env.FROM_NEATMON_IO
CONNECTION_URL = process.env.MONGO_URL;
const DATABASE_NAME = process.env.MONGO_DATABASE_NAME;
const DATABASE_COLLECTION = process.env.MONGO_DATABASE_COLLECTION_DATA;
const DATABASE_CONFIG = process.env.MONGO_DATABASE_COLLECTION_CONFIGURATION;
const MONGO_DATABASE_EDITOR_USER = process.env.MONGO_DATABASE_EDITOR_USER;
const MONGO_DATABASE_EDITOR_PASSWORD = process.env.MONGO_DATABASE_EDITOR_PASSWORD;
console.log("Connecting with User: " + MONGO_DATABASE_EDITOR_USER);
console.log("pword: " + MONGO_DATABASE_EDITOR_PASSWORD);

// Add the protocol to the connection URL
// if (FROM_NEATMON_IO !== 'true') {
//     CONNECTION_URL = "mongodb://" + MONGO_DATABASE_EDITOR_USER + ":" + MONGO_DATABASE_EDITOR_PASSWORD + "@" + CONNECTION_URL + "/" + DATABASE_NAME;
// }


console.log("DB string " + CONNECTION_URL);

let app = Express();
app.use(BodyParser.text({type: 'application/json'}))
app.use((req, res, next) => {
    if (req.body) {
        if (typeof req.body == 'string') {
            if (req.body.includes('"pn":')) {
                console.log('Warning: "pn" key detected from request body. These are currently causing issues, so removing...')
                var startIndex = req.body.indexOf('"pn":')
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
                const newString = req.body.substring(0, startIndex) + req.body.substring(endIndex + 1, req.body.length)
                req.body = JSON.parse(newString)
                console.log('Successfully removed the "pn" key. Now processing request.')
            }
            else {
                req.body = JSON.parse(req.body)
            }
        } 
        else {
            console.log('Not a string...')
            console.log(typeof req.body)
            console.log(req.body)
        }
    }
    next()
})
// app.use(BodyParser.urlencoded({ extended: true }));
// app.use(BodyParser.json());
app.use((err, req, res, next) => {
    if (err) {
        let now = new Date(); // Get the date/time
        let m_date = new Date(now.toISOString()); // Convert to ISO format
        console.log("\n" + m_date + " - BAD post req from " + req.ip + " || Url: " + req.url);
        console.error(err)
        console.log('Error occurred parsing data. This usually means bad JSON was sent. Sending error as a response.')
        res.status(400).send({err: 'Bad JSON'})
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
app.post("/api/device/:p_guid", async (request, response) => {
    try {
        // If it is desired to maintain a separate record of when the data is received as opposed to 
        // recorded then consider the code below for a starting point.  Add the m_date to the doc object
        // too.
        let now = new Date(); // Get the date/time
        let m_date = new Date(now.toISOString()); // Convert to ISO format

        console.log("\n" + m_date + " - Post req from " + request.ip + " || GUID:" + request.params.p_guid + "; ID:" + request.body.id);

        if (!request.body?.id) return response.status(500).send("Bad unit/password"); // No ID included in post!

        // First check that the GUID is matching
        // The incoming post can either be the full GUID string, or the shortened string
        // To reduce payload size the GUID will be shortened to the last 5 digits in the body of the post

        let m_guid = request.body.id;

        if (request.body.id.length == 5) { // short string provided
            m_guid = request.body.id;
            cutString = request.params.p_guid.length - 5;
            if (m_guid != request.params.p_guid.substring(cutString)) return response.status(500).send("ShortID Bad unit/password");
        }
        else if (request.body.id.length > 5 && request.body.id == request.params.p_guid) m_guid = request.body.id; // Long string for GUID provided
        else return response.status(500).send("Bad unit/password"); // Catch all for bad guid or undefined guid in post
        
        // if ((m_guid_shortened != request.params.p_guid.substring(31)) || (m_guid != request.params.p_guid)) return response.status(500).send("Bad unit/password");

        // The best practice is to include a password check, if the schema doesn't provide this, just comment this out
        // console.log("Looking up pword for GUID: " + m_guid);
        // m_pword = request.body.pword;
        // let pwordCheckResult = await checkPword(m_pword, m_guid);
        // if (pwordCheckResult) 
        //     console.log("OK pword");
        // else {
        //     console.log("Error with pword");
        //     return response.status(500).send(error);
        // }
        // End password checking

        // console.log("Post content: ");
        console.log("GUID/ID: " + request.params.p_guid);
        console.log("HW: " + request.body.hw); // not included in every post
        console.log("FW: " + request.body.fw); // not included in every post

        // If these are not included in the body, they will not be used in the db insert
        m_hw_id = request.body.hw;
        m_fw_id = request.body.fw;

        const doc = {
            "guid": request.params.p_guid,
            "hw": m_hw_id,
            "fw": m_fw_id,
            "d": m_date,
            "v": request.body.v,
            "body": request.body
        }

        const deviceList = await database.collection('devices').find({serial: doc.guid}).toArray()
        if(deviceList.length > 0){
            const job = await queue.add(doc)
        } else {
            console.log(`device with GUID ${doc.guid} does not exist, data will not be inserted`)
        }

        //grab any controls that are available for device that have not been executed yet
        const controlList = await database.collection('controlQueue').find({guid: doc.guid, executed: ""}).toArray()
        //grab a command that needs to be executed on the device
        const cmd = await database.collection('commandQueue').findOne({guid: doc.guid, executed: ""})

        // console.log(controlList)
        // console.log(cmd)
        
        //if the device has any controls/command, they need to be sent to the device
        if(controlList.length > 0 || cmd){
            let finalCommand = {}
            if (controlList.length > 0) {
                finalCommand.control = []
                controlList.forEach((ctrl) => {
                    finalCommand.control.push(ctrl.control)
                })
            }
            if (cmd) {
                if (cmd.command.fwu)
                    finalCommand.fwu = cmd.command.fwu
                if (cmd.command.cfg)
                    finalCommand.cfg = cmd.command.cfg
            }
            console.log({t: Math.floor(Date.now() / 1000), cmd: finalCommand})
            //return the command to the device
            return response.send({t: Math.floor(Date.now() / 1000), cmd: finalCommand})    
        } else {
            console.log({t: Math.floor(Date.now() / 1000)})
            // if there are no controls/command, just send the timestamp
            return response.send({t: Math.floor(Date.now() / 1000)})
        }
    }
    catch (e) {
        console.log('Exception occurred at some point during the request:')
        console.log(e)
        return response.send({t: Math.floor(Date.now() / 1000)})
    }

    //create array for new time series documents

    // Let's go through the data in the value (v) array and dump to console for reference
    // if (request.body.v) {
    //     // const timestamps = []
    //     // Object.keys(doc.v).forEach(async (sensor) => {
    //     //     if(sensor === 'sys'){
    //     //         // const results = await database.collection('devices').updateOne({'serial': doc.guid}, {
    //     //         //     $set: {
    //     //         //         lat: doc.v[sensor][0].loc[0],
    //     //         //         long: doc.v[sensor][0].loc[1]
    //     //         //     }
    //     //         // })
    //     //         console.log(`Updated device location to ${doc.v[sensor][0].loc[0]}, ${doc.v[sensor][0].loc[1]}`)
    //     //     }else{
    //     //         doc.v[sensor].forEach((entry) => {
    //     //             const timestamp = entry.ts
    //     //             timestamps.push(new Date(timestamp))
    //     //             Object.keys(entry).forEach((type) => {
    //     //                 if(type !== 'ts'){
    //     //                     if(typeof entry[type] === 'object'){
    //     //                         entry[type].forEach((dataPoint, index) => {
    //     //                             docArray.push({
    //     //                                 metadata: {
    //     //                                     guid: doc.guid,
    //     //                                     sensor: sensor,
    //     //                                     type: type + ':' + index,
    //     //                                 },
    //     //                                 timestamp: new Date(timestamp * 1000),
    //     //                                 data: dataPoint
    //     //                             })
    //     //                         })
    //     //                     }else{
    //     //                         docArray.push({
    //     //                             metadata: {
    //     //                                 guid: doc.guid,
    //     //                                 sensor: sensor,
    //     //                                 type: type,
    //     //                             },
    //     //                             timestamp: new Date(timestamp * 1000),
    //     //                             data: entry[type]
    //     //                         })
    //     //                     }
    //     //                 }
    //     //             })
    //     //         })
    //     //     }
    //     // })

    //     let collisions = collection.find({'timestamp': {'$in': timestamps}, 'metadata.guid': doc.guid})
    //     let final_doc_array = []
    //     collisions.forEach((document) => {
    //         final_doc_array = docArray.filter((incoming) => {
    //             const foundCollision = incoming.timestamp.getTime() === document.timestamp.getTime() && document.metadata.sensor === incoming.metadata.sensor && document.metadata.type === incoming.metadata.type
    //             return !foundCollision
    //         })
    //     console.log(docArray)
    //     })
    //     try {
    //         if (final_doc_array.length > 0) {  
    //             console.log("docArray contents:");
    //             console.log(final_doc_array);   
    //             await collection.insertMany(docArray, (error, result) => {
    //                 if (error) {
    //                     return response.status(500).send(error);
    //                 }
    //                 console.log("Insert db _id:" + result.insertedId + "\n");
    //                 // console.log("To view the posted data go to http://localhost/api/device/" + result.insertedId);
    //                 let combinedResponse = "{\"t\":\"" + Date.now() + "\"}";
                    
    //                 let json = JSON.parse(combinedResponse);
        
    //                 return response.send(json);
    //             });
    //         }else{
    //             return response.send("All values were duplicates, nothing was inserted.")
    //         }
    //         await collection.insertMany(docArray, (error, result) => {
    //             if (error) {
    //                 return response.status(500).send(error);
    //             }
    //             Object.values(result.insertedIds).forEach((id) => {
    //                 console.log("Insert db _id:" + id);
    //             })
    //             // console.log("To view the posted data go to http://localhost/api/device/" + result.insertedId);
    //             let combinedResponse = "{\"t\":\"" + Date.now() + "\"}";
                
    //             let json = JSON.parse(combinedResponse);
    
    //             return response.send(doc);
    //         });
            
    //     } catch (e) {
    //         console.error("Error parsing incoming request: ", e);
    //         return response.status(500).send("Error inserting data into collection");
    //     }
    // }

    // console.log(docArray);
    
    // Insert adds the _id to the doc.


});


//VERSION 2 OF THE POST ROUTE
//This includes a CRC in the response
app.post("/api2/device/:p_guid", async (request, response) => {
    try {
        // If it is desired to maintain a separate record of when the data is received as opposed to 
        // recorded then consider the code below for a starting point.  Add the m_date to the doc object
        // too.
        let now = new Date(); // Get the date/time
        let m_date = new Date(now.toISOString()); // Convert to ISO format

        console.log("\n" + m_date + " - Post req from " + request.ip + " || GUID:" + request.params.p_guid + "; ID:" + request.body.id);

        if (!request.body?.id) return response.status(500).send("Bad unit/password"); // No ID included in post!

        // First check that the GUID is matching
        // The incoming post can either be the full GUID string, or the shortened string
        // To reduce payload size the GUID will be shortened to the last 5 digits in the body of the post

        let m_guid = request.body.id;

        if (request.body.id.length == 5) { // short string provided
            m_guid = request.body.id;
            cutString = request.params.p_guid.length - 5;
            if (m_guid != request.params.p_guid.substring(cutString)) return response.status(500).send("ShortID Bad unit/password");
        }
        else if (request.body.id.length > 5 && request.body.id == request.params.p_guid) m_guid = request.body.id; // Long string for GUID provided
        else return response.status(500).send("Bad unit/password"); // Catch all for bad guid or undefined guid in post
        
        // if ((m_guid_shortened != request.params.p_guid.substring(31)) || (m_guid != request.params.p_guid)) return response.status(500).send("Bad unit/password");

        // The best practice is to include a password check, if the schema doesn't provide this, just comment this out
        // console.log("Looking up pword for GUID: " + m_guid);
        // m_pword = request.body.pword;
        // let pwordCheckResult = await checkPword(m_pword, m_guid);
        // if (pwordCheckResult) 
        //     console.log("OK pword");
        // else {
        //     console.log("Error with pword");
        //     return response.status(500).send(error);
        // }
        // End password checking

        // console.log("Post content: ");
        console.log("GUID/ID: " + request.params.p_guid);
        console.log("HW: " + request.body.hw); // not included in every post
        console.log("FW: " + request.body.fw); // not included in every post

        // If these are not included in the body, they will not be used in the db insert
        m_hw_id = request.body.hw;
        m_fw_id = request.body.fw;

        const doc = {
            "guid": request.params.p_guid,
            "hw": m_hw_id,
            "fw": m_fw_id,
            "d": m_date,
            "v": request.body.v,
            "body": request.body
        }

        const deviceList = await database.collection('devices').find({serial: doc.guid}).toArray()
        if(deviceList.length > 0){
            const job = await queue.add(doc)
        } else {
            console.log(`device with GUID ${doc.guid} does not exist, data will not be inserted`)
        }

        //grab any controls that are available for device that have not been executed yet
        const controlList = await database.collection('controlQueue').find({guid: doc.guid, executed: ""}).toArray()
        //grab a command that needs to be executed on the device
        const cmd = await database.collection('commandQueue').findOne({guid: doc.guid, executed: ""})

        // console.log(controlList)
        // console.log(cmd)
        
        //if the device has any controls/command, they need to be sent to the device
        if(controlList.length > 0 || cmd){
            let finalCommand = {}
            if (controlList.length > 0) {
                finalCommand.control = []
                controlList.forEach((ctrl) => {
                    finalCommand.control.push(ctrl.control)
                })
            }
            if (cmd) {
                if (cmd.command.fwu) {
                    finalCommand.fwu = cmd.command.fwu
                    console.log(cmd.command.fwu.uri.substring(cmd.command.fwu.uri.lastIndexOf('/') + 1));
                    const filePath = path.join(FILE_DIRECTORY, cmd.command.fwu.uri.substring(cmd.command.fwu.uri.lastIndexOf('/') + 1));
                    const fileCRC = crc32(fileSystem.readFileSync(filePath, 'utf-8')).toString(16);
                    finalCommand.fwu.crc = fileCRC
                }
                if (cmd.command.cfg) {
                    finalCommand.cfg = cmd.command.cfg
                } 
            }
            const resp = {t: Math.floor(Date.now() / 1000), cmd: finalCommand}
            const crc = crc32(JSON.stringify(resp)).toString(16)
            console.log({resp: resp, crc: crc})
            //return the command to the device
            return response.send({resp: resp, crc: crc})    
        } else {
            const resp = {t: Math.floor(Date.now() / 1000)}
            const crc = crc32(JSON.stringify(resp)).toString(16)
            console.log({resp: resp, crc: crc})
            // if there are no controls/command, just send the timestamp
            return response.send({resp: resp, crc: crc})
        }
    }
    catch (e) {
        console.log('Exception occurred at some point during the request:')
        console.log(e)
        const resp = {t: Math.floor(Date.now() / 1000)}
        const crc = crc32(JSON.stringify(resp)).toString(16)
        return response.send({resp: resp, crc: crc})
    }
});

//////////////////////////////////////////////////////////
//// GET METHODS                                    //////
//////////////////////////////////////////////////////////

/*
** !! Note the following methods, are not necessary for the purpose of communication with nM devices
** !! The GET methods are included for diagnostic purposes, and are especially useful for initial implementation testing
** !! These methods may be removed for production deployments
*/

/*
** Get the status of the API, useful for uptime monitoring of the API by a third party
*/
app.get("/api/status", async (request, response) => {
    response.send("API Working " + Date());
});

/*
** Get the current time in timestamp format
*/
app.get("/api/status/time", async (request, response) => {
    let res = {
        "t": Date.now()
    }
    response.send(res);
});

/*
** Get the status of a GUID passed as parameter
** Returns all data for a given GUID starting with the latest
*/
app.get("/api/device/status/:m_guid", async (request, response) => {
    console.log("Received a data request for GUID status: " + request.params.m_guid);

    let query = { 'guid': request.params.m_guid }; // look for all documents/data with this guid
    let sort = { 'd': -1 }; // show data ascending according to the recorded date (d)
    try{
        await collection.find(query).sort(sort).toArray(function (error, result) {
            if (error) {
                return response.status(500).send("ID doesn't exist, or bad request");
                // return response.status(500).send(error);
            }
            response.send(result);
        });
    }catch(e){
        console.error("Error parsing incoming request: ", e);
        return response.status(500).send("Error finding record in collection");
    }
});

/*
**  Get the data from the POST _id passed as parameter
*/
app.get("/api/device/data/:postId", async (request, response) => {
    console.log("Received a data request for _id: " + request.params.postId);
    try{
        await collection.findOne({ "_id": new ObjectId(request.params.postId) }, (error, result) => {
            if (error) {
                return response.status(500).send("ID doesn't exist, or bad request");
                // return response.status(500).send(error);
            }
            console.log(result);
            response.send(result);
        });
    }catch(e){
        console.error("Error parsing incoming request: ", e);
        return response.status(500).send("Error finding record in collection");
    }
    
});

/*
**  Get a file from the API server (for firmware updates)
*/
app.get("/files/:filename", async (request, response) => {
    
    console.log("Received a request for the file: " + request.params.filename);
    try {
        var filePath = path.join(FILE_DIRECTORY, request.params.filename);
        var stat = fileSystem.statSync(filePath);

        response.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': stat.size
        });

        var readStream = fileSystem.createReadStream(filePath);
        // We replaced all the event handlers with a simple call to readStream.pipe()
        readStream.pipe(response);
    }
    catch (e) {
        console.log('No file found.');
        return response.status(404).send("No file found.");
    }
})

/////////////////////////////////////////////////////////
/////   DATABASE CONNECTOR                          /////
/////////////////////////////////////////////////////////
app.listen(5000, async () => {
    console.log("Connection: ", CONNECTION_URL)
    try{
        MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true}, (error, client) => {
            if (error) {
                throw error;
            }
            database = client.db(DATABASE_NAME);
            console.log(DATABASE_COLLECTION)
            collection = database.collection(DATABASE_COLLECTION); // data storage
            // collection = database.collection("device-data");
            unit_configuration = database.collection(DATABASE_CONFIG); // password storage
            console.log("Connected to `" + DATABASE_NAME + ":" + DATABASE_CONFIG + ", " + DATABASE_COLLECTION + "`!");
        });
    }catch(e){
        console.error("Error connecting to Mongo client: ", e);
    }
    
});