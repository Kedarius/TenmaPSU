/**
 Simple express web server to provide access to the Tenma PSU via TenmaPSU Class
 Clients should connect via WebSocket or GET requests (not yet implemented)
 Is tested on 1 channel PSU but should work on 2 channels with minimal changes
 The webserver also serves the public directory which contains simple client
 There is no authentication nor authorization in place, you need to protect your TCP port,
 use reverse proxy like nginx or implement your own authentication/authorization mechanism.
 This also have a support for simple in memory logging. 
 */


import express, { json, urlencoded } from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from 'dotenv';
const globalConfig=config().parsed;

import pkg from 'body-parser';
const { json: _json } = pkg;

const comport = globalConfig.COMPORT || 'com1';
const port = globalConfig.PORT || 6060;

//create express and websocket server
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

//instatntiate Tenma PSU
import {TenmaPSU} from './tenmaPSU.js';
const psu=new TenmaPSU(comport);
await psu.open();
await psu.getIdentification();

if ((psu.identity == null) || (! psu.identity.startsWith('TENMA')))
{
    await psu.close();
    throw new Error('TENMA PSU not detected');
    //Fail if PSU not detected
}

console.log('TENMA PSU detected',psu.identity);

const commandQueue = []; //queue for commands from client - they need to be sent to PSU in sync with other commands (i.e. status read ones)
let shouldLog=false; //if logging is enabled
let log=[]; //array for in memory logging
/** Clear the in memory log */
function clearLog()
{
  log=[];
}
let lastOn=null; //when was the output last on
let onDuration=0; //duration since last on

/** Process commands from the command queue */
async function processCommands()
{
  while (commandQueue.length>0)
  {
    let cmd = commandQueue.shift();
    //console.log(cmd);
    if (cmd.command=="outputOn")  await psu.setOutput('1');
    if (cmd.command=="outputOff") await psu.setOutput('0');
    if (cmd.command=="setVoltage") await psu.setVoltage(cmd.channel,cmd.value);
    if (cmd.command=="setCurrent") await psu.setCurrent(cmd.channel,cmd.value);
    if (cmd.command=="startLog") shouldLog=true;
    if (cmd.command=="stopLog") shouldLog=false;
    if (cmd.command=="clearLog") clearLog();
  }
}

/** Calculates the onDuration global variable */
function calculateOnDuration(now=null)
{
  if (now==null) now=new Date();
  onDuration=0;
  if (psu.state.outputEnabled) onDuration=now-lastOn;  
  if ((psu.state.outputEnabled) && (lastOn==null)) lastOn=now;
  if (!psu.state.outputEnabled) lastOn=null;
}

/** Handle logging - check whether loging is enabled and if so log current state. */
function handleLogging(now)
{
  if (now==null) now=new Date();
  
  if (shouldLog) 
  {
    log.push({time:now, state: psu.state, onDuration: onDuration});
  }
}

/** Main loop */
async function mainLoop()
{
  await processCommands(); //process all commands in command queue
  await psu.maintain();  //let the PSU update its state
  const now=new Date(); //fix current time
  handleLogging(now);  
  calculateOnDuration(now);
  setTimeout(async () => mainLoop(),50);
}
mainLoop();



// WebSocket connection handler
wss.on('connection', (ws) => {
  const preriodicIntervalId = setInterval(() => 
  {
    //send periodic messages to the client
    if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({messageid:'periodic',identity:psu.identity,state:psu.state,logging:shouldLog,logline:log.length,onduration:onDuration})); } else {clearInterval(preriodicIntervalId); }
  }, 100); 


  ws.on('message', (message) => 
  {
    //handle messages from client
    try 
    {
      const msg = JSON.parse(message);
      if (msg.messageid==="command") { commandQueue.push(msg); } //if command is received, enqueue the command
      
    } catch (e) 
    {
      console.log('Received non-JSON message:', message);
    }
  });

  ws.on('close', () => 
  {
      //cleanup the connection on close
      clearInterval(preriodicIntervalId);
  });
});


//Initialize express app
app.use(json());
app.use(urlencoded({ extended: true }));
app.use(_json());

//basic Access control handling
app.use((req, res, next) => 
  {
    //console.log('Ref',req.headers.referer);
    res.header("Access-Control-Allow-Origin", (req.headers.referer!= undefined ? req.headers.referer.replace(/\/+$/, '') : 'http://127.0.0.1:8044')); 
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Credentials", "true");
    next();
  });


// For serving static html files
app.use(express.static('public'));

//Send CSV formatted log
app.get('/log', (req, res) => 
{
  let csvlog = '"time","onDuration","outputEnabled","channel1mode","channel1currentSet","channel1currentOutput","channel1voltageSet","channel1voltageOutput","channel2mode","channel2currentSet","channel2currentOutput","channel2voltageSet","channel2voltageOutput"'+"\r\n";
  log.forEach(l=>
    {
      let logline='"' + l.time.toISOString() + '",';
      logline+='"' + (1.0*(l.onDuration)/1000).toFixed(3) + '",';
      logline+='"' + ((l.state.outputEnabled)?"On":"Off") + '",';
      logline+='"' + l.state.channel1Mode + '",';
      logline+='"' + l.state.currentSetting[1] + '",';
      logline+='"' + l.state.currentOutput[1] + '",';      
      logline+='"' + l.state.voltageSetting[1] + '",';
      logline+='"' + l.state.voltageOutput[1] + '",';      
      logline+='"' + l.state.channel2Mode + '",';
      logline+='"' + l.state.currentSetting[2] + '",';
      logline+='"' + l.state.currentOutput[2] + '",';
      logline+='"' + l.state.voltageSetting[2] + '",';
      logline+='"' + l.state.voltageOutput[2] + '"';
      logline+="\r\n";
      csvlog += logline;
    })
    const fileName = psu.identity+new Date().toISOString()+'log.csv';

    res.setHeader('Content-Disposition', 'attachment; filename=' + fileName);
    res.setHeader('Content-Type', 'text/csv');
  return res.status(200).send(csvlog);
});

//redirect to index.html
app.get("/", (req, res) => 
{
    return res.redirect("index.html");
});



// Start the server
server.listen(port, () => 
{
	console.log(`The application started successfully on port ${port}`);
});
