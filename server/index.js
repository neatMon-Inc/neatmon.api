/*
    Description: API for neatMon
    License: MIT
    Author: neatMon, Inc.
    Date: 2022-02-25
*/

require('dotenv').config({}); // Get env variables
const axios = require("axios"); // HTTP Client
const Express = require("express");
const BodyParser = require("body-parser");
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;
const fetch = require('isomorphic-fetch')

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

    console.log("Receiving post request from " + request.body.id);
    // First check that the GUID is matching
    m_guid = request.body.id;
    if (m_guid != request.params.p_guid) return response.status(500).send("Bad unit/password");

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

    console.log("GUID/ID: " + request.body.id);
    console.log("HW: " + request.body.hw);
    console.log("FW: " + request.body.fw);

    // If these are not included in the body, they will not be used in the db insert
    m_hw_id = request.body.hw;
    m_fw_id = request.body.fw;

    // Let's go through the data in the value (v) array and dump to console for reference
    if (request.body.v)
    {
        for (var ikey of Object.keys(request.body.v)) {
            console.log(ikey + "->" + request.body.v[ikey]);
        }
    }

    // If it is desired to maintain a separate record of when the data is received as opposed to 
    // recorded then consider the code below for a starting point.  Add the m_date to the doc object
    // too.
    var now = new Date(); // Get the date/time
    var m_date = new Date(now.toISOString()); // Convert to ISO format

    const doc =
    {
        "guid": m_guid,
        "hw": m_hw_id,
        "fw": m_fw_id,
        "d": m_date,
        "v": request.body.v
    }

    // Insert adds the _id to the doc.
    try {
        await collection.insertOne(doc, (error, result) => {
            if (error) {
                return response.status(500).send(error);
            }
            console.log("Insert db _id:" + result.insertedId);
            console.log("To view the posted data go to http://localhost/api/device/" + result.insertedId);
            var combinedResponse = "OK! _id: " + result.insertedId;
            return response.send(combinedResponse);
        });
    } catch (e) {
        console.error("Error parsing incoming request: ", e);
        return response.status(500).send("Error inserting data into collection");
    }


});

//////////////////////////////////////////////////////////
//// GET METHODS                                    //////
//////////////////////////////////////////////////////////
app.get("/api/status", async (request, response) => {
    response.send("API Working " + Date());
});

/*
** Get the status of a GUID passed as parameter
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
        MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true, tlsCAFile: 'ca-certificate.crt' }, (error, client) => {
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