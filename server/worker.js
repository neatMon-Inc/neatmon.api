require('dotenv').config({});
const bull = require('bull');
const { json } = require('express');
const axios = require('axios');
const queue = new bull('data-queue', 'redis://redis:6379');
const MongoClient = require("mongodb").MongoClient;
FROM_NEATMON_IO = process.env.FROM_NEATMON_IO
CONNECTION_URL = process.env.MONGO_URL;
const DATABASE_NAME = process.env.MONGO_DATABASE_NAME;
const DATABASE_COLLECTION = process.env.MONGO_DATABASE_COLLECTION_DATA;
const DATABASE_CONFIG = process.env.MONGO_DATABASE_COLLECTION_CONFIGURATION;
const MONGO_DATABASE_EDITOR_USER = process.env.MONGO_DATABASE_EDITOR_USER;
const MONGO_DATABASE_EDITOR_PASSWORD = process.env.MONGO_DATABASE_EDITOR_PASSWORD;
console.log("Connecting with User: " + MONGO_DATABASE_EDITOR_USER);
console.log("pword: " + MONGO_DATABASE_EDITOR_PASSWORD);
let database, collection;
MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true}, (error, client) => {
    console.log(CONNECTION_URL)
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
queue.process(async (job, done) => {
    console.log("Worker Started Job")
    const timestamps = []
    let docArray = [];
    console.log(job.data)
    Object.keys(job.data.v).forEach(async (sensor) => {
        if(sensor === 'sys'){
            const results = await database.collection('devices').updateOne({'serial': job.data.guid}, {
                $set: {
                    lat: job.data.v[sensor][0].loc[0],
                    long: job.data.v[sensor][0].loc[1]
                }
            })
            console.log(results)
            console.log(`Updated device location to ${job.data.v[sensor][0].loc[0]}, ${job.data.v[sensor][0].loc[1]}`)
        }else{
            job.data.v[sensor].forEach((entry) => {
                const timestamp = entry.ts
                timestamps.push(new Date(timestamp))
                Object.keys(entry).forEach((type) => {
                    if(type !== 'ts'){
                        if(typeof entry[type] === 'object'){
                            entry[type].forEach((dataPoint, index) => {
                                docArray.push({
                                    metadata: {
                                        guid: job.data.guid,
                                        sensor: sensor,
                                        type: type + ':' + index,
                                    },
                                    timestamp: new Date(timestamp * 1000),
                                    data: dataPoint
                                })
                            })
                        }else{
                            docArray.push({
                                metadata: {
                                    guid: job.data.guid,
                                    sensor: sensor,
                                    type: type,
                                },
                                timestamp: new Date(timestamp * 1000),
                                data: entry[type]
                            })
                        }
                    }
                })
            })
        }
    })

    // START DATA FORWARDING CODE
    console.log('Checking to see if data should be forwarded...')
    let device = await database.collection('devices').findOne({"serial": job.data.guid})
    if (device) {
        let organization = await database.collection('organizations').findOne({ "name": device.organizationName})
        if (organization) {
            if (organization.webService !== 'None') {
                console.log('Data needs to be forwarded.')
                console.log('Organization\'s forwarding address: ' + organization.webAddress)

                // let testData = {
                //     Id: 78912,
                //     Customer: "Jason Sweet",
                //     Quantity: 1,
                //     Price: 18.00
                // };

                var config, res = null;

                if (organization.secretKey !== null && organization.secretKey !== 'None') {
                    console.log('Secret key: ' + organization.secretKey)
                    config = {
                        headers: {
                            "x-api-key": organization.secretKey
                        }
                    }
                    console.log('Forwarding data...') 
                    res = await axios.post(organization.webAddress, job.data, config)
                }
                else {
                    console.log('No secret key found. Proceeding without it.')
                    console.log('Forwarding data...') 
                    res = await axios.post(organization.webAddress, job.data)
                }
                
                let data = res.data;
                if (res.status != 200) {
                    console.error('Forwarding failed.')
                }
                else {
                    console.log('Forwarding successful!')
                }
                console.log(data);       
            }
            else {
                console.log('Data does not need to be forwarded. Continuing...')
            }
        }
        else {
            console.error('Error finding organization from device in the database.')
            console.log(device)
        }
    }
    else {
        console.error('Error finding device in database for forwarding.')
        console.log(job.data)
    }
    // END DATA FORWARDING CODE


    // let collisions = collection.find({'timestamp': {'$in': timestamps}, 'metadata.guid': job.data.guid})
    // let final_doc_array = []
    // collisions.forEach((document) => {
    //     final_doc_array = docArray.filter((incoming) => {
    //         console.log(document)
    //         const foundCollision = incoming.timestamp.getTime() === document.timestamp.getTime() && document.metadata.sensor === incoming.metadata.sensor && document.metadata.type === incoming.metadata.type
    //         return !foundCollision
    //     })
    // console.log(docArray)
    // })
    console.log(docArray)
    await collection.insertMany(docArray, (error, result) => {
        Object.values(result.insertedIds).forEach((id) => {
            console.log("Insert db _id:" + id);
        })
        // console.log("To view the posted data go to http://localhost/api/device/" + result.insertedId);
        let combinedResponse = "{\"t\":\"" + Date.now() + "\"}";
        
        let json = JSON.parse(combinedResponse);
    });
    console.log("Worker Finished")
    done()
})