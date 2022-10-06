/*
    Description: API for neatMon
    License: MIT
    Author: neatMon, Inc.
    Date: 2022-02-25
*/

require('dotenv').config({}); // Get env variables
// const axios = require("axios"); // HTTP Client
const Express = require("express");
const BodyParser = require("body-parser");
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;
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
if (FROM_NEATMON_IO !== 'true') {
    CONNECTION_URL = "mongodb://" + MONGO_DATABASE_EDITOR_USER + ":" + MONGO_DATABASE_EDITOR_PASSWORD + "@" + CONNECTION_URL + "/" + DATABASE_NAME;
}


console.log("DB string " + CONNECTION_URL);

var app = Express();
app.use(BodyParser.urlencoded({ extended: true }));
app.use(BodyParser.json());
app.use(BodyParser.raw());

var database, collection;

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

    // If it is desired to maintain a separate record of when the data is received as opposed to 
    // recorded then consider the code below for a starting point.  Add the m_date to the doc object
    // too.
    var now = new Date(); // Get the date/time
    var m_date = new Date(now.toISOString()); // Convert to ISO format

    console.log("\n" + m_date + " - Post req from " + request.ip + " || GUID:" + request.params.p_guid + "; ID:" + request.body.id);

    if (!request.body?.id) return response.status(500).send("Bad unit/password"); // No ID included in post!

    // First check that the GUID is matching
    // The incoming post can either be the full GUID string, or the shortened string
    // To reduce payload size the GUID will be shortened to the last 5 digits in the body of the post

    var m_guid = request.body.id;

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

    console.log("Post content: ");
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
        "v": request.body.v
    }

    //create array for new time series documents
    var docArray = [];

    // Let's go through the data in the value (v) array and dump to console for reference
    if (request.body.v) {
    // if (true) {
        var hours = [];
        for (var ikey of Object.keys(doc.v)) {
            console.log(ikey + "->" + request.body.v[ikey]);

            var doc1 = null;
            var doc2 = null;

            for (var keyName in doc.v[ikey]) {
                // console.log(keyName + ': ' + (request.body.v[ikey])[keyName]);
                // console.log(keyName + ': ' + (doc.v[ikey])[keyName].t);
                // console.log(keyName + ': ' + (doc.v[ikey])[keyName].h);
                // if ((doc.v[ikey])[keyName].ts < (now - 1000)){
                //     console.log("TIME NOW: " + Date.now());
                //     console.log(keyName + ': ' + (doc.v[ikey])[keyName].ts);
                // }

                //var currentDate = new Date((doc.v[ikey])[keyName].ts);
                var currentDate = new Date((doc.v[ikey])[keyName].ts);
                var resetDate = currentDate;
                resetDate.setMinutes(0,0,0);

                var currentHourEpoch = resetDate.getTime();
                var now = Date.now();
                console.log("currentDate: " + currentDate.toISOString());
                console.log("resetDate: " + resetDate.toISOString());
                console.log("hours[ikey]: " + hours[ikey]);

                // beginning of the for loops, so create a new timeseries document
                if (hours[ikey] == null) {
                    hours[ikey] = currentHourEpoch;
                    // create new timeseries documents and insert them into the docArray. 
                    // Each doc will later be inserted into the new timeseries db collection
                    var metaString1 = "{\"guid\": \"" + request.params.p_guid + "\", \"sensor\": \"" +  ikey + "\", \"type\": \"t\"}";
                    var metaString2 = "{\"guid\": \"" + request.params.p_guid + "\", \"sensor\": \"" +  ikey + "\", \"type\": \"h\"}";
                    var metadata1 = JSON.parse(metaString1);
                    var metadata2 = JSON.parse(metaString2);
                    // var date = new Date();
                    doc1 = {
                        "metadata": metadata1,
                        "timestamp": currentHourEpoch,
                        "data": []
                    };
                    doc2 = {
                        "metadata": metadata2,
                        "timestamp": currentHourEpoch,
                        "data": []
                    };

                    doc1.data.push((doc.v[ikey])[keyName].t);
                    doc2.data.push((doc.v[ikey])[keyName].h);
                    // console.log("doc1" + JSON.stringify(doc1));
                    // console.log("doc2" + JSON.stringify(doc2));
                }
                else if (currentDate.getHours() != hours[ikey]) {
                    //push the documents into the docArray, which will be pushed into mongo
                    docArray.push(doc1);
                    docArray.push(doc2);

                    //set the new current hour of the next document
                    hours[ikey] = currentHourEpoch;

                    // create new timeseries documents and insert them into the docArray. 
                    // Each doc will later be inserted into the new timeseries db collection
                    var metaString1 = "{\"guid\": \"" + request.params.p_guid + "\", \"sensor\": \"" +  ikey + "\", \"type\": \"t\"}";
                    var metaString2 = "{\"guid\": \"" + request.params.p_guid + "\", \"sensor\": \"" +  ikey + "\", \"type\": \"h\"}";
                    var metadata1 = JSON.parse(metaString1);
                    var metadata2 = JSON.parse(metaString2);
                    // var date = new Date();
                    doc1 = {
                        "metadata": metadata1,
                        "timestamp": currentHourEpoch,
                        "data": []
                    };
                    doc2 = {
                        "metadata": metadata2,
                        "timestamp": currentHourEpoch,
                        "data": []
                    };

                    doc1.data.push((doc.v[ikey])[keyName].t);
                    doc2.data.push((doc.v[ikey])[keyName].h);

                }
                else {
                    // we are still in the same hour of the current doc, so just push the data into the array
                    doc1.data.push((doc.v[ikey])[keyName].t);
                    doc2.data.push((doc.v[ikey])[keyName].h);
                }
                // // create new timeseries documents and insert them into the docArray. 
                // // Each doc will later be inserted into the new timeseries db collection
                // var metaString1 = "{\"guid\": \"" + request.params.p_guid + "\", \"sensor\": \"" +  ikey + "\", \"type\": \"t\"}";
                // var metaString2 = "{\"guid\": \"" + request.params.p_guid + "\", \"sensor\": \"" +  ikey + "\", \"type\": \"h\"}";
                // var metadata1 = JSON.parse(metaString1);
                // var metadata2 = JSON.parse(metaString2);
                // var date = new Date();
                // var doc1 = {
                //     "metadata": metadata1,
                //     "timestamp": date.getTime(),
                //     "data": (doc.v[ikey])[keyName].t
                // };
                // var doc2 = {
                //     "metadata": metadata2,
                //     "timestamp": date.getTime(),
                //     "data": (doc.v[ikey])[keyName].h
                // };
                // // console.log("doc1" + JSON.stringify(doc1));
                // // console.log("doc2" + JSON.stringify(doc2));

                // docArray.push(doc1);
                // docArray.push(doc2);
            }

            docArray.push(doc1);
            docArray.push(doc2);
        }
    }

    console.log("docArray contents:");
    console.log(docArray);

    // Insert adds the _id to the doc.
    try {
        if (docArray.length > 0) {
            await collection.insertMany(docArray, (error, result) => {
                if (error) {
                    return response.status(500).send(error);
                }
                console.log("Insert db _id:" + result.insertedId + "\n");
                // console.log("To view the posted data go to http://localhost/api/device/" + result.insertedId);
                //var combinedResponse = "{\"id\":\"" + result.insertedId + "\",\"t\":\"" + Date.now() + "\"}";
                var combinedResponse = "{\"t\":\"" + Date.now() + "\"}";
                
                var json = JSON.parse(combinedResponse);
    
                return response.send(json);
            });
            //empty the array after inserting
            docArray = [];
        }
        
    } catch (e) {
        console.error("Error parsing incoming request: ", e);
        return response.status(500).send("Error inserting data into collection");
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
** Get the status of a GUID passed as parameter
** Returns all data for a given GUID starting with the latest
*/
app.get("/api/device/status/:m_guid", async (request, response) => {
    console.log("Received a data request for GUID status: " + request.params.m_guid);

    var query = { 'guid': request.params.m_guid }; // look for all documents/data with this guid
    var sort = { 'd': -1 }; // show data ascending according to the recorded date (d)
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

/////////////////////////////////////////////////////////
/////   DATABASE CONNECTOR                          /////
/////////////////////////////////////////////////////////
app.listen(5000, async () => {
    try{
        MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true }, (error, client) => {
            if (error) {
                throw error;
            }
            database = client.db(DATABASE_NAME);
            collection = database.collection(DATABASE_COLLECTION); // data storage
            // collection = database.collection("device-data");
            unit_configuration = database.collection(DATABASE_CONFIG); // password storage
            console.log("Connected to `" + DATABASE_NAME + ":" + DATABASE_CONFIG + ", " + DATABASE_COLLECTION + "`!");
        });
    }catch(e){
        console.error("Error connecting to Mongo client: ", e);
    }
    
});

function convert(t) {
  const dt = new Date(t);
  const hr = dt.getUTCHours();
  const m = "0" + dt.getUTCMinutes();
}