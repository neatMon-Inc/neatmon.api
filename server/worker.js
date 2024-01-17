require('dotenv').config({});
const bull = require('bull');
const { json } = require('express');
const axios = require('axios');
let database, collection;
console.log('Starting up worker queue...')
const queue = new bull('data-queue', 'redis://redis:6379');
console.log('Queue started!')
const MongoClient = require("mongodb").MongoClient;
FROM_NEATMON_IO = process.env.FROM_NEATMON_IO
CONNECTION_URL = process.env.MONGO_URL;
const DATABASE_NAME = process.env.MONGO_DATABASE_NAME;
const DATABASE_COLLECTION = process.env.MONGO_DATABASE_COLLECTION_DATA;
const DATABASE_CONFIG = process.env.MONGO_DATABASE_COLLECTION_CONFIGURATION;
const MONGO_DATABASE_EDITOR_USER = process.env.MONGO_DATABASE_EDITOR_USER;
const MONGO_DATABASE_EDITOR_PASSWORD = process.env.MONGO_DATABASE_EDITOR_PASSWORD;

async function connectToDatabase() {
    console.log("Connecting with User: " + MONGO_DATABASE_EDITOR_USER);
    console.log("pword: " + MONGO_DATABASE_EDITOR_PASSWORD);
    try {
        const client = await MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true })
        database = client.db(DATABASE_NAME);
        console.log(DATABASE_COLLECTION);
        collection = database.collection(DATABASE_COLLECTION); // data storage

        // collection = database.collection("device-data");
        unit_configuration = database.collection(DATABASE_CONFIG); // password storage
        console.log("Connected to `" + DATABASE_NAME + ":" + DATABASE_CONFIG + ", " + DATABASE_COLLECTION + "`!");
    }
    catch (e) {
        throw e
    }
}

queue.process(async (job, done) => {
    if (!database || !collection) {
        console.log('Establishing connection to database...')
        await connectToDatabase();
    }
    const metadataSet = new Set()
    try {
        console.log("Worker Started Job")
        const timestamps = []
        let docArray = [];
        console.log(job.data)
        Object.keys(job.data.v).forEach(async (sensor) => {
            if(sensor === 'sys'){
                if(job.data.v[sensor][0].loc !== undefined){
                    if(job.data.v[sensor][0].loc[0] !== undefined && job.data.v[sensor][0].loc[1]){
                        const results = await database.collection('devices').updateOne({'serial': job.data.guid}, {
                            $set: {
                                lat: job.data.v[sensor][0].loc[0],
                                long: job.data.v[sensor][0].loc[1]
                            }
                        })
                        console.log(results)
                        console.log(`Updated device location to ${job.data.v[sensor][0].loc[0]}, ${job.data.v[sensor][0].loc[1]}`)
                    }
                }
            }else{
                job.data.v[sensor].forEach((entry) => {
                    const timestamp = entry.ts
                    timestamps.push(new Date(timestamp))
                    Object.keys(entry).forEach((type) => {
                        if(type !== 'ts'){
                            if(typeof entry[type] === 'object' && entry[type] !== null){
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
                                metadataSet.add(JSON.stringify({
                                    guid: job.data.guid,
                                    sensor: sensor,
                                    node: type,
                                    nodeType: 'array',
                                    alias: Array(entry[type].length).fill(""),
                                }))
                            }else{
                                metadataSet.add(JSON.stringify({
                                    guid: job.data.guid,
                                    sensor: sensor,
                                    node: type,
                                    nodeType: 'singular',
                                    alias: [],
                                }))
                                if (entry[type] === null)
                                    console.log('Entry is null, inserting anyways...')
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

        // console.log('Forwarding data...') 
        // try {
        //     let address = 'http://147.182.239.29:5000/api/device'
        //     let newAddress = address + '?id=' + job.data.guid
        //     console.log(newAddress)
        //     console.log(JSON.stringify(job.data.body))
        //     res = await axios.post(newAddress, JSON.stringify(job.data.body), {
        //         headers: {
        //             "Content-Type": "application/json",
        //         }
        //     })

        //     console.log(res)

        //     if (res.status != 200) {
        //         console.error('Forwarding failed.')
        //     }
        //     else {
        //         console.log('Forwarding successful!')
        //     }
        // }
        // catch (e) {
        //     console.log('something went wrong')
        //     console.log(e)
        // }

        

        // START DATA FORWARDING CODE
        console.log('Checking to see if data should be forwarded...')
        let device = await database.collection('devices').findOne({"serial": job.data.guid})
        if (device) {
            let organization = await database.collection('organizations').findOne({ "name": device.organizationName})
            if (organization) {
                if (organization.webService !== 'None') {
                    console.log('Data needs to be forwarded.')
                    if (organization.webAddress !== '' && organization.webAddress !== null && organization.webAddress !== undefined && organization.webAddress !== 'undefined') {

                        let newAddress = organization.webAddress + '?id=' + job.data.guid
                        console.log('Organization\'s forwarding address: ' + newAddress)

                        try{
        
                            let res = null;
            
                            if (organization.secretKey !== null && organization.secretKey !== undefined && organization.secretKey !== 'None' && organization.secretKey !== 'undefined' && organization.secretKey !== '') {
                                console.log('Secret key: ' + organization.secretKey)
                                console.log('Forwarding data...') 
                                res = await axios.post(newAddress, JSON.stringify(job.data.body), {
                                    "x-api-key": organization.secretKey,
                                    'Content-Type': 'application/json'
                                })
                            }
                            else {
                                console.log('No secret key found. Proceeding without it.')
                                console.log('Forwarding data...') 
                                res = await axios.post(newAddress, JSON.stringify(job.data.body), {
                                    headers: {
                                        'Content-Type': 'application/json'
                                    }
                                })
                            }
                            
                            let data = res.data;
                            if (res.status != 200) {
                                console.error('Forwarding failed.')
                            }
                            else {
                                console.log('Forwarding successful!')
                            }
                            console.log('DATA')
                            console.log(data);       
                        } catch(e){
                            console.log('Something went wrong when forwarding to webhook')
                            console.log(e)
                        }
                    }
                    else {
                        console.log('No forwarding address found. Continuing...')
                    }
                    
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

        // console.log(docArray)
        const sensorArray = []
        // console.log('metadata set', metadataSet)
        const currSensors = await database.collection('sensors').find({guid: job.data.guid}).toArray()
        metadataSet.forEach( (metadata) => {
            const parsedData = JSON.parse(metadata)
            const dupeCheck = currSensors.findIndex((s) => {
                return s.guid === parsedData.guid && s.sensor === parsedData.sensor && s.node === parsedData.node
            })
            console.log(dupeCheck)
            if(dupeCheck === -1) {
                sensorArray.push(parsedData)
            }
        })
        console.log(sensorArray)
        if(sensorArray.length > 0) {
            await database.collection('sensors').insertMany(sensorArray)
        }
        await collection.insertMany(docArray, (error, result) => {
            console.log(result)
            if(result !== undefined){

                Object.values(result.insertedIds).forEach((id) => {
                    console.log("Insert db _id:" + id);
                })
                // console.log("To view the posted data go to http://localhost/api/device/" + result.insertedId);
                let combinedResponse = "{\"t\":\"" + Date.now() + "\"}";
                
                let json = JSON.parse(combinedResponse);
            } else {
                console.log("Empty data object, nothing was inserted.")
            }
        });
        console.log("Worker Finished")
        done()
    }
    catch (e) {
        console.log('An error occurred at some point during this job.')
        console.log('Job information:\n')
        console.log(JSON.stringify(job, null, 4))
        console.log('\nError that occurred:\n')
        console.log(e)
        console.log("Worker Finished")
        done()
    }
    
})