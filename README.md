# Tenma Power Souce Unit Node.js class and Client/Server application

## Overview TLDR;
![Placeholder for an image](#)  <!-- Replace # with your image link -->
This project contains a class for controlling Tenma Power Sources via a serial connection, based on the Tenma PSU serial protocol as described in the [CERN TWiki](https://twiki.cern.ch/twiki/bin/view/CLIC/TenmaPWRRemoteControlSyntax) and [kxtells/tenma-serial](https://github.com/kxtells/tenma-serial/tree/master). It supports both single and dual-channel PSUs. 
This project also includes a simpe client/server app to access the Tenma PSU over network.

## More overview
Tenma Power Sources are relatively cheap but reliable PSUs from Farnell and are also rebranded under different names. The higher models provide serial connection to the PC via RS232 or USB connection. I was not able to find any official software or protocol documentation. 
There is a great Python library and CLI utility at [kxtells/tenma-serial](https://github.com/kxtells/tenma-serial/tree/master).
So I decided to create a simple Node.js class and client/server application for it. The source code is not perfect but I needed to have something working. I did also use ChatGPT to help with the code so...
There is no authentication, no autorization, no security checks, no user input validation implemented. It is supposed to run on your local network and out of reach of the bad guys... 


## TenmaPSU Class
- Implements the Tenma PSU serial protocol. It can be used over USB or RS232.
- Compatible with 1 and 2 channel PSU models. (tested only with 1 channel TENMA 72-2535)


## APIserver.js
- Provides network access to the Tenma PSU via the TenmaPSU Class.
- Clients can connect via WebSocket; GET requests support is planned.
- Tested on a single channel PSU, but prepared for dual-channel models.
- Serves the `public` directory containing a simple client interface.
- Note: No built-in authentication or authorization. Ensure to protect your TCP port and consider using a reverse proxy like nginx.

## Logging
- The server features simple in-memory logging.
- It can be started/stopped from the application and then it stores all the states in one big array on the server. You can download it as CSV file. 
- It gets cleared when the apiserver is restarted.
- You should have enough memory to store and process it if you intend to use it for long periods.

## Installation and Usage
- __Disconnect the load from the PSU - the example code will set voltage and enable output__
- Download or clone the project
- Install dependencies via `npm i`
- Set the serial port in index.js
- Run the example code in index.js to test the connection
- Set the variables COMPORT and optionally PORT in .env file. If you change the http port, you also need to change it in the html file.
- Run apiserver.js and browse to the port the configured port using web browser (http)

## Tested PSUs
-  TENMA 72-2535 V5.8 
