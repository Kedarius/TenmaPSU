/**
 * Simple example how to use the TenmaPSU class. Run apiserver.js for the client/server application.
 */

//Import the class
import {TenmaPSU} from './tenmaPSU.js';

//Instantiate the class with serial port
const psu=new TenmaPSU('com18');

//Open connection to the PSU
await psu.open();

//Get the identification of the PSU - this is a simple way how to check whether the connection has been established successfully
await psu.getIdentification();
if ((psu.identity != null) && (psu.identity.startsWith('TENMA')))
{
    //We are connected to the PSU
    setInterval(async function ()
    {
        //Periodically check the state of the PSU and log it to the console
        await psu.maintain();
        console.log(psu.state);
    },1000);

    //set voltage on channel 1    
    await psu.setVoltage(1,'05.00'); 

    //enable output
    await psu.setOutput(1);
    //disable output after 1 sec
    setTimeout(async function () {await psu.setOutput(0);},1000);

}
else
{
    //close the connection as we did not connect to the PSU
    await psu.close();
}


