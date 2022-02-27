# Description
Data services for neatMon devices.  Allows incoming data to be received, parsed and stored in a database for later retrieval in other apps and services.

For assistance please contact info@neatmon.com

# Getting Started
After bringing up the neatMon API using the appropriate make commands, the app can be reached from a web browser at the address `http://localhost:3000/api/status` which should show the message: "API Working Sat Feb 26 2022 08:16:20 GMT+0000 (Coordinated Universal Time)" (The current time should be displayed)

# Installation
The API requires Docker to be installed and running, or can be run locally with the `node index.js` command, however there may be issues that arise as versions differ from development environments and production and as such Docker is preferred method for maintaining the consistency between different environments.

## Environment Variables Setup
We have created some helpful scripts in the /script directory.  

Before executing any script read, understand and update the variables to the correct values with the name of the database and other authentication.

The environment variables can be configured and set using the setConfig.bash script.  Use the command `source setConfig.bash` to export the environment variables needed to run the app.

## Building the complete app
In our deployment, the app requires both a database and server to respond to incoming requests.  We have selected mongodb for the database, however it can be updated to others as required.  Due to the complexity of the production environments it might be advantageous to have a separate DB server, and have decided to split the architecture in folder level with each microservice containing its own Dockerfile.  However to orchestrate each container, we can use Docker Compose to do this for us. 

### Building the complete app with Docker Compose
From the root directory use the command `make run` to build and run the containers

## Building just the server
If you decide to use Docker Compose in the section above, then the following server build steps will not be necessary as this will be taken care of for you.

### 2) Building Server App
From the /server folder, run the command `make build` to compile and save the corresponding Docker image locally

### 3) Running Server App
From the /server folder, run the command `make up` to run the app and see the debug messages

# Other Useful Information
See /server/index.js for a complete list of routes and more details
