# Description
This is an example of the data services to receive data from neatMon devices.  Allows incoming data to be received, parsed, and stored in a database for later retrieval in other apps and services.

## Helpful Links
Detailed specifications on the neatMon Open Source API can be found [here.](https://neatmon-inc.github.io/neatmon.api/)

For assistance please contact info@neatmon.com or visit the nM user guides and documentation [here.](https://info.neatmon.com/)

# API Technical Overview YouTube Video
Please see the recorded video covering the deployment and an overview of the menu-driven setup of the Automated Monitoring Nodes [here.](https://www.youtube.com/watch?v=SwGXM8TaJbA&t=304s)

# Getting Started
See Environment Variable Setup below. Copy and edit the configuration file.  Bring up the neatMon API using the `make` command. The app can be tested from a web browser at the address `http://localhost/api/status` which should show the message: "API Working Sat Feb 26 2022 08:16:20 GMT+0000 (Coordinated Universal Time)" (The current UTC time should be displayed)

# Installation
The API is designed to be deployed with Docker however it can be run also be executed locally with the `node index.js` command.  However, there may be issues that arise as versions differ from development environments and production, and as such Docker is the preferred method for maintaining the consistency between different environments.

## System requirements
Linux system is preferred, though others can be substituted, the following packages are suggested/required

Required packages:
* make
* docker

## Environment Variables Setup
Each installation may have different configurations.  To handle this, we have provided a configuration file located at: `/config/.env_sample`.  Copy the `/config/.env_sample` file to `/config/.env` and make appropriate changes.  Additional setup is required to set up the standard Mongo user in the Mongo configuration file: `/database/init-mongo.js`  

## Building the complete app
In our deployment, the app requires both a database and a server to respond to incoming requests.  We have selected MongoDB for the database, however, it can be updated with others as required.  Due to the complexity of the production environments, it might be advantageous to have a separate DB server and have decided to split the architecture at the folder level with each microservice containing its own Dockerfile.  However, to orchestrate each container, we can use Docker Compose to do this for us.

### Running and stopping the complete app with Docker Compose
#### Run
From the root directory use the command `make` or `make run` to build and run the containers

#### Stopping containers
Usually, the containers and their subsequent logs will be displayed in the same terminal as when they were started.  To stop a container that is active in the current terminal just press `CTRL + C` and the containers will stop.  Don't worry, you won't lose any work.  If you want to erase everything in the database and start over, see the steps below under the 'Stop + Erase' section below.

When a container is running but is not displaying in the active terminal for whatever reason, you can stop it by issuing the command `docker stop $(docker ps -q)` which will terminate all active docker containers with an exit code 0.
#### Stop + Erase
To stop the running containers from the dev environment, press `ctrl+c` and then if desired `make flush` to delete any containers, volumes, and network configurations from the previous instance.

## Building just the server
If you decide to use Docker Compose in the section above, then the following server build steps will not be necessary as this will be taken care of for you.

### 2) Building Server App
From the `/server` folder, run the command `make build` to compile and save the corresponding Docker image locally

### 3) Running Server App
From the `/server` folder, run the command `make up` to run the app and see the debug messages

# Debugging GUID requests and other incoming connections
From the root directory exists two scripts that are useful for debugging in a production environment once the api has been confirmed running and is running in backgroune (e.g. no front end).  Both scripts will output the detailed log for the GUID when added as a parameter.  Note, they may need to be modified to execute with the `chmod +x deploy_*` command which will change from a normal file to a bash executable script.

# Other Useful Information
## Firmware Over The Air Updates
When first run, the app will create a directory in the path `../apiFolder` this directory should contain the firmware to send to Automated Monitoring Nodes.  The path for the directory is configurable in the docker-compose file.
