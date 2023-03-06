require('dotenv').config({})
const fs = require('fs')
const MongoClient = require("mongodb").MongoClient



// To use this script use the following example
// node AddNodeConfig.js example_key name_of_payload_file YYYY-MM-DD

CONNECTION_URL = process.env.MONGO_URL;
MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true}, async (error, client) => {
    if (error) {
        throw error
    }
    database = client.db('neatmon_dev')
    let key = ''
    let payload = ''
    let expirationDate = new Date()
    process.argv.forEach((val, index, array) => {
        switch(index){
            case 2:
                key = array[index]
                break
            case 3:
                fileName = array[index]
                payload = fs.readFileSync(fileName, 'utf-8')
            case 4:
                expirationDate = new Date(array[index])
        }
    })
    console.log(key)
    console.log(payload)
    console.log(expirationDate)
    await database.collection('deviceresponses').insertOne({
        guid: '358f3740-f7cf-43e7-78e36de9f4ec',
        key: key,
        payload: payload,
        expirationDate: expirationDate,
    })
    process.exit(0)
});